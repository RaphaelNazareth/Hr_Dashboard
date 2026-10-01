"""
SummaryAI.py (v2) - AI candidate scoring / summary / ranking (Ollama).

What changed vs v1
- strengths = ONLY positives, concerns = ONLY negatives (prompt + schema + code guard + retry)
- summary now explains the score per category (skills / experience / education / availability),
  then lists every strength and every concern
- profiles with too little data are NOT sent to the AI -> "insufficient_data" instead of a fake 0
- uses the service-role key (falls back to the VITE_ keys if you haven't renamed them yet)
- failure rows use the same job_id as success rows (no duplicate rows)
- old / bad rows (older prompt_version, or insufficient_data) are re-analysed by the backfill

Setup:
    pip install ollama supabase python-dotenv pydantic fastapi
    ollama pull qwen2.5:7b          # or llama3.1:8b. 3B models (llama3.2) mix up the two lists

backend/.env:
    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_KEY=...        # service-role key, backend ONLY
    OLLAMA_MODEL=qwen2.5:7b
    RESUME_BUCKET=resumes
    AUTO_BACKFILL=true
    MIN_COMPLETENESS=40             # below this % of profile data, skip the AI

api.py:
    from contextlib import asynccontextmanager
    from fastapi import FastAPI
    from SummaryAI import router as summary_router, start_backfill_in_background

    @asynccontextmanager
    async def lifespan(app):
        start_backfill_in_background()
        yield

    app = FastAPI(lifespan=lifespan)
    app.include_router(summary_router)

Routes:
    POST /api/analyze-candidate        {candidateId, jobId?}  -> analyse, return result (not saved)
    POST /api/reanalyze-candidate      {candidateId, jobId?}  -> analyse AND save (the "Re-analyze" button)
    POST /api/analyze-missing          run the backfill in the background
    GET  /api/analyze-missing/status   {running,total,done,failed,last_error}

CLI:
    python SummaryAI.py --backfill                  analyse candidates with missing/outdated analysis
    python SummaryAI.py --redo-all                  re-analyse EVERY candidate
    python SummaryAI.py <candidate_uuid> [job_uuid] test one candidate (prints, does not save)
"""
from __future__ import annotations

import json
import os
import re
import sys
import tempfile
import threading
from typing import Literal

import ollama
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from supabase import create_client

load_dotenv()

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")
RESUME_BUCKET = os.getenv("RESUME_BUCKET", "resumes")
MIN_COMPLETENESS = int(os.getenv("MIN_COMPLETENESS", "40"))
MAX_RESUME_CHARS = 6000
PROMPT_VERSION = "v2-ollama-numeric"

_supabase = create_client(
    os.getenv("SUPABASE_URL") or os.environ["VITE_SUPABASE_URL"],
    os.getenv("SUPABASE_SERVICE_KEY") or os.environ["VITE_SUPABASE_ANON_KEY"],
)

Recommendation = Literal["strong_fit", "potential_fit", "weak_fit", "insufficient_data"]
RECOMMENDATION_LABEL = {
    "strong_fit": "Strong fit",
    "potential_fit": "Potential fit",
    "weak_fit": "Weak fit",
    "insufficient_data": "Insufficient data",
}


# ---------------------------------------------------------------------------
# Output templates
# ---------------------------------------------------------------------------
class LLMAssessment(BaseModel):
    """Also used as Ollama's JSON schema. Ranges are clamped in code, not rejected."""

    skills_score: int = Field(description="Skills vs job requirements, integer 0-40")
    skills_reason: str = Field(description="One sentence explaining the skills score")
    experience_score: int = Field(description="Relevance and length of work experience, integer 0-30")
    experience_reason: str = Field(description="One sentence explaining the experience score")
    education_score: int = Field(description="Education / certificates vs requirements, integer 0-15")
    education_reason: str = Field(description="One sentence explaining the education score")
    availability_score: int = Field(description="Notice period, right to work, language fit, integer 0-15")
    availability_reason: str = Field(description="One sentence explaining the availability score")
    fit_reasons: list[str] = Field(
        description=(
            "POSITIVE points only (max 5): things the candidate HAS that match the job, "
            "e.g. '3 years forklift operation at PT Maju'. Empty list if there are none. "
            "Never write 'no ...', 'lacks ...' or 'missing ...' here."
        )
    )
    gap_reasons: list[str] = Field(
        description=(
            "NEGATIVE points only (max 5): job requirements the candidate is MISSING or weak on, "
            "e.g. 'no forklift certificate'. Empty list if there are none. "
            "Must not repeat anything from fit_reasons."
        )
    )


