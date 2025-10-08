from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import uuid
import modal
import replicate
import librosa
from pathlib import Path
import json

from config import settings
from database import get_db, CallEvaluation, SessionLocal

# ⭐ ADD THIS SECTION - Modal Authentication for Production
if os.getenv("MODAL_TOKEN_ID") and os.getenv("MODAL_TOKEN_SECRET"):
    # Set Modal credentials for production environment
    os.environ["MODAL_TOKEN_ID"] = os.getenv("MODAL_TOKEN_ID")
    os.environ["MODAL_TOKEN_SECRET"] = os.getenv("MODAL_TOKEN_SECRET")

# Initialize APIs
os.environ["REPLICATE_API_TOKEN"] = settings.REPLICATE_API_TOKEN
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(title="CallEval API - Modal WhisperX + Binary Scorecard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def transcribe_with_modal_whisperx(audio_path: str, call_id: str):
    """
    Transcribe audio using Modal WhisperX deployment
    
    Modal function expects a URL, so we create a public URL to the file
    """
    # Get Modal function
    f = modal.Function.lookup(
        settings.MODAL_APP_NAME,
        settings.MODAL_FUNCTION_NAME
    )
    
    # Create URL to audio file
    # In production (Render): https://calleval-backend.onrender.com/api/temp-audio/{call_id}
    # In local dev: http://localhost:8000/api/temp-audio/{call_id}
    backend_url = settings.BACKEND_URL  # Set in environment variables
    audio_url = f"{backend_url}/api/temp-audio/{call_id}"
    
    print(f"🎯 Sending audio URL to Modal: {audio_url}")
    
    # Call Modal WhisperX with URL
    result = f.remote(
        audio_url=audio_url,
        language="en",
        min_speakers=2,
        max_speakers=2
    )
    
    return result


def process_call(call_id: str, file_path: str):
    """
    BACKGROUND TASK: Process the call with Modal WhisperX + Binary Scorecard
    
    All Phases (10%): enthusiasm_markers | shows_enthusiasm | sounds_polite_courteous
    I. Opening Spiel (10%): professional_greeting (5%) + verifies_patient_online (5%)
    II. Middle/Climax (70%): patient_verification (25%) + active_listening|handled_with_care (10%) + 
                             asks_permission_hold|returns_properly_from_hold (10%) + 
                             has_fillers|no_fillers_stammers (10%) + recaps_time_date (15%)
    III. Closing/Wrap-up (10%): offers_further_assistance (5%) + ended_call_properly (5%)
    Total: 100%
    """
    
    db = SessionLocal()
    
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            print(f"Call {call_id} not found")
            return
        
        # ============================================================
        # STEP 1: TRANSCRIBE WITH MODAL WHISPERX
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 1: TRANSCRIBING WITH MODAL WHISPERX")
        print(f"{'='*60}")
        
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        # Call Modal WhisperX
        whisperx_result = transcribe_with_modal_whisperx(file_path, call_id)
        
        if not whisperx_result or "segments" not in whisperx_result:
            raise Exception("WhisperX transcription failed")
        
        # Extract full transcript
        full_text = " ".join([seg["text"] for seg in whisperx_result["segments"]])
        call.transcript = full_text
        
        # Calculate duration
        if "segments" in whisperx_result and len(whisperx_result["segments"]) > 0:
            last_segment = whisperx_result["segments"][-1]
            duration_seconds = int(last_segment.get("end", 0))
            duration_minutes = duration_seconds // 60
            duration_secs = duration_seconds % 60
            call.duration = f"{duration_minutes}:{duration_secs:02d}"
        
        # Process speaker diarization from WhisperX
        speakers_data = []
        if "segments" in whisperx_result:
            for seg in whisperx_result["segments"]:
                if "speaker" in seg:
                    speakers_data.append({
                        "speaker": seg["speaker"],
                        "text": seg["text"],
                        "start": seg["start"],
                        "end": seg["end"]
                    })
        
        call.speakers = speakers_data
        
        # Identify speaker roles
        print(f"✓ Identifying speaker roles...")
        speakers = list(set(s["speaker"] for s in speakers_data))
        agent_speaker = None
        
        if len(speakers) >= 1:
            # Check first utterances for greeting patterns
            first_utterances = speakers_data[:3]
            for utt in first_utterances:
                text_lower = utt["text"].lower()
                if any(word in text_lower for word in ["thank you for calling", "good morning", "good afternoon", "hello", "sony"]):
                    agent_speaker = utt["speaker"]
                    break
            
            # If no clear greeting, assume first speaker is agent
            if not agent_speaker and len(speakers_data) > 0:
                agent_speaker = speakers_data[0]["speaker"]
        
        # Assign roles
        speaker_roles = {}
        for speaker in speakers:
            if speaker == agent_speaker:
                speaker_roles[speaker] = "agent"
            else:
                speaker_roles[speaker] = "caller"
        
        print(f"✓ Speaker roles: {speaker_roles}")
        
        # Filter agent segments
        agent_segments = [s for s in speakers_data if speaker_roles.get(s["speaker"]) == "agent"]
        agent_text = " ".join([s["text"] for s in agent_segments])
        
        # ============================================================
        # STEP 2: ANALYZE WITH REPLICATE MODELS
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 2: ANALYZING WITH REPLICATE MODELS")
        print(f"{'='*60}")
        
        call.status = "analyzing"
        call.analysis_status = "analyzing"
        db.commit()
        
        # Prepare audio features for Wav2Vec2-BERT
        audio_array, sr = librosa.load(file_path, sr=16000)
        
        # Call Wav2Vec2-BERT model on Replicate
        print(f"✓ Running Wav2Vec2-BERT model...")
        wav2vec_output = replicate.run(
            "p0peizd0pe/wav2vec2-calleval-bert:4f9414167eff508260c6981379338743da77cbf37f4715fd1f56e73b68237399",
            input={
                "audio": open(file_path, "rb"),
                "text": agent_text
            }
        )
        
        # Call BERT model on Replicate for text-only analysis
        print(f"✓ Running BERT model...")
        bert_output = replicate.run(
            "p0peizd0pe/calleval-bert:89f41f4389e3ccc573950905bf1784905be3029014a573a880cbcd47d582cc12",
            input={
                "text": agent_text,
                "task": "all"  # Analyze all tasks
            }
        )
        
        # ============================================================
        # STEP 3: BINARY SCORING SYSTEM
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 3: BINARY SCORING")
        print(f"{'='*60}")
        
        # Initialize scores
        scores = {}
        total_score = 0.0
        
        # Define scoring structure
        scoring_structure = {
            "All Phases": {
                "weight": 10,
                "metrics": [
                    {"name": "enthusiasm_markers", "score": 5, "alternatives": ["shows_enthusiasm", "sounds_polite_courteous"]},
                ]
            },
            "Opening Spiel": {
                "weight": 10,
                "metrics": [
                    {"name": "professional_greeting", "score": 5},
                    {"name": "verifies_patient_online", "score": 5},
                ]
            },
            "Middle/Climax": {
                "weight": 70,
                "metrics": [
                    {"name": "patient_verification", "score": 25},
                    {"name": "active_listening", "score": 10, "alternatives": ["handled_with_care"]},
                    {"name": "asks_permission_hold", "score": 10, "alternatives": ["returns_properly_from_hold"]},
                    {"name": "has_fillers", "score": 10, "inverse": True},  # 0 if fillers detected, 10 if no fillers
                    {"name": "recaps_time_date", "score": 15},
                ]
            },
            "Closing/Wrap-up": {
                "weight": 10,
                "metrics": [
                    {"name": "offers_further_assistance", "score": 5},
                    {"name": "ended_call_properly", "score": 5},
                ]
            }
        }
        
        # Helper function to check if metric is detected
        def is_metric_detected(metric_name, bert_results, wav2vec_results, text):
            """
            Binary detection: Returns True if metric is detected, False otherwise
            Uses AI models + pattern matching
            """
            # Check BERT model prediction
            if bert_results and metric_name in bert_results:
                bert_score = bert_results[metric_name]
                if isinstance(bert_score, dict) and "score" in bert_score:
                    if bert_score["score"] > 0.5:  # Threshold for binary decision
                        return True
            
            # Check Wav2Vec2-BERT model prediction
            if wav2vec_results and metric_name in wav2vec_results:
                wav2vec_score = wav2vec_results[metric_name]
                if isinstance(wav2vec_score, dict) and "score" in wav2vec_score:
                    if wav2vec_score["score"] > 0.5:
                        return True
            
            # Pattern matching as fallback
            patterns = {
                "professional_greeting": ["thank you for calling", "good morning", "good afternoon", "hello"],
                "verifies_patient_online": ["are you online", "online with me", "verify"],
                "patient_verification": ["confirm", "verify", "date of birth", "birthday"],
                "active_listening": ["i understand", "i see", "okay", "i hear you"],
                "asks_permission_hold": ["may i put you on hold", "can i put you on hold", "hold please"],
                "returns_properly_from_hold": ["thank you for holding", "thanks for waiting"],
                "recaps_time_date": ["appointment", "scheduled", "time", "date"],
                "offers_further_assistance": ["anything else", "help you with", "further assistance"],
                "ended_call_properly": ["have a great day", "thank you", "goodbye", "bye"],
            }
            
            if metric_name in patterns:
                text_lower = text.lower()
                for pattern in patterns[metric_name]:
                    if pattern in text_lower:
                        return True
            
            return False
        
        # Detect fillers in segments
        filler_words = ["um", "uh", "er", "ah", "like", "you know"]
        has_fillers_detected = False
        for seg in agent_segments:
            text_lower = seg["text"].lower()
            for filler in filler_words:
                if f" {filler} " in f" {text_lower} " or text_lower.startswith(f"{filler} ") or text_lower.endswith(f" {filler}"):
                    has_fillers_detected = True
                    break
            if has_fillers_detected:
                break
        
        # Calculate scores for each phase
        for phase_name, phase_data in scoring_structure.items():
            phase_score = 0.0
            phase_details = []
            
            for metric in phase_data["metrics"]:
                metric_name = metric["name"]
                metric_score = metric["score"]
                
                # Special handling for fillers (inverse scoring)
                if metric_name == "has_fillers":
                    if has_fillers_detected:
                        achieved = 0.0  # Fillers detected = 0 points
                        detected = False
                    else:
                        achieved = metric_score  # No fillers = full points
                        detected = True
                else:
                    # Check if metric or any alternative is detected
                    detected = is_metric_detected(metric_name, bert_output, wav2vec_output, agent_text)
                    
                    # Check alternatives if available
                    if not detected and "alternatives" in metric:
                        for alt in metric["alternatives"]:
                            if is_metric_detected(alt, bert_output, wav2vec_output, agent_text):
                                detected = True
                                break
                    
                    achieved = metric_score if detected else 0.0
                
                phase_score += achieved
                phase_details.append({
                    "metric": metric_name,
                    "detected": detected,
                    "score": achieved,
                    "max_score": metric_score
                })
            
            scores[phase_name] = {
                "score": phase_score,
                "max_score": phase_data["weight"],
                "details": phase_details
            }
            total_score += phase_score
        
        # Save results
        call.score = total_score
        call.scores = scores
        call.status = "completed"
        call.analysis_status = "completed"
        
        print(f"\n{'='*60}")
        print(f"✓ Analysis completed: {total_score:.1f}/100")
        print(f"{'='*60}")
        
        db.commit()
        
    except Exception as e:
        print(f"Error processing call {call_id}: {e}")
        call.status = "failed"
        call.analysis_status = f"failed: {str(e)}"
        db.commit()
        raise
    finally:
        db.close()


@app.post("/api/upload")
async def upload_call(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    db: Session = Depends(get_db)
):
    """Upload audio file and start processing"""
    
    # Validate file type
    if not file.content_type.startswith("audio/"):
        raise HTTPException(400, "File must be an audio file")
    
    # Generate unique ID and save file
    call_id = str(uuid.uuid4())
    file_ext = Path(file.filename).suffix
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}{file_ext}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Create database record
    call = CallEvaluation(
        id=call_id,
        filename=file.filename,
        file_path=file_path,
        status="pending",
        analysis_status="pending"
    )
    db.add(call)
    db.commit()
    
    # Start background processing
    background_tasks.add_task(process_call, call_id, file_path)
    
    return {
        "call_id": call_id,
        "status": "pending",
        "message": "File uploaded successfully. Processing started."
    }


