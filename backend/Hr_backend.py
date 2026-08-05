"""
HR Recruitment AI Assistant — Backend (single-file version)

Architecture:
    React Frontend -> FastAPI Backend -> Gemini AI Agent -> Tool Calling
    -> Python Functions -> PocketBase

The AI never accesses the database directly and never generates SQL. It can
only call the plain Python tool functions defined below (search_candidate,
get_candidate, summarize_candidate, get_candidate_profile,
get_recent_candidates, get_candidates_by_status, analytics,
compare_candidates, navigate, open_resume, generate_email,
schedule_interview, list_jobs). Those functions are the only code in this
file allowed to talk to PocketBase.

Run:
    pip install fastapi "uvicorn[standard]" pydantic pydantic-settings httpx google-genai python-dotenv
    cp .env.example .env   # fill in GEMINI_API_KEY + PocketBase creds
    uvicorn hr_ai_backend:app --reload --port 8000

Model choice (mid-2026):
    Primary  = gemini-3.6-flash       (GA, strong agentic tool-calling)
    Fallback = gemini-3.5-flash-lite  (cheapest current-gen model that still
                                        supports native function calling, so
                                        it can run the exact same tool loop
                                        if the primary is rate-limited/down)
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import time
from functools import lru_cache
from typing import Any, Iterable, Literal, Optional

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

from google import genai
from google.genai import types as genai_types
from google.genai import errors as genai_errors
from typing import ClassVar, Any, Iterable, Literal, Optional
from datetime import datetime

# MUST run before Settings/genai.Client are defined below, since their field
# defaults call os.getenv(...) at import time. If this runs after, or not at
# all, GEMINI_API_KEY etc. will silently read as empty strings even though
# your .env file has real values in it.
load_dotenv()
import resend

resend.api_key = os.environ["RESEND_API_KEY"]
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("hr_ai_backend")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],  # ganti ke domain frontend kamu di production
    allow_methods=["*"],
    allow_headers=["*"],
)

class InterviewEmailRequest(BaseModel):
    to: str
    candidateName: str
    stageName: str
    startDateTime: str | None = None
    endTime: str | None = None
    notes: str | None = None

# ============================================================================
# 1. CONFIG
# ============================================================================

class Settings(BaseSettings):
    # --- Gemini ---
    gemini_api_key: str = os.getenv("GEMINI_API_KEY", "")
    gemini_primary_models: ClassVar[list[str]] = [
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
        "gemini-2-flash",
    ]

    gemini_reasoning_models: ClassVar[list[str]] = [
        "gemini-3.1-pro",
        "gemini-2.5-pro",
        "gemini-3.6-flash",
        "gemini-3.5-flash",
        "gemini-2.5-flash",
    ]

    gemini_summary_models: ClassVar[list[str]] = [
        "gemini-3.5-flash-lite",
        "gemini-3.1-flash-lite",
        "gemini-2.5-flash-lite",
        "gemini-2-flash-lite",
    ]

    @property
    def gemini_primary_model(self) -> str:
        return self.gemini_primary_models[0]

    @property
    def gemini_fallback_model(self) -> str:
        return self.gemini_primary_models[1]

    @property
    def gemini_summary_model(self) -> str:
        return self.gemini_summary_models[0]

    @property
    def gemini_reasoning_model(self) -> str:
        return self.gemini_reasoning_models[0]

    # --- PocketBase ---
    pocketbase_url: str = os.getenv("POCKETBASE_URL", "http://127.0.0.1:8090")
    pocketbase_admin_email: str = os.getenv("POCKETBASE_ADMIN_EMAIL", "")
    pocketbase_admin_password: str = os.getenv("POCKETBASE_ADMIN_PASSWORD", "")

    # --- Collections ---
    collection_candidates: str = os.getenv("PB_COLLECTION_CANDIDATES", "Operator_dataset")
    collection_jobs: str = os.getenv("PB_COLLECTION_JOBS", "Jobs")
    collection_tracking: str = os.getenv("PB_COLLECTION_TRACKING", "Candidate_Tracking")

    # --- App ---
    # Kept as a plain string, not list[str]: pydantic-settings tries to
    # JSON-decode env vars typed as list[...] directly (it expects
    # ALLOWED_ORIGINS='["http://a","http://b"]'), which crashes on a normal
    # comma-separated string. We split it ourselves via the property below.
    allowed_origins_raw: str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173")
    max_agent_tool_hops: int = int(os.getenv("MAX_AGENT_TOOL_HOPS", "2"))

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins_raw.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()

if not settings.gemini_api_key:
    raise RuntimeError(
        "GEMINI_API_KEY is not set. Create a .env file next to this script "
        "with GEMINI_API_KEY=your_key (see .env.example), or set it as an "
        "environment variable before running."
    )


# ============================================================================
# 2. API SCHEMAS
# ============================================================================

class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatTurn] = Field(default_factory=list)
    user_id: Optional[str] = None  # set by your auth layer, not the client


class UIAction(BaseModel):
    """A suggested UI action. The AI proposes it; the frontend renders a button and decides whether to act."""
    type: Literal["navigate", "open_resume", "compare", "schedule_interview"]
    label: str
    payload: dict[str, Any] = Field(default_factory=dict)


class ToolTrace(BaseModel):
    tool: str
    arguments: dict[str, Any]
    result_preview: Any = None


class ChatResponse(BaseModel):
    reply: str
    actions: list[UIAction] = Field(default_factory=list)
    tool_trace: list[ToolTrace] = Field(default_factory=list)
    model_used: str


# ============================================================================
# 3. POCKETBASE CLIENT — the ONLY thing in this file that talks to the DB
# ============================================================================

class PocketBaseError(Exception):
    def __init__(self, status_code: int, detail: Any):
        self.status_code = status_code
        self.detail = detail
        super().__init__(f"PocketBase error {status_code}: {detail}")


class PocketBaseClient:
    def __init__(self):
        self._base_url = settings.pocketbase_url.rstrip("/")
        self._token: Optional[str] = None
        self._token_expires_at: float = 0
        self._client = httpx.AsyncClient(base_url=self._base_url, timeout=15.0)

    async def _ensure_auth(self) -> None:
        if self._token and time.time() < self._token_expires_at:
            return
        # PocketBase >= 0.23 admin auth endpoint. On older PocketBase, use
        # /api/admins/auth-with-password instead.
        resp = await self._client.post(
            "/api/collections/_superusers/auth-with-password",
            json={"identity": settings.pocketbase_admin_email, "password": settings.pocketbase_admin_password},
        )
        if resp.status_code != 200:
            raise PocketBaseError(resp.status_code, resp.text)
        data = resp.json()
        self._token = data["token"]
        self._token_expires_at = time.time() + 50 * 60

    async def _headers(self) -> dict[str, str]:
        await self._ensure_auth()
        return {"Authorization": self._token or ""}

    async def list_records(self, collection: str, *, filter_str: Optional[str] = None,
                            sort: Optional[str] = None, page: int = 1, per_page: int = 30) -> dict[str, Any]:
        params: dict[str, Any] = {"page": page, "perPage": per_page}
        if filter_str:
            params["filter"] = filter_str
        if sort:
            params["sort"] = sort
        resp = await self._client.get(f"/api/collections/{collection}/records", params=params, headers=await self._headers())
        if resp.status_code != 200:
            raise PocketBaseError(resp.status_code, resp.text)
        return resp.json()

    async def get_record(self, collection: str, record_id: str) -> dict[str, Any]:
        resp = await self._client.get(f"/api/collections/{collection}/records/{record_id}", headers=await self._headers())
        if resp.status_code != 200:
            raise PocketBaseError(resp.status_code, resp.text)
        return resp.json()

    async def create_record(self, collection: str, data: dict[str, Any]) -> dict[str, Any]:
        resp = await self._client.post(f"/api/collections/{collection}/records", json=data, headers=await self._headers())
        if resp.status_code not in (200, 201):
            raise PocketBaseError(resp.status_code, resp.text)
        return resp.json()

    async def update_record(self, collection: str, record_id: str, data: dict[str, Any]) -> dict[str, Any]:
        resp = await self._client.patch(f"/api/collections/{collection}/records/{record_id}", json=data, headers=await self._headers())
        if resp.status_code != 200:
            raise PocketBaseError(resp.status_code, resp.text)
        return resp.json()

    def file_url(self, collection: str, record_id: str, filename: str) -> str:
        return f"{self._base_url}/api/files/{collection}/{record_id}/{filename}"

    async def aclose(self):
        await self._client.aclose()


pb = PocketBaseClient()

CANDIDATES = settings.collection_candidates
JOBS = settings.collection_jobs
TRACKING = settings.collection_tracking


# ============================================================================
# 4. FILTER HELPERS — safe PocketBase filter-string builders (not SQL)
# ============================================================================

def esc(value: str) -> str:
    return str(value).replace('"', '\\"')


def eq(field: str, value: Any) -> str:
    return f'{field} = "{esc(value)}"'


def contains(field: str, value: Any) -> str:
    if isinstance(value, str):
        value = value.lower()

    return f'{field} ~ "{esc(value)}"'


def gte(field: str, value: Any) -> str:
    return f'{field} >= "{esc(value)}"'


def and_(clauses: Iterable[Optional[str]]) -> str:
    parts = [c for c in clauses if c]
    return " && ".join(parts)


def or_group(field: str, values: Iterable[str], op: str = "~") -> str:
    parts = [f'{field} {op} "{esc(v)}"' for v in values]
    if not parts:
        return ""
    return "(" + " || ".join(parts) + ")"


# ============================================================================
# 5. GEMINI CLIENT — low-level call with automatic primary -> fallback retry
# ============================================================================

_client = genai.Client(api_key=settings.gemini_api_key)

RETRYABLE_STATUS_CODES = {429, 500, 503}


def _is_retryable(exc: Exception) -> bool:
    code = getattr(exc, "code", None) or getattr(exc, "status_code", None)
    if code in RETRYABLE_STATUS_CODES:
        return True
    msg = str(exc).lower()
    return any(tok in msg for tok in ("429", "resource_exhausted", "quota", "unavailable", "overloaded"))


async def generate_with_fallback(
    *, models: list[str], contents: Any,
    config: Optional[genai_types.GenerateContentConfig] = None,
) -> tuple[genai_types.GenerateContentResponse, str]:
    """Calls each model in `models` in order; on a retryable error (rate limit/
    quota/overload) moves to the next one. Raises the last exception if every
    model in the list fails, or immediately on a non-retryable error."""
    last_exc: Optional[Exception] = None
    for i, model in enumerate(models):
        try:
            resp = await _client.aio.models.generate_content(model=model, contents=contents, config=config)
            return resp, model
        except Exception as exc:  # noqa: BLE001
            is_last = i == len(models) - 1
            if not _is_retryable(exc) or is_last:
                raise
            next_model = models[i + 1]
            logger.warning("Model %s failed (%s) — retrying on %s", model, exc, next_model)
            last_exc = exc
    # unreachable, but keeps type checkers happy
    raise last_exc  # type: ignore[misc]


# ============================================================================
# 6. TOOL FUNCTIONS — what the AI is allowed to call
# ============================================================================

def _candidate_card(rec: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": rec.get("id"),
        "candidate_id": rec.get("Candidate_ID"),
        "name": f"{rec.get('First_Name', '')} {rec.get('Last_Name', '')}".strip(),
        "position": rec.get("Applied_Position"),
        "city": rec.get("City"),
        "status": rec.get("Status"),
        "experience": rec.get("Experience"),
        "skills": rec.get("Skills"),
    }


async def search_candidate(
    name: Optional[str] = None, skills: Optional[list[str]] = None, city: Optional[str] = None,
    status: Optional[str] = None, experience_min: Optional[int] = None, experience_max: Optional[int] = None,
    education: Optional[str] = None, current_company: Optional[str] = None,
) -> list[dict[str, Any]]:
    """Search candidates using any combination of filters."""
    clauses = []
    if name:
        parts = name.lower().split()

        if len(parts) == 1:
            clauses.append(
                f'({contains("First_Name", parts[0])} || {contains("Last_Name", parts[0])})'
            )
        else:
            name_conditions = []
            for word in parts:
                name_conditions.append(
                    f'({contains("First_Name", word)} || {contains("Last_Name", word)})'
                )
            clauses.append(and_(name_conditions))
    if skills:
        clauses.append(or_group("Skills", skills))
    if city:
        clauses.append(contains("City", city))
    if status:
        clauses.append(eq("Status", status))
    if education:
        clauses.append(contains("Education", education))
    if current_company:
        # No dedicated column today — best-effort text search over Experience.
        clauses.append(contains("Experience", current_company))

    data = await pb.list_records(CANDIDATES, filter_str=and_(clauses), per_page=50, sort="-created")
    results = [_candidate_card(r) for r in data.get("items", [])]

    if experience_min is not None or experience_max is not None:
        def years(exp_text: Optional[str]) -> Optional[int]:
            if not exp_text:
                return None
            digits = "".join(ch for ch in exp_text if ch.isdigit())
            return int(digits) if digits else None

        filtered = []
        for r in results:
            yrs = years(r.get("experience"))
            if yrs is None:
                continue
            if experience_min is not None and yrs < experience_min:
                continue
            if experience_max is not None and yrs > experience_max:
                continue
            filtered.append(r)
        results = filtered

    return results

async def _resolve_record(candidate_id: str) -> dict[str, Any]:
    data = await pb.list_records(CANDIDATES, filter_str=eq("Candidate_ID", candidate_id), per_page=1)
    items = data.get("items", [])
    if items:
        return items[0]
    return await pb.get_record(CANDIDATES, candidate_id)  # fallback for raw PocketBase IDs


async def get_candidate(candidate_id: str) -> dict[str, Any]:
    """Get every stored field for one specific candidate."""
    return await _resolve_record(candidate_id)


async def get_candidate_profile(candidate_id: str, include_summary: bool = True) -> dict[str, Any]:
    """Curated candidate profile shaped for a detail page.

    include_summary=False builds the profile without recursing into
    summarize_candidate — used internally by summarize_candidate itself
    so the two functions don't call each other forever.
    """
    rec = await _resolve_record(candidate_id)
    profile = {
        "id": rec.get("id"),
        "candidate_id": rec.get("Candidate_ID"),
        "name": f"{rec.get('First_Name', '')} {rec.get('Last_Name', '')}".strip(),
        "age": rec.get("Age"),
        "email": rec.get("email"),
        "phone": rec.get("Phone_Number"),
        "city": rec.get("City"),
        "applied_position": rec.get("Applied_Position"),
        "experience": rec.get("Experience"),
        "education": rec.get("Education"),
        "school": rec.get("School"),
        "skills": rec.get("Skills"),
        "notice_period": rec.get("Notice_Period"),
        "status": rec.get("Status"),
        "is_18_plus": rec.get("Is_18_Plus"),
        "legal_right_to_work": rec.get("Legal_Right_To_Work"),
        "former_current_mattel_employee": rec.get("Former_Current_Mattel_Employee"),
        "applied_date": rec.get("date"),
        "notes": rec.get("Notes"),
        "has_resume": bool(rec.get("Resume_Input")),
    }
    if include_summary:
        profile["summary"] = await summarize_candidate(candidate_id, profile=profile)
    return profile


async def get_recent_candidates(days: int = 7) -> list[dict[str, Any]]:
    """Candidates who applied within the last N days."""
    since = (dt.datetime.utcnow() - dt.timedelta(days=days)).strftime("%Y-%m-%d %H:%M:%S")
    data = await pb.list_records(CANDIDATES, filter_str=gte("date", since), sort="-date", per_page=50)
    return [_candidate_card(r) for r in data.get("items", [])]


async def get_candidates_by_status(status: str) -> list[dict[str, Any]]:
    """All candidates with a specific pipeline status, e.g. Rejected, Interview, Offer, Applied."""
    data = await pb.list_records(CANDIDATES, filter_str=eq("Status", status), sort="-created", per_page=50)
    return [_candidate_card(r) for r in data.get("items", [])]


async def compare_candidates(ids: list[str]) -> dict[str, Any]:
    """Compare two or more candidates side by side."""
    profiles = []
    for cid in ids:
        try:
            profiles.append(await get_candidate_profile(cid))
        except PocketBaseError:
            profiles.append({"id": cid, "error": "not_found"})
    return {"candidates": profiles}


async def open_resume(candidate_id: str) -> dict[str, Any]:
    """Resume file/download URL for a candidate."""
    rec = await _resolve_record(candidate_id)
    filename = rec.get("Resume_Input")
    if not filename:
        return {"available": False, "reason": "No resume on file for this candidate."}
    url = pb.file_url(CANDIDATES, rec["id"], filename)
    return {"available": True, "url": url, "candidate_id": rec.get("Candidate_ID")}


# Statuses tracked on the dashboard — adjust to match your real `Status` values.
TRACKED_STATUSES = ["Applied", "Interview", "Offer", "Rejected"]


async def analytics() -> dict[str, Any]:
    """Overall dashboard statistics: total candidates and counts per status."""
    total_data = await pb.list_records(CANDIDATES, per_page=1)
    total = total_data.get("totalItems", 0)
    counts: dict[str, int] = {}
    for status in TRACKED_STATUSES:
        data = await pb.list_records(CANDIDATES, filter_str=eq("Status", status), per_page=1)
        counts[status.lower()] = data.get("totalItems", 0)
    return {"total_candidates": total, **counts}


VALID_PAGES = {"dashboard", "analytics", "candidates", "jobs", "help-desk", "settings"}


async def navigate(page: str) -> dict[str, Any]:
    """Propose navigating to a dashboard page. Never navigates automatically — only returns a suggested action."""
    page_normalized = page.strip().lower().replace(" ", "-")
    if page_normalized not in VALID_PAGES:
        return {
            "valid": False,
            "requested_page": page,
            "message": f"'{page}' isn't a known page. Valid pages: {', '.join(sorted(VALID_PAGES))}",
        }
    return {"valid": True, "action": "navigate", "page": page_normalized}


async def schedule_interview(candidate_id: str, proposed_date: Optional[str] = None, notes: Optional[str] = None) -> dict[str, Any]:
    """Log an interview scheduling request into the pipeline tracker (does not book a calendar slot)."""
    rec = await _resolve_record(candidate_id)
    date_value = proposed_date or dt.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    created = await pb.create_record(TRACKING, {
        "candidate_id": rec.get("Candidate_ID") or rec["id"],
        "Applied_Position": rec.get("Applied_Position", ""),
        "Stage": "Interview Requested",
        "Date": date_value,
        "Notes": notes or "Requested via AI Assistant",
    })
    return {
        "scheduled": True,
        "tracking_record_id": created.get("id"),
        "candidate_name": f"{rec.get('First_Name', '')} {rec.get('Last_Name', '')}".strip(),
        "date": date_value,
    }


async def list_jobs(status: Optional[bool] = None, title: Optional[str] = None) -> list[dict[str, Any]]:
    """List job postings, optionally filtered by status (open/closed) or title."""
    clauses = []
    if status is not None:
        clauses.append(eq("Status", str(status).lower()))
    if title:
        clauses.append(contains("Job_Title", title))
    data = await pb.list_records(JOBS, filter_str=and_(clauses), sort="-created", per_page=50)
    return [{"id": r.get("id"), "title": r.get("Job_Title"), "status": r.get("Status"), "requirements": r.get("Requirements")} for r in data.get("items", [])]


EMAIL_TEMPLATES = {
    "interview_invitation": "an interview invitation, warm and professional, including a placeholder for date/time/location and next steps",
    "offer_letter": "a job offer email, professional and congratulatory, including a placeholder for salary, start date, and a deadline to respond",
    "rejection": "a respectful, kind rejection email that leaves the door open for future roles",
    "follow_up": "a brief, friendly follow-up email checking in on the candidate's status/interest",
}


async def summarize_candidate(candidate_id: str, profile: Optional[dict[str, Any]] = None) -> dict[str, str]:
    """Short, human-readable AI-generated summary of one candidate (bullet points).

    If `profile` is passed in (by get_candidate_profile, which already has the
    fields), it's used directly instead of re-fetching — avoids the
    get_candidate_profile <-> summarize_candidate recursion.
    """
    if profile is None:
        profile = await get_candidate_profile(candidate_id, include_summary=False)
    prompt = f"""Summarize this job candidate in 4-6 short bullet points for a
