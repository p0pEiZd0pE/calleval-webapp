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

# Parse FRONTEND_URL to support multiple origins (comma-separated)
allowed_origins = [
    origin.strip() 
    for origin in settings.FRONTEND_URL.split(",")
]
# Always allow localhost for development
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Binary Scorecard Configuration (AI-only)
SCORECARD_CONFIG = {
    # All Phases (10%)
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5
    },
    "sounds_polite_courteous": {
        "weight": 5,
        "threshold": 0.5
    },
    
    # Opening Spiel (10%)
    "professional_greeting": {
        "weight": 5,
        "threshold": 0.5
    },
    "verifies_patient_online": {
        "weight": 5,
        "threshold": 0.5
    },
    
    # Middle/Climax (70%)
    "patient_verification": {
        "weight": 25,
        "threshold": 0.5
    },
    "active_listening": {
        "weight": 10,
        "threshold": 0.5
    },
    "recaps_time_date": {
        "weight": 15,
        "threshold": 0.5
    },
    
    # Closing/Wrap up (10%)
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5
    },
    "ended_call_properly": {
        "weight": 5,
        "threshold": 0.5
    }
}


def transcribe_with_modal_whisperx(audio_path: str, call_id: str):
    """Transcribe audio using Modal WhisperX"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_WHISPERX_APP}/{settings.MODAL_WHISPERX_FUNCTION}")
        f = modal.Function.from_name(
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
    except Exception as e:
        print(f"❌ WhisperX Modal error: {e}")
        print(f"   App: {settings.MODAL_WHISPERX_APP}")
        print(f"   Function: {settings.MODAL_WHISPERX_FUNCTION}")
        raise


def analyze_with_modal_bert(text: str):
    """Analyze text using Modal BERT"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_BERT_APP}/{settings.MODAL_BERT_FUNCTION}")
        f = modal.Function.from_name(
            settings.MODAL_BERT_APP,
            settings.MODAL_BERT_FUNCTION
        )
        
        print(f"📝 Calling Modal BERT...")
        result = f.remote(text=text, task="all")
        return result
        
    except Exception as e:
        print(f"❌ BERT Modal error: {e}")
        print(f"   App: {settings.MODAL_BERT_APP}")
        print(f"   Function: {settings.MODAL_BERT_FUNCTION}")
        return None


def analyze_with_modal_wav2vec2(audio_path: str, call_id: str, text: str):
    """Analyze audio+text using Modal Wav2Vec2-BERT"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_WAV2VEC2_APP}/{settings.MODAL_WAV2VEC2_FUNCTION}")
        f = modal.Function.from_name(
            settings.MODAL_WAV2VEC2_APP,
            settings.MODAL_WAV2VEC2_FUNCTION
        )
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        print(f"🎵 Calling Modal Wav2Vec2-BERT...")
        
        result = f.remote(audio_url=audio_url, text=text)
        return result
        
    except Exception as e:
        print(f"❌ Wav2Vec2 Modal error: {e}")
        print(f"   App: {settings.MODAL_WAV2VEC2_APP}")
        print(f"   Function: {settings.MODAL_WAV2VEC2_FUNCTION}")
        return None


def evaluate_binary_metric(metric_name: str, text: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """
    Evaluate a single metric using AI models only (BERT + Wav2Vec2)
    Returns: 1.0 if ANY AI model detects it, 0.0 otherwise
    """
    # BERT-based score
    ai_score = 0.0
    if bert_output and bert_output.get("success") and metric_name in SCORECARD_CONFIG:
        predictions = bert_output.get("predictions", {})
        threshold = SCORECARD_CONFIG[metric_name].get("threshold", 0.5)
        
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            ai_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name}: BERT={prediction_value:.3f} (threshold={threshold}) → {ai_score}")
    
    # Wav2Vec2-based score (for enthusiasm and politeness)
    wav2vec2_score = 0.0
    if wav2vec2_output and wav2vec2_output.get("success"):
        results = wav2vec2_output.get("results", {})
        preds = results.get("predictions", {})
        
        wav2vec2_mapping = {
            'enthusiasm_markers': 'enthusiasm',
            'sounds_polite_courteous': 'politeness'
        }
        
        if metric_name in wav2vec2_mapping:
            wav2vec2_key = wav2vec2_mapping[metric_name]
            if wav2vec2_key in preds:
                threshold = SCORECARD_CONFIG[metric_name].get("threshold", 0.5)
                prediction_value = preds[wav2vec2_key]
                wav2vec2_score = 1.0 if prediction_value >= threshold else 0.0
                print(f"  {metric_name}: Wav2Vec2={prediction_value:.3f} → {wav2vec2_score}")
    
    # Binary OR logic: if ANY AI model detects it, return 1.0
    final_score = 1.0 if (ai_score > 0 or wav2vec2_score > 0) else 0.0
    
    if ai_score == 0 and wav2vec2_score == 0:
        print(f"  {metric_name}: NOT DETECTED by any AI model → {final_score}")
    
    return final_score


@app.get("/")
async def root():
    return {
        "status": "ok",
        "service": "CallEval Backend API - Full Modal Stack",
        "version": "2.0.0",
        "evaluation": "AI Models Only (No Pattern Matching)",
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
    
    file_path = call.file_path
    
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"attachment; filename={call.filename}"}
    )


def process_call(call_id: str, file_path: str):
    """Background task: Process call with full Modal stack + Binary Scoring"""
    
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
            print(f"⚠️ BERT failed: {error_msg}")
            print(f"⚠️ Cannot continue without AI model predictions")
            
            if wav2vec_output is None:
                raise Exception(f"Both AI models failed - cannot evaluate call without model predictions")
        
        # STEP 3: CALCULATE BINARY SCORECARD (AI-ONLY)
        print(f"\n{'='*60}")
        print(f"STEP 3: CALCULATING BINARY SCORECARD (AI MODELS ONLY)")
        print(f"{'='*60}")
        
        # Evaluate each metric using binary logic
        metric_scores = {}
        
        for metric_name in SCORECARD_CONFIG.keys():
            score = evaluate_binary_metric(metric_name, agent_text, bert_output, wav2vec_output)
            metric_scores[metric_name] = score
        
        # Calculate weighted scores
        scores = {}
        total_score = 0
        
        for metric_name, found_score in metric_scores.items():
            weight = SCORECARD_CONFIG[metric_name]["weight"]
            final_score = found_score * weight
            scores[metric_name] = final_score
            total_score += final_score
        
        print(f"📊 Individual Scores: {scores}")
        print(f"🎯 Total Score: {total_score}/100")
        
        # Update database
        call.score = total_score
        call.scores = json.dumps(scores, indent=2)
        call.status = "completed"
        call.analysis_status = "completed - AI models only"
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
        file_path=file_path,
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
    
    file_path = call.file_path
    if os.path.exists(file_path):
        os.remove(file_path)
    
    db.delete(call)
    db.commit()
    
    return {"message": "Call deleted successfully"}