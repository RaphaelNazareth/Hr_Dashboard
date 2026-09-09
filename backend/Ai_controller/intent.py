"""Intent extraction: natural language in, a structured tool call out.

This is the translator layer between how people ask and what Ollama_tools.py
accepts. It replaces letting the model free-call tools, which a 3B local model
does badly — it invents arguments, picks search_candidates for aggregate
questions, and hallucinates people when a lookup comes back empty.

The pipeline splits the job into a part models are good at and a part they are
not:

    extract()   the model reads the sentence and fills a flat slot bag. It is
                asked for FREE TEXT ("wawancara hr", "bulan ini"), never for
                enum values, because free text is what it produces reliably.
    normalize   rules turn that into the exact vocabulary the tools require.
    plan()      pure mapping from intent + slots to one tool and its arguments.
                No model involved, so a given intent always runs the same query.
    resolve()   the one step that needs the DB: turn a person's name into a
                candidate id, and snap a city or job title onto a real value.

Everything the model can get wrong is therefore recoverable, and everything
that must be exact is decided by code.
"""

import json
import re
from dataclasses import dataclass, field as dc_field
from typing import Any

from . import normalize
from .memory import Session

INTENTS = [
    "SEARCH_CANDIDATES",      # list people matching exact filters
    "SEMANTIC_SEARCH",        # find people by described ability, via embeddings
    "COUNT_CANDIDATES",       # how many match — answered from total_matches
    "GET_CANDIDATE",          # one person, full profile
    "GET_CANDIDATE_FIELD",    # one person, one section ("what skills does X have")
    "LIST_JOBS",              # openings and their per-stage counts
    "GET_APPLICATION_STATS",  # aggregates: by city, by month, time-to-hire
    "GET_PIPELINE",           # funnel, conversion, bottlenecks
    "GET_SCREENING_RESULTS",  # AI screening scores
    "SMALL_TALK",             # greetings, thanks — no tool
    "OUT_OF_SCOPE",           # not about this ATS — no tool
    "UNKNOWN",                # extractor unsure; caller falls back to tool-calling
]

# Kept deliberately flat and small. Nested or heavily-enumerated schemas make
# small models emit malformed JSON; a wide flat object of optional strings is
# the shape they handle best. Values are normalised afterwards, not here.
EXTRACTION_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {"type": "string", "enum": INTENTS},
        "person_name": {"type": "string", "description": "A candidate's name, if one is mentioned."},
        "semantic_query": {"type": "string", "description": "For SEMANTIC_SEARCH: the described ability or background, without the city/stage/education words."},
        "field": {"type": "string", "description": "What is asked about them, e.g. skills, education, phone."},
        "job_title": {"type": "string"},
        "city": {"type": "string"},
        "stage": {"type": "string", "description": "Recruitment stage in the user's own words."},
        "education_level": {"type": "string"},
        "time_phrase": {"type": "string", "description": "Any time expression, verbatim."},
        "min_age": {"type": "integer"},
        "max_age": {"type": "integer"},
        "min_score": {"type": "number"},
        "limit": {"type": "integer"},
        "refers_to_previous": {
            "type": "boolean",
            "description": "true if the person is referred to only as him/her/dia/that candidate.",
        },
    },
    "required": ["intent"],
}

