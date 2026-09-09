"""Deterministic slot normalisation for the intent layer.

intent.py extracts slots with a small local model, and small models are sloppy
about vocabulary: the same pipeline stage comes back as "psikotes", "Psycho
Test" or "psychotest", and S1 as "sarjana", "bachelor" or "strata 1". The tool
layer in Ollama_tools.py only accepts the exact strings in STAGES / EDU_LEVELS
and raises ValueError on anything else, so every slot passes through here first.

That is why the extraction schema asks the model for free text rather than an
enum: a 3B model hits "wawancara hr" reliably and "Interview HR" only
sometimes. Getting from the former to the latter is a lookup, not a guess.

Rules only, no model call — the same input must always normalise the same way.
"""

import re
from datetime import date, timedelta

from rapidfuzz import fuzz, process

from .Ollama_tools import EDU_LEVELS, STAGES

# --- Pipeline stages ---------------------------------------------------

_STAGE_SYNONYMS = {
    "applied": "Applied", "apply": "Applied", "new": "Applied", "baru": "Applied",
    "melamar": "Applied", "pelamar": "Applied", "lamaran": "Applied", "pendaftar": "Applied",
    "cv screening": "CV Screening", "screening cv": "CV Screening", "cv": "CV Screening",
    "seleksi berkas": "CV Screening", "berkas": "CV Screening", "resume screening": "CV Screening",
    "phone screening": "Phone Screening", "phone": "Phone Screening", "telepon": "Phone Screening",
    "telpon": "Phone Screening", "screening telepon": "Phone Screening", "hp": "Phone Screening",
    "psychotest": "Psychotest", "psycho test": "Psychotest", "psikotes": "Psychotest",
    "psikotest": "Psychotest", "tes psikologi": "Psychotest", "psikologi": "Psychotest",
    "fgd": "FGD", "focus group discussion": "FGD", "diskusi kelompok": "FGD",
    "interview hr": "Interview HR", "hr interview": "Interview HR", "wawancara hr": "Interview HR",
    "hr": "Interview HR",
    "interview user": "Interview User", "user interview": "Interview User",
    "wawancara user": "Interview User", "user": "Interview User",
    "interview manager": "Interview Manager", "manager interview": "Interview Manager",
    "wawancara manager": "Interview Manager", "wawancara manajer": "Interview Manager",
    "manager": "Interview Manager", "manajer": "Interview Manager",
    "mcu": "MCU", "medical": "MCU", "medical check up": "MCU", "medical checkup": "MCU",
    "tes kesehatan": "MCU", "kesehatan": "MCU",
    "offering": "Offering", "offer": "Offering", "penawaran": "Offering", "tawaran": "Offering",
    "hired": "Hired", "hire": "Hired", "diterima": "Hired", "lolos": "Hired", "keterima": "Hired",
    "rejected": "Rejected", "reject": "Rejected", "ditolak": "Rejected", "gagal": "Rejected",
    "tidak lolos": "Rejected",
}

_EDU_SYNONYMS = {
    "sma": "SMA/SMK", "smk": "SMA/SMK", "sma/smk": "SMA/SMK", "slta": "SMA/SMK",
    "high school": "SMA/SMK", "highschool": "SMA/SMK", "senior high school": "SMA/SMK",
    "d3": "D3", "diploma": "D3", "diploma 3": "D3", "associate": "D3", "vokasi": "D3", "d-3": "D3",
    "s1": "S1", "sarjana": "S1", "bachelor": "S1", "bachelors": "S1", "bachelor degree": "S1",
    "undergraduate": "S1", "strata 1": "S1", "s-1": "S1",
    "s2": "S2", "magister": "S2", "master": "S2", "masters": "S2", "master degree": "S2",
    "postgraduate": "S2", "strata 2": "S2", "s-2": "S2",
    "s3": "S3", "doktor": "S3", "doctor": "S3", "doctorate": "S3", "phd": "S3",
    "strata 3": "S3", "s-3": "S3",
}

