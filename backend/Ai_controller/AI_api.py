"""Ollama wrapped in FastAPI, mounted at /controller/*.

Replaces the Gemini /chat the AIAssistantWidget used to call. The response
shape is kept backwards-compatible, so the frontend only needed its URL
changed.

Answering happens in two passes rather than by handing the model the tool list
and hoping:

    1. intent.py turns the message into one structured tool call, using
       memory.py to work out who "him" is.
    2. The tool runs against Postgres, and the model is asked only to put the
       result into words.

The model therefore never chooses arguments and never sees a question it could
answer from imagination — by the time it writes, the data is already fetched or
already known to be missing. The old free tool-calling loop is still here and
still used, but only for UNKNOWN intents, where a fixed mapping has nothing to
offer.
"""
import json
import os
import uuid
from typing import Any, Literal

import psycopg
from fastapi import APIRouter, HTTPException
from fastapi.concurrency import run_in_threadpool
from ollama import AsyncClient
from pydantic import BaseModel, Field

from . import intent as intent_mod
from .memory import STORE, remember_result
from .Ollama_tools import HANDLERS, TOOLS

router = APIRouter(prefix="/controller", tags=["controller"])

MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
client = AsyncClient(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"))

# Read lazily rather than at import time: binding this to a module global meant
# a server started before the variable was set stayed broken until restart,
# reporting "not configured" even after .env was fixed.
def _database_url() -> str:
    return os.getenv("DATABASE_URL", "")


MAX_TOOL_HOPS = int(os.getenv("MAX_AGENT_TOOL_HOPS", "4"))

SYSTEM_PROMPT = (
    "You are the HR Assistant in an HR dashboard. Help with hiring, recruitment "
    "stages, job descriptions and interview planning. Use Markdown. You have tools "
    "to search real candidates, jobs, stats, pipeline and screening data — use them "
    "instead of guessing.\n\n"
    "If a tool call returns an \"error\" field, the data is NOT available. In that "
    "case you MUST tell the user the lookup failed and state the error message — "
    "do NOT then make up example or placeholder candidates, names, or numbers to "
    "fill the gap. An error result is not a cue to improvise."
)

ANSWER_PROMPT = (
    "You are the HR Assistant in an HR dashboard. You are given a user question and "
    "the JSON result of a database query that has ALREADY been run for it. Answer the "
    "question from that JSON in Markdown, briefly.\n\n"
    "Rules:\n"
    "- Use ONLY what is in the JSON. Never add a candidate, number, skill or date that "
    "is not there.\n"
    "- If the JSON is empty or has zero matches, say plainly that nothing matched. Do "
    "not invent examples to be helpful.\n"
    "- If the JSON has an \"error\" field, say the lookup failed and quote the message.\n"
    "- total_matches is the true total; the rows shown may be only the first page, so "
    "never state a count by counting them.\n"
    "- When answer_type is \"count\", the answer is matching_candidates. Report that "
    "number and nothing else.\n"
    "- Screening scores are advisory. Give the reasoning with the score, and never "
    "present one as a hiring decision.\n"
    "- A \"similarity\" field means the match is by meaning, not by keyword. Say what in "
    "their background makes them relevant, and call anything below 0.5 a loose match.\n"
    "- Answer in the language the user used."
)

# Ollama's tool-calling wants OpenAI-style {"type": "function", "function": {..., "parameters": ...}}.
# Ollama_tools.py was written against Anthropic's {"input_schema": ...} shape, so translate.
OLLAMA_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": t["name"],
            "description": t["description"],
            "parameters": t["input_schema"],
        },
    }
    for t in TOOLS
]


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatTurn] = Field(default_factory=list)
    # Ties a conversation to its stored context. Optional so an older frontend
    # keeps working — it just gets a fresh, memoryless session each turn.
    session_id: str | None = None


class ChatResponse(BaseModel):
    reply: str
    actions: list[Any] = Field(default_factory=list)
    tool_trace: list[Any] = Field(default_factory=list)
    model_used: str
    intent: str | None = None
    session_id: str | None = None


def _run_tool(name: str, arguments: dict) -> Any:
    """Runs one tool call against Postgres. Sync — call via run_in_threadpool."""
    url = _database_url()
    if not url:
        return {"error": "not_configured", "message": "DATABASE_URL is not set on the server."}
    handler = HANDLERS.get(name)
    if handler is None:
        return {"error": "unknown_tool", "message": f"No such tool: {name}"}
    try:
        with psycopg.connect(url) as conn:
            result = handler(conn, **arguments)
        return result if result is not None else {"error": "not_found", "message": "No matching record."}
    except Exception as exc:  # noqa: BLE001 — fed back to the model as a tool result, not raised
        return {"error": "tool_failed", "message": str(exc)}


def _execute_plan(plan: intent_mod.Plan) -> tuple[Any, dict | None]:
    """Resolve and run one plan in a single connection.

    Returns (result, ambiguity). Ambiguity is a name that matched several people
    — the caller turns it into a question instead of an answer.
    """
    url = _database_url()
    if not url:
        return {"error": "not_configured", "message": "DATABASE_URL is not set on the server."}, None
    handler = HANDLERS.get(plan.tool)
    if handler is None:
        return {"error": "unknown_tool", "message": f"No such tool: {plan.tool}"}, None

    try:
        with psycopg.connect(url) as conn:
            plan = intent_mod.resolve(conn, plan)

            if plan.person_query:
                found = intent_mod.resolve_person(conn, plan.person_query)
                if found["status"] == "not_found":
                    return {
                        "error": "not_found",
                        "message": f"No candidate matching '{plan.person_query}' is in the database.",
                    }, None
                if found["status"] == "ambiguous":
                    return None, found
                plan.args["candidate_id"] = found["candidate_id"]

            result = handler(conn, **plan.args)

        if result is None:
            return {"error": "not_found", "message": "No matching record."}, None
        return intent_mod.shape_result(plan, result), None
    except Exception as exc:  # noqa: BLE001 — surfaced to the user as a failed lookup
        return {"error": "tool_failed", "message": str(exc)}, None


