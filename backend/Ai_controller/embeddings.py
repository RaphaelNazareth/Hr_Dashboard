"""Vector embeddings for semantic candidate search.

Keyword search answers "who is named Wijaya". It cannot answer "siapa yang
pernah pegang mesin produksi" — nobody's row contains that phrase, even when
three people spent years doing exactly that. Embeddings put the question and
the profile in the same space, so a match no longer depends on shared words.

One row per candidate in candidate_embeddings, holding a flattened profile and
its vector. Rebuilt only when the profile text actually changes, which is what
content_hash is for: a backfill over 351 unchanged candidates should cost
nothing and make no model calls.

Run it directly to create the schema and fill it in:

    python -m Ai_controller.embeddings            # create + backfill changed
    python -m Ai_controller.embeddings --all      # re-embed everything
"""

import hashlib
import os
from typing import Any

import ollama
from psycopg.rows import dict_row

# nomic-embed-text is trained with task prefixes, and retrieval quality drops
# noticeably without them: documents and queries are embedded for different
# roles even when the words are identical. Models that ignore the prefix are
# unharmed by it.
DOC_PREFIX = "search_document: "
QUERY_PREFIX = "search_query: "

EMBED_MODEL = os.getenv("OLLAMA_EMBED_MODEL", "nomic-embed-text")
EMBED_DIM = int(os.getenv("OLLAMA_EMBED_DIM", "768"))

SCHEMA_DDL = f"""
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS public.candidate_embeddings (
    candidate_id uuid PRIMARY KEY REFERENCES public.candidates(id) ON DELETE CASCADE,
    content      text NOT NULL,
    content_hash text NOT NULL,
    embedding    vector({EMBED_DIM}) NOT NULL,
    model        text NOT NULL,
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Cosine, to match the <=> operator the search uses. A vector index that does
-- not match the query's operator class is silently ignored by the planner.
CREATE INDEX IF NOT EXISTS idx_candidate_embeddings_vec
    ON public.candidate_embeddings USING hnsw (embedding vector_cosine_ops);
"""

# Everything that describes what a person can do. Deliberately excludes name,
# NIK, phone, address and salary: they carry no meaning to match on, and
# embedding PII spreads it into a second place it does not need to live.
_PROFILE_SQL = """
SELECT c.id,
       c.applied_position,
       c.education,
       c.school,
       c.skills,
       c.certificates,
       c.languages,
       c.experience,
       c.city,
       j.job_title,
       (SELECT string_agg(
                   concat_ws(' ', e.last_position, 'di', e.company_name,
                             '(' || e.business_type || ')', e.job_description),
                   '; ' ORDER BY e.start_date DESC)
        FROM candidate_employment_history e WHERE e.candidate_id = c.id) AS work,
       (SELECT string_agg(
                   concat_ws(' ', ed.level, ed.major, ed.institution_name), '; ')
        FROM candidate_education ed WHERE ed.candidate_id = c.id) AS study
FROM candidates c
LEFT JOIN jobs j ON j.id = c.job_id
"""


def build_profile_text(row: dict) -> str:
    """One candidate flattened into the text that gets embedded."""
    parts = [
        f"Posisi dilamar: {row.get('applied_position') or row.get('job_title') or '-'}",
        f"Pendidikan: {row.get('education') or '-'} di {row.get('school') or '-'}",
        f"Keahlian: {row.get('skills') or '-'}",
        f"Sertifikat: {row.get('certificates') or '-'}",
        f"Bahasa: {row.get('languages') or '-'}",
        f"Lama pengalaman: {row.get('experience') or '-'}",
        f"Domisili: {row.get('city') or '-'}",
    ]
    if row.get("work"):
        parts.append(f"Riwayat kerja: {row['work']}")
    if row.get("study"):
        parts.append(f"Riwayat pendidikan: {row['study']}")
    return "\n".join(parts)


def _hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def _to_literal(vector: list[float]) -> str:
    """pgvector accepts a bracketed list as text; avoids a driver dependency."""
    return "[" + ",".join(f"{v:.7g}" for v in vector) + "]"


def embed_documents(texts: list[str], client: ollama.Client | None = None) -> list[list[float]]:
    client = client or ollama.Client(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"))
    response = client.embed(model=EMBED_MODEL, input=[DOC_PREFIX + t for t in texts])
    return response["embeddings"]


def embed_query(text: str, client: ollama.Client | None = None) -> list[float]:
    client = client or ollama.Client(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"))
    response = client.embed(model=EMBED_MODEL, input=QUERY_PREFIX + text)
    return response["embeddings"][0]


def ensure_schema(conn) -> None:
    with conn.cursor() as cur:
        cur.execute(SCHEMA_DDL)
    conn.commit()


def backfill(conn, force: bool = False, batch_size: int = 16) -> dict[str, Any]:
    """Embed every candidate whose profile text changed. Safe to re-run."""
    with conn.cursor(row_factory=dict_row) as cur:
        cur.execute(_PROFILE_SQL)
        rows = cur.fetchall()
        cur.execute("SELECT candidate_id, content_hash FROM candidate_embeddings")
        known = {str(r["candidate_id"]): r["content_hash"] for r in cur.fetchall()}

    pending = []
    for row in rows:
        text = build_profile_text(row)
        digest = _hash(f"{EMBED_MODEL}|{text}")
        if force or known.get(str(row["id"])) != digest:
            pending.append((str(row["id"]), text, digest))

    client = ollama.Client(host=os.getenv("OLLAMA_HOST", "http://localhost:11434"))
    written = 0
    for start in range(0, len(pending), batch_size):
        chunk = pending[start : start + batch_size]
        vectors = embed_documents([t for _, t, _ in chunk], client)
        with conn.cursor() as cur:
            for (cid, text, digest), vector in zip(chunk, vectors):
                cur.execute(
                    """INSERT INTO candidate_embeddings
                           (candidate_id, content, content_hash, embedding, model, updated_at)
                       VALUES (%s, %s, %s, %s::vector, %s, now())
                       ON CONFLICT (candidate_id) DO UPDATE SET
                           content = EXCLUDED.content,
                           content_hash = EXCLUDED.content_hash,
                           embedding = EXCLUDED.embedding,
                           model = EXCLUDED.model,
                           updated_at = now()""",
                    [cid, text, digest, _to_literal(vector), EMBED_MODEL],
                )
        conn.commit()
        written += len(chunk)

    return {"candidates": len(rows), "embedded": written, "skipped": len(rows) - len(pending),
            "model": EMBED_MODEL, "dimensions": EMBED_DIM}


if __name__ == "__main__":
    import sys

    import psycopg
    from dotenv import load_dotenv

    load_dotenv()
    url = os.getenv("DATABASE_URL")
    if not url:
        raise SystemExit("DATABASE_URL is not set. Check backend/.env.")

    with psycopg.connect(url) as connection:
        ensure_schema(connection)
        print(f"schema ready (vector({EMBED_DIM}), model {EMBED_MODEL})")
        summary = backfill(connection, force="--all" in sys.argv)
        print(summary)
