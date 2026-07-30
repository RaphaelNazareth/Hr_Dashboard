"""
cv_text_extract.py

Extracts clean, readable text from a CV/resume PDF -- nothing more.

This is deliberately "dumb" on purpose: no section segmentation, no name
guessing, no regex field extraction. Those are semantic-understanding
problems better handled by an LLM (e.g. Gemini) downstream. This script's
only job is: get the best possible raw text out of a PDF, whether it's a
native-text PDF or a scanned/image-based one, and lightly clean it up
without destroying the document's original structure (line breaks,
paragraph spacing, bullet points) -- that structure is itself a signal an
LLM can use to understand where one section/job entry ends and another
begins.

Usage:
    python cv_text_extract.py path/to/cv.pdf
"""

from __future__ import annotations

import re
import sys
import unicodedata
from pathlib import Path

import fitz  # PyMuPDF
import pytesseract
from PIL import Image

import os

from dotenv import load_dotenv
from google import genai
from google.genai import errors

import json

from rapidfuzz import process, fuzz

# --- Config -----------------------------------------------------------

MIN_CHARS_PER_PAGE = 30   # below this, a page is treated as having no usable text layer
OCR_RENDER_DPI = 300
OCR_LANG = "eng+ind"

# --- Gemini model fallback chain, highest to lowest priority ---
GEMINI_MODELS = [
    "gemini-3.6-flash",
    "gemini-3.5-flash",
    "gemini-3-flash",
    "gemini-2.5-flash",
    "gemini-2.5-flash-lite",
    "gemini-3.5-flash-lite",
    "gemini-3.1-flash-lite",
]

PDF_EXTENSIONS = {".pdf"}

# A block is treated as "full width" (a header/title spanning the whole
# page, e.g. a name banner) if its width exceeds this fraction of the
# page's total content width. Full-width blocks break the reading order
# into separate rows rather than getting swept into a column.
FULL_WIDTH_RATIO = 0.62

# Minimum horizontal gap between blocks, as a fraction of content width,
# required before we treat it as a real column gutter rather than just
# normal spacing within a single column of text.
MIN_COLUMN_GAP_RATIO = 0.04

# OCR sometimes renders bullet glyphs (•, ●, ▪, etc.) as stray punctuation
# depending on the font. Normalizing these to a single consistent marker
# keeps list structure visible without changing any actual content.
BULLET_CHARS = "•●▪◦‣∙·«»\u201c\u201d\u2018\u2019"
BULLET_CHAR_PATTERN = re.compile(r"^[\s]*[" + BULLET_CHARS + r"]\s*")