_EXTRACTOR_PROMPT = f"""You convert one HR question into JSON. Output JSON only.

Pick exactly one intent:
- SEARCH_CANDIDATES: list/find/show people by EXACT values (a name, city, stage, education)
- SEMANTIC_SEARCH: find people by a DESCRIBED ability or background, in the user's own
  words, where profiles may not contain those words ("terbiasa pegang mesin produksi",
  "someone who can lead a small team", "berpengalaman QC di pabrik")
- COUNT_CANDIDATES: how many people match ("berapa banyak", "how many")
- GET_CANDIDATE: everything about one named person
- GET_CANDIDATE_FIELD: one specific thing about one person (skills, education, phone, status)
- LIST_JOBS: job openings / positions available
- GET_APPLICATION_STATS: totals and breakdowns by city, month, education; time-to-hire
- GET_PIPELINE: funnel, drop-off, conversion between stages, bottlenecks
- GET_SCREENING_RESULTS: AI screening scores, match scores, recommendations
- SMALL_TALK: greeting or thanks
- OUT_OF_SCOPE: nothing to do with recruitment data
- UNKNOWN: you cannot tell

Fill only the fields the sentence actually mentions. Omit the rest.
Copy stage, city, education_level and time_phrase in the USER'S OWN WORDS.
Do not translate them and do not tidy them up.
Set refers_to_previous=true when the person is only "he", "she", "dia", "that candidate".

Examples:
"Find candidates named Tania Pratama" -> {{"intent":"SEARCH_CANDIDATES","person_name":"Tania Pratama"}}
"What skills does Baktiadi have?" -> {{"intent":"GET_CANDIDATE_FIELD","person_name":"Baktiadi","field":"skills"}}
"How many warehouse staff applied?" -> {{"intent":"COUNT_CANDIDATES","job_title":"Warehouse Staff"}}
"Show me candidates in Bogor" -> {{"intent":"SEARCH_CANDIDATES","city":"Bogor"}}
"kandidat S1 yang lagi psikotes" -> {{"intent":"SEARCH_CANDIDATES","education_level":"S1","stage":"psikotes"}}
"berapa pelamar bulan ini" -> {{"intent":"COUNT_CANDIDATES","time_phrase":"bulan ini"}}
"what is his phone number" -> {{"intent":"GET_CANDIDATE_FIELD","field":"phone","refers_to_previous":true}}
"di tahap mana paling banyak yang gugur" -> {{"intent":"GET_PIPELINE"}}
"kota mana paling banyak melamar" -> {{"intent":"GET_APPLICATION_STATS"}}
"siapa saja yang skornya di atas 80" -> {{"intent":"GET_SCREENING_RESULTS","min_score":80}}
"tell me about Rina Wijaya" -> {{"intent":"GET_CANDIDATE","person_name":"Rina Wijaya"}}
"halo" -> {{"intent":"SMALL_TALK"}}
"cari kandidat yang terbiasa mengoperasikan mesin produksi" -> {{"intent":"SEMANTIC_SEARCH","semantic_query":"terbiasa mengoperasikan mesin produksi"}}
"siapa yang berpengalaman QC di manufaktur, yang di Bogor" -> {{"intent":"SEMANTIC_SEARCH","semantic_query":"berpengalaman quality control di manufaktur","city":"Bogor"}}
"find someone good at graphic design with an S1" -> {{"intent":"SEMANTIC_SEARCH","semantic_query":"good at graphic design","education_level":"S1"}}
"what is the capital of France" -> {{"intent":"OUT_OF_SCOPE"}}
"write me a poem" -> {{"intent":"OUT_OF_SCOPE"}}
"""

# Which slice of a get_candidate profile answers each field. First element is
# the set of top-level sections to keep, second the keys to keep inside
# "candidate". Projecting rather than returning the whole record keeps unasked
# PII out of the model's context.
_FIELD_PROJECTION = {
    "skills": (["candidate"], ["skills", "certificates", "languages", "experience_summary"]),
    # The classification and school of record lead; the detail rows follow.
    "education": (["education_history"], ["education_level", "school"]),
    "experience": (["employment_history"], ["experience_summary"]),
    "contact": (["candidate"], ["email", "phone_number", "mobile_phone_wa"]),
    "status": (["tracking", "application_history"], ["status"]),
    "address": (["address"], ["city"]),
    "family": (["family", "emergency_contact"], []),
    "offer": (["offer_details"], ["notice_period"]),
    "interview": (["interviews"], []),
    "certificates": (["candidate"], ["certificates"]),
    "languages": (["candidate"], ["languages"]),
    "personal": (["candidate"], ["age", "date_of_birth", "place_of_birth", "gender", "marital_status"]),
    "notice_period": (["candidate"], ["notice_period"]),
    "position": (["job"], ["applied_position", "status"]),
    "documents": (["candidate"], ["resume_path"]),
}

