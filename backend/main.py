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
import re

from config import settings
from database import get_db, CallEvaluation, SessionLocal

# ==================== MODAL AUTHENTICATION ====================
modal_token_id = os.getenv("MODAL_TOKEN_ID")
modal_token_secret = os.getenv("MODAL_TOKEN_SECRET")

if modal_token_id and modal_token_secret:
    print(f"✓ Modal credentials found")
    print(f"  Token ID: {modal_token_id[:10]}...")
    os.environ["MODAL_TOKEN_ID"] = modal_token_id
    os.environ["MODAL_TOKEN_SECRET"] = modal_token_secret
    print(f"✓ Modal environment configured")
else:
    print("⚠ WARNING: Modal credentials NOT found!")
    print(f"  MODAL_TOKEN_ID exists: {bool(modal_token_id)}")
    print(f"  MODAL_TOKEN_SECRET exists: {bool(modal_token_secret)}")
    print("  Modal functions will NOT work without credentials!")

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(title="CallEval API - Full Modal Stack")

allowed_origins = [origin.strip() for origin in settings.FRONTEND_URL.split(",")]
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Binary Scorecard Configuration - ONLY ADDED "phases" FIELD
SCORECARD_CONFIG = {
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["all"],  # NEW: Can be evaluated in any phase
        "patterns": [
            r"happy to help", r"glad to assist", r"pleasure", r"absolutely", 
            r"of course", r"definitely", r"certainly", r"wonderful", r"great"
        ]
    },
    "sounds_polite_courteous": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["all"],  # NEW: Can be evaluated in any phase
        "patterns": [
            r"please", r"thank you", r"you're welcome", r"my pleasure", 
            r"sir", r"ma'am", r"excuse me", r"pardon"
        ]
    },
    "professional_greeting": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["opening"],  # NEW: Only opening phase
        "patterns": [
            r"thank you for calling.*practice",
            r"good (morning|afternoon|evening)",
            r"this is \w+",
            r"how (can|may) i (help|assist)"
        ]
    },
    "verifies_patient_online": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["opening"],  # NEW: Only opening phase
        "patterns": [
            r"are you (still )?there",
            r"can you hear me",
            r"hello.*are you",
            r"patient.*on.*line"
        ]
    },
    "patient_verification": {
        "weight": 25,
        "threshold": 0.5,
        "phases": ["middle"],  # NEW: Only middle phase
        "patterns": [
            r"(date of birth|dob|birthday)",
            r"(first.*last name|full name)",
            r"verify (your )?identity",
            r"confirm.*name",
            r"what('s| is) your name",
            r"spell.*name"
        ]
    },
    "active_listening": {
        "weight": 10,
        "threshold": 0.5,
        "phases": ["middle"],  # NEW: Only middle phase
        "patterns": [
            r"i (understand|see|hear you)",
            r"let me (check|look|review)",
            r"okay,? (so|let me)",
            r"i'll (help|assist)",
            r"got it"
        ]
    },
    "asks_permission_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["middle"],  # NEW: Only middle phase
        "patterns": [
            r"may i (place|put) you on hold",
            r"can i (place|put) you on hold",
            r"is it (okay|ok) if i put you on hold",
            r"mind if i put you on (a )?hold"
        ]
    },
    "returns_properly_from_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["middle"],  # NEW: Only middle phase
        "patterns": [
            r"thank you for (holding|waiting)",
            r"thanks for (holding|waiting)",
            r"appreciate your patience",
            r"sorry (for|about) the wait"
        ]
    },
    "no_fillers_stammers": {
        "weight": 10,
        "threshold": 0.5,
        "phases": ["middle"],  # NEW: Only middle phase
        "patterns": []
    },
    "recaps_time_date": {
        "weight": 15,
        "threshold": 0.5,
        "phases": ["middle"],  # NEW: Only middle phase
        "patterns": [
            r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
            r"(january|february|march|april|may|june|july|august|september|october|november|december)",
            r"\d{1,2}:\d{2}\s*(am|pm|a\.m\.|p\.m\.)",
            r"at \d{1,2}",
            r"appointment.*\d{1,2}",
            r"scheduled.*\d{1,2}"
        ]
    },
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["closing"],  # NEW: Only closing phase
        "patterns": [
            r"(and |is there )?anything else",
            r"can i help (you )?with anything else",
            r"what else can i"
        ]
    },
    "ended_call_properly": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["closing"],  # NEW: Only closing phase
        "patterns": [
            r"(have a|enjoy your) (great|good|nice|wonderful) (day|afternoon|evening)",
            r"take care",
            r"bye",
            r"goodbye",
            r"talk to you"
        ]
    }
}

# NEW FUNCTION: Determine phase based on timing
def determine_phase(start_time: float, total_duration: float) -> str:
    """Determine call phase based on segment timing"""
    opening_threshold = min(30, total_duration * 0.15)
    closing_threshold = max(total_duration - 30, total_duration * 0.85)
    
    if start_time <= opening_threshold:
        return 'opening'
    elif start_time >= closing_threshold:
        return 'closing'
    else:
        return 'middle'