INDONESIAN_CITIES = [
  # DKI Jakarta
  "Jakarta Pusat",
  "Jakarta Utara",
  "Jakarta Barat",
  "Jakarta Selatan",
  "Jakarta Timur",
  "Kepulauan Seribu",

  # Banten
  "Tangerang",
  "Tangerang Selatan",
  "Kabupaten Tangerang",
  "Serang",
  "Kabupaten Serang",
  "Cilegon",
  "Pandeglang",
  "Lebak",

  # Jawa Barat
  "Bandung",
  "Kabupaten Bandung",
  "Kabupaten Bandung Barat",
  "Cimahi",
  "Bekasi",
  "Kabupaten Bekasi",
  "Bogor",
  "Kabupaten Bogor",
  "Depok",
  "Sukabumi",
  "Kabupaten Sukabumi",
  "Cianjur",
  "Garut",
  "Tasikmalaya",
  "Kabupaten Tasikmalaya",
  "Ciamis",
  "Banjar",
  "Cirebon",
  "Kabupaten Cirebon",
  "Kuningan",
  "Majalengka",
  "Sumedang",
  "Indramayu",
  "Subang",
  "Purwakarta",
  "Karawang",

  # Jawa Tengah
  "Semarang",
  "Kabupaten Semarang",
  "Surakarta (Solo)",
  "Salatiga",
  "Magelang",
  "Kabupaten Magelang",
  "Pekalongan",
  "Kabupaten Pekalongan",
  "Tegal",
  "Kabupaten Tegal",
  "Kudus",
  "Pati",
  "Jepara",
  "Rembang",
  "Blora",
  "Grobogan",
  "Demak",
  "Kendal",
  "Batang",
  "Pemalang",
  "Brebes",
  "Banyumas (Purwokerto)",
  "Cilacap",
  "Kebumen",
  "Purworejo",
  "Wonosobo",
  "Temanggung",
  "Boyolali",
  "Klaten",
  "Sukoharjo",
  "Wonogiri",
  "Karanganyar",
  "Sragen",

  # DI Yogyakarta
  "Yogyakarta",
  "Bantul",
  "Sleman",
  "Kulon Progo",
  "Gunungkidul",

  # Jawa Timur
  "Surabaya",
  "Malang",
  "Kabupaten Malang",
  "Batu",
  "Kediri",
  "Kabupaten Kediri",
  "Blitar",
  "Kabupaten Blitar",
  "Mojokerto",
  "Kabupaten Mojokerto",
  "Madiun",
  "Kabupaten Madiun",
  "Pasuruan",
  "Kabupaten Pasuruan",
  "Probolinggo",
  "Kabupaten Probolinggo",
  "Jember",
  "Banyuwangi",
  "Bojonegoro",
  "Tuban",
  "Lamongan",
  "Gresik",
  "Sidoarjo",
  "Mojokerto",
  "Ngawi",
  "Magetan",
  "Ponorogo",
  "Pacitan",
  "Trenggalek",
  "Tulungagung",
  "Nganjuk",
  "Jombang",
  "Bangkalan",
  "Sampang",
  "Pamekasan",
  "Sumenep",
  "Situbondo",
  "Bondowoso",
  "Lumajang",

  # Bali & Nusa Tenggara
  "Denpasar",
  "Badung",
  "Gianyar",
  "Tabanan",
  "Klungkung",
  "Bangli",
  "Karangasem",
  "Buleleng",
  "Jembrana",
  "Mataram",
  "Kupang",

  # Sumatera
  "Medan",
  "Binjai",
  "Pematangsiantar",
  "Tebing Tinggi",
  "Deli Serdang",
  "Padang",
  "Bukittinggi",
  "Padang Panjang",
  "Payakumbuh",
  "Pekanbaru",
  "Dumai",
  "Batam",
  "Tanjungpinang",
  "Jambi",
  "Palembang",
  "Lubuklinggau",
  "Prabumulih",
  "Bengkulu",
  "Bandar Lampung",
  "Metro",
  "Banda Aceh",
  "Langsa",
  "Lhokseumawe",
  "Sabang",

  # Kalimantan
  "Pontianak",
  "Singkawang",
  "Palangkaraya",
  "Banjarmasin",
  "Banjarbaru",
  "Samarinda",
  "Balikpapan",
  "Bontang",
  "Tarakan",

  # Sulawesi
  "Makassar",
  "Parepare",
  "Palopo",
  "Manado",
  "Bitung",
  "Tomohon",
  "Kotamobagu",
  "Palu",
  "Kendari",
  "Bau-Bau",
  "Gorontalo",
  "Mamuju",

  # Maluku & Papua
  "Ambon",
  "Tual",
  "Ternate",
  "Tidore Kepulauan",
  "Jayapura",
  "Sorong",
  "Manokwari"
]

# --- API Key -----------------------------------------------------------


load_dotenv()
client = genai.Client(
    api_key=os.environ["GEMINI_API_KEY"]
)

# --- Step 1: get raw text out of the PDF, page by page -----------------

def _ocr_page_image(pil_image: Image.Image) -> str:
    return pytesseract.image_to_string(pil_image, lang=OCR_LANG)


def _split_columns(run_blocks, content_x0, content_x1):
    """
    Given a run of blocks that share roughly the same vertical territory
    (no full-width block among them), detect whether they actually form
    two side-by-side columns and, if so, split them.

    Detection method: look at the gaps between each block's right edge
    and the next block's left edge (sorted by x0). If the largest such
    gap comfortably exceeds normal word/line spacing (MIN_COLUMN_GAP_RATIO
    of the content width), treat that gap as the gutter between columns.
    Otherwise, there's no reliable column signal -- return everything as
    a single "column" so single-column CVs pass through unchanged.
    """
    content_width = content_x1 - content_x0
    min_gap = content_width * MIN_COLUMN_GAP_RATIO

    by_x0 = sorted(run_blocks, key=lambda b: b[0])

    best_gap = 0.0
    best_boundary = None
    running_right_edge = by_x0[0][2]
    for b in by_x0[1:]:
        gap = b[0] - running_right_edge
        if gap > best_gap:
            best_gap = gap
            best_boundary = (running_right_edge + b[0]) / 2
        running_right_edge = max(running_right_edge, b[2])

    if best_boundary is None or best_gap < min_gap:
        return [run_blocks]  # no real column split

    left = [b for b in run_blocks if b[0] < best_boundary]
    right = [b for b in run_blocks if b[0] >= best_boundary]

    # Sanity check: a genuine two-column layout should have blocks in
    # both halves. If one side is empty, the "gap" was probably just
    # ragged-right spacing in a single column, not a real gutter.
    if not left or not right:
        return [run_blocks]

    return [left, right]