class AIAnalysisResult(BaseModel):
    score: int
    score_display: str
    recommendation: Recommendation
    summary: str
    strengths: list[str]
    concerns: list[str]
    breakdown: dict[str, int]
    model: str


# ---------------------------------------------------------------------------
# Cleaning / summary helpers
# ---------------------------------------------------------------------------
NEGATIVE_START = re.compile(
    r"^\s*(no|not|none|lack|lacks|lacking|missing|without|never|does not|doesn't|has no|have no|zero)\b",
    re.I,
)


def _clean(items: list[str] | None, limit: int) -> list[str]:
    seen: set[str] = set()
    out: list[str] = []
    for item in items or []:
        text = re.sub(r"\s+", " ", str(item or "")).strip().rstrip(".;,")
        if not text or text.lower() in seen:
            continue
        seen.add(text.lower())
        out.append(text)
    return out[:limit]


def split_reasons(fits: list[str], gaps: list[str]) -> tuple[list[str], list[str]]:
    """
    Guarantee: strengths are positive, concerns are negative, no overlap.
    - negative-sounding items found in fits are MOVED to gaps (not lost)
    - anything in both lists stays only in gaps
    """
    fits = _clean(fits, 10)
    gaps = _clean(gaps, 10)

    misplaced = [f for f in fits if NEGATIVE_START.match(f)]
    fits = [f for f in fits if not NEGATIVE_START.match(f)]

    gap_keys = {g.lower() for g in gaps}
    gaps += [m for m in misplaced if m.lower() not in gap_keys]

    gap_keys = {g.lower() for g in gaps}
    fits = [f for f in fits if f.lower() not in gap_keys]
    return fits[:5], gaps[:5]


def _looks_broken(fits: list[str], gaps: list[str]) -> bool:
    """True if the model mixed up the two lists (so we should retry once)."""
    f, g = _clean(fits, 10), _clean(gaps, 10)
    overlap = {x.lower() for x in f} & {x.lower() for x in g}
    return bool(overlap) or any(NEGATIVE_START.match(x) for x in f)


def recommendation_from_score(score: int) -> Recommendation:
    # Keep in sync with recommendationFromScore() in the frontend.
    if score >= 75:
        return "strong_fit"
    if score >= 50:
        return "potential_fit"
    return "weak_fit"


def _sentence(text: str) -> str:
    text = (text or "").strip()
    if not text:
        return "No explanation given."
    return text if text.endswith((".", "!", "?")) else text + "."


def build_summary(
    score: int,
    recommendation: str,
    a: LLMAssessment,
    breakdown: dict[str, int],
    fits: list[str],
    gaps: list[str],
) -> str:
    lines = [f"Scored {score}/100 ({RECOMMENDATION_LABEL[recommendation]})."]
    lines.append(
        "Score breakdown: "
        f"Skills {breakdown['skills']}/40 - {_sentence(a.skills_reason)} "
        f"Experience {breakdown['experience']}/30 - {_sentence(a.experience_reason)} "
        f"Education {breakdown['education']}/15 - {_sentence(a.education_reason)} "
        f"Availability {breakdown['availability']}/15 - {_sentence(a.availability_reason)}"
    )
    lines.append(
        "Strengths: " + "; ".join(fits) + "."
        if fits
        else "Strengths: none found in the profile for this role."
    )
    lines.append(
        "Concerns: " + "; ".join(gaps) + "."
        if gaps
        else "Concerns: no significant gaps found."
    )
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def _one(table: str, **eq):
    q = _supabase.table(table).select("*")
    for k, v in eq.items():
        q = q.eq(k, v)
    res = q.limit(1).execute()
    return res.data[0] if res.data else None


