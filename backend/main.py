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
app = FastAPI(title="CallEval API - With Phase Classification")

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

# Binary Scorecard Configuration - WITH PATTERN MATCHING
SCORECARD_CONFIG = {
    # All Phases (10%)
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
    
    # Opening Spiel (10%)
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
    
    # Middle/Climax (70%)
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
            r"\bi see\b",
            r"\buh-huh\b",
            r"\bmm-hmm\b",
            r"\bokay\b",
            r"\balright\b",
            r"\bright\b",
            r"\bgot it\b",
            r"\bunderstood\b",
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
        "patterns": [
            r"\b(um|uh|er|ah)\b"
        ]
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
    
    # Closing/Wrap up (10%)
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
            r"take care",
            r"bye",
            r"goodbye",
            r"talk to you"
        ]
    }
}


def determine_phase(start_time: float, end_time: float, total_duration: float) -> str:
    """Determine call phase based on segment timing"""
    opening_threshold = min(10, total_duration * 0.11)
    closing_threshold = max(total_duration - 13, total_duration * 0.88)
    
    if start_time <= opening_threshold:
        return 'opening'
    elif start_time >= closing_threshold:
        return 'closing'
    else:
        return 'middle'


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


def evaluate_binary_metric(metric_name: str, text: str, phase: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """Evaluate a single metric using PATTERN MATCHING + AI models"""
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    config = SCORECARD_CONFIG[metric_name]
    applicable_phases = config.get("phases", ["all"])
    if "all" not in applicable_phases and phase not in applicable_phases:
        return 0.0
    
    threshold = config.get("threshold", 0.5)
    
    # 1. PATTERN MATCHING
    pattern_score = 0.0
    patterns = config.get("patterns", [])
    
    if metric_name == "no_fillers_stammers":
        has_fillers = any(re.search(pattern, text.lower(), re.IGNORECASE) for pattern in patterns)
        pattern_score = 0.0 if has_fillers else 1.0
        print(f"  ✓ {metric_name} (Phase: {phase}): {'FILLERS DETECTED' if has_fillers else 'NO FILLERS'}")
    else:
        for pattern in patterns:
            try:
                if re.search(pattern, text.lower(), re.IGNORECASE):
                    pattern_score = 1.0
                    print(f"  ✓ {metric_name} (Phase: {phase}): PATTERN MATCHED")
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
            print(f"  {metric_name} (Phase: {phase}): BERT={prediction_value:.3f} → {bert_score}")
    
    # 3. Wav2Vec2 predictions
    wav2vec2_score = 0.0
    if wav2vec2_output and wav2vec2_output.get("success"):
        predictions = wav2vec2_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            wav2vec2_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name} (Phase: {phase}): Wav2Vec2={prediction_value:.3f} → {wav2vec2_score}")
    
    final_score = max(pattern_score, bert_score, wav2vec2_score)
    return final_score


def calculate_binary_scores(segments: list, bert_output: dict, wav2vec2_output: dict, total_duration: float) -> dict:
    """Calculate binary scores for all metrics with phase-aware evaluation"""
    print("\n" + "="*60)
    print("CALCULATING PHASE-AWARE BINARY SCORECARD")
    print("="*60)
    
    metric_best_scores = {metric: 0.0 for metric in SCORECARD_CONFIG.keys()}
    metric_phases_found = {metric: [] for metric in SCORECARD_CONFIG.keys()}
    
    for seg_idx, segment in enumerate(segments):
        text = segment.get('text', '')
        start_time = segment.get('start', 0)
        end_time = segment.get('end', 0)
        
        phase = determine_phase(start_time, end_time, total_duration)
        
        print(f"\n📍 Segment {seg_idx + 1}: [{start_time:.1f}s - {end_time:.1f}s] Phase: {phase.upper()}")
        print(f"   Text: {text[:100]}...")
        
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
            "phases_found": metric_phases_found[metric_name],
            "applicable_phases": SCORECARD_CONFIG[metric_name].get("phases", ["all"])
        }
    
    total_score = sum(s["weighted_score"] for s in scores.values())
    
    print("\n" + "="*60)
    print("FINAL PHASE-AWARE SCORECARD RESULTS")
    print("="*60)
    for metric_name, score_data in scores.items():
        status = "✅" if score_data["detected"] else "❌"
        phases_info = f"(Found in: {', '.join(score_data['phases_found'])})" if score_data['phases_found'] else "(Not found)"
        print(f"{status} {metric_name}: {score_data['weighted_score']}/{score_data['weight']} {phases_info}")
    
    print(f"\n🎯 TOTAL SCORE: {total_score}/100")
    print("="*60 + "\n")
    
    return {
        "metrics": scores,
        "total_score": total_score,
        "max_score": 100.0,
        "percentage": total_score
    }