# "id" is kept in every projection so memory.py can still bind the pronoun to
# this person after the rest of the record has been projected away.
_IDENTITY_KEYS = ["id", "full_name", "candidate_code"]

_GREETING = re.compile(
    r"^\s*(hi|hai|halo|hello|hey|pagi|siang|sore|malam|selamat (pagi|siang|sore|malam)|"
    r"thanks|thank you|makasih|terima kasih|ok|oke|sip|good morning|good afternoon)"
    r"[\s!.,?]*$",
    re.IGNORECASE,
)


# A stage word in the sentence pulls the extractor towards GET_PIPELINE even
# when the question is "who is at MCU" — a plain filtered list. That swap is
# expensive: the pipeline tool takes no stage or education filter, so it
# answers a narrow question with whole-funnel numbers and looks authoritative
# doing it. These cues separate "show me the people" from "explain the funnel".
_PERSON_LIST_CUE = re.compile(
    r"\b(siapa|who|which candidates?|kandidat|pelamar|applicants?|show me|list|"
    r"tampilkan|daftar|cari|find|namanya)\b",
    re.IGNORECASE,
)
_FUNNEL_CUE = re.compile(
    r"\b(funnel|pipeline|conversion|konversi|convert|drop|dropoff|gugur|"
    r"bottleneck|hambatan|tahap mana|stage)\b",
    re.IGNORECASE,
)
_AGGREGATE_CUE = re.compile(
    r"\b(berapa|how many|total|rata-?rata|average|median|kota mana|bulan mana|"
    r"breakdown|statistik|distribusi|paling banyak)\b",
    re.IGNORECASE,
)


# "berapa"/"how many" is an unambiguous request for a number, but the extractor
# loses it once the session context names a candidate. Getting this wrong is
# the most damaging error the layer can make: SEARCH returns a page of rows,
# the writer model counts the rows it can see, and the user is told 8 when the
# answer is 46 — a plausible wrong number, stated as fact.
_COUNT_CUE = re.compile(r"\b(berapa|how many|jumlah|total)\b", re.IGNORECASE)
# "berapa lama" is a duration, not a count.
_COUNT_EXCLUDE = re.compile(r"\b(berapa lama|how long|berapa persen|what percent)\b", re.IGNORECASE)
# An explicit request to see the people outranks the count cue.
_EXPLICIT_LIST = re.compile(
    r"\b(siapa|who|show me|list|tampilkan|daftar|sebutkan|cari|find)\b", re.IGNORECASE
)


# Language that describes a capability rather than naming a stored value.
# "pengalaman" is excluded on purpose: "berapa yang punya pengalaman" is a
# structured has_experience question, not a description of what someone can do.
_DESCRIPTIVE_CUE = re.compile(
    r"\b(berpengalaman|terbiasa|menguasai|mampu|bisa\s+\w+|paham|mengerti|ahli|jago|"
    r"cocok untuk|mirip|sejenis|semacam|yang pernah|pernah kerja|pernah pegang|"
    r"experienced|familiar with|comfortable with|good (?:at|with)|skilled|capable of|"
    r"knows how|used to|background in|expertise|similar to|able to|who can|that can)\b",
    re.IGNORECASE,
)