@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, db: Session = Depends(get_db)):
    """Get call evaluation results"""
    
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(404, "Call not found")
    
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "score": call.score,
        "scores": call.scores,
        "transcript": call.transcript,
        "duration": call.duration,
        "speakers": call.speakers,
        "created_at": call.created_at.isoformat()
    }


@app.get("/api/calls")
async def list_calls(db: Session = Depends(get_db)):
    """List all call evaluations"""
    
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    
    return [
        {
            "id": call.id,
            "filename": call.filename,
            "status": call.status,
            "score": call.score,
            "duration": call.duration,
            "created_at": call.created_at.isoformat()
        }
        for call in calls
    ]


@app.get("/api/audio/{call_id}")
async def get_audio(call_id: str, db: Session = Depends(get_db)):
    """Get audio file"""
    
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(404, "Call not found")
    
    if not os.path.exists(call.file_path):
        raise HTTPException(404, "Audio file not found")
    
    return FileResponse(call.file_path)


@app.get("/api/temp-audio/{call_id}")
async def get_temp_audio(call_id: str, db: Session = Depends(get_db)):
    """
    Temporary endpoint for Modal to download audio file
    This serves the file so Modal's transcribe_with_diarization can access it via URL
    """
    
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(404, "Call not found")
    
    if not os.path.exists(call.file_path):
        raise HTTPException(404, "Audio file not found")
    
    return FileResponse(call.file_path)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)