# api.py
from fastapi import FastAPI, UploadFile
from fastapi.middleware.cors import CORSMiddleware
import tempfile, os
from cv_extract import extract_cv_text, extract_information_with_ollama, match_city
from ktp_extract import extract_and_validate

# --- Add these imports near the top of api.py, with your other imports ---
import os
import resend
from datetime import datetime
from pydantic import BaseModel
from dotenv import load_dotenv
 
load_dotenv()  # reads backend/.env
resend.api_key = os.getenv("RESEND_API_KEY")


app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# --- Add this class + route anywhere after `app = FastAPI()` -------------
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