recruiter skimming a dashboard. Be concrete (years of experience, key
skills, notable background). No preamble, no markdown headers — just bullets.

Candidate data (JSON):
{profile}
"""
    resp, model_used = await generate_with_fallback(
        models=settings.gemini_summary_models, contents=prompt,
    )
    return {"summary": resp.text.strip(), "model_used": model_used}

async def generate_email(candidate_id: str, email_type: str) -> dict[str, str]:
    """Generate a recruitment email for a candidate. email_type: interview_invitation, offer_letter, rejection, follow_up."""
    if email_type not in EMAIL_TEMPLATES:
        valid = ", ".join(EMAIL_TEMPLATES)
        raise ValueError(f"Unknown email_type '{email_type}'. Must be one of: {valid}")
    profile = await get_candidate_profile(candidate_id, include_summary=False)
    instruction = EMAIL_TEMPLATES[email_type]
    prompt = f"""Write {instruction}.

Candidate: {profile.get('name')}
Position applied for: {profile.get('applied_position')}

Return the email with a "Subject:" line first, then the body. Keep it
concise and human — no corporate filler, no placeholders like [Company Name]
unless genuinely needed (use "our team" instead where possible).
"""
    resp, model_used = await generate_with_fallback(
        models=settings.gemini_summary_models, contents=prompt,
    )
    return {"email": resp.text.strip(), "email_type": email_type, "model_used": model_used}

# ============================================================================
# 7. TOOL SCHEMAS (for Gemini function calling) + dispatch table
# ============================================================================

TOOLS = [
    genai_types.Tool(function_declarations=[
        genai_types.FunctionDeclaration(
            name="search_candidate",
            description="Search candidates using any combination of filters. Use for open-ended searches like 'find Python developers in Bandung'.",
            parameters=genai_types.Schema(type="OBJECT", properties={
                "name": genai_types.Schema(type="STRING", description="Full or partial candidate name"),
                "skills": genai_types.Schema(type="ARRAY", items=genai_types.Schema(type="STRING")),
                "city": genai_types.Schema(type="STRING"),
                "status": genai_types.Schema(type="STRING", description="e.g. Applied, Interview, Offer, Rejected"),
                "experience_min": genai_types.Schema(type="INTEGER"),
                "experience_max": genai_types.Schema(type="INTEGER"),
                "education": genai_types.Schema(type="STRING"),
                "current_company": genai_types.Schema(type="STRING"),
            }),
        ),
        genai_types.FunctionDeclaration(
            name="get_candidate",
            description="Get every stored field for one specific candidate by id.",
            parameters=genai_types.Schema(type="OBJECT", properties={"candidate_id": genai_types.Schema(type="STRING")}, required=["candidate_id"]),
        ),
        genai_types.FunctionDeclaration(
            name="summarize_candidate",
            description="Short AI-generated summary of one candidate (bullet points). Use instead of get_candidate when the user just wants an overview.",
            parameters=genai_types.Schema(type="OBJECT", properties={"candidate_id": genai_types.Schema(type="STRING")}, required=["candidate_id"]),
        ),
        genai_types.FunctionDeclaration(
            name="get_candidate_profile",
            description="Curated candidate profile shaped for a detail page.",
            parameters=genai_types.Schema(type="OBJECT", properties={"candidate_id": genai_types.Schema(type="STRING")}, required=["candidate_id"]),
        ),
        genai_types.FunctionDeclaration(
            name="get_recent_candidates",
            description="Candidates who applied within the last N days.",
            parameters=genai_types.Schema(type="OBJECT", properties={"days": genai_types.Schema(type="INTEGER", description="Lookback window in days, default 7")}),
        ),
        genai_types.FunctionDeclaration(
            name="get_candidates_by_status",
            description="All candidates with a specific pipeline status, e.g. Rejected, Interview, Offer, Applied.",
            parameters=genai_types.Schema(type="OBJECT", properties={"status": genai_types.Schema(type="STRING")}, required=["status"]),
        ),
        genai_types.FunctionDeclaration(
            name="analytics",
            description="Overall dashboard statistics: total candidates and counts per status.",
            parameters=genai_types.Schema(type="OBJECT", properties={}),
        ),
        genai_types.FunctionDeclaration(
            name="compare_candidates",
            description="Compare two or more candidates side by side.",
            parameters=genai_types.Schema(type="OBJECT", properties={"ids": genai_types.Schema(type="ARRAY", items=genai_types.Schema(type="STRING"))}, required=["ids"]),
        ),
        genai_types.FunctionDeclaration(
            name="navigate",
            description="Propose navigating the user to a dashboard page. NEVER navigates automatically — only returns a suggested action the frontend renders as a button.",
            parameters=genai_types.Schema(type="OBJECT", properties={
                "page": genai_types.Schema(type="STRING", description="One of: dashboard, analytics, candidates, jobs, help-desk, settings")
            }, required=["page"]),
        ),
        genai_types.FunctionDeclaration(
            name="open_resume",
            description="Get the resume file/download URL for a candidate.",
            parameters=genai_types.Schema(type="OBJECT", properties={"candidate_id": genai_types.Schema(type="STRING")}, required=["candidate_id"]),
        ),
        genai_types.FunctionDeclaration(
            name="generate_email",
            description="Generate a recruitment email for a candidate.",
            parameters=genai_types.Schema(type="OBJECT", properties={
                "candidate_id": genai_types.Schema(type="STRING"),
                "email_type": genai_types.Schema(type="STRING", description="One of: interview_invitation, offer_letter, rejection, follow_up"),
            }, required=["candidate_id", "email_type"]),
        ),
        genai_types.FunctionDeclaration(
            name="schedule_interview",
            description="Log an interview scheduling request for a candidate into the pipeline tracker.",
            parameters=genai_types.Schema(type="OBJECT", properties={
                "candidate_id": genai_types.Schema(type="STRING"),
                "proposed_date": genai_types.Schema(type="STRING", description="ISO-ish date/time string, optional"),
                "notes": genai_types.Schema(type="STRING"),
            }, required=["candidate_id"]),
        ),
        genai_types.FunctionDeclaration(
            name="list_jobs",
            description="List job postings, optionally filtered by status (open/closed) or title.",
            parameters=genai_types.Schema(type="OBJECT", properties={
                "status": genai_types.Schema(type="BOOLEAN", description="true = open, false = closed"),
                "title": genai_types.Schema(type="STRING"),
            }),
        ),
    ])
]

DISPATCH = {
    "search_candidate": search_candidate,
    "get_candidate": get_candidate,
    "summarize_candidate": summarize_candidate,
    "get_candidate_profile": get_candidate_profile,
    "get_recent_candidates": get_recent_candidates,
    "get_candidates_by_status": get_candidates_by_status,
    "analytics": analytics,
    "compare_candidates": compare_candidates,
    "navigate": navigate,
    "open_resume": open_resume,
    "generate_email": generate_email,
    "schedule_interview": schedule_interview,
    "list_jobs": list_jobs,
}


# ============================================================================
# 8. AGENT LOOP
# ============================================================================

SYSTEM_INSTRUCTION = """You are the AI Recruitment Assistant embedded in an HR dashboard.

