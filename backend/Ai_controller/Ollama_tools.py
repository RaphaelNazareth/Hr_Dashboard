"""ATS agent tools. psycopg 3, parameterized SQL, no DB-side functions required."""

from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from psycopg.rows import dict_row

STAGES = [
    "Applied", "CV Screening", "Phone Screening", "Psychotest", "FGD",
    "Interview HR", "Interview User", "Interview Manager", "MCU",
    "Offering", "Hired", "Rejected",
]
EDU_LEVELS = ["SMA/SMK", "D3", "S1", "S2", "S3"]
EDU_RANK = {lvl: i for i, lvl in enumerate(EDU_LEVELS, start=1)}
SORTS = {
    "applied_at_desc": "c.applied_at DESC NULLS LAST",
    "applied_at_asc": "c.applied_at ASC NULLS LAST",
    "name_asc": "full_name ASC",
    "education_desc": "edu_rank DESC NULLS LAST, c.applied_at DESC",
}

TOOLS = [
    {
        "name": "search_candidates",
        "description": (
            "Search and filter candidates in the ATS. Returns summary rows (name, position, "
            "stage, education, applied date) plus total_matches for pagination. Use for questions "
            "like 'kandidat S1 di tahap Interview HR' or 'applicants for Operator in Jakarta'. "
            "Call get_candidate afterwards for full detail on one person. Never invent candidates "
            "that are not in the result."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "Keyword match on name, skills, applied position, school. Short keywords, not sentences."},
                "status": {"type": "array", "items": {"type": "string", "enum": STAGES}, "description": "Pipeline stages to include. Omit for all."},
                "job_id": {"type": "string", "description": "Job UUID from list_jobs. Preferred over job_title."},
                "job_title": {"type": "string", "description": "Fuzzy job title match when the UUID is unknown."},
                "city": {"type": "string", "description": "Exact city, case-insensitive."},
                "education_level": {"type": "array", "items": {"type": "string", "enum": EDU_LEVELS}, "description": "Matches candidates holding ANY of these levels."},
                "min_age": {"type": "integer"},
                "max_age": {"type": "integer"},
                "applied_after": {"type": "string", "description": "ISO 8601, inclusive lower bound."},
                "applied_before": {"type": "string", "description": "ISO 8601, exclusive upper bound."},
                "has_experience": {"type": "boolean", "description": "true = has employment history; false = fresh graduate."},
                "sort": {"type": "string", "enum": list(SORTS), "description": "Default applied_at_desc."},
                "limit": {"type": "integer", "description": "1-100, default 20."},
                "offset": {"type": "integer", "description": "Default 0."},
            },
            "required": [],
        },
    },
    {
        "name": "semantic_candidate_search",
        "description": (
            "Find candidates by MEANING rather than by keyword, using vector similarity over "
            "their skills, work history, education and certificates. Use this when the user "
            "describes the kind of person they want in their own words — 'someone used to "
            "running production machines', 'kandidat yang terbiasa kerja shift malam', "
            "'berpengalaman QC di manufaktur' — where the right people may not use those exact "
            "words in their profile. Use search_candidates instead when every criterion is an "
            "exact value (a name, a city, a stage). Structured filters here are applied as hard "
            "constraints ON TOP of the meaning match, so 'QC experience in Bogor at Psychotest' "
            "is one call. Results carry a similarity score from 0 to 1; treat anything below "
            "roughly 0.5 as weak and say so rather than presenting it as a match."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "What kind of candidate is wanted, in natural language. A phrase or sentence, not keywords."},
                "status": {"type": "array", "items": {"type": "string", "enum": STAGES}, "description": "Hard filter on pipeline stage."},
                "city": {"type": "string", "description": "Hard filter, matches city by substring."},
                "education_level": {"type": "array", "items": {"type": "string", "enum": EDU_LEVELS}, "description": "Hard filter on the education classification."},
                "job_title": {"type": "string", "description": "Hard filter on applied position or job title."},
                "min_age": {"type": "integer"},
                "max_age": {"type": "integer"},
                "has_experience": {"type": "boolean", "description": "true = has employment history; false = fresh graduate."},
                "min_similarity": {"type": "number", "description": "0-1 floor on similarity. Default 0.35."},
                "limit": {"type": "integer", "description": "1-50, default 10."},
                "offset": {"type": "integer", "description": "Default 0."},
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_candidate",
        "description": (
            "Full profile for one candidate: personal data, address, emergency contact, education, "
            "employment history, family, application history, offer details, stage tracking log and "
            "interview schedule. Identify by UUID (from search_candidates) or candidate_code. "
            "National ID is masked and salary figures redacted unless include_sensitive is set."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "candidate_id": {"type": "string", "description": "Candidate UUID."},
                "candidate_code": {"type": "string", "description": "Human-readable code, when UUID is unknown."},
                "include_sensitive": {"type": "boolean", "description": "Set true ONLY on an explicit, authorized need for NIK, family card number or salary. Default false."},
            },
            "required": [],
        },
    },
    {
        "name": "list_jobs",
        "description": (
            "List job openings with candidate counts per pipeline stage. Use this first when the user "
            "names a role rather than an ID, then pass job_id into search_candidates. Also answers "
            "funnel questions like 'berapa pelamar posisi X' or 'which openings have no applicants'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {"type": "string", "enum": ["Open", "Closed"], "description": "Omit for both."},
                "query": {"type": "string", "description": "Fuzzy match on title or description."},
                "created_after": {"type": "string", "description": "ISO 8601."},
                "limit": {"type": "integer", "description": "1-200, default 50."},
                "offset": {"type": "integer", "description": "Default 0."},
            },
            "required": [],
        },
    },
    {
        "name": "get_application_stats",
        "description": (
            "Aggregate application statistics: totals, breakdown by stage, job, city, education "
            "level and month, plus median days-to-hire. Use for reporting questions like 'berapa "
            "total pelamar bulan ini', 'kota mana paling banyak melamar', 'how many hires this "
            "quarter'. Do not use this to look up individuals — use search_candidates."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Restrict all statistics to one job."},
                "applied_after": {"type": "string", "description": "ISO 8601, inclusive lower bound on application date."},
                "applied_before": {"type": "string", "description": "ISO 8601, exclusive upper bound."},
                "top_n": {"type": "integer", "description": "Rows to return per breakdown (job, city). 1-50, default 10."},
            },
            "required": [],
        },
    },
    {
        "name": "get_candidate_pipeline",
        "description": (
            "Recruitment funnel: how many candidates ever reached each stage, how many sit there "
            "now, stage-to-stage conversion rate, and median days spent in each stage. Scope to one "
            "job with job_id, or omit for the whole pipeline. Use for 'di mana kandidat paling "
            "banyak drop', 'conversion rate from Psychotest to Interview HR', bottleneck analysis. "
            "'reached' counts come from the stage history log, 'current' from the candidate's "
            "present status."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Restrict the funnel to one job."},
                "applied_after": {"type": "string", "description": "ISO 8601; filters on candidate application date, not stage date."},
                "applied_before": {"type": "string", "description": "ISO 8601."},
            },
            "required": [],
        },
    },
    {
        "name": "get_screening_results",
        "description": (
            "AI screening results for candidates: match score, recommendation, summary, strengths, "
            "gaps and per-requirement matches. Filter by job, candidate, minimum score or "
            "recommendation. Use for 'kandidat dengan skor tertinggi untuk posisi X' or 'which "
            "screening results still need human review'. These scores are advisory only — always "
            "present them as a recommendation to be reviewed, never as a hiring decision, and state "
            "the score alongside the reasoning rather than on its own."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "job_id": {"type": "string", "description": "Job UUID from list_jobs."},
                "candidate_id": {"type": "string", "description": "Single candidate UUID."},
                "min_score": {"type": "number", "description": "0-100 inclusive lower bound on match score."},
                "recommendation": {
                    "type": "array",
                    "items": {"type": "string", "enum": ["Strong Match", "Match", "Weak Match", "Not Match"]},
                    "description": "Include only these recommendation levels.",
                },
                "only_unreviewed": {"type": "boolean", "description": "true = only results no human has reviewed yet."},
                "sort": {"type": "string", "enum": ["score_desc", "score_asc", "created_at_desc"], "description": "Default score_desc."},
                "limit": {"type": "integer", "description": "1-100, default 20."},
                "offset": {"type": "integer", "description": "Default 0."},
            },
            "required": [],
        },
    },
]

