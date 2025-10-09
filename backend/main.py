from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import uuid
import modal
import librosa
from pathlib import Path
import json

from config import settings
from database import get_db, CallEvaluation, SessionLocal

# Modal Authentication
modal_token_id = os.getenv("MODAL_TOKEN_ID")
modal_token_secret = os.getenv("MODAL_TOKEN_SECRET")

if modal_token_id and modal_token_secret:
    print(f"✓ Modal credentials found")
    os.environ["MODAL_TOKEN_ID"] = modal_token_id
    os.environ["MODAL_TOKEN_SECRET"] = modal_token_secret
else:
    print("⚠ Warning: Modal credentials not found")

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(title="CallEval API - Full Modal Stack")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def transcribe_with_modal_whisperx(audio_path: str, call_id: str):
    """Transcribe audio using Modal WhisperX"""
    f = modal.Function.lookup(
        settings.MODAL_WHISPERX_APP,
        settings.MODAL_WHISPERX_FUNCTION
    )
    
    audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
    print(f"🎯 WhisperX audio URL: {audio_url}")
    
    result = f.remote(
        audio_url=audio_url,
        language="en",
        min_speakers=2,
        max_speakers=2
    )
    
    return result


def analyze_with_modal_bert(text: str):
    """Analyze text using Modal BERT"""
    try:
        f = modal.Function.lookup(
            settings.MODAL_BERT_APP,
            settings.MODAL_BERT_FUNCTION
        )
        
        print(f"📝 Calling Modal BERT...")
        result = f.remote(text=text, task="all")
        return result
        
    except Exception as e:
        print(f"❌ BERT error: {e}")
        return None


def analyze_with_modal_wav2vec2(audio_path: str, call_id: str, text: str):
    """Analyze audio+text using Modal Wav2Vec2-BERT"""
    try:
        f = modal.Function.lookup(
            settings.MODAL_WAV2VEC2_APP,
            settings.MODAL_WAV2VEC2_FUNCTION
        )
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        print(f"🎵 Calling Modal Wav2Vec2-BERT...")
        
        result = f.remote(audio_url=audio_url, text=text)
        return result
        
    except Exception as e:
        print(f"❌ Wav2Vec2 error: {e}")
        return None


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "CallEval Backend API - Full Modal Stack",
        "version": "2.0.0",
        "models": {
            "whisperx": "Modal ✓",
            "bert": "Modal ✓",
            "wav2vec2": "Modal ✓"
        }
    }


