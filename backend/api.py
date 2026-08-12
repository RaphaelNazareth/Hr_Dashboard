# api.py
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import tempfile, os
from cv_extract import extract_cv_text, extract_information_with_gemini, match_city
from ktp_extract import extract_and_validate

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

@app.post("/api/extract-cv")
async def extract_cv(file: UploadFile):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        text = extract_cv_text(tmp_path)
        data = extract_information_with_gemini(text)
        data["city"] = match_city(data.get("city"))
        return data
    finally:
        os.remove(tmp_path)

@app.post("/api/extract-ktp")
async def extract_ktp(file: UploadFile):
    suffix = os.path.splitext(file.filename or "")[1] or ".jpg"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        return extract_and_validate(tmp_path)
    finally:
        os.remove(tmp_path)