RECOMMENDATIONS = ["Strong Match", "Match", "Weak Match", "Not Match"]

# Run this once. The base schema has no AI screening table; get_screening_results
# returns a structured error until it exists.
SCREENING_TABLE_DDL = """
CREATE TABLE IF NOT EXISTS public.candidate_screening (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id        uuid NOT NULL REFERENCES public.candidates(id) ON DELETE CASCADE,
    job_id              uuid REFERENCES public.jobs(id),
    score               numeric(5,2) CHECK (score BETWEEN 0 AND 100),
    recommendation      text CHECK (recommendation IN
                            ('Strong Match','Match','Weak Match','Not Match')),
    summary             text,
    strengths           jsonb NOT NULL DEFAULT '[]'::jsonb,
    gaps                jsonb NOT NULL DEFAULT '[]'::jsonb,
    requirement_matches jsonb NOT NULL DEFAULT '{}'::jsonb,
    model               text,
    prompt_version      text,
    reviewed_by_human   boolean NOT NULL DEFAULT false,
    human_decision      text CHECK (human_decision IN
                            ('Agree','Override - Advance','Override - Reject')),
    reviewed_at         timestamptz,
    created_at          timestamptz NOT NULL DEFAULT now(),
    UNIQUE (candidate_id, job_id)
);
CREATE INDEX IF NOT EXISTS idx_screening_job_score
    ON public.candidate_screening (job_id, score DESC);
CREATE INDEX IF NOT EXISTS idx_screening_candidate
    ON public.candidate_screening (candidate_id);
"""