def _ambiguity_reply(found: dict) -> str:
    lines = [
        f"- **{m.get('full_name')}** — {m.get('applied_position') or 'no position'}"
        f" ({m.get('status')}, {m.get('city') or 'city unknown'})"
        for m in found["matches"]
    ]
    return (
        f"Several candidates match \"{found['name']}\". Which one do you mean?\n\n"
        + "\n".join(lines)
    )


async def _write_answer(question: str, payload: Any, context: str) -> str:
    """Second pass: the model narrates a result it did not choose.

    Deliberately given no chat history. The question and the JSON are already
    self-contained, and prior turns actively poison this pass: asked about
    graphic designers right after a machine-operator search, the model reused
    the earlier heading and described the new people as machine operators.
    Whatever pronoun context is genuinely needed arrives via `context`.
    """
    briefing = f"Conversation context: {context}\n\n" if context else ""
    response = await client.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": ANSWER_PROMPT},
            {
                "role": "user",
                "content": (
                    f"{briefing}Question: {question}\n\n"
                    f"Query result JSON:\n{json.dumps(payload, ensure_ascii=False, default=str)}"
                ),
            },
        ],
        options={"temperature": 0.2},
    )
    return response["message"]["content"].strip()


async def _tool_loop(messages: list, tool_trace: list) -> str:
    """Original free tool-calling loop. Fallback for questions the intent layer
    could not classify, where any fixed mapping would be a worse guess."""
    for _ in range(MAX_TOOL_HOPS):
        response = await client.chat(model=MODEL, messages=messages, tools=OLLAMA_TOOLS)
        msg = response["message"]
        tool_calls = msg.get("tool_calls")
        if not tool_calls:
            return msg["content"].strip()

        messages.append(msg)
        for call in tool_calls:
            name = call["function"]["name"]
            arguments = call["function"]["arguments"]
            result = await run_in_threadpool(_run_tool, name, arguments)
            tool_trace.append({"tool": name, "arguments": arguments, "result_preview": result})
            messages.append({"role": "tool", "content": json.dumps(result, ensure_ascii=False)})

    # Ran out of hops — ask once more without tools so the model has to answer now.
    response = await client.chat(model=MODEL, messages=messages)
    return response["message"]["content"].strip()


@router.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest) -> ChatResponse:
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")

    session_id = req.session_id or str(uuid.uuid4())
    session = STORE.get(session_id)
    history = [{"role": t.role, "content": t.content} for t in req.history]
    tool_trace: list[dict] = []

    try:
        raw = await intent_mod.extract(client, MODEL, req.message, session)
        plan = intent_mod.plan(raw, req.message, session)
        tool_trace.append({"stage": "intent", "intent": plan.intent, "slots": plan.slots,
                           "source": plan.source})

        if plan.clarification:
            reply = plan.clarification

        elif plan.tool:
            result, ambiguous = await run_in_threadpool(_execute_plan, plan)
            if ambiguous:
                # Keep the shortlist so "the second one" works on the next turn.
                session.note_candidates(ambiguous["matches"])
                reply = _ambiguity_reply(ambiguous)
            else:
                tool_trace.append({"tool": plan.tool, "arguments": plan.args, "result_preview": result})
                remember_result(session, plan.tool, result)
                if plan.intent in ("SEARCH_CANDIDATES", "SEMANTIC_SEARCH"):
                    session.last_search = dict(plan.args)
                # The context line is only there to let the writer name the
                # person a pronoun stood for. On a group or aggregate answer it
                # just bleeds in — "nothing matched for Rina's MCU stage" when
                # the question was who is at MCU at all.
                context = (
                    session.as_prompt_context()
                    if plan.intent in ("GET_CANDIDATE", "GET_CANDIDATE_FIELD")
                    else ""
                )
                reply = await _write_answer(req.message, result, context)

        else:
            # SMALL_TALK, OUT_OF_SCOPE and UNKNOWN. Only UNKNOWN is worth the
            # full tool loop; the other two have no data to fetch.
            messages = [{"role": "system", "content": SYSTEM_PROMPT}, *history,
                        {"role": "user", "content": req.message}]
            if plan.intent == "UNKNOWN":
                reply = await _tool_loop(messages, tool_trace)
            else:
                response = await client.chat(model=MODEL, messages=messages)
                reply = response["message"]["content"].strip()

        session.last_intent = plan.intent

    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Ollama unavailable ({exc}). Is `ollama serve` running?",
        ) from exc

    return ChatResponse(
        reply=reply, tool_trace=tool_trace, model_used=MODEL,
        intent=plan.intent, session_id=session_id,
    )


@router.post("/reset")
async def reset(session_id: str) -> dict:
    """Drop a session's remembered context without clearing the visible chat."""
    STORE.reset(session_id)
    return {"ok": True, "session_id": session_id}