def _load_job(candidate: dict, job_id: str | None) -> dict | None:
    job_id = job_id or candidate.get("job_id")
    if job_id:
        return _one("jobs", id=job_id)
    position = (candidate.get("applied_position") or "").strip()
    if position:
        res = _supabase.table("jobs").select("*").ilike("job_title", position).limit(1).execute()
        return res.data[0] if res.data else None
    return None


def _read_resume(candidate: dict) -> str:
    """Best-effort: download the CV from Supabase Storage and extract its text."""
    path = candidate.get("resume_path")
    if not path:
        return ""
    try:
        from cv_extract import extract_cv_text  # your existing extractor

        blob = _supabase.storage.from_(RESUME_BUCKET).download(path)
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
            tmp.write(blob)
            tmp_path = tmp.name
        try:
            return (extract_cv_text(tmp_path) or "")[:MAX_RESUME_CHARS]
        finally:
            os.remove(tmp_path)
    except Exception as exc:
        print(f"[SummaryAI] resume not read ({exc})")
        return ""


def build_profile(candidate_id: str, job_id: str | None) -> tuple[dict, dict | None]:
    """
    Collect ONLY job-relevant information. Excluded on purpose: ID/KTP numbers,
    gender, age, religion, marital status, family, address, salary.
    """
    candidate = _one("candidates", id=candidate_id)
    if not candidate:
        raise ValueError(f"Candidate {candidate_id} not found")

    job = _load_job(candidate, job_id)

    education = (
        _supabase.table("candidate_education")
        .select("level,institution_name,major,graduation_year")
        .eq("candidate_id", candidate_id).execute().data
    )
    employment = (
        _supabase.table("candidate_employment_history")
        .select("company_name,last_position,business_type,job_description,start_date,still_working,finish_date,reason_for_leaving")
        .eq("candidate_id", candidate_id).order("start_date", desc=True).execute().data
    )

    profile = {
        "applied_position": candidate.get("applied_position"),
        "city": candidate.get("city"),
        "skills": candidate.get("skills"),
        "experience_summary": candidate.get("experience"),
        "education_summary": candidate.get("education"),
        "school": candidate.get("school"),
        "certificates": candidate.get("certificates"),
        "languages": candidate.get("languages"),
        "notice_period": candidate.get("notice_period"),
        "legal_right_to_work": candidate.get("legal_right_to_work"),
        "education_history": education,
        "employment_history": employment,
        "resume_text": _read_resume(candidate),
    }
    return {"candidate": candidate, "profile": profile}, job


def profile_completeness(profile: dict) -> tuple[int, list[str]]:
    """Returns (0-100 completeness, names of the missing sections)."""

    def has(key: str) -> bool:
        return bool(str(profile.get(key) or "").strip())

    checks = {
        "skills": has("skills"),
        "work experience": bool(profile.get("employment_history")) or has("experience_summary"),
        "education": bool(profile.get("education_history")) or has("education_summary"),
        "resume": has("resume_text"),
        "certificates": has("certificates"),
        "languages": has("languages"),
    }
    weights = {"skills": 25, "work experience": 30, "education": 15, "resume": 20, "certificates": 5, "languages": 5}
    score = sum(w for k, w in weights.items() if checks[k])
    return score, [k for k, ok in checks.items() if not ok]


