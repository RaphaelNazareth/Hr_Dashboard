# job_suggestions.py
# POST /api/job-suggestions : generate or rewrite a job description + requirements
# for the Create Job page, using the local Ollama model.
#
# Put this file next to api.py. api.py already mounts `router` from here.
# No extra packages needed: it talks to Ollama over its HTTP API with the
# standard library.

import json
import os
import re
import urllib.error
import urllib.request
from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()

# Set these in backend/.env if needed. Use the same model your CV extraction uses.
OLLAMA_URL = os.getenv("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "180"))


class JobAiRequest(BaseModel):
    mode: Literal["generate", "rewrite"]
    job_title: str
    industry: str = ""
    experience_level: str = ""
    job_type: str = ""
    working_hours: str = ""
    workplace_type: str = ""
    city: str = ""
    country: str = ""
    job_description: str = ""
    requirements: str = ""


def build_prompt(r: JobAiRequest) -> str:
    context = f"""Company: Mattel
Job title: {r.job_title}
Industry: {r.industry}
Experience level: {r.experience_level}
Job type: {r.job_type}
Working hours: {r.working_hours}
Workplace: {r.workplace_type}
Location: {", ".join(x for x in [r.city, r.country] if x)}"""

    if r.mode == "rewrite":
        task = f"""The recruiter wrote a draft. Rewrite it so it is clear, professional and well structured, keeping their intent and facts.

Draft description:
\"\"\"{r.job_description}\"\"\"

Draft requirements:
\"\"\"{r.requirements}\"\"\"

Rules:
- If a draft field is empty, gibberish (random characters, meaningless words), or unrelated to the job title, ignore it and write that field from scratch.
- Do not invent specific facts (salary, benefits, years of experience) that are not in the draft or implied by the context."""
    else:
        task = "Write a job description and requirements for this role from scratch."

    return f"""You are an HR assistant writing a job posting.

{context}

{task}

Return ONLY valid JSON with exactly these two keys:
- "job_description": a short summary followed by the day-to-day responsibilities, plain text, 120-200 words.
- "requirements": qualifications, experience and skills, ONE PER LINE, plain text, no bullet symbols and no numbering.
"""


def ask_ollama(prompt: str) -> str:
    body = json.dumps(
        {
            "model": OLLAMA_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "format": "json",  # forces valid JSON output
        }
    ).encode("utf-8")

    req = urllib.request.Request(
        f"{OLLAMA_URL}/api/chat",
        data=body,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=OLLAMA_TIMEOUT) as resp:
        payload = json.loads(resp.read().decode("utf-8"))
    return payload["message"]["content"]


def as_text(value) -> str:
    # Small local models sometimes return a list instead of a string.
    if isinstance(value, list):
        return "\n".join(str(v).strip() for v in value)
    return str(value or "")


@router.post("/api/job-suggestions")
def job_suggestions(req: JobAiRequest):
    if not req.job_title.strip():
        raise HTTPException(status_code=400, detail="job_title is required")

    try:
        raw = ask_ollama(build_prompt(req))
    except urllib.error.URLError as exc:
        print("Ollama unreachable:", exc)
        raise HTTPException(
            status_code=503,
            detail=f"Can't reach Ollama at {OLLAMA_URL}. Is it running?",
        )
    except Exception as exc:
        print("Ollama error:", exc)
        raise HTTPException(
            status_code=502,
            detail=f"Ollama request failed. Check that model '{OLLAMA_MODEL}' is installed.",
        )

    cleaned = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        print("Invalid JSON from model:", raw[:300])
        raise HTTPException(status_code=502, detail="AI returned invalid JSON")

    return {
        "job_description": as_text(data.get("job_description")).strip(),
        "requirements": as_text(data.get("requirements")).strip(),
    }