Your job:
- Understand what the recruiter is asking in natural language.
- Decide which tool(s) to call to get real data. NEVER make up candidate
  data, statistics, or IDs — always call a tool.
- You have no direct database or SQL access. The only way to get or change
  data is by calling the provided tools.
- After tool results come back, write a clear, human-friendly answer.
  Use short paragraphs or bullet points. Don't dump raw JSON at the user.
- If the user's request implies moving to a different page (e.g. "open
  analytics", "show me the jobs page"), call the `navigate` tool. Never
  claim you've navigated them there yourself — the frontend shows a button
  for the user to click.
- If a request is ambiguous (e.g. a name matches multiple candidates), ask
  a brief clarifying question instead of guessing.
- If a tool call fails or returns nothing, say so plainly rather than
  inventing a result.
- Keep responses concise. This is a working tool for busy recruiters, not a
  chat companion.
"""


def _history_to_contents(history: list[ChatTurn]) -> list[genai_types.Content]:
    contents = []
    for turn in history:
        role = "user" if turn.role == "user" else "model"
        contents.append(genai_types.Content(role=role, parts=[genai_types.Part(text=turn.content)]))
    return contents


def _extract_navigate_action(tool_name: str, result: dict[str, Any]) -> Optional[UIAction]:
    if tool_name == "navigate" and result.get("valid"):
        return UIAction(type="navigate", label=f"Open {result['page'].replace('-', ' ').title()}", payload={"page": result["page"]})
    if tool_name == "open_resume" and result.get("available"):
        return UIAction(type="open_resume", label="Open Resume", payload={"url": result["url"]})
    if tool_name == "schedule_interview" and result.get("scheduled"):
        return UIAction(type="schedule_interview", label="View Scheduling Request", payload={"tracking_record_id": result.get("tracking_record_id")})
    return None


async def _run_tool(name: str, args: dict[str, Any]) -> Any:
    fn = DISPATCH.get(name)
    if fn is None:
        return {"error": f"Unknown tool '{name}'"}
    try:
        return await fn(**args)
    except TypeError as exc:
        return {"error": f"Invalid arguments for {name}: {exc}"}
    except Exception as exc:  # noqa: BLE001
        logger.exception("Tool '%s' failed", name)
        return {"error": f"{name} failed: {exc}"}


def _preview(result: Any, limit: int = 400) -> Any:
    try:
        s = json.dumps(result, default=str)
    except TypeError:
        s = str(result)
    return s if len(s) <= limit else s[:limit] + "…"


async def run_agent(message: str, history: list[ChatTurn]) -> dict[str, Any]:
    contents = _history_to_contents(history)
    contents.append(genai_types.Content(role="user", parts=[genai_types.Part(text=message)]))

    config = genai_types.GenerateContentConfig(system_instruction=SYSTEM_INSTRUCTION, tools=TOOLS)

    tool_trace: list[ToolTrace] = []
    actions: list[UIAction] = []
    model_used = settings.gemini_primary_model

    for _hop in range(settings.max_agent_tool_hops):
        response, model_used = await generate_with_fallback(
            models=settings.gemini_primary_models, contents=contents, config=config,
        )

        candidate = response.candidates[0]
        parts = candidate.content.parts or []
        function_calls = [p.function_call for p in parts if getattr(p, "function_call", None)]

        if not function_calls:
            final_text = "".join(p.text for p in parts if getattr(p, "text", None))
            return {
                "reply": final_text.strip() or "I couldn't generate a response — please try rephrasing.",
                "actions": actions, "tool_trace": tool_trace, "model_used": model_used,
            }

        contents.append(candidate.content)
        response_parts = []
        for call in function_calls:
            args = dict(call.args or {})
            result = await _run_tool(call.name, args)
            tool_trace.append(ToolTrace(tool=call.name, arguments=args, result_preview=_preview(result)))

            action = _extract_navigate_action(call.name, result if isinstance(result, dict) else {})
            if action:
                actions.append(action)

            response_parts.append(genai_types.Part(function_response=genai_types.FunctionResponse(name=call.name, response={"result": result})))

        contents.append(genai_types.Content(role="user", parts=response_parts))

    return {
        "reply": "This request needed more steps than I'm allowed to take at once — could you narrow it down?",
        "actions": actions, "tool_trace": tool_trace, "model_used": model_used,
    }


# ============================================================================
# 9. FASTAPI APP
# ============================================================================

app = FastAPI(title="HR Recruitment AI Assistant", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown():
    await pb.aclose()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/chat", response_model=ChatResponse)
async def chat(req: ChatRequest):
    """
    Main entrypoint the React frontend calls.

    NOTE on auth: no auth is enforced here so it's easy to run locally. In
    production, add a dependency that resolves the authenticated user and
    pass their id/role into the agent if tools need per-user scoping.
    """
    if not req.message.strip():
        raise HTTPException(status_code=400, detail="message must not be empty")
    try:
        result = await run_agent(req.message, req.history)
    except PocketBaseError as exc:
        raise HTTPException(status_code=502, detail=f"Data backend error: {exc.detail}") from exc
    except Exception as exc:  # noqa: BLE001
        logger.exception("Agent run failed")
        raise HTTPException(status_code=500, detail="The assistant hit an unexpected error.") from exc
    return ChatResponse(**result)

@app.post("/api/send-interview-email")
async def send_interview_email(payload: InterviewEmailRequest):
    if payload.startDateTime:
        dt = datetime.fromisoformat(payload.startDateTime)
        start_label = dt.strftime("%A, %d %B %Y %H:%M")
    else:
        start_label = "waktu akan dikonfirmasi"

    time_range = f"{start_label} – {payload.endTime}" if payload.endTime else start_label

    html = f"""
        <p>Halo {payload.candidateName},</p>
        <p>Interview <strong>{payload.stageName}</strong> kamu dijadwalkan pada
        <strong>{time_range}</strong>.</p>
        {f"<p>{payload.notes}</p>" if payload.notes else ""}
        <p>Sampai jumpa,<br/>Recruitment Team</p>
    """

    try:
        resend.Emails.send(
            {
                "from": "Recruitment Team <onboarding@resend.dev>",
                "to": "raph00707@gmail.com",
                "subject" : f"Jadwal interview: {payload.stageName}",
                "html": html,
            }
        )
        return {"ok": True}
    except Exception as e:
        print("Failed to send interview email:", e)
        return {"ok": False}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)