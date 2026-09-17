# api.py
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import tempfile, os
from cv_extract import extract_cv_text, extract_information_with_ollama, match_city
from ktp_extract import extract_and_validate

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- Local-AI controller (Ollama) ------------------------------------------
# Serves /controller/chat, which the React AIAssistantWidget talks to.
# Guarded so a missing/broken Ollama setup cannot stop the CV + KTP
# extraction endpoints above from booting.
try:
    from Ai_controller.AI_api import router as controller_router

    app.include_router(controller_router)
except Exception as exc:  # pragma: no cover - optional subsystem
    print(f"[warn] controller not mounted, /controller/chat will 404: {exc}")


@app.post("/api/extract-cv")
async def extract_cv(file: UploadFile):
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        text = extract_cv_text(tmp_path)
        data = extract_information_with_ollama(text)
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


if __name__ == "__main__":
    # Lets you start the server with a plain `python api.py`.
    import uvicorn

    uvicorn.run("api:app", host="127.0.0.1", port=8000, reload=True)