def _correct_intent(intent: str, text: str, slots: dict, session: Session) -> str:
    """Rescue the confusions the extractor makes often enough to matter."""
    person_cue = bool(_PERSON_LIST_CUE.search(text))

    if intent == "GET_PIPELINE" and person_cue and not _FUNNEL_CUE.search(text):
        return "SEARCH_CANDIDATES"
    if intent == "GET_APPLICATION_STATS" and person_cue and not _AGGREGATE_CUE.search(text):
        return "SEARCH_CANDIDATES"

    if (
        intent == "SEARCH_CANDIDATES"
        and _COUNT_CUE.search(text)
        and not _COUNT_EXCLUDE.search(text)
        and not _EXPLICIT_LIST.search(text)
    ):
        return "COUNT_CANDIDATES"

    # A described ability is what the vector index is for; a keyword search on
    # "terbiasa pegang mesin" matches nobody, because no profile is written in
    # those words. A name, by contrast, is exact and belongs in keyword search.
    if intent == "SEARCH_CANDIDATES" and not slots.get("person_name") and _DESCRIPTIVE_CUE.search(text):
        return "SEMANTIC_SEARCH"
    if intent == "SEMANTIC_SEARCH" and slots.get("person_name"):
        return "SEARCH_CANDIDATES"

    # "siapa yang di tahap MCU" asks for a group. Left as a single-candidate
    # intent it answers about whoever the session last mentioned, which reads
    # as a real answer to a question nobody asked.
    if intent in ("GET_CANDIDATE", "GET_CANDIDATE_FIELD"):
        # Deliberately ignores the model's refers_to_previous flag here: once
        # the session context names someone, the extractor sets that flag on
        # sentences containing no pronoun at all. Only a name, or an actual
        # referring word in the text, counts as a target.
        has_target = slots.get("person_name") or session.resolve_reference(text)
        if not has_target:
            # No one to ask about, so this is a group question wearing the
            # wrong intent. Which group tool depends on how it was phrased.
            if _DESCRIPTIVE_CUE.search(text):
                return "SEMANTIC_SEARCH"
            if _EXPLICIT_LIST.search(text) or _PERSON_LIST_CUE.search(text):
                return "SEARCH_CANDIDATES"

    return intent


@dataclass
class Plan:
    """One resolved decision: which tool to run, with what, and why."""

    intent: str
    tool: str | None = None
    args: dict[str, Any] = dc_field(default_factory=dict)
    field: str | None = None            # projection for GET_CANDIDATE_FIELD
    person_query: str | None = None     # a name that still needs resolving to an id
    clarification: str | None = None    # ask this instead of running anything
    slots: dict[str, Any] = dc_field(default_factory=dict)
    source: str = "model"               # "rules" when matched without the model


# --- 1. extraction -----------------------------------------------------


def _rule_extract(text: str) -> dict | None:
    """Cheap pre-pass. Only for cases not worth a model round-trip."""
    if _GREETING.match(text):
        return {"intent": "SMALL_TALK"}
    return None


async def extract(client, model: str, text: str, session: Session) -> dict:
    """Slot bag for one message. Never raises — an unusable reply becomes UNKNOWN."""
    rules = _rule_extract(text)
    if rules is not None:
        return {**rules, "_source": "rules"}

    context = session.as_prompt_context()
    user_block = f"Conversation so far: {context}\n\nQuestion: {text}" if context else text

    try:
        response = await client.chat(
            model=model,
            messages=[
                {"role": "system", "content": _EXTRACTOR_PROMPT},
                {"role": "user", "content": user_block},
            ],
            format=EXTRACTION_SCHEMA,
            # Extraction is classification, not writing. Sampling here only adds
            # a chance of a different answer to the same question.
            options={"temperature": 0},
        )
        raw = json.loads(response["message"]["content"])
    except (json.JSONDecodeError, KeyError, TypeError):
        return {"intent": "UNKNOWN", "_source": "unparsable"}
    except Exception:
        return {"intent": "UNKNOWN", "_source": "extractor_failed"}

    if not isinstance(raw, dict) or raw.get("intent") not in INTENTS:
        return {"intent": "UNKNOWN", "_source": "bad_intent"}
    raw["_source"] = "model"
    return raw


# --- 2. normalisation + planning ---------------------------------------


def _mentioned_name(value, text: str) -> str | None:
    """Drop a name the user did not actually say.

    The session briefing that makes pronouns work also leaks: told "Candidate
    currently being discussed: Rina Wijaya", the extractor answers "siapa yang
    di tahap MCU" with person_name="Rina Wijaya", lifted from the context line
    rather than the question. The result is a group question answered about one
    unrelated person. A name has to appear in the message to count.
    """
    name = (value or "").strip()
    if not name:
        return None
    low = text.lower()
    tokens = re.findall(r"\w{3,}", name.lower())
    return name if any(tok in low for tok in tokens) else None