@app.get("/")
async def root():
    return {
        "message": "CallEval API - Phase-Aware Evaluation",
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
    db: Session = Depends(get_db)
):
    """Upload and evaluate audio with phase-aware scoring"""
    print("\n" + "="*60)
    print("NEW AUDIO UPLOAD - PHASE-AWARE EVALUATION")
    print("="*60)
    
    call_id = str(uuid.uuid4())
    file_ext = Path(file.filename).suffix
    audio_filename = f"{call_id}{file_ext}"
    audio_path = os.path.join(settings.UPLOAD_DIR, audio_filename)
    
    try:
        # Step 1: Save file
        print(f"📁 Saving audio: {audio_filename}")
        with open(audio_path, "wb") as buffer:
            content = await file.read()
            buffer.write(content)
        
        file_size = len(content)
        print(f"✓ File saved: {file_size} bytes")
        
        # Step 2: Transcribe with WhisperX
        print("\n🎤 Step 2: Transcribing with WhisperX...")
        whisperx_result = transcribe_with_modal_whisperx(audio_path, call_id)
        
        if not whisperx_result or not whisperx_result.get("success"):
            raise Exception("WhisperX transcription failed")
        
        full_transcript = whisperx_result.get("text", "")
        segments = whisperx_result.get("segments", [])
        total_duration = segments[-1].get('end', 0) if segments else 0
        
        print(f"✓ Transcription complete: {total_duration:.1f}s, {len(segments)} segments")
        
        # Step 3: Analyze with BERT
        print("\n🧠 Step 3: Analyzing with BERT...")
        bert_output = analyze_with_modal_bert(full_transcript)
        
        # Step 4: Analyze with Wav2Vec2
        print("\n🎵 Step 4: Analyzing with Wav2Vec2...")
        wav2vec2_output = analyze_with_modal_wav2vec2(audio_path, call_id, full_transcript)
        
        # Step 5: Calculate phase-aware binary scores
        print("\n📊 Step 5: Calculating phase-aware scores...")
        scorecard = calculate_binary_scores(segments, bert_output, wav2vec2_output, total_duration)
        
        # Step 6: Save to database
        db_call = CallEvaluation(
            id=call_id,
            filename=file.filename,
            file_path=audio_path,
            status="completed",
            analysis_status="completed",
            transcript=full_transcript,
            duration=f"{int(total_duration//60)}:{int(total_duration%60):02d}",
            score=scorecard["total_score"],
            binary_scores=json.dumps(scorecard["metrics"]),
            bert_analysis=json.dumps(bert_output) if bert_output else None,
            wav2vec2_analysis=json.dumps(wav2vec2_output) if wav2vec2_output else None,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        db.add(db_call)
        db.commit()
        db.refresh(db_call)
        
        print(f"\n✅ Call evaluation complete! Score: {scorecard['total_score']}/100")
        
        return {
            "success": True,
            "call_id": call_id,
            "filename": file.filename,
            "transcript": full_transcript,
            "segments": segments,
            "total_duration": total_duration,
            "scorecard": scorecard,
            "message": "Audio processed successfully"
        }
        
    except Exception as e:
        print(f"\n❌ Error processing audio: {str(e)}")
        import traceback
        traceback.print_exc()
        
        if os.path.exists(audio_path):
            os.remove(audio_path)
        
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/calls")
async def get_calls(db: Session = Depends(get_db)):
    """Get all call evaluations - Returns array directly for frontend"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    
    # Return array directly (not wrapped in dict) - frontend expects this
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
    """Serve audio file temporarily for Modal processing"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        # Fallback: try to find by filename pattern
        audio_files = list(Path(settings.UPLOAD_DIR).glob(f"{call_id}.*"))
        if not audio_files:
            raise HTTPException(status_code=404, detail="Audio file not found")
        return FileResponse(
            path=str(audio_files[0]),
            media_type="audio/mpeg",
            filename=audio_files[0].name
        )
    
    if not os.path.exists(call.file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")
    
    return FileResponse(
        path=call.file_path,
        media_type="audio/mpeg",
        filename=call.filename
    )


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)