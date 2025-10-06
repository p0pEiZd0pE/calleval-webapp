from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from fastapi.responses import FileResponse
import assemblyai as aai
import replicate
import os
import uuid
import aiofiles
import base64
from datetime import datetime
from pathlib import Path

from config import settings
from database import get_db, CallEvaluation, SessionLocal

app = FastAPI(title="CallEval API")

# Initialize Replicate (ADD THIS)
os.environ["REPLICATE_API_TOKEN"] = settings.REPLICATE_API_TOKEN

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Create upload directory
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# Initialize AssemblyAI
aai.settings.api_key = settings.ASSEMBLYAI_API_KEY


# Background task for processing
def process_call(call_id: str, file_path: str):
    """Process the call: transcribe with AssemblyAI, then analyze with BERT models"""
    
    # Create new database session for background task
    db = SessionLocal()
    
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            print(f"Call {call_id} not found")
            return
        
        # Step 1: Transcribe with AssemblyAI
        call.status = "transcribing"
        db.commit()
        
        config = aai.TranscriptionConfig(
            speaker_labels=True,  # Diarization
            language_code="en"
        )
        
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(file_path, config=config)
        
        if transcript.status == aai.TranscriptStatus.error:
            raise Exception(transcript.error)
        
        # Save transcription results
        call.transcript = transcript.text
        duration_minutes = int(transcript.audio_duration // 60)
        duration_seconds = int(transcript.audio_duration % 60)
        call.duration = f"{duration_minutes}:{duration_seconds:02d}"
        
        # Save speaker diarization
        if transcript.utterances:
            speakers_data = [
                {
                    "speaker": utt.speaker,
                    "text": utt.text,
                    "start": utt.start,
                    "end": utt.end
                }
                for utt in transcript.utterances
            ]
            call.speakers = speakers_data
        
        call.status = "completed"
        call.analysis_status = "processing"
        db.commit()
        
        print(f"Transcription completed for {call_id}")
        print(f"Transcript: {transcript.text[:200]}...")  # First 200 chars
        
        # Step 2: Analyze with Wav2Vec2-BERT (audio + text)
        print(f"Running Wav2Vec2-BERT analysis for {call_id}...")

        # Convert audio file to data URI for Replicate
        import base64

        with open(file_path, "rb") as audio_file:
            audio_bytes = audio_file.read()
            audio_base64 = base64.b64encode(audio_bytes).decode('utf-8')
            
            # Determine MIME type
            file_ext = Path(file_path).suffix.lower()
            mime_types = {
                '.wav': 'audio/wav',
                '.mp3': 'audio/mpeg',
                '.m4a': 'audio/mp4'
            }
            mime_type = mime_types.get(file_ext, 'audio/wav')
            
            # Create data URI
            audio_data_uri = f"data:{mime_type};base64,{audio_base64}"

        # Step 2: Analyze with Wav2Vec2-BERT (audio + text)
        print(f"Running Wav2Vec2-BERT analysis for {call_id}...")

        # Use specific version instead of model name
        wav2vec_output = replicate.run(
            "p0peizd0pe/calleval-wav2vec2:4f9414167eff508260c6981379338743da77cbf37f4715fd1f56e73b68237399",  # Add version hash
            input={
                "audio": open(file_path, "rb"),  # Changed this line
                "text": transcript.text
            }
        )

        print(f"Wav2Vec2 output: {wav2vec_output}")

        # Parse Wav2Vec2-BERT results (keep the parsing code you already have)
        if isinstance(wav2vec_output, dict):
            call.phase = wav2vec_output.get("predicted_phase", "middle")
            
            has_fillers_data = wav2vec_output.get("has_fillers", {})
            if isinstance(has_fillers_data, dict):
                has_fillers_score = has_fillers_data.get("score", 0.5)
                call.has_fillers = "yes" if has_fillers_score > 0.5 else "no"
            else:
                call.has_fillers = "unknown"
            
            enthusiasm_data = wav2vec_output.get("enthusiasm", {})
            politeness_data = wav2vec_output.get("politeness", {})
            
            if isinstance(enthusiasm_data, dict) and isinstance(politeness_data, dict):
                enthusiasm_score = enthusiasm_data.get("score", 0.5)
                politeness_score = politeness_data.get("score", 0.5)
                
                call.enthusiasm_score = float(enthusiasm_score) * 100
                call.politeness_score = float(politeness_score) * 100
                call.quality_score = (call.enthusiasm_score + call.politeness_score) / 2
            else:
                call.quality_score = 0.0
                call.enthusiasm_score = 0.0
                call.politeness_score = 0.0
        
        # Step 3: Analyze with BERT (text-based)
        print(f"Running BERT analysis for {call_id}...")

        bert_output = replicate.run(
            "p0peizd0pe/calleval-bert:89f41f4389e3ccc573950905bf1784905be3029014a573a880cbcd47d582cc12",  # Replace with actual hash
            input={"text": transcript.text}
        )

        print(f"BERT output: {bert_output}")

        # Parse BERT results - each task returns {score, prediction}
        if isinstance(bert_output, dict):
            # Helper function to get score from task
            def get_task_score(task_name):
                task_data = bert_output.get(task_name, {})
                if isinstance(task_data, dict):
                    return task_data.get("score", 0.0)
                return 0.0
            
            # Tone score: average of enthusiasm and politeness
            enthusiasm_score = get_task_score("shows_enthusiasm")
            politeness_score = get_task_score("sounds_polite_courteous")
            call.tone_score = float((enthusiasm_score + politeness_score) / 2) * 100
            
            # Script adherence: average of greeting, verification, and other protocol tasks
            greeting_score = get_task_score("professional_greeting")
            verification_score = get_task_score("patient_verification")
            introduces_score = get_task_score("introduces_name")
            call.script_score = float((greeting_score + verification_score + introduces_score) / 3) * 100
            
            # Resolution effectiveness: assistance and proper ending
            assistance_score = get_task_score("offers_further_assistance")
            ending_score = get_task_score("ended_call_properly")
            recap_score = get_task_score("recaps_time_date")
            call.resolution_score = float((assistance_score + ending_score + recap_score) / 3) * 100
            
            # Overall classification based on average of all scores
            avg_score = (call.tone_score + call.script_score + call.resolution_score) / 3
            
            if avg_score >= 70:
                call.classification = "Satisfactory"
            elif avg_score >= 50:
                call.classification = "Needs Improvement"
            else:
                call.classification = "Unsatisfactory"
            
            print(f"Scores - Tone: {call.tone_score:.1f}%, Script: {call.script_score:.1f}%, Resolution: {call.resolution_score:.1f}%")
        else:
            # Fallback if BERT output is unexpected
            call.tone_score = 0.0
            call.script_score = 0.0
            call.resolution_score = 0.0
            call.classification = "Analysis Error"

        call.analysis_status = "classified"
        db.commit()

        print(f"Successfully processed call {call_id}")
        print(f"Classification: {call.classification}, Overall: {avg_score:.1f}%")
        
    except Exception as e:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        if call:
            call.status = "failed"
            call.analysis_status = "failed"
            db.commit()
        print(f"Error processing call {call_id}: {str(e)}")
        import traceback
        traceback.print_exc()
    
    finally:
        db.close()


@app.post("/api/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    agent_name: str = None,
    db: Session = Depends(get_db)
):
    """Upload audio file and start processing"""
    
    # Validate file type
    if not file.filename.endswith(('.wav', '.mp3', '.m4a')):
        raise HTTPException(400, "Only WAV, MP3, M4A files are supported")
    
    # Generate unique ID and file path
    call_id = f"CE-{datetime.now().strftime('%Y')}-{str(uuid.uuid4())[:4]}"
    file_ext = Path(file.filename).suffix
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}{file_ext}")
    
    # Save file
    async with aiofiles.open(file_path, 'wb') as out_file:
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(400, "File too large (max 100MB)")
        await out_file.write(content)
    
    # Create database record
    call = CallEvaluation(
        id=call_id,
        file_name=file.filename,
        agent_name=agent_name,
        audio_path=file_path,
        status="pending"
    )
    db.add(call)
    db.commit()
    
    # Start background processing (pass only call_id and file_path)
    background_tasks.add_task(process_call, call_id, file_path)
    
    return {
        "id": call_id,
        "filename": file.filename,
        "status": "processing",
        "message": "File uploaded successfully. Processing started."
    }


@app.get("/api/calls")
async def get_calls(db: Session = Depends(get_db)):
    """Get all call evaluations"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.date_time.desc()).all()
    return calls


@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, db: Session = Depends(get_db)):
    """Get specific call evaluation"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    if not call:
        raise HTTPException(404, "Call not found")
    return call


@app.get("/api/calls/{call_id}/download")
async def download_audio(call_id: str, db: Session = Depends(get_db)):
    """Download audio file"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    if not call:
        raise HTTPException(404, "Call not found")
    
    if not os.path.exists(call.audio_path):
        raise HTTPException(404, "Audio file not found")
    
    return FileResponse(
        call.audio_path,
        media_type="audio/wav",
        filename=call.file_name
    )


@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    total_calls = db.query(CallEvaluation).count()
    satisfactory = db.query(CallEvaluation).filter(
        CallEvaluation.classification == "Satisfactory"
    ).count()
    
    return {
        "total_calls": total_calls,
        "satisfactory_rating": (satisfactory / total_calls * 100) if total_calls > 0 else 0,
        "avg_duration": "4:32",  # Placeholder
        "agent_adherence_score": 87.1  # Placeholder
    }


@app.get("/")
async def root():
    return {"message": "CallEval API is running"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)