# ---------------------------------------------------------------------------
# Prompting
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = """You are an experienced recruiter screening candidates for Mattel Indonesia.
Assess how well ONE candidate fits ONE job, using only the information provided.

SCORING (all integers)
- skills_score 0-40, experience_score 0-30, education_score 0-15, availability_score 0-15.
- Be strict: full marks only if every key requirement is clearly met.
- Each *_reason is ONE sentence that justifies that sub-score using facts from the profile.
- If notice period / right to work is simply not stated, give about half of the availability points
  and say it is not stated.

TWO LISTS, DIFFERENT MEANINGS (most important rule)
- fit_reasons = POSITIVES. Things the candidate HAS that match the job.
  Good: "3 years of forklift operation at PT Maju", "Warehouse management diploma", "Fluent English".
  Never start a fit_reason with "no", "lacks", "missing" or "without".
- gap_reasons = NEGATIVES. Requirements the candidate is MISSING or weak on.
  Good: "No forklift certificate", "Only 6 months of relevant experience".
- The two lists must NEVER contain the same or similar items. An item is either a positive or a negative.
- If there are no positives, fit_reasons must be an empty list []. Do not fill it with negatives.
- If there are no gaps, gap_reasons must be an empty list [].
- Max 5 items per list. Each item is one short, specific phrase tied to the job requirements.

OTHER RULES
- Never use or infer gender, age, religion, marital status, ethnicity or appearance.
- Do not invent facts. A blank field means "not stated", NOT "the candidate lacks it":
  only list a gap when the profile shows the candidate lacks something, or say "not stated".
Respond ONLY with JSON matching the requested schema."""

RETRY_NOTE = (
    "\n\nIMPORTANT: your previous answer put negative or duplicate items in fit_reasons. "
    "fit_reasons must contain ONLY things the candidate HAS (positives). "
    "gap_reasons must contain ONLY things the candidate LACKS (negatives). "
    "No item may appear in both lists. Use [] for an empty list."
)


def _build_user_prompt(profile: dict, job: dict | None) -> str:
    if job:
        job_block = (
            f"Title: {job.get('job_title')}\n"
            f"Description: {job.get('job_description') or 'n/a'}\n"
            f"Requirements: {job.get('requirements') or 'n/a'}"
        )
    else:
        job_block = (
            f"No matching job posting found. Applied position: {profile.get('applied_position') or 'unknown'}. "
            "Give a general assessment for that position and mention the missing job details as a concern."
        )
    return (
        f"=== JOB ===\n{job_block}\n\n"
        f"=== CANDIDATE ===\n{json.dumps(profile, ensure_ascii=False, default=str, indent=2)}"
    )


def _call_llm(user_prompt: str) -> LLMAssessment:
    response = ollama.chat(
        model=OLLAMA_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt},
        ],
        format=LLMAssessment.model_json_schema(),
        options={"temperature": 0},
    )
    return LLMAssessment.model_validate_json(response["message"]["content"])


def _clamp(value: int, high: int) -> int:
    return max(0, min(high, int(value)))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def _insufficient_result(missing: list[str]) -> AIAnalysisResult:
    what = ", ".join(missing) if missing else "key sections"
    return AIAnalysisResult(
        score=0,
        score_display="N/A",
        recommendation="insufficient_data",
        summary=(
            "Not enough information to assess this candidate, so no score was given. "
            f"Missing: {what}. Ask the candidate to complete their profile, then re-analyze."
        ),
        strengths=[],
        concerns=[f"Profile incomplete: {m} not provided" for m in missing],
        breakdown={"skills": 0, "experience": 0, "education": 0, "availability": 0},
        model="rule:insufficient_data",
    )


def analyze_candidate_with_job(
    candidate_id: str, job_id: str | None = None
) -> tuple[AIAnalysisResult, str | None]:
    """Returns (result, resolved_job_id)."""
    data, job = build_profile(candidate_id, job_id)
    resolved_job_id = job["id"] if job else None

    completeness, missing = profile_completeness(data["profile"])
    if completeness < MIN_COMPLETENESS:
        return _insufficient_result(missing), resolved_job_id

    user_prompt = _build_user_prompt(data["profile"], job)
    assessment = _call_llm(user_prompt)
    if _looks_broken(assessment.fit_reasons, assessment.gap_reasons):
        print("[SummaryAI] model mixed up strengths/concerns, retrying once")
        assessment = _call_llm(user_prompt + RETRY_NOTE)

    fits, gaps = split_reasons(assessment.fit_reasons, assessment.gap_reasons)

    breakdown = {
        "skills": _clamp(assessment.skills_score, 40),
        "experience": _clamp(assessment.experience_score, 30),
        "education": _clamp(assessment.education_score, 15),
        "availability": _clamp(assessment.availability_score, 15),
    }
    score = sum(breakdown.values())
    recommendation = recommendation_from_score(score)

    result = AIAnalysisResult(
        score=score,
        score_display=f"{score}/100",
        recommendation=recommendation,
        summary=build_summary(score, recommendation, assessment, breakdown, fits, gaps),
        strengths=fits,
        concerns=gaps,
        breakdown=breakdown,
        model=f"ollama:{OLLAMA_MODEL}",
    )
    return result, resolved_job_id


