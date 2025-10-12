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

# ==============================================================

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(title="CallEval API - Full Modal Stack with Phase Classification")

# Parse FRONTEND_URL to support multiple origins
allowed_origins = [
    origin.strip() 
    for origin in settings.FRONTEND_URL.split(",")
]
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Binary Scorecard Configuration - WITH PATTERN MATCHING AND PHASE INFO
SCORECARD_CONFIG = {
    # All Phases (10%)
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["all"],  # NEW: indicates which phases this applies to
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
        "phases": ["opening"],  # NEW: only evaluate in opening phase
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
        "threshold": 0.6,
        "phases": ["middle"],  # NEW: only evaluate in middle phase
        "patterns": [
            r"first.*last.*name",
            r"date.*birth",
            r"verify.*identity",
            r"confirm.*information"
        ]
    },
    "active_listening": {
        "weight": 10,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"i understand", r"i see", r"that makes sense",
            r"let me.*", r"i'll help you with"
        ]
    },
    "asks_permission_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"may i.*hold", r"can i.*hold",
            r"hold.*moment", r"brief hold"
        ]
    },
    "returns_properly_from_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["middle"],
        "patterns": [
            r"thank you for (holding|waiting)",
            r"thanks for your patience",
            r"sorry for the wait"
        ]
    },
    "recaps_time_date": {
        "weight": 15,
        "threshold": 0.6,
        "phases": ["middle"],
        "patterns": [
            r"\d{1,2}:\d{2}",
            r"(monday|tuesday|wednesday|thursday|friday|saturday|sunday)",
            r"(january|february|march|april|may|june|july|august|september|october|november|december)"
        ]
    },
    "no_fillers": {
        "weight": 10,
        "threshold": 0.5,
        "phases": ["all"],
        "patterns": []  # Special handling for filler detection
    },
    
    # Closing/Wrap Up (10%)
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["closing"],  # NEW: only evaluate in closing phase
        "patterns": [
            r"anything else", r"further assistance",
            r"help.*with.*anything", r"anything else i can"
        ]
    },
    "ended_call_properly": {
        "weight": 5,
        "threshold": 0.5,
        "phases": ["closing"],
        "patterns": [
            r"have a (great|good|nice|wonderful) day",
            r"take care", r"goodbye", r"bye"
        ]
    }
}


# ==================== PHASE CLASSIFICATION FUNCTIONS ====================

def determine_phase(segment_start: float, total_duration: float) -> str:
    """
    Determine call phase for a segment based on timing
    Same logic as inference.py
    
    Args:
        segment_start: Start time of segment in seconds
        total_duration: Total call duration in seconds
        
    Returns:
        str: 'opening', 'middle', or 'closing'
    """
    opening_threshold = min(30, total_duration * 0.15)  # First 30s or 15%
    closing_threshold = max(total_duration - 30, total_duration * 0.85)  # Last 30s or 15%
    
    if segment_start <= opening_threshold:
        return 'opening'
    elif segment_start >= closing_threshold:
        return 'closing'
    else:
        return 'middle'


def classify_segments_by_phase(segments: list, total_duration: float) -> dict:
    """
    Classify all segments into opening, middle, closing phases
    
    Args:
        segments: List of segment dicts with 'start' times
        total_duration: Total call duration
        
    Returns:
        dict: Segments grouped by phase
    """
    phases = {
        'opening': [],
        'middle': [],
        'closing': []
    }
    
    for segment in segments:
        start_time = segment.get('start', 0)
        phase = determine_phase(start_time, total_duration)
        
        # Add phase info to segment
        segment['phase'] = phase
        phases[phase].append(segment)
    
    return phases


