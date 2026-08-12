"""
ktp_extract_gemini.py

KTP (Indonesian Identity Card) extraction using Gemini's multimodal
image understanding -- no OCR, no preprocessing, no regex field parsing.

Why this instead of ktp_extract.py:
    The old pipeline (cv2 deskew/upscale -> pytesseract -> line-by-line
    regex/keyword matching) kept failing in two independent ways: (1)
    preprocessing choices (thresholding, upscale factor, deskew angle)
    that helped one photo hurt another, and (2) even with clean OCR text,
    reconstructing "label: value" pairs from a linear text dump loses the
    KTP's actual 2D layout (e.g. "Jenis Kelamin" and "Gol. Darah" sitting
    side-by-side on the card, not sequentially).

    Gemini reads the image directly, so it uses the real spatial layout
    instead of a flattened, error-prone OCR reconstruction of it. This
    mirrors cv_extract.py's philosophy: extract/preprocess only what's
    mechanical (here: none of it, we just hand over the image), and let
    the LLM do all the semantic/field-identification work.

Usage:
    python ktp_extract_gemini.py path/to/ktp.jpg
    python ktp_extract_gemini.py path/to/ktp.pdf
"""

from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
from pathlib import Path

from dotenv import load_dotenv
from google import genai
from google.genai import types as genai_types
from google.genai import errors

# Reuse the exact same city list + fuzzy matcher the CV extractor uses, so
# a "Bandung" typed on a KTP and a "Bandung" typed on a CV both resolve to
# the same dropdown-compatible value. Keeps the vocabulary in one place
# instead of maintaining two copies of INDONESIAN_CITIES.
from cv_extract import INDONESIAN_CITIES, match_city  # noqa: F401 (re-exported)

# --- Config -----------------------------------------------------------

GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}
PDF_EXTENSIONS = {".pdf"}

# Kept in sync with ApplyPage.tsx's option lists so Gemini returns values
# the dropdowns can consume directly, no translation layer needed.
GENDER_OPTIONS = ["Laki-laki (Male)", "Perempuan (Female)"]
RELIGION_OPTIONS = [
    "Islam",
    "Kristen Protestan",
    "Katolik",
    "Hindu",
    "Buddha",
    "Khonghucu",
    "Other / Lainnya",
]
MARITAL_STATUS_OPTIONS = [
    "Single / Belum Menikah",
    "Married / Menikah",
    "Widowed / Janda / Duda",
]

load_dotenv()
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])


# --- Step 1: load the file as a Gemini Part (image or PDF) ---------------

def _load_file_part(file_path: str | Path) -> genai_types.Part:
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(path)

    ext = path.suffix.lower()
    if ext not in IMAGE_EXTENSIONS | PDF_EXTENSIONS:
        raise ValueError(
            f"Unsupported file type: {ext}. Supported: {sorted(IMAGE_EXTENSIONS | PDF_EXTENSIONS)}"
        )

    mime_type, _ = mimetypes.guess_type(path)
    if mime_type is None:
        # Gemini accepts PDFs natively too -- no need to render to an image
        # ourselves, it handles the document directly.
        mime_type = "application/pdf" if ext == ".pdf" else "image/jpeg"

    return genai_types.Part.from_bytes(data=path.read_bytes(), mime_type=mime_type)


# --- Step 2: ask Gemini to read the card and return structured JSON ------

