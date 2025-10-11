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
import re  # ADD THIS FOR PATTERN MATCHING

from config import settings
from database import get_db, CallEvaluation, SessionLocal

# ==================== MODAL AUTHENTICATION ====================
modal_token_id = os.getenv("MODAL_TOKEN_ID")
modal_token_secret = os.getenv("MODAL_TOKEN_SECRET")

if modal_token_id and modal_token_secret:
    print(f"✓ Modal credentials found")
    print(f"  Token ID: {modal_token_id[:10]}...")
    
    # Set environment variables for Modal
    os.environ["MODAL_TOKEN_ID"] = modal_token_id
    os.environ["MODAL_TOKEN_SECRET"] = modal_token_secret
    
    print(f"✓ Modal environment configured")
else:
    print("⚠ WARNING: Modal credentials NOT found!")
    print(f"  MODAL_TOKEN_ID exists: {bool(modal_token_id)}")
    print(f"  MODAL_TOKEN_SECRET exists: {bool(modal_token_secret)}")
    print("  Modal functions will NOT work without credentials!")

# ==============================================================

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

# Binary Scorecard Configuration - WITH PATTERN MATCHING (UPDATED!)
SCORECARD_CONFIG = {
    # All Phases (10%)
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"happy to help", r"glad to assist", r"pleasure", r"absolutely", 
            r"of course", r"definitely", r"certainly", r"wonderful", r"great"
        ]
    },
    "sounds_polite_courteous": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"please", r"thank you", r"you're welcome", r"my pleasure", 
            r"sir", r"ma'am", r"excuse me", r"pardon"
        ]
    },
    
    # Opening Spiel (10%)
    "professional_greeting": {
        "weight": 5,
        "threshold": 0.5,
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
        "patterns": []  # Inverse logic
    },
    "recaps_time_date": {
        "weight": 15,
        "threshold": 0.5,
        "patterns": [
            r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
            r"(january|february|march|april|may|june|july|august|september|october|november|december)",
            r"\d{1,2}:\d{2}\s*(am|pm|a\.m\.|p\.m\.)",
            r"at \d{1,2}",
            r"appointment.*\d{1,2}",
            r"scheduled.*\d{1,2}"
        ]
    },
    
    # Closing/Wrap up (10%)
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"anything else (i can|to)",
            r"is there anything else",
            r"can i help (you )?with anything else",
            r"what else can i"
        ]
    },
    "ended_call_properly": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"(have a|enjoy your) (great|good|nice|wonderful) (day|afternoon|evening)",
            r"take care",
            r"bye",
            r"goodbye",
            r"talk to you"
        ]
    }
}