# Which slice of a get_candidate profile the user actually asked about. The
# planner uses this to project one section instead of dumping the whole record
# (and its PII) into the model's context.
_FIELD_SYNONYMS = {
    "skill": "skills", "skills": "skills", "keahlian": "skills", "kemampuan": "skills",
    "kompetensi": "skills", "keterampilan": "skills",
    "education": "education", "pendidikan": "education", "school": "education",
    "sekolah": "education", "degree": "education", "kuliah": "education", "major": "education",
    "jurusan": "education", "universitas": "education", "university": "education",
    "experience": "experience", "pengalaman": "experience", "work history": "experience",
    "employment": "experience", "riwayat kerja": "experience", "pengalaman kerja": "experience",
    "contact": "contact", "kontak": "contact", "email": "contact", "phone": "contact",
    "nomor": "contact", "no hp": "contact", "whatsapp": "contact", "wa": "contact",
    "phone number": "contact", "telepon": "contact",
    "status": "status", "stage": "status", "tahap": "status", "progress": "status",
    "tahapan": "status", "posisi seleksi": "status",
    "address": "address", "alamat": "address", "domisili": "address", "city": "address",
    "kota": "address",
    "family": "family", "keluarga": "family", "anak": "family", "children": "family",
    "offer": "offer", "penawaran": "offer", "salary": "offer", "gaji": "offer",
    "interview": "interview", "wawancara": "interview", "jadwal": "interview",
    "schedule": "interview", "jadwal interview": "interview",
    "certificate": "certificates", "certificates": "certificates", "sertifikat": "certificates",
    "language": "languages", "languages": "languages", "bahasa": "languages",
    "age": "personal", "umur": "personal", "usia": "personal", "gender": "personal",
    "jenis kelamin": "personal", "religion": "personal", "agama": "personal",
    "birth": "personal", "lahir": "personal", "personal": "personal", "profile": "personal",
    "notice period": "notice_period", "notice": "notice_period",
    "position": "position", "posisi": "position", "role": "position", "jabatan": "position",
    "resume": "documents", "cv": "documents", "ktp": "documents", "document": "documents",
    "dokumen": "documents",
}

_MONTHS = {
    "january": 1, "januari": 1, "jan": 1,
    "february": 2, "februari": 2, "feb": 2,
    "march": 3, "maret": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5, "mei": 5,
    "june": 6, "juni": 6, "jun": 6,
    "july": 7, "juli": 7, "jul": 7,
    "august": 8, "agustus": 8, "aug": 8, "agt": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oktober": 10, "oct": 10, "okt": 10,
    "november": 11, "nov": 11,
    "december": 12, "desember": 12, "dec": 12, "des": 12,
}