def _clean_slots(raw: dict, text: str) -> dict:
    """Model output to tool vocabulary.

    Each slot falls back to scanning the raw message, because the extractor
    drops slots it can plainly see — "kandidat S1 yang lagi psikotes" reliably
    yields the S1 and loses the psikotes. A dropped filter is worse than a
    wrong one: the answer comes back confident and much too broad.
    """
    stage_list = normalize.stages(raw.get("stage")) or normalize.scan_stages(text)
    edu_list = normalize.educations(raw.get("education_level")) or normalize.scan_educations(text)
    after, before = normalize.date_range(raw.get("time_phrase"))
    if not after and not before:
        after, before = normalize.date_range(text)

    slots: dict[str, Any] = {
        "person_name": _mentioned_name(raw.get("person_name"), text),
        "semantic_query": (raw.get("semantic_query") or "").strip() or None,
        "field": normalize.field(raw.get("field")),
        "job_title": (raw.get("job_title") or "").strip() or None,
        "city": (raw.get("city") or "").strip() or None,
        "status": stage_list,
        "education_level": edu_list,
        "applied_after": after,
        "applied_before": before,
        "refers_to_previous": bool(raw.get("refers_to_previous")),
    }
    for key in ("min_age", "max_age", "limit"):
        value = raw.get(key)
        if isinstance(value, (int, float)) and value > 0:
            slots[key] = int(value)
    score = raw.get("min_score")
    if isinstance(score, (int, float)) and 0 <= score <= 100:
        slots["min_score"] = float(score)
    return slots


def _search_args(slots: dict) -> dict:
    args: dict[str, Any] = {}
    for key in ("job_title", "city", "applied_after", "applied_before", "min_age", "max_age"):
        if slots.get(key):
            args[key] = slots[key]
    if slots.get("status"):
        args["status"] = slots["status"]
    if slots.get("education_level"):
        args["education_level"] = slots["education_level"]
    if slots.get("person_name"):
        args["query"] = slots["person_name"]
    return args


