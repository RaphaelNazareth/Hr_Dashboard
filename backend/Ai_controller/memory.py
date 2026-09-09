"""Per-session conversation memory for the HR assistant.

The frontend already replays prior turns as `history`, but raw transcript is a
poor way to answer "what are HIS skills?" — the model has to re-read the whole
conversation and re-guess which of the five names it mentioned is "he", and a
3B model gets that wrong often enough to matter. So alongside the transcript we
keep a small structured record of what the conversation is *about*: the last
candidate discussed, the last result set, the last job, the last set of search
filters.

That record is what makes follow-ups work. "Show me candidates in Bogor" then
"only the S1 ones" then "what's his phone number?" is three turns that each
depend on the previous one, and only the first carries enough information to
build a query on its own.

Storage is in-process and TTL'd: this is conversational scratch state, not a
system of record, and it is fine to lose on restart. Losing it costs the user a
re-ask, not data. If the backend is ever scaled past one worker this needs to
move to Redis or a table, because a session pinned to worker A is amnesiac on
worker B.
"""

import re
import threading
import time
from dataclasses import dataclass, field
from typing import Any

# A session is dropped after this long without a turn, and the store is capped
# so an unbounded stream of one-shot session ids cannot grow it forever.
TTL_SECONDS = 2 * 60 * 60
MAX_SESSIONS = 500
MAX_RECENT_CANDIDATES = 25

# "his skills", "dia di tahap apa", "that candidate" — a reference to whoever
# was last discussed rather than a new name.
_PRONOUNS = re.compile(
    r"\b(he|him|his|she|her|hers|they|them|their|dia|ia|beliau|orang itu|"
    r"that candidate|this candidate|the candidate|kandidat (itu|ini|tersebut)|"
    r"pelamar (itu|ini|tersebut))\b",
    re.IGNORECASE,
)

# Indonesian marks possession with the clitic -nya, written joined: "sekolahnya",
# "umurnya", "statusnya" all mean "their X" and are the ordinary way to ask a
# follow-up. Matching only a standalone "nya" missed every one of them.
# The stoplist covers words that merely end in those letters, where -nya is not
# possessive at all ("hanya" = only, "punya" = have).
_NYA_STOPLIST = {
    "hanya", "punya", "tanya", "biasanya", "misalnya", "akhirnya", "seharusnya",
    "artinya", "maksudnya", "semuanya", "sebenarnya", "rupanya", "kenya",
    # These take -nya possessively but refer to the result set, not a person.
    "hasilnya", "daftarnya", "listnya", "jumlahnya", "totalnya",
}
_NYA_SUFFIX = re.compile(r"\b(\w{3,}nya)\b", re.IGNORECASE)


def _has_possessive_nya(text: str) -> bool:
    return any(m.group(1).lower() not in _NYA_STOPLIST for m in _NYA_SUFFIX.finditer(text))

_ORDINALS = {
    1: r"\b(first|1st|pertama|ke-?1)\b", 2: r"\b(second|2nd|kedua|ke-?2)\b",
    3: r"\b(third|3rd|ketiga|ke-?3)\b", 4: r"\b(fourth|4th|keempat|ke-?4)\b",
    5: r"\b(fifth|5th|kelima|ke-?5)\b",
}

_PLURAL_REF = re.compile(
    r"\b(them|those|these|mereka|semuanya|semua itu|the results|hasilnya|"
    r"the list|daftarnya)\b",
    re.IGNORECASE,
)