# ORIGINAL WORKING MODAL FUNCTIONS - NO CHANGES
def transcribe_with_modal_whisperx(audio_path: str, call_id: str):
    """Transcribe audio using Modal WhisperX"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_WHISPERX_APP}/{settings.MODAL_WHISPERX_FUNCTION}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        
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
        import traceback
        traceback.print_exc()
        raise


def analyze_with_modal_bert(text: str):
    """Analyze text using Modal BERT"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_BERT_APP}/{settings.MODAL_BERT_FUNCTION}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        
        print(f"📝 Calling Modal BERT...")
        result = f.remote(text=text)
        return result
        
    except Exception as e:
        print(f"❌ BERT Modal error: {e}")
        print(f"   App: {settings.MODAL_BERT_APP}")
        print(f"   Function: {settings.MODAL_BERT_FUNCTION}")
        import traceback
        traceback.print_exc()
        return None


def analyze_with_modal_wav2vec2(audio_path: str, call_id: str, text: str):
    """Analyze audio+text using Modal Wav2Vec2-BERT"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_WAV2VEC2_APP}/{settings.MODAL_WAV2VEC2_FUNCTION}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WAV2VEC2_APP, settings.MODAL_WAV2VEC2_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_WAV2VEC2_APP, settings.MODAL_WAV2VEC2_FUNCTION)
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        print(f"🎵 Calling Modal Wav2Vec2...")
        
        result = f.remote(audio_url=audio_url, text=text)
        return result
        
    except Exception as e:
        print(f"❌ Wav2Vec2 Modal error: {e}")
        import traceback
        traceback.print_exc()
        return None


# UPDATED FUNCTION - ADDED PHASE PARAMETER ONLY
def evaluate_binary_metric(metric_name: str, text: str, phase: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """Evaluate a single metric using PATTERN MATCHING + AI models"""
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    config = SCORECARD_CONFIG[metric_name]
    
    # NEW: Check if metric applies to this phase
    applicable_phases = config.get("phases", ["all"])
    if "all" not in applicable_phases and phase not in applicable_phases:
        return 0.0  # Skip if metric doesn't apply to this phase
    
    threshold = config.get("threshold", 0.5)
    
    # 1. PATTERN MATCHING
    pattern_score = 0.0
    patterns = config.get("patterns", [])
    for pattern in patterns:
        try:
            if re.search(pattern, text.lower(), re.IGNORECASE):
                pattern_score = 1.0
                print(f"  ✓ {metric_name}: PATTERN MATCHED")
                break
        except re.error:
            continue
    
    # 2. BERT predictions
    bert_score = 0.0
    if bert_output and bert_output.get("success"):
        predictions = bert_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            bert_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name}: BERT={prediction_value:.3f} → {bert_score}")
    
    # 3. Wav2Vec2 predictions
    wav2vec2_score = 0.0
    if wav2vec2_output and wav2vec2_output.get("success"):
        predictions = wav2vec2_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            wav2vec2_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name}: Wav2Vec2={prediction_value:.3f} → {wav2vec2_score}")
    
    # OR LOGIC: Return 1.0 if ANY method detects it
    final_score = max(pattern_score, bert_score, wav2vec2_score)
    return final_score


# UPDATED FUNCTION - ADDED PHASE-AWARE EVALUATION
def calculate_binary_scores(text: str, segments: list, total_duration: float, bert_output: dict, wav2vec2_output: dict) -> dict:
    """Calculate binary scores for all metrics with phase awareness"""
    scores = {}
    
    # Track best score for each metric across all segments
    metric_best_scores = {metric: 0.0 for metric in SCORECARD_CONFIG.keys()}
    
    # Evaluate each segment with phase awareness
    for segment in segments:
        seg_text = segment.get('text', '')
        start_time = segment.get('start', 0)
        
        # Determine phase for this segment
        phase = determine_phase(start_time, total_duration)
        
        # Evaluate all metrics for this segment
        for metric_name in SCORECARD_CONFIG.keys():
            score = evaluate_binary_metric(metric_name, seg_text, phase, bert_output, wav2vec2_output)
            
            # Keep the best score across all segments
            if score > metric_best_scores[metric_name]:
                metric_best_scores[metric_name] = score
    
    # Build final scores
    for metric_name, best_score in metric_best_scores.items():
        weight = SCORECARD_CONFIG[metric_name]["weight"]
        scores[metric_name] = {
            "detected": best_score == 1.0,
            "score": best_score,
            "weight": weight,
            "weighted_score": best_score * weight
        }
    
    # Calculate total
    total_score = sum(s["weighted_score"] for s in scores.values())
    
    return {
        "metrics": scores,
        "total_score": total_score,
        "max_score": 100.0,
        "percentage": total_score
    }


# ORIGINAL WORKING process_call FUNCTION - NO CHANGES EXCEPT calculate_binary_scores call
def process_call(call_id: str, file_path: str):
    """Background task to process audio file"""
    db = SessionLocal()
    
    try:
        # Step 1: Transcribe
        print(f"\n🎤 Step 1: Transcribing {call_id}...")
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        whisperx_result = transcribe_with_modal_whisperx(file_path, call_id)
        
        # Save transcript
        transcript = whisperx_result.get("text", "")
        segments = whisperx_result.get("segments", [])
        total_duration = segments[-1].get('end', 0) if segments else 0
        
        call.transcript = transcript
        call.duration = f"{int(total_duration//60)}:{int(total_duration%60):02d}"
        db.commit()
        print(f"✓ Transcription complete")
        
        # Step 2: Analyze with BERT
        print(f"\n🧠 Step 2: Analyzing with BERT...")
        call.status = "analyzing"
        call.analysis_status = "analyzing_bert"
        db.commit()
        
        bert_output = analyze_with_modal_bert(transcript)
        if bert_output:
            call.bert_analysis = json.dumps(bert_output)
            db.commit()
            print(f"✓ BERT analysis complete")
        
        # Step 3: Analyze with Wav2Vec2
        print(f"\n🎵 Step 3: Analyzing with Wav2Vec2...")
        call.analysis_status = "analyzing_wav2vec2"
        db.commit()
        
        wav2vec2_output = analyze_with_modal_wav2vec2(file_path, call_id, transcript)
        if wav2vec2_output:
            call.wav2vec2_analysis = json.dumps(wav2vec2_output)
            db.commit()
            print(f"✓ Wav2Vec2 analysis complete")
        
        # Step 4: Calculate scores with phase awareness
        print(f"\n📊 Step 4: Calculating scores...")
        scorecard = calculate_binary_scores(transcript, segments, total_duration, bert_output, wav2vec2_output)
        
        call.score = scorecard["total_score"]
        call.binary_scores = json.dumps(scorecard["metrics"])
        call.status = "completed"
        call.analysis_status = "completed"
        call.updated_at = datetime.utcnow()
        db.commit()
        
        print(f"\n✅ Call {call_id} processed successfully! Score: {scorecard['total_score']}/100\n")
        
    except Exception as e:
        print(f"\n❌ Error processing call {call_id}: {str(e)}")
        import traceback
        traceback.print_exc()
        
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        if call:
            call.status = "failed"
            call.analysis_status = f"error: {str(e)[:200]}"
            db.commit()
    
    finally:
        db.close()


@app.get("/")
async def root():
    return {
        "message": "CallEval API - Full Modal Stack",
        "status": "running",
        "models": {
            "transcription": f"{settings.MODAL_WHISPERX_APP}/{settings.MODAL_WHISPERX_FUNCTION}",
            "bert": f"{settings.MODAL_BERT_APP}/{settings.MODAL_BERT_FUNCTION}",
            "wav2vec2": f"{settings.MODAL_WAV2VEC2_APP}/{settings.MODAL_WAV2VEC2_FUNCTION}"
        }
    }


@app.post("/api/upload")
async def upload_audio(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Upload and process audio file"""
    
    if not file.filename.endswith(('.mp3', '.wav', '.m4a', '.ogg')):
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    call_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}_{file.filename}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    call = CallEvaluation(
        id=call_id,
        filename=file.filename,
        file_path=file_path,
        status="processing",
        analysis_status="queued"
    )
    db.add(call)
    db.commit()
    
    background_tasks.add_task(process_call, call_id, file_path)
    
    return {
        "id": call_id,
        "filename": file.filename,
        "status": "processing"
    }


@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, db: Session = Depends(get_db)):
    """Get call evaluation results"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    bert_analysis = json.loads(call.bert_analysis) if call.bert_analysis else None
    wav2vec2_analysis = json.loads(call.wav2vec2_analysis) if call.wav2vec2_analysis else None
    binary_scores = json.loads(call.binary_scores) if call.binary_scores else None
    speakers = json.loads(call.speakers) if call.speakers else None
    
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "transcript": call.transcript,
        "duration": call.duration,
        "score": call.score,
        "bert_analysis": bert_analysis,
        "wav2vec2_analysis": wav2vec2_analysis,
        "binary_scores": binary_scores,
        "speakers": speakers,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None,
    }


@app.get("/api/calls")
async def list_calls(db: Session = Depends(get_db)):
    """List all call evaluations"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    
    return [{
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "duration": call.duration,
        "score": call.score,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None,
    } for call in calls]


@app.get("/api/temp-audio/{call_id}")
async def get_temp_audio(call_id: str, db: Session = Depends(get_db)):
    """Serve audio file temporarily for Modal to download"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    if not os.path.exists(call.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(path=call.file_path, media_type="audio/mpeg", filename=call.filename)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)