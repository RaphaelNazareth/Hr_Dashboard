# api.py
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import tempfile, os
from datetime import datetime

import resend
from pydantic import BaseModel
from dotenv import load_dotenv

from cv_extract import extract_cv_text, extract_information_with_ollama, match_city
from ktp_extract import extract_and_validate
from SummaryAI import router as summary_router, start_backfill_in_background

load_dotenv()  # reads backend/.env
resend.api_key = os.getenv("RESEND_API_KEY")


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


# --- Interview email -------------------------------------------------------
class InterviewEmailRequest(BaseModel):
    to: str
    candidateName: str
    stageName: str
    startDateTime: str | None = None
    endTime: str | None = None
    notes: str | None = None


@app.post("/api/send-interview-email")
def send_interview_email(payload: InterviewEmailRequest):
    if not payload.to:
        return {"error": "Missing candidate email"}

    if payload.startDateTime:
        try:
            dt = datetime.fromisoformat(payload.startDateTime)
            time_label = dt.strftime("%A, %d %B %Y, %H:%M")
        except ValueError:
            time_label = payload.startDateTime
    else:
        time_label = "to be confirmed"

    html = f"""
        <p>Hi {payload.candidateName},</p>
        <p>Your <strong>{payload.stageName}</strong> has been scheduled for:</p>
        <p><strong>{time_label}</strong>{f' – {payload.endTime}' if payload.endTime else ''}</p>
        {f'<p>{payload.notes}</p>' if payload.notes else ''}
        <p>Best regards,<br/>HR Team</p>
    """

    try:
        result = resend.Emails.send({
            "from": "onboarding@resend.dev",
            "to": payload.to,
            "subject": f"Interview Scheduled – {payload.stageName}",
            "html": html,
        })
        return {"data": result}
    except Exception as e:
        print("Resend error:", e)
        return {"error": "Failed to send email"}


# --- Local-AI controller (Ollama) ------------------------------------------
# Serves /controller/chat, which the React AIAssistantWidget talks to.
# Guarded so a missing/broken Ollama setup cannot stop the CV + KTP
# extraction endpoints below from booting.
try:
    from Ai_controller.AI_api import router as controller_router

    app.include_router(controller_router)
except Exception as exc:  # pragma: no cover - optional subsystem
    print(f"[warn] controller not mounted, /controller/chat will 404: {exc}")

# --- Job description / requirements AI (Create Job page) -------------------
# Serves POST /api/job-suggestions. Guarded the same way, so a problem in
# job_suggestions.py (e.g. the ollama package missing) can't stop the API booting.
try:
    from job_suggestions import router as job_suggestions_router

    app.include_router(job_suggestions_router)
except Exception as exc:  # pragma: no cover - optional subsystem
    print(f"[warn] job suggestions not mounted, /api/job-suggestions will 404: {exc}")

app.include_router(summary_router)


# --- AI summary backfill (manual) -------------------------------------------
# No work happens at startup: the server just stands by (serving things like
# /api/job-suggestions). Candidates that have no AI summary yet are only
# processed when this endpoint is called, e.g. from /docs or:
#   curl -X POST http://127.0.0.1:8000/api/summaries/backfill
@app.post("/api/summaries/backfill")
def run_summary_backfill():
    start_backfill_in_background()  # runs in a background thread
    return {"status": "started", "detail": "Checking candidates without an AI summary."}


# --- CV / KTP extraction ---------------------------------------------------
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