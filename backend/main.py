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

# Binary Scorecard Configuration - AI-ONLY (No Pattern Matching)
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
    "asks_permission_hold": {
        "weight": 5,
        "threshold": 0.5
    },
    "returns_properly_from_hold": {
        "weight": 5,
        "threshold": 0.5
    },
    "no_fillers_stammers": {
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
        
        # Import modal here to ensure env vars are set
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
        print(f"🎵 Calling Modal Wav2Vec2-BERT...")
        
        result = f.remote(audio_url=audio_url, text=text)
        return result
        
    except Exception as e:
        print(f"❌ Wav2Vec2 Modal error: {e}")
        print(f"   App: {settings.MODAL_WAV2VEC2_APP}")
        print(f"   Function: {settings.MODAL_WAV2VEC2_FUNCTION}")
        import traceback
        traceback.print_exc()
        return None


def evaluate_binary_metric(metric_name: str, text: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """
    Evaluate a single metric using AI models only (BERT + Wav2Vec2)
    Returns: 1.0 if ANY AI model detects it, 0.0 otherwise
    
    AI-ONLY VERSION - No pattern matching
    """
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    threshold = SCORECARD_CONFIG[metric_name].get("threshold", 0.5)
    
    # Initialize scores
    bert_score = 0.0
    wav2vec2_score = 0.0
    
    # BERT predictions
    if bert_output and bert_output.get("success"):
        predictions = bert_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            bert_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name}: BERT={prediction_value:.3f} → {bert_score}")
    
    # Wav2Vec2 predictions (for audio-based metrics)
    if wav2vec2_output and wav2vec2_output.get("success"):
        predictions = wav2vec2_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            wav2vec2_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name}: Wav2Vec2={prediction_value:.3f} → {wav2vec2_score}")
    
    # Return 1.0 if EITHER model detects it (OR logic)
    final_score = max(bert_score, wav2vec2_score)
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
        "message": "CallEval API - Full Modal Stack (WhisperX + BERT + Wav2Vec2)",
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
    
    # Parse JSON fields safely
    result = {
        "id": call.id,
        "filename": call.filename,
        "file_path": call.file_path,
        "status": call.status or "pending",
        "analysis_status": call.analysis_status or "pending",
        "transcript": call.transcript,
        "duration": call.duration,
        "score": call.score,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None,
    }
    
    # Add JSON fields if they exist
    if hasattr(call, 'bert_analysis') and call.bert_analysis:
        try:
            result["bert_analysis"] = json.loads(call.bert_analysis)
        except:
            result["bert_analysis"] = None
    
    if hasattr(call, 'wav2vec2_analysis') and call.wav2vec2_analysis:
        try:
            result["wav2vec2_analysis"] = json.loads(call.wav2vec2_analysis)
        except:
            result["wav2vec2_analysis"] = None
    
    if hasattr(call, 'binary_scores') and call.binary_scores:
        try:
            result["binary_scores"] = json.loads(call.binary_scores)
        except:
            result["binary_scores"] = None
    
    if hasattr(call, 'speakers') and call.speakers:
        try:
            result["speakers"] = json.loads(call.speakers)
        except:
            result["speakers"] = None
    
    if hasattr(call, 'scores') and call.scores:
        try:
            result["scores"] = json.loads(call.scores)
        except:
            result["scores"] = None
    
    return result