def plan(raw: dict, text: str, session: Session) -> Plan:
    """Slot bag -> one tool call. Pure: no DB, no model, no clock beyond today."""
    slots = _clean_slots(raw, text)
    intent = _correct_intent(raw.get("intent", "UNKNOWN"), text, slots, session)
    source = raw.get("_source", "model")

    if intent in ("SMALL_TALK", "OUT_OF_SCOPE", "UNKNOWN"):
        return Plan(intent=intent, slots=slots, source=source)

    # Who is "he"? Ordinals and pronouns beat a name the extractor may have
    # carried over from an earlier turn.
    referent = None
    if slots["refers_to_previous"] or not slots["person_name"]:
        referent = session.resolve_reference(text)

    if intent in ("GET_CANDIDATE", "GET_CANDIDATE_FIELD"):
        if referent:
            return Plan(
                intent=intent, tool="get_candidate", args={"candidate_id": referent["id"]},
                field=slots["field"], slots=slots, source=source,
            )
        if slots["person_name"]:
            return Plan(
                intent=intent, tool="get_candidate", args={}, field=slots["field"],
                person_query=slots["person_name"], slots=slots, source=source,
            )
        return Plan(
            intent=intent, slots=slots, source=source,
            clarification="Which candidate do you mean? Give me a name and I'll pull their record.",
        )

    if intent == "SEARCH_CANDIDATES":
        args = _search_args(slots)
        args["limit"] = min(int(slots.get("limit", 20)), 50)
        # A follow-up that only adds a filter ("only the S1 ones") inherits the
        # previous search rather than starting from the whole table.
        if session.last_search and not slots["person_name"] and len(args) <= 2:
            # Inherit the filters but never the previous "query": the two tools
            # both use that key for different things — a keyword here, a
            # description in semantic search — so carrying it over turns a
            # refinement into a search for the wrong thing entirely.
            inherited = {k: v for k, v in session.last_search.items() if k != "query"}
            args = {**inherited, **args}
        return Plan(intent=intent, tool="search_candidates", args=args, slots=slots, source=source)

    if intent == "SEMANTIC_SEARCH":
        # Falls back to the whole sentence: a slightly noisy embedding still
        # ranks sensibly, whereas an empty query is a hard failure.
        args = {"query": slots["semantic_query"] or text}
        for key in ("city", "job_title", "min_age", "max_age"):
            if slots.get(key):
                args[key] = slots[key]
        if slots.get("status"):
            args["status"] = slots["status"]
        if slots.get("education_level"):
            args["education_level"] = slots["education_level"]
        args["limit"] = min(int(slots.get("limit", 10)), 25)
        return Plan(intent=intent, tool="semantic_candidate_search", args=args,
                    slots=slots, source=source)

    if intent == "COUNT_CANDIDATES":
        args = _search_args(slots)
        # Only total_matches is needed; one row is enough to carry it.
        args["limit"] = 1
        return Plan(intent=intent, tool="search_candidates", args=args, slots=slots, source=source)

    if intent == "LIST_JOBS":
        args = {}
        if slots.get("job_title"):
            args["query"] = slots["job_title"]
        return Plan(intent=intent, tool="list_jobs", args=args, slots=slots, source=source)

    if intent == "GET_APPLICATION_STATS":
        args = {k: slots[k] for k in ("applied_after", "applied_before") if slots.get(k)}
        return Plan(intent=intent, tool="get_application_stats", args=args, slots=slots, source=source)

    if intent == "GET_PIPELINE":
        args = {k: slots[k] for k in ("applied_after", "applied_before") if slots.get(k)}
        return Plan(intent=intent, tool="get_candidate_pipeline", args=args, slots=slots, source=source)

    if intent == "GET_SCREENING_RESULTS":
        args: dict[str, Any] = {}
        if slots.get("min_score") is not None:
            args["min_score"] = slots["min_score"]
        if referent:
            args["candidate_id"] = referent["id"]
        return Plan(intent=intent, tool="get_screening_results", args=args, slots=slots, source=source)

    return Plan(intent="UNKNOWN", slots=slots, source=source)


# --- 3. DB-dependent resolution ----------------------------------------


def _distinct(conn, sql: str) -> list[str]:
    with conn.cursor() as cur:
        cur.execute(sql)
        return [r[0] for r in cur.fetchall() if r[0]]


def resolve(conn, plan_: Plan) -> Plan:
    """Snap free-text slots onto values that exist, using an open connection.

    Without this, "Bogor" misses rows stored as "Kota Bogor" and the assistant
    reports zero candidates for a city that has plenty — the failure mode most
    likely to be read as fact.
    """
    if plan_.tool is None:
        return plan_

    # "berpengalaman QC di Bogor" often arrives with the city still inside the
    # semantic query. Left there it is a weak signal in an embedding instead of
    # a hard filter, so results include the right skills in the wrong city.
    if plan_.tool == "semantic_candidate_search" and not plan_.args.get("city"):
        query = plan_.args.get("query") or ""
        names = set()
        for value in _distinct(conn, "SELECT DISTINCT city FROM candidates WHERE city IS NOT NULL"):
            names.add(re.sub(r"^(kota|kabupaten)\s+", "", value, flags=re.IGNORECASE).strip())
        # Longest first so "Jakarta Timur" wins over "Jakarta".
        for name in sorted(names, key=len, reverse=True):
            if len(name) >= 4 and re.search(rf"\b{re.escape(name)}\b", query, re.IGNORECASE):
                plan_.args["city"] = name
                stripped = re.sub(
                    rf"\s*\b(?:di|in|from|dari)?\s*{re.escape(name)}\b", " ", query, flags=re.IGNORECASE
                ).strip()
                # Keep the original if removing the city left nothing to match on.
                plan_.args["query"] = stripped or query
                break

    if plan_.args.get("city"):
        cities = _distinct(conn, "SELECT DISTINCT city FROM candidates WHERE city IS NOT NULL")
        term = plan_.args["city"].strip().lower()
        # "Bogor" is stored as both "Kota Bogor" and "Kabupaten Bogor". Snapping
        # to whichever scores higher would silently drop half the city, so when
        # the term appears in real values it is left alone for the ILIKE filter
        # to widen. Fuzzy matching is only for typos that hit nothing.
        if not any(term in c.lower() for c in cities):
            match = normalize.choice(plan_.args["city"], cities)
            if match:
                plan_.args["city"] = match

    if plan_.args.get("job_title"):
        titles = _distinct(conn, "SELECT DISTINCT job_title FROM jobs WHERE job_title IS NOT NULL")
        titles += _distinct(
            conn, "SELECT DISTINCT applied_position FROM candidates WHERE applied_position IS NOT NULL"
        )
        match = normalize.choice(plan_.args["job_title"], titles)
        if match:
            plan_.args["job_title"] = match

    return plan_


