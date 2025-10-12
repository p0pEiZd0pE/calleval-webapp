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

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(title="CallEval API - Phase-Aware with Background Processing")

# CORS
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

# Binary Scorecard Configuration
SCORECARD_CONFIG = {
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["all"],
        "patterns": [
            r"happy to help", r"glad to assist", r"pleasure", r"absolutely", 
            r"of course", r"definitely", r"certainly", r"wonderful", r"great"
        ]
    },
    "sounds_polite_courteous": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["all"],
        "patterns": [
            r"please", r"thank you", r"you're welcome", r"my pleasure", 
            r"sir", r"ma'am", r"excuse me", r"pardon"
        ]
    },
    "professional_greeting": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["opening"],
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
        "phases": ["opening"],
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
        "phases": ["middle"],
        "patterns": [
            r"first.*last name",
            r"(full )?name.*date of birth",
            r"date of birth",
            r"verify.*identity",
            r"confirm.*who (you are|i'?m speaking)",
            r"(can i have|may i get|could i get).*(your|the).*(name|dob|date of birth)"
        ]
    },
    "active_listening": {
        "weight": 10,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"\bi see\b", r"\buh-huh\b", r"\bmm-hmm\b", r"\bokay\b",
            r"\balright\b", r"\bright\b", r"\bgot it\b", r"\bunderstood\b",
            r"i understand"
        ]
    },
    "asks_permission_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"(can|may|could) i (put|place) you on (a )?(brief |quick )?hold",
            r"(would|will) you mind (if i|holding)",
            r"do you mind.*hold",
            r"is it okay.*hold"
        ]
    },
    "returns_properly_from_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"thank you (for|so much).*(holding|waiting|patience)",
            r"(sorry|apologize).*(keeping you|wait|hold)",
            r"i appreciate.*(holding|waiting|patience)"
        ]
    },
    "no_fillers_stammers": {
        "weight": 10,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [r"\b(um|uh|er|ah)\b"]
    },
    "recaps_time_date": {
        "weight": 15,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"(scheduled|set|appointment|booked).*(for|on|at)",
            r"(coming|see you).*(on|at|this|next)",
            r"\d{1,2}\s*(am|pm|a\.m\.|p\.m\.)",
            r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
            r"at \d{1,2}",
            r"appointment.*\d{1,2}",
            r"scheduled.*\d{1,2}"
        ]
    },
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["closing"],
        "patterns": [
            r"(and |is there )?anything else",
            r"can i help (you )?with anything else",
            r"what else can i"
        ]
    },
    "ended_call_properly": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["closing"],
        "patterns": [
            r"(have a|enjoy your) (great|good|nice|wonderful) (day|afternoon|evening)",
            r"take care", r"bye", r"goodbye", r"talk to you"
        ]
    }
}


def determine_phase(start_time: float, end_time: float, total_duration: float) -> str:
    """Determine call phase based on segment timing"""
    opening_threshold = min(30, total_duration * 0.15)
    closing_threshold = max(total_duration - 30, total_duration * 0.85)
    
    if start_time <= opening_threshold:
        return 'opening'
    elif start_time >= closing_threshold:
        return 'closing'
    else:
        return 'middle'


def transcribe_with_modal_whisperx(audio_path: str, call_id: str):
    """Transcribe audio using Modal WhisperX"""
    try:
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        result = f.remote(audio_url=audio_url, language="en", min_speakers=2, max_speakers=2)
        return result
    except Exception as e:
        print(f"❌ WhisperX error: {e}")
        import traceback
        traceback.print_exc()
        raise


def analyze_with_modal_bert(text: str):
    """Analyze text using Modal BERT"""
    try:
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        
        result = f.remote(text=text)
        return result
    except Exception as e:
        print(f"❌ BERT error: {e}")
        import traceback
        traceback.print_exc()
        return None


def analyze_with_modal_wav2vec2(audio_path: str, call_id: str, text: str):
    """Analyze audio+text using Modal Wav2Vec2-BERT"""
    try:
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WAV2VEC2_APP, settings.MODAL_WAV2VEC2_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_WAV2VEC2_APP, settings.MODAL_WAV2VEC2_FUNCTION)
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        result = f.remote(audio_url=audio_url, text=text)
        return result
    except Exception as e:
        print(f"❌ Wav2Vec2 error: {e}")
        import traceback
        traceback.print_exc()
        return None


