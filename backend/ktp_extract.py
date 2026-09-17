"""
ktp_extract.py

KTP (Indonesian Identity Card) extraction using a local Ollama vision
model's multimodal image understanding -- no OCR, no preprocessing, no
regex field parsing.

Why this instead of an OCR + regex pipeline:
    Preprocessing choices (thresholding, upscale factor, deskew angle)
    that help one photo hurt another, and even with clean OCR text,
    reconstructing "label: value" pairs from a linear text dump loses the
    KTP's actual 2D layout (e.g. "Jenis Kelamin" and "Gol. Darah" sitting
    side-by-side on the card, not sequentially).

    A vision-capable model reads the image directly, so it uses the real
    spatial layout instead of a flattened, error-prone OCR reconstruction
    of it. This mirrors cv_extract.py's philosophy: extract/preprocess
    only what's mechanical (here: rendering PDF pages to images, nothing
    else), and let the model do all the semantic/field-identification
    work.

    This was originally built against Gemini's multimodal API; it's been
    swapped to a local Ollama vision model (e.g. llama3.2-vision, llava,
    qwen2.5vl) so extraction runs fully offline. Ollama has no native PDF
    support the way Gemini did, so PDFs are rendered to page images with
    PyMuPDF before being handed to the model.

Usage:
    python ktp_extract.py path/to/ktp.jpg
    python ktp_extract.py path/to/ktp.pdf
"""

from __future__ import annotations

import json
import os
import re
import sys
from pathlib import Path

import fitz  # PyMuPDF
import ollama
from ollama import ResponseError

# Reuse the exact same city list + fuzzy matcher the CV extractor uses, so
# a "Bandung" typed on a KTP and a "Bandung" typed on a CV both resolve to
# the same dropdown-compatible value. Keeps the vocabulary in one place
# instead of maintaining two copies of INDONESIAN_CITIES.
from cv_extract import INDONESIAN_CITIES, match_city  # noqa: F401 (re-exported)

# --- Config -----------------------------------------------------------

# Vision-capable models only -- a text-only model (llama3.2, mistral, ...)
# can't read the card image at all. Override the whole chain with
# OLLAMA_VISION_MODELS="model1,model2,...", or just the first choice with
# OLLAMA_VISION_MODEL.
_env_chain = os.getenv("OLLAMA_VISION_MODELS")
OLLAMA_VISION_MODELS = (
    [m.strip() for m in _env_chain.split(",") if m.strip()]
    if _env_chain
    else [os.getenv("OLLAMA_VISION_MODEL", "llama3.2"), "qwen2.5vl", "llava"]
)

OLLAMA_HOST = os.getenv("OLLAMA_HOST", "http://localhost:11434")
_client = ollama.Client(host=OLLAMA_HOST)

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp"}
PDF_EXTENSIONS = {".pdf"}
PDF_RENDER_DPI = 300

# Kept in sync with ApplyPage.tsx's option lists so the model returns
# values the dropdowns can consume directly, no translation layer needed.
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


# --- Step 1: load the file as one or more raw image byte strings ---------

def _load_image_bytes(file_path: str | Path) -> list[bytes]:
    """Returns a list of raw image bytes -- one entry for a plain image,
    one entry per page for a PDF (Ollama has no native PDF support, so
    each page is rendered to a PNG first)."""
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(path)

    ext = path.suffix.lower()

    if ext in IMAGE_EXTENSIONS:
        return [path.read_bytes()]

    if ext in PDF_EXTENSIONS:
        doc = fitz.open(path)
        zoom = PDF_RENDER_DPI / 72
        images = []
        for page in doc:
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            images.append(pix.tobytes("png"))
        doc.close()
        return images

    raise ValueError(
        f"Unsupported file type: {ext}. Supported: {sorted(IMAGE_EXTENSIONS | PDF_EXTENSIONS)}"
    )


# --- Step 2: ask the vision model to read the card and return structured JSON

def extract_ktp_with_ollama(file_path: str | Path) -> dict:
    images = _load_image_bytes(file_path)

    prompt = f"""
    You are an expert information extraction assistant reading an Indonesian
    Identity Card (KTP) from the attached image(s).

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
        "age": integer | null,
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
    - calculate age from tanggal_lahir if present, otherwise return null.
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

    for model_name in OLLAMA_VISION_MODELS:
        try:
            response = _client.chat(
                model=model_name,
                messages=[{"role": "user", "content": prompt, "images": images}],
                format="json",
                options={"temperature": 0},
            )
            break  # success -- stop trying further models
        except ResponseError as e:
            # Typically means the model isn't pulled locally, doesn't
            # support images, or the daemon rejected the request -- fall
            # through to the next model in the chain.
            last_error = e
            continue

    if response is None:
        raise RuntimeError(
            f"All Ollama vision models in the fallback chain failed. Last error: {last_error}"
        )

    raw = response["message"]["content"].strip()
    if raw.startswith("```"):
        raw = raw.strip("`")
        raw = raw.split("\n", 1)[-1] if raw.lower().startswith("json") else raw

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        raise ValueError(f"Ollama did not return valid JSON: {e}\nRaw output: {raw}")

    return data


# --- Step 3: light, targeted post-validation ------------------------------
#
# Deliberately minimal -- the goal is to catch cases where the model's
# answer can't be trusted as-is, not to re-implement field parsing ourselves.

def _validate_nik(nik: str | None) -> tuple[str | None, bool]:
    """Returns (nik, confident). Never guesses or repairs digits -- if it's
    not exactly 16 digits, we say so rather than silently keeping a
    possibly-wrong value."""
    if not nik:
        return None, False
    digits = re.sub(r"\D", "", nik)
    return (digits, True) if len(digits) == 16 else (nik, False)


def extract_and_validate(file_path: str | Path) -> dict:
    data = extract_ktp_with_ollama(file_path)

    nik, nik_confident = _validate_nik(data.get("nik"))
    data["nik"] = nik
    data["nik_confident"] = nik_confident

    # Fuzzy-match onto the canonical city list, same as the CV extractor,
    # so the value is guaranteed to be one the frontend's dropdown accepts.
    data["kota_kabupaten"] = match_city(data.get("kota_kabupaten"))

    return data


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python ktp_extract.py <path_to_ktp_file>")
        sys.exit(1)

    result = extract_and_validate(sys.argv[1])
    print(json.dumps(result, indent=2, ensure_ascii=False))