@app.get("/api/calls")
async def list_calls(db: Session = Depends(get_db)):
    """List all call evaluations"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    
    # Properly serialize with safe defaults
    return [{
        "id": call.id,
        "filename": call.filename,
        "file_path": call.file_path,
        "status": call.status or "pending",
        "analysis_status": call.analysis_status or "pending",
        "transcript": call.transcript,
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
        
        
        # STEP 2: IDENTIFY AGENT AND EXTRACT AGENT SEGMENTS
        print(f"\n{'='*60}")
        print(f"STEP 2: IDENTIFYING AGENT SEGMENTS")
        print(f"{'='*60}")
        
        # Count segments per speaker
        speaker_counts = {}
        for seg in whisperx_result["segments"]:
            speaker = seg.get("speaker", "UNKNOWN")
            speaker_counts[speaker] = speaker_counts.get(speaker, 0) + 1
        
        print(f"📊 Speaker distribution: {speaker_counts}")
        
        # Identify agent (usually first speaker if they have reasonable segments)
        first_speakers = [whisperx_result["segments"][i].get("speaker") 
                         for i in range(min(3, len(whisperx_result["segments"])))]
        first_speaker = max(set(first_speakers), key=first_speakers.count) if first_speakers else None
        
        if first_speaker and speaker_counts.get(first_speaker, 0) > len(whisperx_result["segments"]) * 0.3:
            agent_speaker = first_speaker
        else:
            agent_speaker = max(speaker_counts, key=speaker_counts.get) if speaker_counts else None
        
        print(f"🎯 Identified Agent: {agent_speaker}")
        
        # Extract ONLY agent segments
        agent_segments = [
            seg for seg in whisperx_result["segments"]
            if seg.get("speaker") == agent_speaker
        ]
        
        print(f"📝 Agent segments: {len(agent_segments)}/{len(whisperx_result['segments'])}")
        
        call.status = "completed"
        call.analysis_status = "analyzing"
        db.commit()
        
        
        # STEP 3: ANALYZE WITH AI MODELS (SEGMENT BY SEGMENT)
        print(f"\n{'='*60}")
        print(f"STEP 3: ANALYZING AGENT PERFORMANCE (SEGMENT-BY-SEGMENT)")
        print(f"{'='*60}")
        
        # Initialize aggregated predictions
        all_bert_predictions = {}
        
        # Evaluate each agent segment individually
        for idx, segment in enumerate(agent_segments):
            segment_text = segment.get("text", "").strip()
            if not segment_text:
                continue
            
            print(f"\n📝 Segment {idx+1}/{len(agent_segments)}: '{segment_text[:60]}...'")
            
            # Get BERT predictions for THIS segment only
            bert_output = analyze_with_modal_bert(segment_text)
            
            if bert_output and bert_output.get("success"):
                predictions = bert_output.get("predictions", {})
                
                # Aggregate predictions (keep MAX score for each metric)
                for metric, score in predictions.items():
                    if metric not in all_bert_predictions:
                        all_bert_predictions[metric] = score
                    else:
                        all_bert_predictions[metric] = max(all_bert_predictions[metric], score)
                    
                    # Show if this segment scored high
                    if score > 0.5:
                        print(f"   ✓ {metric}: {score:.3f}")
        
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
        
        
        # STEP 4: BINARY SCORING
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
                print(f"   ✓ {metric_name}: {metric_data['weighted_score']:.1f} points")
        
        print(f"\n✗ FAILED METRICS:")
        for metric_name, metric_data in binary_scores["metrics"].items():
            if not metric_data["detected"]:
                print(f"   ✗ {metric_name}: 0 points")
        
        print(f"\n📈 Summary: {passed_count}/12 metrics passed")
        
        
        # STEP 5: SAVE TO DATABASE
        print(f"\n{'='*60}")
        print(f"STEP 5: SAVING RESULTS")
        print(f"{'='*60}")
        
        call.score = total_score
        call.bert_analysis = json.dumps(bert_output_combined) if bert_output_combined else None
        call.wav2vec2_analysis = json.dumps(wav2vec2_output) if wav2vec2_output else None
        call.binary_scores = json.dumps(binary_scores)
        call.analysis_status = "completed"
        
        # Add speaker roles to segments
        speaker_info = {
            "agent": agent_speaker,
            "caller": [s for s in speaker_counts.keys() if s != agent_speaker],
            "distribution": speaker_counts
        }
        
        segments_with_role = whisperx_result["segments"]
        for seg in segments_with_role:
            seg["role"] = "agent" if seg.get("speaker") == agent_speaker else "caller"
        
        call.speakers = json.dumps({
            "speaker_roles": speaker_info,
            "segments": segments_with_role
        }, indent=2)
        
        db.commit()
        
        print(f"✅ PROCESSING COMPLETE!")
        print(f"   - Final Score: {total_score:.1f}/100")
        print(f"   - Metrics Passed: {passed_count}/12")
        print(f"   - Agent: {agent_speaker}")
        
    except Exception as e:
        print(f"\n❌ ERROR processing call {call_id}: {e}")
        import traceback
        traceback.print_exc()
        
        call.status = "failed"
        call.analysis_status = f"error: {str(e)}"
        db.commit()
    
    finally:
        db.close()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)