@app.get("/api/temp-audio/{call_id}")
async def serve_temp_audio(call_id: str, db: Session = Depends(get_db)):
    """Serve audio file for Modal functions to download"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    file_path = os.path.join(settings.UPLOAD_DIR, call.filename)
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"attachment; filename={call.filename}"}
    )


def process_call(call_id: str, file_path: str):
    """Background task: Process call with full Modal stack"""
    
    db = SessionLocal()
    
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            print(f"Call {call_id} not found")
            return
        
        # STEP 1: TRANSCRIBE WITH MODAL WHISPERX
        print(f"\n{'='*60}")
        print(f"STEP 1: TRANSCRIBING WITH MODAL WHISPERX")
        print(f"{'='*60}")
        
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        whisperx_result = transcribe_with_modal_whisperx(file_path, call_id)
        
        if not whisperx_result or "segments" not in whisperx_result:
            raise Exception("WhisperX transcription failed")
        
        full_text = " ".join([seg["text"] for seg in whisperx_result["segments"]])
        call.transcript = full_text
        
        # Calculate duration
        if "segments" in whisperx_result and len(whisperx_result["segments"]) > 0:
            last_segment = whisperx_result["segments"][-1]
            duration_seconds = int(last_segment.get("end", 0))
            minutes = duration_seconds // 60
            seconds = duration_seconds % 60
            call.duration = f"{minutes}:{seconds:02d}"
        
        # Store speakers
        if "segments" in whisperx_result:
            call.speakers = json.dumps(whisperx_result["segments"], indent=2)
        
        db.commit()
        print(f"✅ Transcription complete!")
        
        # Extract agent text (SPEAKER_01)
        agent_segments = [
            seg for seg in whisperx_result["segments"]
            if seg.get("speaker") == "SPEAKER_01"
        ]
        agent_text = " ".join([seg["text"] for seg in agent_segments])
        
        print(f"📝 Agent text length: {len(agent_text)} chars")
        
        # STEP 2: ANALYZE WITH MODAL MODELS
        print(f"\n{'='*60}")
        print(f"STEP 2: ANALYZING WITH MODAL AI MODELS")
        print(f"{'='*60}")
        
        call.status = "analyzing"
        call.analysis_status = "analyzing"
        db.commit()
        
        # Try Wav2Vec2-BERT model (optional)
        print(f"✓ Running Modal Wav2Vec2-BERT model...")
        wav2vec_output = analyze_with_modal_wav2vec2(file_path, call_id, agent_text)
        
        if wav2vec_output and not wav2vec_output.get("success"):
            print(f"⚠️ Wav2Vec2 warning: {wav2vec_output.get('error')}")
            wav2vec_output = None
        
        # Try BERT model (required)
        print(f"✓ Running Modal BERT model...")
        bert_output = analyze_with_modal_bert(agent_text)
        
        if not bert_output or not bert_output.get("success"):
            error_msg = bert_output.get("error") if bert_output else "No response"
            print(f"❌ BERT failed: {error_msg}")
            
            if wav2vec_output is None:
                raise Exception(f"All AI models failed: {error_msg}")
        
        # STEP 3: CALCULATE BINARY SCORECARD
        print(f"\n{'='*60}")
        print(f"STEP 3: CALCULATING BINARY SCORECARD")
        print(f"{'='*60}")
        
        # Use BERT or Wav2Vec2 predictions
        predictions = {}
        if bert_output and bert_output.get("success"):
            predictions = bert_output.get("predictions", {})
        elif wav2vec_output and wav2vec_output.get("success"):
            predictions = wav2vec_output.get("results", {}).get("predictions", {})
        
        # Calculate binary scores based on predictions
        scores = {
            # Opening (10%)
            "professional_greeting": 5 if predictions.get("professional_greeting", 0) > 0.5 else 0,
            "verifies_patient_online": 5 if predictions.get("patient_verification", 0) > 0.5 else 0,
            
            # Middle/Climax (70%)
            "patient_verification": 25 if predictions.get("patient_verification", 0) > 0.5 else 0,
            "active_listening": 10 if predictions.get("active_listening", 0) > 0.5 else 0,
            "recaps_time_date": 15 if predictions.get("recaps_correctly", 0) > 0.5 else 0,
            
            # Closing (10%)
            "offers_further_assistance": 5 if predictions.get("offers_assistance", 0) > 0.5 else 0,
            "ended_call_properly": 5 if predictions.get("proper_closing", 0) > 0.5 else 0,
            
            # All Phases (10%)
            "enthusiasm_markers": 10 if predictions.get("enthusiasm", 0) > 0.5 else 0,
        }
        
        total_score = sum(scores.values())
        
        print(f"📊 Individual Scores: {scores}")
        print(f"🎯 Total Score: {total_score}/100")
        
        # Update database
        call.score = total_score
        call.scores = json.dumps(scores, indent=2)
        call.status = "completed"
        call.analysis_status = "completed"
        db.commit()
        
        print(f"✅ Call {call_id} processed successfully!")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f"❌ Error processing call {call_id}: {e}")
        import traceback
        traceback.print_exc()
        
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        if call:
            call.status = "failed"
            call.analysis_status = f"error: {str(e)}"
            db.commit()
    
    finally:
        db.close()


@app.post("/api/upload")
async def upload_call(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload and process call recording"""
    
    if not file.filename.endswith(('.mp3', '.wav', '.m4a')):
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    call_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, file.filename)
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    call = CallEvaluation(
        id=call_id,
        filename=file.filename,
        status="processing",
        analysis_status="queued",
        created_at=datetime.utcnow()
    )
    
    db.add(call)
    db.commit()
    
    background_tasks.add_task(process_call, call_id, file_path)
    
    return {
        "id": call_id,
        "filename": file.filename,
        "status": "processing"
    }


@app.get("/api/calls")
async def get_all_calls(db: Session = Depends(get_db)):
    """Get all call evaluations"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    return calls


@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, db: Session = Depends(get_db)):
    """Get specific call evaluation"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    return call


@app.delete("/api/calls/{call_id}")
async def delete_call(call_id: str, db: Session = Depends(get_db)):
    """Delete call evaluation"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    file_path = os.path.join(settings.UPLOAD_DIR, call.filename)
    if os.path.exists(file_path):
        os.remove(file_path)
    
    db.delete(call)
    db.commit()
    
    return {"message": "Call deleted successfully"}