def _clean(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _lookup(value, table: dict, canonical: list[str]) -> str | None:
    """Exact canonical match, then synonym table, then fuzzy against both."""
    text = _clean(value)
    if not text:
        return None
    for item in canonical:
        if text == item.lower():
            return item
    if text in table:
        return table[text]

    # Substring hit beats fuzzy: "tahap psikotes" contains a known key. Longest
    # key first so "interview hr" wins over the bare "hr".
    for key in sorted(table, key=len, reverse=True):
        if len(key) >= 3 and key in text:
            return table[key]

    hit = process.extractOne(text, list(table), scorer=fuzz.WRatio, score_cutoff=82)
    return table[hit[0]] if hit else None


def stage(value) -> str | None:
    """One pipeline stage as spelled in Ollama_tools.STAGES, or None."""
    return _lookup(value, _STAGE_SYNONYMS, STAGES)


def stages(values) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        values = re.split(r",| dan | and | atau | or ", values)
    out = []
    for v in values:
        hit = stage(v)
        if hit and hit not in out:
            out.append(hit)
    return out


def education(value) -> str | None:
    return _lookup(value, _EDU_SYNONYMS, EDU_LEVELS)


def educations(values) -> list[str]:
    if values is None:
        return []
    if isinstance(values, str):
        values = re.split(r",| dan | and | atau | or ", values)
    out = []
    for v in values:
        hit = education(v)
        if hit and hit not in out:
            out.append(hit)
    return out


def field(value) -> str | None:
    """Which profile section the question is about ('skills', 'contact', ...)."""
    return _lookup(value, _FIELD_SYNONYMS, [])


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, n: int) -> date:
    month = d.month - 1 + n
    return date(d.year + month // 12, month % 12 + 1, 1)


def date_range(phrase, today: date | None = None) -> tuple[str | None, str | None]:
    """A relative time phrase to a half-open [after, before) ISO date pair.

    Half-open because the tools compare `applied_at >= after AND applied_at <
    before`, so "this month" must end at the 1st of next month, not the 30th.
    Returns (None, None) when nothing time-like is present.
    """
    text = _clean(phrase)
    if not text:
        return None, None
    today = today or date.today()
    iso = date.isoformat

    if re.search(r"\b(today|hari ini)\b", text):
        return iso(today), iso(today + timedelta(days=1))
    if re.search(r"\b(yesterday|kemarin)\b", text):
        return iso(today - timedelta(days=1)), iso(today)

    # "last 30 days" / "30 hari terakhir" / "dalam 2 minggu terakhir"
    m = re.search(r"(?:last|past|terakhir|dalam)\s+(\d{1,3})\s*(day|hari|week|minggu|month|bulan)", text) \
        or re.search(r"(\d{1,3})\s*(day|hari|week|minggu|month|bulan)\s*(?:terakhir|ago|lalu|yang lalu)", text)
    if m:
        n, unit = int(m.group(1)), m.group(2)
        if unit in ("day", "hari"):
            start = today - timedelta(days=n)
        elif unit in ("week", "minggu"):
            start = today - timedelta(weeks=n)
        else:
            start = _add_months(today, -n).replace(day=min(today.day, 28))
        return iso(start), iso(today + timedelta(days=1))

    monday = today - timedelta(days=today.weekday())
    if re.search(r"\b(this week|minggu ini|pekan ini)\b", text):
        return iso(monday), iso(monday + timedelta(days=7))
    if re.search(r"\b(last week|minggu lalu|pekan lalu)\b", text):
        return iso(monday - timedelta(days=7)), iso(monday)

    if re.search(r"\b(this month|bulan ini)\b", text):
        return iso(_month_start(today)), iso(_add_months(today, 1))
    if re.search(r"\b(last month|bulan lalu|bulan kemarin)\b", text):
        return iso(_add_months(today, -1)), iso(_month_start(today))

    q_start = date(today.year, today.month - (today.month - 1) % 3, 1)
    if re.search(r"\b(this quarter|kuartal ini|triwulan ini)\b", text):
        return iso(q_start), iso(_add_months(q_start, 3))
    if re.search(r"\b(last quarter|kuartal lalu|triwulan lalu)\b", text):
        return iso(_add_months(q_start, -3)), iso(q_start)

    if re.search(r"\b(this year|tahun ini)\b", text):
        return iso(date(today.year, 1, 1)), iso(date(today.year + 1, 1, 1))
    if re.search(r"\b(last year|tahun lalu)\b", text):
        return iso(date(today.year - 1, 1, 1)), iso(date(today.year, 1, 1))

    # An explicit year, optionally with a month: "agustus 2025", "in 2024".
    year_m = re.search(r"\b(20\d{2})\b", text)
    for name, num in _MONTHS.items():
        if re.search(rf"\b{name}\b", text):
            year = int(year_m.group(1)) if year_m else today.year
            start = date(year, num, 1)
            # A bare month name that has not happened yet means last year.
            if not year_m and start > today:
                start = date(year - 1, num, 1)
            return iso(start), iso(_add_months(start, 1))
    if year_m:
        year = int(year_m.group(1))
        return iso(date(year, 1, 1)), iso(date(year + 1, 1, 1))

    return None, None


# --- Backstop scanning -------------------------------------------------
#
# The extractor regularly drops a slot that is plainly in the sentence — "S1"
# survives while "psikotes" right next to it does not. These patterns re-read
# the raw message for anything it missed.
#
# Only distinctive, word-bounded patterns belong here, because this runs over
# a whole sentence rather than a value the model already isolated. The loose
# substring matching in _lookup would read the "hr" in "hrd" as Interview HR.
#
# "Applied" is deliberately absent: "how many warehouse staff applied?" asks
# for a total, not for people sitting in the Applied stage, and scanning that
# verb would quietly filter the count down to one stage.

_STAGE_SCAN = [
    (r"psikotes|psikotest|psycho\s*test|psychotest", "Psychotest"),
    (r"\bfgd\b|focus group", "FGD"),
    (r"\bmcu\b|medical\s*check|tes kesehatan", "MCU"),
    (r"(?:interview|wawancara)\s+hr\b", "Interview HR"),
    (r"(?:interview|wawancara)\s+user\b", "Interview User"),
    (r"(?:interview|wawancara)\s+(?:manager|manajer)\b", "Interview Manager"),
    (r"(?:cv|resume)\s+screening|screening\s+cv|seleksi berkas", "CV Screening"),
    (r"phone\s+screening|screening\s+(?:telepon|telpon)", "Phone Screening"),
    (r"\boffering\b|\bpenawaran\b", "Offering"),
    (r"\bhired\b|\bditerima\b|\bketerima\b", "Hired"),
    (r"\brejected\b|\bditolak\b|tidak lolos", "Rejected"),
]

_EDU_SCAN = [
    (r"\bs-?1\b|\bsarjana\b|\bbachelor\b|\bundergraduate\b", "S1"),
    (r"\bs-?2\b|\bmagister\b|\bmasters?\b|\bpostgraduate\b", "S2"),
    (r"\bs-?3\b|\bdoktor\b|\bph\.?d\b|\bdoctorate\b", "S3"),
    (r"\bd-?3\b|\bdiploma\b|\bvokasi\b", "D3"),
    (r"\bsma\b|\bsmk\b|\bslta\b|high\s*school", "SMA/SMK"),
]


def _scan(text: str, patterns: list[tuple[str, str]]) -> list[str]:
    found = []
    for pattern, value in patterns:
        if re.search(pattern, text, re.IGNORECASE) and value not in found:
            found.append(value)
    return found


def scan_stages(text: str) -> list[str]:
    return _scan(text, _STAGE_SCAN)


def scan_educations(text: str) -> list[str]:
    return _scan(text, _EDU_SCAN)


def choice(value, options, cutoff: int = 80) -> str | None:
    """Fuzzy-pick one of `options` (e.g. real city or job titles read from the DB)."""
    text = _clean(value)
    if not text or not options:
        return None
    for opt in options:
        if text == _clean(opt):
            return opt
    hit = process.extractOne(text, options, processor=_clean, scorer=fuzz.WRatio, score_cutoff=cutoff)
    return hit[0] if hit else None