_SEARCH_TEXT = (
    "c.first_name || ' ' || c.last_name || ' ' || coalesce(c.skills,'') || ' ' "
    "|| coalesce(c.applied_position,'') || ' ' || coalesce(c.school,'')"
)
_EFF_AGE = "coalesce(c.age, date_part('year', age(c.date_of_birth))::int)"


def _jsonable(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: _jsonable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, UUID):
        return str(value)
    return value


def _strip(row: dict | None, *drop: str) -> dict | None:
    if row is None:
        return None
    return {k: v for k, v in row.items() if k not in drop and k not in ("id", "candidate_id")}


def search_candidates(
    conn,
    query: str | None = None,
    status: list[str] | None = None,
    job_id: str | None = None,
    job_title: str | None = None,
    city: str | None = None,
    education_level: list[str] | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
    applied_after: str | None = None,
    applied_before: str | None = None,
    has_experience: bool | None = None,
    sort: str = "applied_at_desc",
    limit: int = 20,
    offset: int = 0,
) -> dict:
    where: list[str] = []
    params: list[Any] = []

    if query:
        where.append(f"({_SEARCH_TEXT}) ILIKE %s")
        params.append(f"%{query}%")
    if status:
        bad = [s for s in status if s not in STAGES]
        if bad:
            raise ValueError(f"unknown status: {bad}")
        where.append("c.status = ANY(%s)")
        params.append(status)
    if job_id:
        where.append("c.job_id = %s")
        params.append(job_id)
    if job_title:
        where.append("(j.job_title ILIKE %s OR c.applied_position ILIKE %s)")
        params += [f"%{job_title}%", f"%{job_title}%"]
    if city:
        # Substring, not equality: Indonesian cities carry an administrative
        # prefix, so "Bogor" has to reach both "Kota Bogor" and "Kabupaten
        # Bogor". An exact match returns zero for the way people actually ask.
        where.append("c.city ILIKE %s")
        params.append(f"%{city}%")
    if education_level:
        bad = [e for e in education_level if e not in EDU_LEVELS]
        if bad:
            raise ValueError(f"unknown education level: {bad}")
        # candidates.education is the authoritative classification. The old
        # filter read candidate_education.level instead, which holds no S3 row
        # at all — so "kandidat S3" returned nothing while 78 of them existed.
        where.append("c.education = ANY(%s)")
        params.append(education_level)
    if min_age is not None:
        where.append(f"{_EFF_AGE} >= %s")
        params.append(min_age)
    if max_age is not None:
        where.append(f"{_EFF_AGE} <= %s")
        params.append(max_age)
    if applied_after:
        where.append("c.applied_at >= %s")
        params.append(applied_after)
    if applied_before:
        where.append("c.applied_at < %s")
        params.append(applied_before)
    if has_experience is not None:
        where.append("(coalesce(emp.companies, 0) > 0) = %s")
        params.append(has_experience)

    limit = max(1, min(int(limit or 20), 100))
    offset = max(0, int(offset or 0))
    order = SORTS.get(sort, SORTS["applied_at_desc"])
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    # Education comes from candidates.education / candidates.school, not from
    # the candidate_education detail table. The two disagree for roughly four
    # of every five candidates, and reporting the detail table's value made the
    # assistant contradict the dashboard — which reads as the model making
    # things up, even though every field it printed was really in a row.
    sql = f"""
        WITH emp AS (
            SELECT candidate_id, count(*)::int AS companies
            FROM candidate_employment_history GROUP BY candidate_id
        )
        SELECT c.id AS candidate_id,
               c.candidate_code,
               c.first_name || ' ' || c.last_name AS full_name,
               {_EFF_AGE} AS age,
               c.city,
               c.applied_position,
               c.job_id,
               j.job_title,
               c.status,
               c.education AS education_level,
               c.school,
               coalesce(emp.companies, 0) AS companies_worked,
               c.notice_period,
               c.applied_at,
               CASE c.education {" ".join(f"WHEN '{k}' THEN {v}" for k, v in EDU_RANK.items())} ELSE 0 END AS edu_rank,
               count(*) OVER () AS total_matches
        FROM candidates c
        LEFT JOIN jobs j ON j.id = c.job_id
        LEFT JOIN emp ON emp.candidate_id = c.id
        {clause}
        ORDER BY {order}
        LIMIT %s OFFSET %s
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params + [limit, offset])
        rows = cur.fetchall()

    total = rows[0]["total_matches"] if rows else 0
    for r in rows:
        r.pop("total_matches", None)
        r.pop("edu_rank", None)
    return _jsonable({
        "total_matches": total,
        "returned": len(rows),
        "limit": limit,
        "offset": offset,
        "candidates": rows,
    })


def get_candidate(
    conn,
    candidate_id: str | None = None,
    candidate_code: str | None = None,
    include_sensitive: bool = False,
) -> dict | None:
    if not candidate_id and not candidate_code:
        raise ValueError("candidate_id or candidate_code is required")

    key_sql = "c.id = %s" if candidate_id else "c.candidate_code = %s"
    key = candidate_id or candidate_code

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""SELECT c.*, {_EFF_AGE} AS eff_age,
                       j.id AS j_id, j.job_title, j.status AS j_status, j.requirements
                FROM candidates c
                LEFT JOIN jobs j ON j.id = c.job_id
                WHERE {key_sql} LIMIT 1""",
            [key],
        )
        c = cur.fetchone()
        if not c:
            return None
        cid = c["id"]

        def fetch(sql: str, one: bool = False):
            cur.execute(sql, [cid])
            return cur.fetchone() if one else cur.fetchall()

        address = fetch("SELECT * FROM candidate_address WHERE candidate_id = %s", one=True)
        emergency = fetch("SELECT * FROM candidate_emergency_contact WHERE candidate_id = %s", one=True)
        education = fetch("SELECT * FROM candidate_education WHERE candidate_id = %s")
        employment = fetch(
            "SELECT * FROM candidate_employment_history WHERE candidate_id = %s "
            "ORDER BY start_date DESC NULLS LAST"
        )
        family = fetch("SELECT * FROM candidate_family WHERE candidate_id = %s", one=True)
        children = fetch("SELECT * FROM candidate_children WHERE candidate_id = %s")
        app_history = fetch("SELECT * FROM candidate_application_history WHERE candidate_id = %s", one=True)
        offer = fetch("SELECT * FROM candidate_offer_details WHERE candidate_id = %s", one=True)
        tracking = fetch(
            "SELECT stage, moved_at, notes FROM candidate_tracking WHERE candidate_id = %s "
            "ORDER BY moved_at DESC"
        )
        interviews = fetch(
            "SELECT stage, start_time, end_time, interviewer, status, notes "
            "FROM interview_schedule WHERE candidate_id = %s ORDER BY start_time DESC"
        )

    nik = c.get("identity_card_number")
    education.sort(key=lambda e: EDU_RANK.get(e.get("level"), 0), reverse=True)

    for w in employment:
        if not include_sensitive:
            w["recent_gross_monthly_salary"] = "redacted"
        w.pop("id", None)
        w.pop("candidate_id", None)
    if offer and not include_sensitive:
        offer["expected_gross_monthly_salary"] = "redacted"

    result = {
        "candidate": {
            "id": c["id"],
            "candidate_code": c["candidate_code"],
            "full_name": f"{c['first_name']} {c['last_name']}",
            "first_name": c["first_name"],
            "last_name": c["last_name"],
            "age": c["eff_age"],
            "date_of_birth": c["date_of_birth"],
            "place_of_birth": c["place_of_birth"],
            "gender": c["gender"],
            "marital_status": c["marital_status"],
            "email": c["email"],
            "phone_number": c["phone_number"],
            "mobile_phone_wa": c["mobile_phone_wa"],
            "identity_card_number": (
                nik if include_sensitive else (f"{'*' * 12}{nik[-4:]}" if nik else None)
            ),
            "family_card_number": c["family_card_number"] if include_sensitive else None,
            "city": c["city"],
            # The classification and school of record. Named distinctly from
            # "education_history" below because the two sources disagree for
            # most candidates; these are the ones the dashboard shows.
            "education_level": c["education"],
            "school": c["school"],
            "applied_position": c["applied_position"],
            "status": c["status"],
            "notice_period": c["notice_period"],
            "skills": c["skills"],
            "certificates": c["certificates"],
            "languages": c["languages"],
            "experience_summary": c["experience"],
            "is_18_plus": c["is_18_plus"],
            "legal_right_to_work": c["legal_right_to_work"],
            "former_current_employee": c["former_current_mattel_employee"],
            "consents": {
                "data_collection": c["consent_data_collection"],
                "data_usage": c["consent_data_usage"],
                "data_retention": c["consent_data_retention"],
            },
            "resume_path": c["resume_path"],
            "applied_at": c["applied_at"],
        },
        "job": (
            {
                "id": c["j_id"],
                "job_title": c["job_title"],
                "status": c["j_status"],
                "requirements": c["requirements"],
            }
            if c["j_id"]
            else None
        ),
        "address": _strip(address),
        "emergency_contact": _strip(emergency),
        # Detail rows, NOT the classification. Kept under a name that cannot be
        # mistaken for candidate.education_level, so a level found in here is
        # never reported as "their education".
        "education_history": [_strip(e) for e in education],
        "employment_history": employment,
        "family": (
            {**_strip(family), "children": [_strip(ch) for ch in children]} if family else None
        ),
        "application_history": _strip(app_history),
        "offer_details": _strip(offer),
        "tracking": tracking,
        "interviews": interviews,
    }
    return _jsonable(result)