def _reading_order_text(page) -> str:
    """
    Reconstructs reading order for potentially multi-column pages.

    PyMuPDF's default page.get_text() follows the PDF's internal content
    stream / block layout order, which breaks down for column layouts
    (sidebar CVs, two-column resumes, etc.): header text from different
    columns at similar heights gets interleaved, and text objects placed
    out of visual order (common in design-tool exports like Canva) get
    scrambled.

    Approach:
      1. Pull blocks with bounding boxes.
      2. Walk through them top-to-bottom, grouping consecutive blocks into
         "runs" -- a run breaks whenever a full-width block (spanning
         most of the page, e.g. a name banner) is encountered, since that
         naturally divides the page into rows.
      3. Within each run, detect a left/right column split by looking for
         a clear horizontal gutter between blocks' x-positions.
      4. Emit each run's columns left-to-right, each column top-to-bottom.

    Single-column pages have no detectable gutter, so they fall through
    to plain top-to-bottom order -- identical to the previous behavior.
    """
    blocks = [b for b in page.get_text("blocks") if b[6] == 0 and b[4].strip()]
    if not blocks:
        return ""

    blocks.sort(key=lambda b: (b[1], b[0]))  # top-to-bottom, then left-to-right

    content_x0 = min(b[0] for b in blocks)
    content_x1 = max(b[2] for b in blocks)
    content_width = content_x1 - content_x0

    segments = []  # list of "runs", each a list of blocks
    current_run = []
    for b in blocks:
        width_ratio = (b[2] - b[0]) / content_width if content_width else 1.0
        if width_ratio >= FULL_WIDTH_RATIO:
            if current_run:
                segments.append(current_run)
                current_run = []
            segments.append([b])  # full-width block is its own run
        else:
            current_run.append(b)
    if current_run:
        segments.append(current_run)

    output_parts = []
    for run in segments:
        for column in _split_columns(run, content_x0, content_x1):
            column_sorted = sorted(column, key=lambda b: b[1])
            output_parts.append("\n".join(b[4].strip() for b in column_sorted))

    return "\n\n".join(output_parts)


def get_raw_text(file_path: str | Path) -> str:
    """
    Returns the full document text. Each page is extracted natively if it
    has a real text layer (fast, accurate, column-aware); otherwise it's
    rasterized and OCR'd (for scanned pages/documents). A PDF can mix both
    -- each page is checked independently, so e.g. a scanned signature
    page in an otherwise native-text CV is still handled correctly.

    NOTE: the OCR fallback path does not currently do column reconstruction
    (pytesseract's plain image_to_string reads top-to-bottom across the
    full image width). If scanned/photographed multi-column CVs turn out
    to be common, that path can be upgraded using pytesseract's
    image_to_data output, which provides per-word/per-block bounding
    boxes the same way PyMuPDF's blocks do here.
    """
    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(path)

    if path.suffix.lower() not in PDF_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {path.suffix}. Only PDF is supported.")

    doc = fitz.open(path)
    page_texts = []

    for page in doc:
        native_text = page.get_text()
        if len(native_text.strip()) >= MIN_CHARS_PER_PAGE:
            page_texts.append(_reading_order_text(page))
        else:
            zoom = OCR_RENDER_DPI / 72
            pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom))
            pil_image = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
            page_texts.append(_ocr_page_image(pil_image))

    doc.close()
    return "\n\n".join(page_texts)


# --- Step 2: light preprocessing ----------------------------------------