def should_evaluate_metric_in_phase(metric_name: str, phase: str) -> bool:
    """
    Check if a metric should be evaluated in the given phase
    
    Args:
        metric_name: Name of the metric
        phase: Current phase ('opening', 'middle', 'closing')
        
    Returns:
        bool: True if metric applies to this phase
    """
    if metric_name not in SCORECARD_CONFIG:
        return False
    
    metric_phases = SCORECARD_CONFIG[metric_name].get("phases", ["all"])
    
    return "all" in metric_phases or phase in metric_phases


# ==================== MODAL FUNCTIONS ====================

def transcribe_with_modal_whisperx(file_path: str, call_id: str):
    """Transcribe audio using Modal WhisperX"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_WHISPERX_APP}/{settings.MODAL_WHISPERX_FUNCTION}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_WHISPERX_APP, settings.MODAL_WHISPERX_FUNCTION)
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        print(f"🎤 Calling Modal WhisperX...")
        
        result = f.remote(audio_url)
        return result
        
    except Exception as e:
        print(f"❌ WhisperX Modal error: {e}")
        import traceback
        traceback.print_exc()
        return None


def analyze_with_modal_bert(text: str, task: str = "all"):
    """Analyze text using Modal BERT"""
    try:
        print(f"🔍 Looking up Modal function: {settings.MODAL_BERT_APP}/{settings.MODAL_BERT_FUNCTION}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        
        print(f"📝 Calling Modal BERT...")
        
        result = f.remote(text=text, task=task)
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


# ==================== EVALUATION FUNCTIONS WITH PHASE SUPPORT ====================

def evaluate_binary_metric(metric_name: str, text: str, phase: str, bert_output: dict, wav2vec2_output: dict) -> float:
    """
    Evaluate a single metric using PATTERN MATCHING + AI models
    NOW WITH PHASE AWARENESS
    
    Returns: 1.0 if detected AND applies to current phase, 0.0 otherwise
    """
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    # NEW: Check if this metric should be evaluated in this phase
    if not should_evaluate_metric_in_phase(metric_name, phase):
        return 0.0  # Skip metrics not relevant to this phase
    
    config = SCORECARD_CONFIG[metric_name]
    threshold = config.get("threshold", 0.5)
    
    # 1. PATTERN MATCHING
    pattern_score = 0.0
    patterns = config.get("patterns", [])
    for pattern in patterns:
        try:
            if re.search(pattern, text.lower(), re.IGNORECASE):
                pattern_score = 1.0
                print(f"  ✓ {metric_name} (phase={phase}): PATTERN MATCHED")
                break
        except re.error:
            continue
    
    # 2. BERT predictions
    bert_score = 0.0
    if bert_output and bert_output.get("success"):
        predictions = bert_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            
            # Handle both dict and float predictions
            if isinstance(prediction_value, dict):
                prediction_value = prediction_value.get("score", prediction_value.get("prediction", 0.0))
            
            # Convert to float if needed
            if isinstance(prediction_value, str):
                prediction_value = 1.0 if prediction_value == "positive" else 0.0
            
            bert_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name} (phase={phase}): BERT={prediction_value:.3f} → {bert_score}")
    
    # 3. Wav2Vec2 predictions
    wav2vec2_score = 0.0
    if wav2vec2_output and wav2vec2_output.get("success"):
        predictions = wav2vec2_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            
            # Handle both dict and float predictions
            if isinstance(prediction_value, dict):
                prediction_value = prediction_value.get("score", prediction_value.get("prediction", 0.0))
            
            # Convert to float if needed
            if isinstance(prediction_value, str):
                prediction_value = 1.0 if prediction_value == "positive" else 0.0
            
            wav2vec2_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name} (phase={phase}): Wav2Vec2={prediction_value:.3f} → {wav2vec2_score}")
    
    # OR LOGIC: Return 1.0 if ANY method detects it
    final_score = max(pattern_score, bert_score, wav2vec2_score)
    return final_score


def calculate_binary_scores_by_phase(phases_data: dict, bert_outputs: dict, wav2vec2_output: dict) -> dict:
    """
    Calculate binary scores for all metrics, organized by phase
    
    Args:
        phases_data: Dict with 'opening', 'middle', 'closing' segment lists
        bert_outputs: Dict with BERT predictions per phase
        wav2vec2_output: Wav2Vec2 predictions
        
    Returns:
        dict: Scores organized by phase and overall
    """
    phase_scores = {
        'opening': {},
        'middle': {},
        'closing': {},
        'all_phases': {}
    }
    
    # Evaluate metrics for each phase
    for phase_name, segments in phases_data.items():
        if not segments:
            continue
            
        # Combine text from all segments in this phase
        phase_text = " ".join([seg.get('text', '') for seg in segments])
        
        # Get BERT output for this phase
        bert_output = bert_outputs.get(phase_name, {})
        
        # Evaluate each metric
        for metric_name in SCORECARD_CONFIG.keys():
            score = evaluate_binary_metric(
                metric_name, 
                phase_text, 
                phase_name,
                bert_output, 
                wav2vec2_output
            )
            
            weight = SCORECARD_CONFIG[metric_name]["weight"]
            phase_scores[phase_name][metric_name] = {
                "detected": score == 1.0,
                "score": score,
                "weight": weight,
                "weighted_score": score * weight
            }
    
    # Calculate totals per phase
    total_by_phase = {}
    for phase_name in ['opening', 'middle', 'closing']:
        if phase_name in phase_scores and phase_scores[phase_name]:
            total = sum(s["weighted_score"] for s in phase_scores[phase_name].values())
            max_score = sum(s["weight"] for s in phase_scores[phase_name].values())
            total_by_phase[phase_name] = {
                "total_score": total,
                "max_score": max_score,
                "percentage": (total / max_score * 100) if max_score > 0 else 0
            }
    
    # Calculate overall score
    overall_total = sum(d["total_score"] for d in total_by_phase.values())
    
    return {
        "phase_scores": phase_scores,
        "totals_by_phase": total_by_phase,
        "overall": {
            "total_score": overall_total,
            "max_score": 100.0,
            "percentage": overall_total
        }
    }


# ==================== FASTAPI ROUTES ====================

@app.get("/")
async def root():
    return {
        "message": "CallEval API - Full Modal Stack with Phase Classification",
        "status": "running",
        "models": {
            "transcription": f"{settings.MODAL_WHISPERX_APP}/{settings.MODAL_WHISPERX_FUNCTION}",
            "bert": f"{settings.MODAL_BERT_APP}/{settings.MODAL_BERT_FUNCTION}",
            "wav2vec2": f"{settings.MODAL_WAV2VEC2_APP}/{settings.MODAL_WAV2VEC2_FUNCTION}"
        },
        "features": ["phase_classification", "pattern_matching", "ai_models"]
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
    
    file_path = Path(call.file_path)
    if not file_path.exists():
        raise HTTPException(status_code=404, detail="Audio file not found")
    
    return FileResponse(
        file_path,
        media_type="audio/mpeg",
        headers={"Content-Disposition": f"attachment; filename={call.filename}"}
    )


# ==================== MAIN PROCESSING WITH PHASE CLASSIFICATION ====================

def process_call(call_id: str, file_path: str):
    """Background task: Process call with PHASE-AWARE segment evaluation"""
    
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
            total_duration = float(last_segment.get("end", 0))
            minutes = duration_seconds // 60
            seconds = duration_seconds % 60
            call.duration = f"{minutes}:{seconds:02d}"
        else:
            total_duration = 0
        
        print(f"✅ Transcription complete!")
        print(f"   Transcript length: {len(full_text)} characters")
        print(f"   Duration: {call.duration}")
        
        call.speakers = json.dumps(whisperx_result.get("speaker_roles", {}))
        db.commit()
        
        # STEP 2: IDENTIFY AGENT SEGMENTS AND CLASSIFY BY PHASE
        print(f"\n{'='*60}")
        print(f"STEP 2: IDENTIFYING AGENT SEGMENTS & CLASSIFYING PHASES")
        print(f"{'='*60}")
        
        speaker_roles = whisperx_result.get("speaker_roles", {})
        agent_speaker = speaker_roles.get("agent", "SPEAKER_01")
        
        agent_segments = [
            seg for seg in whisperx_result["segments"]
            if seg.get("speaker") == agent_speaker
        ]
        
        # NEW: Classify segments by phase
        phases_data = classify_segments_by_phase(agent_segments, total_duration)
        
        print(f"✅ Found {len(agent_segments)} agent segments")
        print(f"   Opening: {len(phases_data['opening'])} segments")
        print(f"   Middle: {len(phases_data['middle'])} segments")
        print(f"   Closing: {len(phases_data['closing'])} segments")
        
        # STEP 3: ANALYZE EACH PHASE WITH BERT
        print(f"\n{'='*60}")
        print(f"STEP 3: ANALYZING PHASES WITH BERT")
        print(f"{'='*60}")
        
        call.status = "analyzing"
        call.analysis_status = "analyzing with BERT"
        db.commit()
        
        bert_outputs = {}
        
        for phase_name, segments in phases_data.items():
            if not segments:
                continue
                
            phase_text = " ".join([seg["text"] for seg in segments])
            
            print(f"\n🔍 Analyzing {phase_name} phase ({len(segments)} segments)...")
            bert_result = analyze_with_modal_bert(phase_text)
            
            if bert_result:
                bert_outputs[phase_name] = bert_result
                print(f"   ✓ {phase_name} analysis complete")
        
        # STEP 4: OPTIONAL WAV2VEC2 ANALYSIS
        print(f"\n{'='*60}")
        print(f"STEP 4: OPTIONAL WAV2VEC2 ANALYSIS")
        print(f"{'='*60}")
        
        call.analysis_status = "analyzing with Wav2Vec2"
        db.commit()
        
        # Wav2Vec2 on full call (not phase-specific)
        wav2vec2_output = analyze_with_modal_wav2vec2(file_path, call_id, full_text)
        
        if wav2vec2_output:
            print(f"✓ Wav2Vec2 analysis complete")
        
        # STEP 5: PHASE-AWARE BINARY SCORECARD EVALUATION
        print(f"\n{'='*60}")
        print(f"STEP 5: PHASE-AWARE BINARY SCORECARD EVALUATION")
        print(f"{'='*60}")
        
        binary_scores = calculate_binary_scores_by_phase(
            phases_data,
            bert_outputs,
            wav2vec2_output
        )
        
        total_score = binary_scores["overall"]["total_score"]
        
        print(f"\n📊 FINAL SCORING RESULTS (BY PHASE):")
        print(f"="*60)
        
        for phase_name in ['opening', 'middle', 'closing']:
            if phase_name in binary_scores["totals_by_phase"]:
                phase_total = binary_scores["totals_by_phase"][phase_name]
                print(f"\n{phase_name.upper()} PHASE:")
                print(f"   Score: {phase_total['total_score']:.1f}/{phase_total['max_score']}")
                print(f"   Percentage: {phase_total['percentage']:.1f}%")
                
                # Show passed metrics for this phase
                if phase_name in binary_scores["phase_scores"]:
                    for metric, data in binary_scores["phase_scores"][phase_name].items():
                        status = "✓" if data["detected"] else "✗"
                        print(f"   {status} {metric}: {data['weighted_score']:.1f}/{data['weight']}")
        
        print(f"\n{'='*60}")
        print(f"OVERALL SCORE: {total_score:.1f}/100")
        print(f"PERCENTAGE: {binary_scores['overall']['percentage']:.1f}%")
        print(f"{'='*60}")
        
        # STEP 6: SAVE RESULTS
        call.status = "completed"
        call.analysis_status = "completed"
        call.score = total_score
        call.bert_analysis = json.dumps(bert_outputs)
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