def list_jobs(
    conn,
    status: str | None = None,
    query: str | None = None,
    created_after: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> dict:
    where: list[str] = []
    params: list[Any] = []

    if status:
        if status not in ("Open", "Closed"):
            raise ValueError("status must be 'Open' or 'Closed'")
        where.append("j.status = %s")
        params.append(status)
    if query:
        where.append("(j.job_title ILIKE %s OR coalesce(j.job_description,'') ILIKE %s)")
        params += [f"%{query}%", f"%{query}%"]
    if created_after:
        where.append("j.created_at >= %s")
        params.append(created_after)

    limit = max(1, min(int(limit or 50), 200))
    offset = max(0, int(offset or 0))
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    sql = f"""
        SELECT j.id AS job_id, j.job_title, j.status, j.job_description, j.requirements,
               j.created_at, count(*) OVER () AS total_matches
        FROM jobs j
        {clause}
        ORDER BY (j.status = 'Open') DESC, j.created_at DESC
        LIMIT %s OFFSET %s
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params + [limit, offset])
        jobs = cur.fetchall()
        ids = [j["job_id"] for j in jobs]
        counts: dict[Any, dict[str, int]] = {}
        last_app: dict[Any, Any] = {}
        if ids:
            cur.execute(
                "SELECT job_id, status, count(*)::int AS n, max(applied_at) AS last_app "
                "FROM candidates WHERE job_id = ANY(%s) GROUP BY job_id, status",
                [ids],
            )
            for row in cur.fetchall():
                counts.setdefault(row["job_id"], {})[row["status"]] = row["n"]
                prev = last_app.get(row["job_id"])
                if prev is None or row["last_app"] > prev:
                    last_app[row["job_id"]] = row["last_app"]

    total = jobs[0]["total_matches"] if jobs else 0
    for j in jobs:
        j.pop("total_matches", None)
        stages = counts.get(j["job_id"], {})
        j["stage_counts"] = stages
        j["total_candidates"] = sum(stages.values())
        j["hired_count"] = stages.get("Hired", 0)
        j["rejected_count"] = stages.get("Rejected", 0)
        j["active_candidates"] = j["total_candidates"] - j["hired_count"] - j["rejected_count"]
        j["last_application"] = last_app.get(j["job_id"])

    return _jsonable({
        "total_matches": total,
        "returned": len(jobs),
        "limit": limit,
        "offset": offset,
        "jobs": jobs,
    })


def get_application_stats(
    conn,
    job_id: str | None = None,
    applied_after: str | None = None,
    applied_before: str | None = None,
    top_n: int = 10,
) -> dict:
    where: list[str] = []
    params: list[Any] = []
    if job_id:
        where.append("c.job_id = %s")
        params.append(job_id)
    if applied_after:
        where.append("c.applied_at >= %s")
        params.append(applied_after)
    if applied_before:
        where.append("c.applied_at < %s")
        params.append(applied_before)
    clause = ("WHERE " + " AND ".join(where)) if where else ""
    top_n = max(1, min(int(top_n or 10), 50))

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"""SELECT count(*)::int AS total_candidates,
                       count(DISTINCT c.job_id)::int AS jobs_applied_to,
                       count(*) FILTER (WHERE c.status = 'Hired')::int AS hired,
                       count(*) FILTER (WHERE c.status = 'Rejected')::int AS rejected,
                       count(*) FILTER (WHERE c.status NOT IN ('Hired','Rejected'))::int AS in_progress,
                       count(*) FILTER (WHERE c.job_id IS NULL)::int AS unlinked_to_job,
                       min(c.applied_at) AS first_application,
                       max(c.applied_at) AS last_application
                FROM candidates c {clause}""",
            params,
        )
        totals = cur.fetchone()

        cur.execute(
            f"""SELECT c.status, count(*)::int AS n
                FROM candidates c {clause} GROUP BY c.status ORDER BY n DESC""",
            params,
        )
        by_status = {r["status"]: r["n"] for r in cur.fetchall()}

        cur.execute(
            f"""SELECT c.job_id, coalesce(j.job_title, '(no job linked)') AS job_title,
                       count(*)::int AS n,
                       count(*) FILTER (WHERE c.status = 'Hired')::int AS hired
                FROM candidates c LEFT JOIN jobs j ON j.id = c.job_id {clause}
                GROUP BY c.job_id, j.job_title ORDER BY n DESC LIMIT %s""",
            params + [top_n],
        )
        by_job = cur.fetchall()

        cur.execute(
            f"""SELECT coalesce(nullif(trim(c.city), ''), '(unknown)') AS city, count(*)::int AS n
                FROM candidates c {clause}
                GROUP BY 1 ORDER BY n DESC LIMIT %s""",
            params + [top_n],
        )
        by_city = cur.fetchall()

        rank_case = " ".join(f"WHEN '{k}' THEN {v}" for k, v in EDU_RANK.items())
        cur.execute(
            f"""WITH edu AS (
                    SELECT DISTINCT ON (ce.candidate_id) ce.candidate_id, ce.level
                    FROM candidate_education ce
                    ORDER BY ce.candidate_id,
                             CASE ce.level {rank_case} ELSE 0 END DESC
                )
                SELECT coalesce(e.level, '(not stated)') AS level, count(*)::int AS n
                FROM candidates c LEFT JOIN edu e ON e.candidate_id = c.id {clause}
                GROUP BY 1 ORDER BY n DESC""",
            params,
        )
        by_education = {r["level"]: r["n"] for r in cur.fetchall()}

        cur.execute(
            f"""SELECT to_char(date_trunc('month', c.applied_at), 'YYYY-MM') AS month,
                       count(*)::int AS n
                FROM candidates c {clause}
                GROUP BY 1 ORDER BY 1""",
            params,
        )
        by_month = {r["month"]: r["n"] for r in cur.fetchall()}

        hire_where = where + ["c.status = 'Hired'"]
        cur.execute(
            f"""SELECT percentile_cont(0.5) WITHIN GROUP (
                           ORDER BY EXTRACT(epoch FROM (t.hired_at - c.applied_at)) / 86400.0
                       ) AS median_days,
                       count(*)::int AS sample_size
                FROM candidates c
                JOIN LATERAL (
                    SELECT min(ct.moved_at) AS hired_at FROM candidate_tracking ct
                    WHERE ct.candidate_id = c.id AND ct.stage = 'Hired'
                ) t ON t.hired_at IS NOT NULL
                WHERE {" AND ".join(hire_where)}""",
            params,
        )
        tth = cur.fetchone()

    return _jsonable({
        "filters": {
            "job_id": job_id,
            "applied_after": applied_after,
            "applied_before": applied_before,
        },
        "totals": totals,
        "by_status": by_status,
        "by_job": by_job,
        "by_city": by_city,
        "by_education": by_education,
        "by_month": by_month,
        "days_to_hire": {
            "median_days": round(float(tth["median_days"]), 1) if tth and tth["median_days"] else None,
            "sample_size": tth["sample_size"] if tth else 0,
            "note": "Derived from candidate_tracking; null if no logged 'Hired' transitions.",
        },
    })


def get_candidate_pipeline(
    conn,
    job_id: str | None = None,
    applied_after: str | None = None,
    applied_before: str | None = None,
) -> dict:
    where: list[str] = []
    params: list[Any] = []
    if job_id:
        where.append("c.job_id = %s")
        params.append(job_id)
    if applied_after:
        where.append("c.applied_at >= %s")
        params.append(applied_after)
    if applied_before:
        where.append("c.applied_at < %s")
        params.append(applied_before)
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            f"SELECT c.status, count(*)::int AS n FROM candidates c {clause} GROUP BY c.status",
            params,
        )
        current = {r["status"]: r["n"] for r in cur.fetchall()}

        cur.execute(
            f"""WITH scoped AS (SELECT c.id FROM candidates c {clause}),
                hist AS (
                    SELECT t.candidate_id, t.stage, t.moved_at,
                           lead(t.moved_at) OVER (
                               PARTITION BY t.candidate_id ORDER BY t.moved_at
                           ) AS next_at
                    FROM candidate_tracking t
                    JOIN scoped s ON s.id = t.candidate_id
                )
                SELECT stage,
                       count(DISTINCT candidate_id)::int AS reached,
                       percentile_cont(0.5) WITHIN GROUP (
                           ORDER BY EXTRACT(epoch FROM (next_at - moved_at)) / 86400.0
                       ) AS median_days_in_stage,
                       count(*) FILTER (WHERE next_at IS NULL)::int AS still_here
                FROM hist GROUP BY stage""",
            params,
        )
        hist = {r["stage"]: r for r in cur.fetchall()}

        cur.execute(
            f"""SELECT count(*)::int AS n FROM candidates c
                WHERE c.id NOT IN (SELECT candidate_id FROM candidate_tracking)
                {(' AND ' + ' AND '.join(where)) if where else ''}""",
            params,
        )
        untracked = cur.fetchone()["n"]

    total = sum(current.values())
    funnel = []
    prev_reached = None
    for stage in STAGES:
        if stage == "Rejected":
            continue
        h = hist.get(stage)
        reached = h["reached"] if h else 0
        row = {
            "stage": stage,
            "reached": reached,
            "current": current.get(stage, 0),
            "median_days_in_stage": (
                round(float(h["median_days_in_stage"]), 1)
                if h and h["median_days_in_stage"] is not None
                else None
            ),
            "conversion_from_previous_pct": (
                round(reached / prev_reached * 100, 1)
                if prev_reached
                else (100.0 if reached else None)
            ),
            "drop_off_from_previous": (
                max(prev_reached - reached, 0) if prev_reached is not None else None
            ),
        }
        funnel.append(row)
        if reached:
            prev_reached = reached

    unknown_stages = sorted(set(hist) - set(STAGES))

    return _jsonable({
        "filters": {"job_id": job_id, "applied_after": applied_after, "applied_before": applied_before},
        "total_candidates": total,
        "rejected_current": current.get("Rejected", 0),
        "hired_current": current.get("Hired", 0),
        "funnel": funnel,
        "data_quality": {
            "candidates_with_no_tracking_rows": untracked,
            "unrecognized_stage_values_in_log": unknown_stages,
            "note": (
                "'reached' is from candidate_tracking and undercounts if stage moves were not "
                "logged. 'current' is always accurate. candidate_tracking.stage is free text and "
                "is not constrained to the status enum."
            ),
        },
    })


def get_screening_results(
    conn,
    job_id: str | None = None,
    candidate_id: str | None = None,
    min_score: float | None = None,
    recommendation: list[str] | None = None,
    only_unreviewed: bool | None = None,
    sort: str = "score_desc",
    limit: int = 20,
    offset: int = 0,
) -> dict:
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute("SELECT to_regclass('public.candidate_screening') AS t")
        if cur.fetchone()["t"] is None:
            return {
                "error": "not_configured",
                "message": (
                    "No AI screening results are stored in this database — the "
                    "candidate_screening table does not exist. Tell the user screening results "
                    "are unavailable; do not estimate or invent scores."
                ),
            }

        where: list[str] = []
        params: list[Any] = []
        if job_id:
            where.append("s.job_id = %s")
            params.append(job_id)
        if candidate_id:
            where.append("s.candidate_id = %s")
            params.append(candidate_id)
        if min_score is not None:
            where.append("s.score >= %s")
            params.append(min_score)
        if recommendation:
            bad = [r for r in recommendation if r not in RECOMMENDATIONS]
            if bad:
                raise ValueError(f"unknown recommendation: {bad}")
            where.append("s.recommendation = ANY(%s)")
            params.append(recommendation)
        if only_unreviewed:
            where.append("s.reviewed_by_human = false")

        order = {
            "score_desc": "s.score DESC NULLS LAST",
            "score_asc": "s.score ASC NULLS LAST",
            "created_at_desc": "s.created_at DESC",
        }.get(sort, "s.score DESC NULLS LAST")
        clause = ("WHERE " + " AND ".join(where)) if where else ""
        limit = max(1, min(int(limit or 20), 100))
        offset = max(0, int(offset or 0))

        cur.execute(
            f"""SELECT s.id AS screening_id, s.candidate_id,
                       c.candidate_code,
                       c.first_name || ' ' || c.last_name AS full_name,
                       c.status AS current_stage,
                       s.job_id, j.job_title,
                       s.score, s.recommendation, s.summary,
                       s.strengths, s.gaps, s.requirement_matches,
                       s.model, s.prompt_version,
                       s.reviewed_by_human, s.human_decision, s.reviewed_at,
                       s.created_at,
                       count(*) OVER () AS total_matches
                FROM candidate_screening s
                JOIN candidates c ON c.id = s.candidate_id
                LEFT JOIN jobs j ON j.id = s.job_id
                {clause}
                ORDER BY {order}
                LIMIT %s OFFSET %s""",
            params + [limit, offset],
        )
        rows = cur.fetchall()

    total = rows[0]["total_matches"] if rows else 0
    for r in rows:
        r.pop("total_matches", None)
    return _jsonable({
        "total_matches": total,
        "returned": len(rows),
        "limit": limit,
        "offset": offset,
        "results": rows,
        "disclaimer": (
            "Advisory scores produced by an automated model. Present them with their reasoning "
            "and as input to a human decision, never as the decision itself."
        ),
    })


def semantic_candidate_search(
    conn,
    query: str,
    status: list[str] | None = None,
    city: str | None = None,
    education_level: list[str] | None = None,
    job_title: str | None = None,
    min_age: int | None = None,
    max_age: int | None = None,
    has_experience: bool | None = None,
    min_similarity: float = 0.35,
    limit: int = 10,
    offset: int = 0,
) -> dict:
    """Meaning-based search: embed the question, rank candidates by cosine similarity.

    Structured filters are hard constraints applied alongside the similarity
    ranking, so one call answers "QC experience, in Bogor, at Psychotest".
    """
    from .embeddings import embed_query  # local: keeps the DB tools importable without Ollama

    if not (query or "").strip():
        raise ValueError("query is required and must describe the candidate wanted")

    with conn.cursor() as cur:
        cur.execute("SELECT to_regclass('public.candidate_embeddings')")
        if cur.fetchone()[0] is None:
            return {
                "error": "not_indexed",
                "message": (
                    "No candidate embeddings exist yet. Run "
                    "`python -m Ai_controller.embeddings` in the backend directory to build them."
                ),
            }

    try:
        vector = embed_query(query)
    except Exception as exc:  # noqa: BLE001 — reported as a tool result, not raised
        return {"error": "embedding_failed", "message": f"Could not embed the query: {exc}"}

    where: list[str] = []
    params: list[Any] = ["[" + ",".join(f"{v:.7g}" for v in vector) + "]"]

    if status:
        bad = [s for s in status if s not in STAGES]
        if bad:
            raise ValueError(f"unknown status: {bad}")
        where.append("c.status = ANY(%s)")
        params.append(status)
    if city:
        where.append("c.city ILIKE %s")
        params.append(f"%{city}%")
    if education_level:
        bad = [e for e in education_level if e not in EDU_LEVELS]
        if bad:
            raise ValueError(f"unknown education level: {bad}")
        where.append("c.education = ANY(%s)")
        params.append(education_level)
    if job_title:
        where.append("(j.job_title ILIKE %s OR c.applied_position ILIKE %s)")
        params += [f"%{job_title}%", f"%{job_title}%"]
    if min_age is not None:
        where.append(f"{_EFF_AGE} >= %s")
        params.append(min_age)
    if max_age is not None:
        where.append(f"{_EFF_AGE} <= %s")
        params.append(max_age)
    if has_experience is not None:
        where.append(
            "(EXISTS (SELECT 1 FROM candidate_employment_history h "
            "WHERE h.candidate_id = c.id)) = %s"
        )
        params.append(has_experience)

    limit = max(1, min(int(limit or 10), 50))
    offset = max(0, int(offset or 0))
    min_similarity = max(0.0, min(float(min_similarity if min_similarity is not None else 0.35), 1.0))
    clause = ("WHERE " + " AND ".join(where)) if where else ""

    # Scoring in a CTE and filtering outside means the HNSW index is not used —
    # at a few hundred candidates an exact scan is both fast and more accurate
    # than an approximate one. Revisit if this table reaches tens of thousands.
    sql = f"""
        WITH scored AS (
            SELECT c.id AS candidate_id,
                   c.candidate_code,
                   c.first_name || ' ' || c.last_name AS full_name,
                   {_EFF_AGE} AS age,
                   c.city,
                   c.applied_position,
                   c.job_id,
                   j.job_title,
                   c.status,
                   c.education AS education_level,
                   c.school,
                   c.skills,
                   c.experience AS experience_length,
                   1 - (em.embedding <=> %s::vector) AS similarity
            FROM candidate_embeddings em
            JOIN candidates c ON c.id = em.candidate_id
            LEFT JOIN jobs j ON j.id = c.job_id
            {clause}
        )
        SELECT *, count(*) OVER () AS total_matches
        FROM scored
        WHERE similarity >= %s
        ORDER BY similarity DESC
        LIMIT %s OFFSET %s
    """
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(sql, params + [min_similarity, limit, offset])
        rows = cur.fetchall()

    total = rows[0]["total_matches"] if rows else 0
    for r in rows:
        r.pop("total_matches", None)
        r["similarity"] = round(float(r["similarity"]), 4)

    return _jsonable({
        "query": query,
        "total_matches": total,
        "returned": len(rows),
        "limit": limit,
        "offset": offset,
        "min_similarity": min_similarity,
        "candidates": rows,
        "note": (
            "Ranked by meaning, not keywords. similarity is 0-1; below ~0.5 the match is weak "
            "and should be presented as a loose suggestion, not a fit."
        ),
    })


HANDLERS = {
    "search_candidates": search_candidates,
    "semantic_candidate_search": semantic_candidate_search,
    "get_candidate": get_candidate,
    "list_jobs": list_jobs,
    "get_application_stats": get_application_stats,
    "get_candidate_pipeline": get_candidate_pipeline,
    "get_screening_results": get_screening_results,
}