def clean_text(text: str) -> str:
    """
    Light cleanup only -- no parsing, no reordering, no section detection.
    Goal: remove noise that's clearly an artifact of OCR/PDF extraction,
    while preserving the document's original structure (line breaks,
    blank-line spacing between entries, bullet points) since that
    structure is itself useful signal for an LLM reading the text later.
    """
    # Normalize unicode: fixes ligatures (e.g. "ﬁ" -> "fi"), smart quotes,
    # and other visually-identical-but-differently-encoded characters.
    text = unicodedata.normalize("NFKC", text)

    # Drop non-printable/control characters that occasionally leak in from
    # OCR (except newlines and tabs, which are structurally meaningful).
    text = "".join(ch for ch in text if ch in "\n\t" or ch.isprintable())

    cleaned_lines = []
    for line in text.splitlines():
        # Trim trailing whitespace and collapse runs of internal spaces/tabs
        # (OCR frequently produces irregular spacing), but don't touch
        # leading whitespace, since that can reflect real indentation.
        stripped = line.rstrip()
        leading_ws = len(stripped) - len(stripped.lstrip())
        collapsed = re.sub(r"[ \t]{2,}", " ", stripped.strip())
        line_out = (" " * leading_ws) + collapsed if collapsed else ""

        # Normalize OCR'd bullet glyphs to a single consistent marker so
        # list items are still visually recognizable as list items.
        line_out = BULLET_CHAR_PATTERN.sub("- ", line_out)

        cleaned_lines.append(line_out)

    text = "\n".join(cleaned_lines)

    # Collapse 3+ consecutive blank lines down to at most 1 blank line.
    # Keeps meaningful paragraph/section spacing without excessive gaps.
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# --- Public entry point ---------------------------------------------------

def extract_cv_text(file_path: str | Path) -> str:
    raw_text = get_raw_text(file_path)
    return clean_text(raw_text)

def extract_information_with_gemini(cv_text: str) -> dict:
    prompt = f"""
    You are an expert information extraction assistant.
    You are given text extracted from an applicant's Curriculum Vitae (CV).
    The text may contain OCR errors, unusual formatting, multiple columns, or inconsistent spacing.
    Your task is to identify the applicant's information as accurately as possible.
    Return ONLY valid JSON.
    Do not include markdown.
    Do not include explanations.
    If a field cannot be determined confidently, return null.
    Use the following schema:

    {{
        "first_name": string | null,
        "last_name": string | null,
        "age": integer | null,
        "email": string | null,
        "phone": string | null,
        "city": string | null,
        "highest_education": string | null,
        "school_name": string | null,
        "work_experience_years": number | null,
        "skills": [string],
        "ex_mattel_employee": boolean,
    }}

    Rules:

    - Standardize capitalization for names, cities, and school names to proper title case (e.g. "JOHN DOE" -> "John Doe", "UNIVERSITAS INDONESIA" -> "Universitas Indonesia"), unless it's a known acronym (e.g. "ITB", "UI", "SMA").
    - If the CV only contains one name (e.g. "Sukarno"), use it as first_name and set last_name to null.
    - Calculate age if only birth date is available.
    - work_experience_years should be the total duration of all professional work experience.
    - ex_mattel_employee is true if any company in work_experience is PT Mattel Indonesia or Mattel.
    - school_name should refer to the institution of the highest education only.
    - city should contain only the city or regency name, not the full address.
    - skills should contain only actual skills, not hobbies or interests.
    - Return valid JSON only.
    - Limit the selection of highest education to "SD", "SMP", "SMA/SMK", "D3", "D4", "S1", "S2", "S3". If doesn't match, return "Other / Lainnya".

    CV TEXT:

    {cv_text}
    """

    response = None
    last_error = None

    for model_name in GEMINI_MODELS:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=prompt,
            )
            break  # success -- stop trying further models
        except errors.ClientError as e:
            # Quota/rate-limit errors are typically HTTP 429. Only these
            # should trigger a fallback to the next model -- anything else
            # (bad request, auth failure, etc.) is a real problem and
            # should surface immediately rather than being masked.
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

def match_city(raw_city: str | None, threshold: int = 85) -> str:
    if not raw_city:
        return "Other / Lainnya"
    match = process.extractOne(raw_city, INDONESIAN_CITIES, scorer=fuzz.WRatio)
    if match and match[1] >= threshold:
        return match[0]
    return "Other / Lainnya"

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python cv_text_extract.py <path_to_cv.pdf>")
        sys.exit(1)

    cv_text = extract_cv_text(sys.argv[1])

    print("===== EXTRACTED TEXT =====")
    print(cv_text)

    print("\n===== GEMINI OUTPUT (parsed JSON) =====")
    data = extract_information_with_gemini(cv_text)
    data["city"] = match_city(data["city"])
    print(json.dumps(data, indent=2, ensure_ascii=False))