def extract_ktp_with_gemini(file_path: str | Path) -> dict:
    file_part = _load_file_part(file_path)

    prompt = f"""
    You are an expert information extraction assistant reading an Indonesian
    Identity Card (KTP) from the attached image or PDF.

    Look at the card directly -- use its visual layout (which fields sit
    next to which, which line a value is printed on) rather than assuming a
    fixed reading order, since KTP layouts vary slightly between issuance
    years and regions.

    Return ONLY valid JSON, no markdown, no explanations. If a field is not
    visible, printed illegibly, or genuinely absent from the card, return
    null for it -- never guess or invent a value.

    Use exactly this schema:

    {{
        "nik": string | null,
        "nama": string | null,
        "tempat_lahir": string | null,
        "tanggal_lahir": string | null,
        "jenis_kelamin": string | null,
        "golongan_darah": string | null,
        "alamat": string | null,
        "rt": string | null,
        "rw": string | null,
        "kelurahan_desa": string | null,
        "kecamatan": string | null,
        "kota_kabupaten": string | null,
        "provinsi": string | null,
        "agama": string | null,
        "status_perkawinan": string | null,
        "pekerjaan": string | null,
        "kewarganegaraan": string | null
    }}

    Rules:
    - nik must be exactly 16 digits with no spaces or punctuation. If you
      can't confidently read all 16 digits, return null rather than
      guessing at unclear ones.
    - tanggal_lahir must be formatted as YYYY-MM-DD if a birth date is
      present (the card typically prints it as part of "Tempat/Tgl Lahir",
      e.g. "JAKARTA, 17-08-1990" -> tempat_lahir "Jakarta", tanggal_lahir
      "1990-08-17").
    - jenis_kelamin must be exactly one of: {GENDER_OPTIONS}.
    - agama must be exactly one of: {RELIGION_OPTIONS}. Map the card's
      printed value (e.g. "ISLAM") to the closest matching option; use
      "Other / Lainnya" only if genuinely none of the others fit.
    - status_perkawinan must be exactly one of: {MARITAL_STATUS_OPTIONS}.
      Map "BELUM KAWIN" -> "Single / Belum Menikah", "KAWIN" ->
      "Married / Menikah", any widow/widower/divorce status ->
      "Widowed / Janda / Duda".
    - kewarganegaraan should be "WNI" or "WNA".
    - Standardize nama, alamat, kelurahan_desa, kecamatan, kota_kabupaten,
      provinsi, and pekerjaan to proper title case rather than the card's
      all-caps printing (e.g. "BUDI SANTOSO" -> "Budi Santoso"), unless
      it's a known acronym.
    - kota_kabupaten should contain only the city/regency name (e.g.
      "Bandung", "Jakarta Selatan"), not the full address.
    - rt and rw should each be digits only, no leading zeros stripped
      (e.g. "007"), taken from the "RT/RW" field.
    """

    response = None
    last_error = None

    for model_name in GEMINI_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=[file_part, prompt],
            )
            break  # success -- stop trying further models
        except errors.ClientError as e:
            # Only quota/rate-limit (429) errors should fall through to the
            # next model in the chain -- anything else (bad request, auth
            # failure, unsupported file, etc.) is a real problem and should
            # surface immediately rather than being silently retried.
            if e.code == 429:
                last_error = e
                continue
            raise

    if response is None:
        raise RuntimeError(
            f"All Gemini models in the fallback chain hit rate limits. Last error: {last_error}"
        )

    raw = response.text.strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[-1] if raw.lower().startswith("json") else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Gemini did not return valid JSON: {e}\nRaw output: {raw}")

    return data


# --- Step 3: light, targeted post-validation ------------------------------
#
# Deliberately minimal -- the goal is to catch cases where Gemini's answer
# can't be trusted as-is, not to re-implement field parsing ourselves.

def _validate_nik(nik: str | None) -> tuple[str | None, bool]:
    """Returns (nik, confident). Never guesses or repairs digits -- if it's
    not exactly 16 digits, we say so rather than silently keeping a
    possibly-wrong value."""
    if not nik:
        return None, False
    digits = re.sub(r"\D", "", nik)
    return (digits, True) if len(digits) == 16 else (nik, False)


def extract_and_validate(file_path: str | Path) -> dict:
    data = extract_ktp_with_gemini(file_path)

    nik, nik_confident = _validate_nik(data.get("nik"))
    data["nik"] = nik
    data["nik_confident"] = nik_confident

    # Fuzzy-match onto the canonical city list, same as the CV extractor,
    # so the value is guaranteed to be one the frontend's dropdown accepts.
    data["kota_kabupaten"] = match_city(data.get("kota_kabupaten"))

    return data


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python ktp_extract_gemini.py <path_to_ktp_file>")
        sys.exit(1)

    result = extract_and_validate(sys.argv[1])
    print(json.dumps(result, indent=2, ensure_ascii=False))