def evaluate_binary_metric(metric_name: str, text: str, phase: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """Evaluate a single metric using pattern matching + AI"""
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    config = SCORECARD_CONFIG[metric_name]
    applicable_phases = config.get("phases", ["all"])
    if "all" not in applicable_phases and phase not in applicable_phases:
        return 0.0
    
    threshold = config.get("threshold", 0.5)
    patterns = config.get("patterns", [])
    
    # Pattern matching
    pattern_score = 0.0
    if metric_name == "no_fillers_stammers":
        has_fillers = any(re.search(p, text.lower(), re.IGNORECASE) for p in patterns)
        pattern_score = 0.0 if has_fillers else 1.0
    else:
        for pattern in patterns:
            try:
                if re.search(pattern, text.lower(), re.IGNORECASE):
                    pattern_score = 1.0
                    break
            except re.error:
                continue
    
    # BERT
    bert_score = 0.0
    if bert_output and bert_output.get("success"):
        predictions = bert_output.get("predictions", {})
        if metric_name in predictions:
            bert_score = 1.0 if predictions[metric_name] >= threshold else 0.0
    
    # Wav2Vec2
    wav2vec2_score = 0.0
    if wav2vec2_output and wav2vec2_output.get("success"):
        predictions = wav2vec2_output.get("predictions", {})
        if metric_name in predictions:
            wav2vec2_score = 1.0 if predictions[metric_name] >= threshold else 0.0
    
    return max(pattern_score, bert_score, wav2vec2_score)


def calculate_binary_scores(segments: list, bert_output: dict, wav2vec2_output: dict, total_duration: float) -> dict:
    """Calculate phase-aware binary scores"""
    print("\n" + "="*60)
    print("PHASE-AWARE BINARY SCORECARD")
    print("="*60)
    
    metric_best_scores = {metric: 0.0 for metric in SCORECARD_CONFIG.keys()}
    metric_phases_found = {metric: [] for metric in SCORECARD_CONFIG.keys()}
    
    for seg_idx, segment in enumerate(segments):
        text = segment.get('text', '')
        start_time = segment.get('start', 0)
        end_time = segment.get('end', 0)
        phase = determine_phase(start_time, end_time, total_duration)
        
        for metric_name in SCORECARD_CONFIG.keys():
            score = evaluate_binary_metric(metric_name, text, phase, bert_output, wav2vec2_output)
            if score > metric_best_scores[metric_name]:
                metric_best_scores[metric_name] = score
                if score > 0:
                    metric_phases_found[metric_name].append(phase)
    
    scores = {}
    for metric_name, best_score in metric_best_scores.items():
        weight = SCORECARD_CONFIG[metric_name]["weight"]
        scores[metric_name] = {
            "detected": best_score == 1.0,
            "score": best_score,
            "weight": weight,
            "weighted_score": best_score * weight,
            "phases_found": metric_phases_found[metric_name]
        }
    
    total_score = sum(s["weighted_score"] for s in scores.values())
    
    print(f"\n🎯 TOTAL SCORE: {total_score}/100")
    print("="*60 + "\n")
    
    return {
        "metrics": scores,
        "total_score": total_score,
        "max_score": 100.0,
        "percentage": total_score
    }


def process_call(call_id: str, file_path: str):
    """Background task to process call with phase-aware evaluation"""
    db = SessionLocal()
    
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        if not call:
            print(f"❌ Call {call_id} not found in database")
            return
        
        print(f"\n{'='*60}")
        print(f"PROCESSING CALL: {call_id}")
        print(f"{'='*60}\n")
        
        # Step 1: Transcribe
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        print("🎤 Step 1: Transcribing with WhisperX...")
        whisperx_result = transcribe_with_modal_whisperx(file_path, call_id)
        
        if not whisperx_result or not whisperx_result.get("success"):
            raise Exception("WhisperX transcription failed")
        
        full_transcript = whisperx_result.get("text", "")
        segments = whisperx_result.get("segments", [])
        total_duration = segments[-1].get('end', 0) if segments else 0
        
        call.transcript = full_transcript
        call.duration = f"{int(total_duration//60)}:{int(total_duration%60):02d}"
        db.commit()
        
        print(f"✓ Transcription complete: {total_duration:.1f}s")
        
        # Step 2: BERT Analysis
        call.status = "analyzing"
        call.analysis_status = "analyzing_bert"
        db.commit()
        
        print("\n🧠 Step 2: Analyzing with BERT...")
        bert_output = analyze_with_modal_bert(full_transcript)
        
        if bert_output:
            call.bert_analysis = json.dumps(bert_output)
            db.commit()
            print("✓ BERT analysis complete")
        
        # Step 3: Wav2Vec2 Analysis
        call.analysis_status = "analyzing_wav2vec2"
        db.commit()
        
        print("\n🎵 Step 3: Analyzing with Wav2Vec2...")
        wav2vec2_output = analyze_with_modal_wav2vec2(file_path, call_id, full_transcript)
        
        if wav2vec2_output:
            call.wav2vec2_analysis = json.dumps(wav2vec2_output)
            db.commit()
            print("✓ Wav2Vec2 analysis complete")
        
        # Step 4: Calculate Scores
        print("\n📊 Step 4: Calculating phase-aware scores...")
        scorecard = calculate_binary_scores(segments, bert_output, wav2vec2_output, total_duration)
        
        call.score = scorecard["total_score"]
        call.binary_scores = json.dumps(scorecard["metrics"])
        call.status = "completed"
        call.analysis_status = "completed"
        call.updated_at = datetime.utcnow()
        db.commit()
        
        print(f"\n✅ Processing complete! Score: {scorecard['total_score']}/100\n")
        
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
        "message": "CallEval API - Phase-Aware Evaluation with Background Processing",
        "status": "running"
    }