@dataclass
class Session:
    """What this conversation is currently about."""

    session_id: str
    last_candidate: dict | None = None          # {"id", "name"} — target of "him"/"dia"
    recent_candidates: list[dict] = field(default_factory=list)  # last result set
    last_job: dict | None = None                # {"id", "title"}
    last_search: dict = field(default_factory=dict)   # slots, for refinement
    last_intent: str | None = None
    updated_at: float = field(default_factory=time.time)

    def note_candidates(self, rows: list[dict], total: int | None = None) -> None:
        """Record a result set. A single hit also becomes the pronoun target.

        `total` is the unpaginated match count. It has to be separate from
        len(rows), because a count query fetches one row out of forty-six and
        that row is not "the" candidate — binding a pronoun to it would answer
        the next question about an arbitrary person.
        """
        people = [
            {"id": str(r.get("candidate_id") or r.get("id")), "name": r.get("full_name") or r.get("name")}
            for r in rows
            if r.get("candidate_id") or r.get("id")
        ]
        if not people:
            return
        matched = len(people) if total is None else total
        self.recent_candidates = people[:MAX_RECENT_CANDIDATES]
        # Only an unambiguous result binds "him"/"her". After a 20-row search
        # there is no sensible referent, and silently picking row 0 produces
        # confidently wrong answers on the next turn. Clearing rather than
        # keeping the previous one matters just as much: "his skills" asked
        # after a five-person list must ask which, not quietly answer about
        # whoever happened to be discussed two turns ago.
        self.last_candidate = people[0] if matched == 1 and len(people) == 1 else None

    def note_candidate(self, row: dict) -> None:
        cid = row.get("candidate_id") or row.get("id")
        if not cid:
            return
        name = row.get("full_name") or " ".join(
            filter(None, [row.get("first_name"), row.get("last_name")])
        )
        self.last_candidate = {"id": str(cid), "name": name or None}

    def note_jobs(self, rows: list[dict]) -> None:
        # list_jobs names the column job_id, not id.
        if len(rows) == 1 and rows[0].get("job_id"):
            self.last_job = {"id": str(rows[0]["job_id"]), "title": rows[0].get("job_title")}

    def resolve_reference(self, text: str) -> dict | None:
        """Which candidate does this message point at, without naming one?

        Ordinal first ("the second one" is specific even when a pronoun is also
        present), then a bare pronoun, then None.
        """
        for index, pattern in _ORDINALS.items():
            if re.search(pattern, text, re.IGNORECASE) and len(self.recent_candidates) >= index:
                return self.recent_candidates[index - 1]
        if _PRONOUNS.search(text) or _has_possessive_nya(text):
            return self.last_candidate
        return None

    def refers_to_group(self, text: str) -> bool:
        return bool(_PLURAL_REF.search(text)) and bool(self.recent_candidates)

    def as_prompt_context(self) -> str:
        """A compact briefing line for the reply-writing model. Empty when new."""
        bits = []
        if self.last_candidate and self.last_candidate.get("name"):
            bits.append(f"Candidate currently being discussed: {self.last_candidate['name']}.")
        if self.last_job and self.last_job.get("title"):
            bits.append(f"Job currently being discussed: {self.last_job['title']}.")
        if len(self.recent_candidates) > 1:
            names = ", ".join(c["name"] for c in self.recent_candidates[:5] if c.get("name"))
            if names:
                bits.append(f"Most recent result set ({len(self.recent_candidates)}): {names}.")
        return " ".join(bits)


class MemoryStore:
    """Thread-safe TTL map of session_id -> Session."""

    def __init__(self, ttl: int = TTL_SECONDS, max_sessions: int = MAX_SESSIONS):
        self._ttl = ttl
        self._max = max_sessions
        self._lock = threading.Lock()
        self._sessions: dict[str, Session] = {}

    def get(self, session_id: str) -> Session:
        now = time.time()
        with self._lock:
            self._evict(now)
            session = self._sessions.get(session_id)
            if session is None:
                session = Session(session_id=session_id)
                self._sessions[session_id] = session
            session.updated_at = now
            return session

    def reset(self, session_id: str) -> None:
        with self._lock:
            self._sessions.pop(session_id, None)

    def _evict(self, now: float) -> None:
        stale = [k for k, s in self._sessions.items() if now - s.updated_at > self._ttl]
        for key in stale:
            del self._sessions[key]
        if len(self._sessions) > self._max:
            for key, _ in sorted(self._sessions.items(), key=lambda kv: kv[1].updated_at)[
                : len(self._sessions) - self._max
            ]:
                del self._sessions[key]


STORE = MemoryStore()


def remember_result(session: Session, tool: str, result: Any) -> None:
    """Fold one tool result into the session so the next turn can build on it."""
    if not isinstance(result, dict) or result.get("error"):
        return
    if tool in ("search_candidates", "semantic_candidate_search"):
        session.note_candidates(result.get("candidates") or [], result.get("total_matches"))
    elif tool == "get_candidate":
        person = result.get("candidate")
        session.note_candidate(person if isinstance(person, dict) else result)
    elif tool == "list_jobs":
        session.note_jobs(result.get("jobs") or [])
    elif tool == "get_screening_results":
        session.note_candidates(result.get("results") or [], result.get("total_matches"))