def analyze_candidate(candidate_id: str, job_id: str | None = None) -> AIAnalysisResult:
    return analyze_candidate_with_job(candidate_id, job_id)[0]


# ---------------------------------------------------------------------------
# Saving results to candidate_ai_analyses
# ---------------------------------------------------------------------------
def _write_row(candidate_id: str, job_id: str | None, fields: dict) -> None:
    """Update the (candidate, job) row if it exists, otherwise insert it."""
    table = _supabase.table("candidate_ai_analyses")
    q = table.select("id").eq("candidate_id", candidate_id)
    q = q.is_("job_id", "null") if job_id is None else q.eq("job_id", job_id)
    existing = q.limit(1).execute().data

    if existing:
        table.update(fields).eq("id", existing[0]["id"]).execute()
    else:
        table.insert({"candidate_id": candidate_id, "job_id": job_id, **fields}).execute()


def save_analysis(candidate_id: str, job_id: str | None, result: AIAnalysisResult) -> None:
    _write_row(
        candidate_id,
        job_id,
        {
            "score": result.score,
            "recommendation": result.recommendation,
            "summary": result.summary,
            "strengths": result.strengths,
            "concerns": result.concerns,
            "status": "completed",
            "error": None,
            "model": result.model,
            "prompt_version": PROMPT_VERSION,
        },
    )


def save_failure(candidate_id: str, job_id: str | None, message: str) -> None:
    _write_row(
        candidate_id,
        job_id,
        {"status": "failed", "error": message[:500], "prompt_version": PROMPT_VERSION},
    )


def _resolve_job_id(candidate_id: str) -> str | None:
    """Same job the analysis would use, so failure rows don't create duplicates."""
    try:
        candidate = _one("candidates", id=candidate_id)
        job = _load_job(candidate, None) if candidate else None
        return job["id"] if job else None
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Backfill
# ---------------------------------------------------------------------------
AUTO_BACKFILL = os.getenv("AUTO_BACKFILL", "true").lower() in ("1", "true", "yes")

_backfill_lock = threading.Lock()
backfill_status: dict = {"running": False, "total": 0, "done": 0, "failed": 0, "last_error": None}


def _fetch_all(table: str, columns: str) -> list[dict]:
    """Page through a table (Supabase returns max 1000 rows per request)."""
    rows: list[dict] = []
    start, page = 0, 1000
    while True:
        chunk = (
            _supabase.table(table).select(columns).order("id")
            .range(start, start + page - 1).execute().data
        )
        rows.extend(chunk)
        if len(chunk) < page:
            return rows
        start += page


def find_candidates_to_analyze(force: bool = False) -> list[dict]:
    """
    A candidate is skipped only if it already has a COMPLETED analysis that:
      - has a non-empty summary
      - was made with the current PROMPT_VERSION
      - was made by the AI (rule:insufficient_data rows are retried, since the
        candidate may have completed their profile since)
    """
    candidates = _fetch_all("candidates", "id,first_name,last_name,applied_position")
    if force:
        return candidates

    analyses = _fetch_all("candidate_ai_analyses", "id,candidate_id,summary,status,prompt_version,model")
    up_to_date = {
        a["candidate_id"]
        for a in analyses
        if a.get("status") == "completed"
        and (a.get("summary") or "").strip()
        and a.get("prompt_version") == PROMPT_VERSION
        and not str(a.get("model") or "").startswith("rule:")
    }
    return [c for c in candidates if c["id"] not in up_to_date]