@app.post("/api/upload")
async def upload_audio(
    file: UploadFile = File(...),
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Upload audio file and start background processing"""
    
    # Validate file type
    if not file.filename.endswith(('.mp3', '.wav', '.m4a', '.ogg')):
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    # Generate unique ID
    call_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}_{file.filename}")
    
    # Save file
    print(f"\n📁 Uploading: {file.filename}")
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Create database record
    call = CallEvaluation(
        id=call_id,
        filename=file.filename,
        file_path=file_path,
        status="processing",
        analysis_status="queued"
    )
    db.add(call)
    db.commit()
    
    print(f"✓ File saved: {call_id}")
    print(f"✓ Starting background processing...")
    
    # Start background processing
    background_tasks.add_task(process_call, call_id, file_path)
    
    # Return immediately - frontend will poll for updates
    return {
        "id": call_id,
        "filename": file.filename,
        "status": "processing",
        "message": "File uploaded successfully. Processing started."
    }


@app.get("/api/calls")
async def get_calls(db: Session = Depends(get_db)):
    """Get all call evaluations - Returns array for frontend"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    
    return [
        {
            "id": call.id,
            "filename": call.filename,
            "status": call.status,
            "analysis_status": call.analysis_status,
            "duration": call.duration,
            "score": call.score,
            "created_at": call.created_at.isoformat() if call.created_at else None,
            "updated_at": call.updated_at.isoformat() if call.updated_at else None,
        }
        for call in calls
    ]


@app.get("/api/calls/{call_id}")
async def get_call_details(call_id: str, db: Session = Depends(get_db)):
    """Get detailed call evaluation"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    bert_analysis = json.loads(call.bert_analysis) if call.bert_analysis else None
    wav2vec2_analysis = json.loads(call.wav2vec2_analysis) if call.wav2vec2_analysis else None
    binary_scores = json.loads(call.binary_scores) if call.binary_scores else None
    
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
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None,
    }


@app.get("/api/temp-audio/{call_id}")
async def serve_temp_audio(call_id: str, db: Session = Depends(get_db)):
    """Serve audio file for Modal processing"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        # Fallback: try filename pattern
        audio_files = list(Path(settings.UPLOAD_DIR).glob(f"{call_id}_*"))
        if not audio_files:
            raise HTTPException(status_code=404, detail="Audio not found")
        return FileResponse(path=str(audio_files[0]), media_type="audio/mpeg")
    
    if not os.path.exists(call.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(path=call.file_path, media_type="audio/mpeg", filename=call.filename)


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)