def resolve_person(conn, name: str) -> dict:
    """Name -> candidate id. Returns a status the caller acts on, never a guess.

    Ambiguity is surfaced as a question rather than resolved by picking the
    first row: two people called Wijaya are a question for the user, and
    answering about the wrong one is worse than asking.
    """
    from .Ollama_tools import search_candidates

    found = search_candidates(conn, query=name, limit=10)
    rows = found.get("candidates") or []
    # The keyword search also matches school and position, so "Wijaya" can drag
    # in someone who studied at SMK Wijaya. Prefer rows where the name really
    # matches; fall back to the wide set only if that leaves nothing.
    needle = name.strip().lower()
    by_name = [r for r in rows if needle in (r.get("full_name") or "").lower()]
    rows = by_name or rows

    if not rows:
        return {"status": "not_found", "name": name}
    if len(rows) == 1:
        return {"status": "ok", "candidate_id": rows[0]["candidate_id"], "row": rows[0]}

    # An exact full-name match settles it even when the keyword search is noisy.
    exact = [r for r in rows if (r.get("full_name") or "").lower() == needle]
    if len(exact) == 1:
        return {"status": "ok", "candidate_id": exact[0]["candidate_id"], "row": exact[0]}
    return {"status": "ambiguous", "name": name, "matches": rows[:10]}


# --- 4. result shaping -------------------------------------------------


def shape_result(plan_: Plan, result: Any) -> Any:
    """Reduce a tool result to what the question actually asked for.

    Handing the writer model a raw result invites it to answer from the wrong
    part. A count fetches one row to carry total_matches, and the model reads
    the one row and reports "1 applicant" for a query matching 52 — a wrong
    number stated with total confidence. Removing the rows removes the choice.
    """
    if not isinstance(result, dict) or result.get("error"):
        return result
    if plan_.intent == "COUNT_CANDIDATES":
        return {
            "answer_type": "count",
            "matching_candidates": result.get("total_matches", 0),
            "filters_applied": {k: v for k, v in plan_.args.items() if k != "limit"},
            "note": "This is the full count. No candidate list was requested or returned.",
        }
    if plan_.intent == "GET_CANDIDATE_FIELD":
        return project_field(result, plan_.field)
    return result


def project_field(result: dict, field_name: str | None) -> dict:
    """Keep only the part of a profile the question was about."""
    if not field_name or field_name not in _FIELD_PROJECTION:
        return result
    sections, candidate_keys = _FIELD_PROJECTION[field_name]
    out: dict[str, Any] = {"asked_about": field_name}
    candidate = result.get("candidate") or {}
    identity = {k: candidate.get(k) for k in _IDENTITY_KEYS if candidate.get(k)}

    for section in sections:
        if section == "candidate":
            picked = {k: candidate.get(k) for k in candidate_keys if k in candidate}
            out["candidate"] = {**identity, **picked}
        elif section in result:
            out[section] = result[section]
    if "candidate" not in out:
        out["candidate"] = identity
        for key in candidate_keys:
            if key in candidate:
                out["candidate"][key] = candidate[key]
    return out