# ORIGINAL WORKING MODAL FUNCTIONS (NO CHANGES)
def transcribe_with_modal_whisperx(audio_path: str, call_id: str):
    """Transcribe audio using Modal WhisperX"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_WHISPERX_APP}/{settings.MODAL_WHISPERX_FUNCTION}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        except AttributeError:
            # Fallback for older Modal SDK versions
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
        result = f.remote(text=text, task="all")
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


# UPDATED FUNCTION - PATTERN MATCHING ADDED
def evaluate_binary_metric(metric_name: str, text: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """
    Evaluate a single metric using PATTERN MATCHING + AI models
    Returns: 1.0 if ANY method detects it, 0.0 otherwise
    """
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    config = SCORECARD_CONFIG[metric_name]
    threshold = config.get("threshold", 0.5)
    
    # 1. PATTERN MATCHING (NEW!)
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


def calculate_binary_scores(text: str, bert_output: dict, wav2vec2_output: dict) -> dict:
    """Calculate binary scores for all metrics"""
    scores = {}
    
    for metric_name in SCORECARD_CONFIG.keys():
        score = evaluate_binary_metric(metric_name, text, bert_output, wav2vec2_output)
        weight = SCORECARD_CONFIG[metric_name]["weight"]
        scores[metric_name] = {
            "detected": score == 1.0,
            "score": score,
            "weight": weight,
            "weighted_score": score * weight
        }
    
    # Calculate total
    total_score = sum(s["weighted_score"] for s in scores.values())
    
    return {
        "metrics": scores,
        "total_score": total_score,
        "max_score": 100.0,
        "percentage": total_score
    }


@app.get("/")
async def root():
    return {
        "message": "CallEval API - Full Modal Stack with Pattern Matching",
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
    
    # Validate file type
    if not file.filename.endswith(('.mp3', '.wav', '.m4a', '.ogg')):
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    # Generate unique ID
    call_id = str(uuid.uuid4())
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}_{file.filename}")
    
    # Save file
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
    
    # Start background processing
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
    
    # Parse JSON fields
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
    
    file_path = Path(call.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"attachment; filename={call.filename}"}
    )


def process_call(call_id: str, file_path: str):
    """Background task: Process call with segment-by-segment evaluation"""
    
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
        if whisperx_result["segments"]:
            last_segment = whisperx_result["segments"][-1]
            duration_seconds = int(last_segment.get("end", 0))
            minutes = duration_seconds // 60
            seconds = duration_seconds % 60
            call.duration = f"{minutes}:{seconds:02d}"
        
        print(f"✅ Transcription complete!")
        print(f"   Transcript length: {len(full_text)} characters")
        print(f"   Duration: {call.duration}")
        
        # Store speaker data
        call.speakers = json.dumps(whisperx_result.get("speaker_roles", {}))
        db.commit()
        
        # STEP 2: IDENTIFY AGENT SEGMENTS
        print(f"\n{'='*60}")
        print(f"STEP 2: IDENTIFYING AGENT SEGMENTS")
        print(f"{'='*60}")
        
        speaker_roles = whisperx_result.get("speaker_roles", {})
        agent_speaker = speaker_roles.get("agent", "SPEAKER_01")
        
        agent_segments = [
            seg for seg in whisperx_result["segments"]
            if seg.get("speaker") == agent_speaker
        ]
        
        print(f"✅ Found {len(agent_segments)} agent segments")
        
        # STEP 3: ANALYZE EACH SEGMENT WITH BERT
        print(f"\n{'='*60}")
        print(f"STEP 3: ANALYZING SEGMENTS WITH BERT")
        print(f"{'='*60}")
        
        call.status = "analyzing"
        call.analysis_status = "analyzing with BERT"
        db.commit()
        
        all_bert_predictions = {}
        
        # STEP 3: ANALYZE EACH SEGMENT WITH BERT
        for i, segment in enumerate(agent_segments):
            segment_text = segment["text"]
            bert_output = analyze_with_modal_bert(segment_text)
            
            if bert_output and bert_output.get("success"):
                predictions = bert_output.get("predictions", {})
                
                # FIX: Extract score from nested structure
                for metric, value in predictions.items():
                    # Check if value is a dict with "score" key
                    if isinstance(value, dict) and "score" in value:
                        score = value["score"]  # ← EXTRACT THE ACTUAL SCORE
                    else:
                        score = value  # Fallback for flat structure
                    
                    if metric not in all_bert_predictions:
                        all_bert_predictions[metric] = score
                    else:
                        all_bert_predictions[metric] = max(all_bert_predictions[metric], score)
        
        # Get Wav2Vec2 predictions for the full audio
        print(f"\n🎵 Calling Wav2Vec2 with full agent audio...")
        agent_text_combined = " ".join([seg["text"] for seg in agent_segments])
        wav2vec2_output = analyze_with_modal_wav2vec2(file_path, call_id, agent_text_combined)
        
        # Create combined BERT output for storage
        bert_output_combined = {
            "success": True,
            "predictions": all_bert_predictions,
            "method": "segment-by-segment evaluation"
        }
        
        print(f"\n📊 Aggregated BERT Predictions:")
        for metric, score in all_bert_predictions.items():
            status = "✓" if score >= 0.5 else "✗"
            print(f"   {status} {metric}: {score:.3f}")
        
        
        # STEP 4: BINARY SCORING (NOW WITH PATTERN MATCHING!)
        print(f"\n{'='*60}")
        print(f"STEP 4: BINARY SCORECARD EVALUATION")
        print(f"{'='*60}")
        
        binary_scores = calculate_binary_scores(
            agent_text_combined, 
            bert_output_combined, 
            wav2vec2_output
        )
        
        total_score = binary_scores["total_score"]
        
        print(f"\n📊 FINAL SCORING RESULTS:")
        print(f"   Total Score: {total_score:.1f}/100")
        print(f"   Percentage: {binary_scores['percentage']:.1f}%")
        
        print(f"\n✓ PASSED METRICS:")
        passed_count = 0
        for metric_name, metric_data in binary_scores["metrics"].items():
            if metric_data["detected"]:
                passed_count += 1
                print(f"   ✓ {metric_name}: {metric_data['weighted_score']:.1f}/{metric_data['weight']}")
        
        print(f"\n✗ FAILED METRICS:")
        failed_count = 0
        for metric_name, metric_data in binary_scores["metrics"].items():
            if not metric_data["detected"]:
                failed_count += 1
                print(f"   ✗ {metric_name}: 0/{metric_data['weight']}")
        
        print(f"\nSUMMARY: {passed_count} passed, {failed_count} failed")
        
        # STEP 5: SAVE RESULTS
        call.status = "completed"
        call.analysis_status = "completed"
        call.score = total_score
        call.bert_analysis = json.dumps(bert_output_combined)
        call.wav2vec2_analysis = json.dumps(wav2vec2_output) if wav2vec2_output else None
        call.binary_scores = json.dumps(binary_scores)
        
        db.commit()
        
        print(f"\n{'='*60}")
        print(f"✅ PROCESSING COMPLETE!")
        print(f"   Call ID: {call_id}")
        print(f"   Final Score: {total_score:.1f}/100")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f"\n❌ ERROR processing call {call_id}: {e}")
        import traceback
        traceback.print_exc()
        
        if call:
            call.status = "failed"
            call.analysis_status = f"error: {str(e)}"
            db.commit()
    
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)