def backfill_missing_summaries(force: bool = False) -> dict:
    if not _backfill_lock.acquire(blocking=False):
        print("[SummaryAI] backfill already running, skipping")
        return backfill_status

    try:
        try:
            ollama.list()
        except Exception as exc:
            backfill_status.update(running=False, last_error=f"Ollama not reachable: {exc}")
            print(f"[SummaryAI] {backfill_status['last_error']}")
            return backfill_status

        todo = find_candidates_to_analyze(force)
        backfill_status.update(running=True, total=len(todo), done=0, failed=0, last_error=None)
        print(f"[SummaryAI] {len(todo)} candidate(s) to analyse (model: {OLLAMA_MODEL})")

        for i, c in enumerate(todo, start=1):
            name = f"{c.get('first_name', '')} {c.get('last_name', '')}".strip() or c["id"]
            try:
                result, job_id = analyze_candidate_with_job(c["id"])
                save_analysis(c["id"], job_id, result)
                backfill_status["done"] += 1
                print(f"[SummaryAI] ({i}/{len(todo)}) {name}: {result.score_display} {result.recommendation}")
            except Exception as exc:
                backfill_status["failed"] += 1
                backfill_status["last_error"] = str(exc)
                print(f"[SummaryAI] ({i}/{len(todo)}) {name}: FAILED - {exc}")
                try:
                    save_failure(c["id"], _resolve_job_id(c["id"]), str(exc))
                except Exception:
                    pass

        print(f"[SummaryAI] backfill finished: {backfill_status['done']} done, {backfill_status['failed']} failed")
        return backfill_status
    finally:
        backfill_status["running"] = False
        _backfill_lock.release()


def start_backfill_in_background() -> None:
    """Call on app startup. Runs in a thread so the API boots immediately."""
    if not AUTO_BACKFILL:
        print("[SummaryAI] AUTO_BACKFILL is off, skipping startup backfill")
        return
    threading.Thread(target=backfill_missing_summaries, name="summary-backfill", daemon=True).start()


# ---------------------------------------------------------------------------
# FastAPI routes
# ---------------------------------------------------------------------------
router = APIRouter()


class AnalyzeRequest(BaseModel):
    candidateId: str
    jobId: str | None = None


@router.post("/api/analyze-candidate", response_model=AIAnalysisResult)
def analyze_candidate_route(payload: AnalyzeRequest):
    try:
        return analyze_candidate(payload.candidateId, payload.jobId)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        print("[SummaryAI] analysis failed:", exc)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


@router.post("/api/reanalyze-candidate", response_model=AIAnalysisResult)
def reanalyze_candidate_route(payload: AnalyzeRequest):
    """The 'Re-analyze' button: analyse again and overwrite the saved row."""
    try:
        result, job_id = analyze_candidate_with_job(payload.candidateId, payload.jobId)
        save_analysis(payload.candidateId, job_id, result)
        return result
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    except Exception as exc:
        print("[SummaryAI] re-analysis failed:", exc)
        raise HTTPException(status_code=500, detail=f"Analysis failed: {exc}")


@router.post("/api/analyze-missing")
def analyze_missing_route():
    if backfill_status["running"]:
        return {"started": False, "status": backfill_status}
    threading.Thread(target=backfill_missing_summaries, name="summary-backfill", daemon=True).start()
    return {"started": True}


@router.get("/api/analyze-missing/status")
def analyze_missing_status():
    return backfill_status


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit("usage: python SummaryAI.py --backfill | --redo-all | <candidate_uuid> [job_uuid]")
    if sys.argv[1] == "--backfill":
        backfill_missing_summaries()
    elif sys.argv[1] == "--redo-all":
        backfill_missing_summaries(force=True)
    else:
        print(analyze_candidate(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None).model_dump_json(indent=2))