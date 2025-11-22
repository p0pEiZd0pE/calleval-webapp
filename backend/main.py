from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks, APIRouter
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
from database import get_db, CallEvaluation, SessionLocal, Agent, Report, Settings, AuditLog, create_tables
from config import settings
from pydantic import BaseModel
from typing import Optional
from fastapi import Form
from profanity_filter import censor_segments, censor_transcript
from audit_logger import (
    log_call_upload, log_call_analysis_complete, log_agent_created, 
    log_agent_updated, log_agent_deleted, log_settings_updated,
    log_report_generated, log_call_deleted, log_user_login,
    log_call_cancel, log_call_retry
)
# CHANGED: Import the function instead of the module
from init_storage import initialize_persistent_storage
from auth_routes import router as auth_router
from auth import (
    get_current_user,
    get_current_active_admin,
    get_current_admin_or_manager,
    get_current_active_user,
    check_resource_access,
    filter_data_by_role
)


settings_router = APIRouter()


class AgentBase(BaseModel):
    agentName: str
    position: str
    status: str = "Active"
    avgScore: Optional[float] = 0.0
    callsHandled: Optional[int] = 0

class AgentCreate(AgentBase):
    pass

class AgentUpdate(BaseModel):
    agentName: Optional[str] = None
    position: Optional[str] = None
    status: Optional[str] = None
    avgScore: Optional[float] = None
    callsHandled: Optional[int] = None

class AgentResponse(AgentBase):
    agentId: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ReportCreate(BaseModel):
    type: str  # weekly, monthly, custom
    format: str  # csv, xlsx, pdf
    agent_id: Optional[str] = None
    agent_name: Optional[str] = None
    classification: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    total_calls: int = 0
    avg_score: Optional[float] = None


# ==================== MODAL AUTHENTICATION ====================
# MOVED TO STARTUP EVENT - No module-level execution!

# Create FastAPI app
app = FastAPI(title="CallEval API - Full Modal Stack")

app.include_router(auth_router)

# FIXED: Add startup event for all initialization tasks
@app.on_event("startup")
async def startup_event():
    """Run initialization tasks on app startup"""
    # Initialize persistent storage
    initialize_persistent_storage()
    
    # Create database tables (only runs once per startup)
    create_tables()
    
    # Configure Modal authentication (moved from module level)
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


# Configure CORS origins
allowed_origins = [origin.strip() for origin in settings.FRONTEND_URL.split(",")]
if "http://localhost:5173" not in allowed_origins:
    allowed_origins.append("http://localhost:5173")
if "http://localhost:5174" not in allowed_origins:
    allowed_origins.append("http://localhost:5174")

production_urls = [
    "https://calleval-webapp.vercel.app",
]

for url in production_urls:
    if url not in allowed_origins:
        allowed_origins.append(url)

# REMOVED: print statement that caused sync loop
# print(f"✓ CORS allowed origins: {allowed_origins}")

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

# Binary Scorecard Configuration
SCORECARD_CONFIG = {
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"happy to help", r"glad to assist", r"pleasure", r"absolutely", 
            r"of course", r"definitely", r"certainly", r"wonderful", r"great", r"perfect"
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
    "professional_greeting": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"thank you for calling.*practice",
            r"good (morning|afternoon|evening)",
            r"this is \w+"
        ]
    },
    "verifies_patient_online": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"are you (still )?there",
            r"can you hear me",
            r"hello.*are you",
            r"patient.*on.*line",
            r"how (can|may) i (help|assist)"
        ]
    },
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
    "handled_with_care": {
        "weight": 10,  # Same weight as active_listening (they share the 10%)
        "threshold": 0.5,
        "patterns": [
            r"i (understand|appreciate) (your|the) (concern|situation)",
            r"i('m| am) (so )?sorry (about|for|to hear)",
            r"let me help you with (that|this)",
            r"i('ll| will) take care of (that|this)",
            r"(completely|totally) understand"
        ]
    },
    "asks_permission_hold": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"may i (place|put) you on hold",
            r"can i (place|put) you on hold",
            r"is it (okay|ok) if i put you on hold",
            r"mind if i put you on (a )?hold",
            r"let me check"
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
        "patterns": []
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
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5,
        "patterns": [
            r"(and |is there )?anything else",
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


def determine_phase(segment, call_structure):
    """
    Determine call phase for segment - EXACT copy from inference.py
    
    Args:
        segment: dict with 'start' key
        call_structure: dict with 'total_duration', 'opening_threshold', 'closing_threshold'
    
    Returns:
        str: 'opening', 'middle', or 'closing'
    """
    start_time = segment.get('start', 0)
    total_duration = call_structure['total_duration']
    
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


def assign_speaker_roles(segments):
    """
    Assign agent/caller roles to speakers based on conversation patterns
    Similar to inference.py logic
    """
    if not segments:
        return {}
    
    # Get unique speakers
    speakers = list(set(seg.get('speaker', 'unknown') for seg in segments if 'speaker' in seg))
    
    if len(speakers) < 2:
        return {speakers[0]: "unknown"} if speakers else {}
    
    # Score speakers based on patterns
    agent_scores = {}
    
    for speaker_id in speakers:
        speaker_segments = [seg for seg in segments if seg.get('speaker') == speaker_id]
        
        if not speaker_segments:
            agent_scores[speaker_id] = 0
            continue
        
        score = 0
        
        # Agent typically speaks first (greeting)
        if segments[0].get('speaker') == speaker_id:
            score += 2
        
        # Check first few segments for agent patterns
        for seg in speaker_segments[:3]:
            text = seg.get('text', '').lower()
            
            # Agent greeting patterns
            if any(pattern in text for pattern in [
                "thank you for calling",
                "how can i help",
                "good morning",
                "good afternoon",
                "this is"
            ]):
                score += 3
                break
        
        # Check for solution-oriented language (agent)
        all_text = " ".join([seg.get('text', '').lower() for seg in speaker_segments])
        solution_keywords = ["let me check", "i can help", "our policy", "i'll assist"]
        problem_keywords = ["i have a problem", "issue with", "help me", "i need"]
        
        solution_count = sum(1 for keyword in solution_keywords if keyword in all_text)
        problem_count = sum(1 for keyword in problem_keywords if keyword in all_text)
        
        if solution_count > problem_count:
            score += 2
        elif problem_count > solution_count:
            score -= 2
        
        agent_scores[speaker_id] = score
    
    # Assign roles based on scores
    sorted_speakers = sorted(speakers, key=lambda s: agent_scores[s], reverse=True)
    
    return {
        sorted_speakers[0]: "agent",
        sorted_speakers[1]: "caller" if len(sorted_speakers) > 1 else "unknown"
    }


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



def evaluate_binary_metric(metric_name: str, text: str, bert_output: dict, 
                          wav2vec2_output: dict, phase: str = None) -> float:
    """
    Evaluate a single metric using PATTERN MATCHING + AI models
    
    CRITICAL FIX: Distinguish between "no prediction" and "detected filler"
    Only include actual predictions in MIN/MAX calculation
    """
    if metric_name not in SCORECARD_CONFIG:
        return 0.0
    
    config = SCORECARD_CONFIG[metric_name]
    threshold = config.get("threshold", 0.5)
    
    # ==================== 1. PATTERN MATCHING ====================
    pattern_score = None  # None = no prediction made
    patterns = config.get("patterns", [])
    
    if metric_name == 'no_fillers_stammers':
        # INVERSE LOGIC: Check for PRESENCE of filler patterns
        filler_patterns = [
            r'\b(um|uh|er|ah)\b',
            r'\b(uhm|umm|hmm|mhm|erm)\b',
        ]
        has_filler = False
        for filler_pattern in filler_patterns:
            if re.search(filler_pattern, text.lower(), re.IGNORECASE):
                has_filler = True
                print(f"  ✗ {metric_name}: FILLER DETECTED via pattern")
                break
        
        # Pattern made a prediction
        pattern_score = 0.0 if has_filler else 1.0
        if not has_filler:
            print(f"  ✓ {metric_name}: NO FILLERS via pattern")
    else:
        # Normal pattern matching for other metrics
        for pattern in patterns:
            try:
                if re.search(pattern, text.lower(), re.IGNORECASE):
                    pattern_score = 1.0
                    print(f"  ✓ {metric_name}: PATTERN MATCHED")
                    break
            except re.error:
                continue
    
    # ==================== 2. BERT PREDICTIONS ====================
    bert_score = None  # None = no prediction made
    if bert_output and bert_output.get("success"):
        predictions = bert_output.get("predictions", {})
        
        if metric_name == 'no_fillers_stammers':
            # SPECIAL HANDLING for no_fillers_stammers
            if 'no_fillers_stammers' in predictions:
                # Use no_fillers_stammers directly
                prediction_value = predictions['no_fillers_stammers']
                if isinstance(prediction_value, dict):
                    prediction_value = prediction_value.get('score', 0)
                
                # HIGH score = NO fillers → 1
                # LOW score = HAS fillers → 0
                bert_score = 1.0 if prediction_value >= threshold else 0.0
                print(f"  {metric_name}: BERT no_fillers={prediction_value:.6f} → {bert_score}")
                
            elif 'filler_detection' in predictions:
                # INVERT filler_detection
                prediction_value = predictions['filler_detection']
                if isinstance(prediction_value, dict):
                    prediction_value = prediction_value.get('score', 0)
                
                # HIGH filler_detection = HAS fillers → invert to 0
                # LOW filler_detection = NO fillers → invert to 1
                bert_score = 0.0 if prediction_value >= threshold else 1.0
                print(f"  {metric_name}: BERT filler_detection={prediction_value:.6f} → INVERTED to {bert_score}")
        else:
            # Normal handling for other metrics
            if metric_name in predictions:
                prediction_value = predictions[metric_name]
                if isinstance(prediction_value, dict):
                    prediction_value = prediction_value.get('score', 0)
                
                bert_score = 1.0 if prediction_value >= threshold else 0.0
                print(f"  {metric_name}: BERT={prediction_value:.3f} → {bert_score}")
    
    # ==================== 3. WAV2VEC2 PREDICTIONS ====================
    wav2vec2_score = None  # None = no prediction made
    if wav2vec2_output and wav2vec2_output.get("success"):
        predictions = wav2vec2_output.get("predictions", {})
        if metric_name in predictions:
            prediction_value = predictions[metric_name]
            wav2vec2_score = 1.0 if prediction_value >= threshold else 0.0
            print(f"  {metric_name}: Wav2Vec2={prediction_value:.3f} → {wav2vec2_score}")
    
    # ==================== 4. COLLECT VALID SCORES ====================
    # Only include scores from methods that actually made a prediction
    valid_scores = []
    if pattern_score is not None:
        valid_scores.append(pattern_score)
    if bert_score is not None:
        valid_scores.append(bert_score)
    if wav2vec2_score is not None:
        valid_scores.append(wav2vec2_score)
    
    # ==================== 5. FINAL SCORE CALCULATION ====================
    if not valid_scores:
        # No predictions made by any method
        print(f"  ⚠️ {metric_name}: NO PREDICTIONS from any method, defaulting to 0.0")
        return 0.0
    
    if metric_name == 'no_fillers_stammers':
        # INVERSE METRIC: Use MIN of valid predictions
        # If ANY method detects fillers (score=0), final should be 0
        final_score = min(valid_scores)
        print(f"  🔻 FINAL (MIN of {len(valid_scores)} predictions): {final_score}")
        print(f"     Valid scores: {valid_scores}")
    else:
        # NORMAL METRIC: Use MAX of valid predictions
        # If ANY method detects feature (score=1), final should be 1
        final_score = max(valid_scores)
        print(f"  🔺 FINAL (MAX of {len(valid_scores)} predictions): {final_score}")
    
    return final_score


def calculate_binary_scores(agent_segments, call_structure, bert_output_combined, wav2vec2_output):
    """
    Calculate binary scores with phase-aware evaluation - EXACT logic from inference.py
    """
    print(f"\n{'='*60}")
    print(f"PHASE-AWARE BINARY SCORECARD EVALUATION")
    print(f"{'='*60}")
    
    all_metrics = [
        'professional_greeting', 'verifies_patient_online',
        'patient_verification', 'active_listening', 'handled_with_care',  # ADD handled_with_care here
        'asks_permission_hold', 'returns_properly_from_hold', 'no_fillers_stammers', 
        'recaps_time_date', 'offers_further_assistance', 'ended_call_properly',
        'enthusiasm_markers', 'sounds_polite_courteous'
    ]
    
    metric_scores = {metric: 0.0 for metric in all_metrics}
    
    for i, segment in enumerate(agent_segments):
        phase = determine_phase(segment, call_structure)
        
        segment_text = segment.get('text', '')
        start_time = segment.get('start', 0)
        
        print(f"\n📍 Segment {i+1}: [{start_time:.1f}s] Phase: {phase.upper()}")
        print(f"   Text: {segment_text[:80]}...")
        
        if phase == 'opening':
            score = evaluate_binary_metric('professional_greeting', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['professional_greeting'] = max(metric_scores['professional_greeting'], score)
            
            score = evaluate_binary_metric('verifies_patient_online', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['verifies_patient_online'] = max(metric_scores['verifies_patient_online'], score)
            
        elif phase == 'middle':
            score = evaluate_binary_metric('patient_verification', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['patient_verification'] = max(metric_scores['patient_verification'], score)
            
            score = evaluate_binary_metric('active_listening', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['active_listening'] = max(metric_scores['active_listening'], score)

            score = evaluate_binary_metric('handled_with_care', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['handled_with_care'] = max(metric_scores['handled_with_care'], score)
            
            score = evaluate_binary_metric('asks_permission_hold', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['asks_permission_hold'] = max(metric_scores['asks_permission_hold'], score)
            
            score = evaluate_binary_metric('returns_properly_from_hold', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['returns_properly_from_hold'] = max(metric_scores['returns_properly_from_hold'], score)
            
            score = evaluate_binary_metric('no_fillers_stammers', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['no_fillers_stammers'] = max(metric_scores['no_fillers_stammers'], score)
            
            score = evaluate_binary_metric('recaps_time_date', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['recaps_time_date'] = max(metric_scores['recaps_time_date'], score)
            
        elif phase == 'closing':
            score = evaluate_binary_metric('offers_further_assistance', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['offers_further_assistance'] = max(metric_scores['offers_further_assistance'], score)
            
            score = evaluate_binary_metric('ended_call_properly', segment_text, bert_output_combined, wav2vec2_output, phase)
            metric_scores['ended_call_properly'] = max(metric_scores['ended_call_properly'], score)
        
        # Universal metrics
        score = evaluate_binary_metric('enthusiasm_markers', segment_text, bert_output_combined, wav2vec2_output, phase)
        metric_scores['enthusiasm_markers'] = max(metric_scores['enthusiasm_markers'], score)
        
        score = evaluate_binary_metric('sounds_polite_courteous', segment_text, bert_output_combined, wav2vec2_output, phase)
        metric_scores['sounds_polite_courteous'] = max(metric_scores['sounds_polite_courteous'], score)

    # Calculate OR condition: if EITHER is detected, give full 10 points
    active_or_handled = max(metric_scores['active_listening'], metric_scores['handled_with_care'])
    
    scores = {}
    for metric_name, best_score in metric_scores.items():
        # Special handling for active_listening/handled_with_care OR condition
        if metric_name in ['active_listening', 'handled_with_care']:
            # Both metrics share the same 10 points via OR logic
            detected = active_or_handled == 1.0
            scores[metric_name] = {
                "detected": detected,
                "score": active_or_handled,
                "weight": 10,  # They both have weight 10 but it's an OR condition
                "weighted_score": active_or_handled * 10 if metric_name == 'active_listening' else 0  # Only count once
            }
        else:
            weight = SCORECARD_CONFIG[metric_name]["weight"]
            scores[metric_name] = {
                "detected": best_score == 1.0,
                "score": best_score,
                "weight": weight,
                "weighted_score": best_score * weight
            }
    
    # Calculate total (only count active_listening's weighted_score since handled_with_care is set to 0)
    total_score = sum(s["weighted_score"] for s in scores.values())
    
    return {
        "metrics": scores,
        "total_score": total_score,
        "percentage": total_score,
        "active_listening_OR_handled_with_care": active_or_handled == 1.0  # Add this for clarity
    }

def update_agent_stats(agent_id: str, db: Session):
    """Update agent statistics after call processing or deletion"""
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    if not agent:
        return
    
    # Get all completed calls for this agent
    completed_calls = db.query(CallEvaluation).filter(
        CallEvaluation.agent_id == agent_id,
        CallEvaluation.status == "completed",
        CallEvaluation.score != None
    ).all()
    
    # FIXED: Always update stats, even if no calls remain
    if completed_calls:
        # Calculate new average score
        total_score = sum(call.score for call in completed_calls)
        agent.avgScore = round(total_score / len(completed_calls), 1)
        agent.callsHandled = len(completed_calls)
        agent.updated_at = datetime.utcnow()
        db.commit()
        
        print(f"✅ Updated agent {agent.agentName} stats:")
        print(f"   Calls Handled: {agent.callsHandled}")
        print(f"   Average Score: {agent.avgScore}")
    else:
        # No calls left - reset stats to 0
        agent.avgScore = 0.0
        agent.callsHandled = 0
        agent.updated_at = datetime.utcnow()
        db.commit()
        
        print(f"✅ Reset agent {agent.agentName} stats to 0 (no remaining calls)")

def process_call(call_id: str, file_path: str):
    """Background task: Process call with phase-aware evaluation"""
    
    db = SessionLocal()
    
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            print(f"Call {call_id} not found")
            return
        
        # ==================== ADDED: CANCELLATION CHECK 1 ====================
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled before processing started")
            return
        # =====================================================================
        
        # STEP 1: TRANSCRIBE
        print(f"\n{'='*60}")
        print(f"STEP 1: TRANSCRIBING WITH MODAL WHISPERX")
        print(f"{'='*60}")
        
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        # ==================== ADDED: CANCELLATION CHECK 2 ====================
        db.refresh(call)
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled before transcription")
            return
        # =====================================================================
        
        whisperx_result = transcribe_with_modal_whisperx(file_path, call_id)
        
        if not whisperx_result or "segments" not in whisperx_result:
            raise Exception("WhisperX transcription failed")
        
        # Store full text transcript
        full_text = " ".join([seg["text"] for seg in whisperx_result["segments"]])
        call.transcript = censor_transcript(full_text)
        
        # UPDATED: Assign speaker roles
        print("\n🎭 Assigning speaker roles (agent/caller)...")
        speaker_roles = assign_speaker_roles(whisperx_result["segments"])
        print(f"✅ Speaker roles assigned: {speaker_roles}")
        
        # Store speaker roles
        call.speakers = json.dumps(speaker_roles)
        
        # Store segments with speaker information
        segments_data = []
        for seg in whisperx_result["segments"]:
            segments_data.append({
                "speaker": seg.get("speaker", "unknown"),
                "text": seg.get("text", "").strip(),
                "start": seg.get("start", 0),
                "end": seg.get("end", 0)
            })

        # Apply profanity censoring to all segments ← NEW LINE
        segments_data = censor_segments(segments_data)
        
        # Store segments in the scores field
        call.scores = json.dumps({"segments": segments_data})
        print(f"✅ Stored {len(segments_data)} segments (profanity censored)")
        
        # Calculate duration
        if whisperx_result["segments"]:
            last_segment = whisperx_result["segments"][-1]
            duration_seconds = int(last_segment.get("end", 0))
            minutes = duration_seconds // 60
            seconds = duration_seconds % 60
            call.duration = f"{minutes}:{seconds:02d}"
        else:
            duration_seconds = 0
        
        print(f"✅ Transcription complete (with profanity censoring)!")
        print(f"   Transcript length: {len(full_text)} characters")
        print(f"   Duration: {call.duration}")
        print(f"   Segments: {len(segments_data)}")
        print(f"   Speakers: {speaker_roles}")
        
        db.commit()
        
        # ==================== ADDED: CANCELLATION CHECK 3 ====================
        db.refresh(call)
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled after transcription")
            return
        # =====================================================================
        
        # STEP 2: IDENTIFY AGENT SEGMENTS
        print(f"\n{'='*60}")
        print(f"STEP 2: IDENTIFYING AGENT SEGMENTS")
        print(f"{'='*60}")

        speaker_roles = assign_speaker_roles(whisperx_result["segments"])
        print(f"✅ Speaker roles assigned: {speaker_roles}")

        # FIX: Find which SPEAKER_ID has the role "agent"
        agent_speaker = next(
            (speaker_id for speaker_id, role in speaker_roles.items() if role == 'agent'),
            'SPEAKER_01'  # fallback to SPEAKER_01 if not found
        )

        print(f"🎯 Identified agent speaker: {agent_speaker}")
        print(f"   Role mapping: {speaker_roles}")

        agent_segments = [
            seg for seg in whisperx_result["segments"]
            if seg.get("speaker") == agent_speaker
        ]

        print(f"✅ Found {len(agent_segments)} agent segments")

        # Debug: Show caller segments count too
        caller_speaker = next(
            (speaker_id for speaker_id, role in speaker_roles.items() if role == 'caller'),
            None
        )
        if caller_speaker:
            caller_segments = [
                seg for seg in whisperx_result["segments"]
                if seg.get("speaker") == caller_speaker
            ]
            print(f"📞 Found {len(caller_segments)} caller segments (not evaluated)")
        
        # ==================== ADDED: CANCELLATION CHECK 4 ====================
        db.refresh(call)
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled before BERT analysis")
            return
        # =====================================================================
        
        # STEP 3: ANALYZE WITH BERT
        print(f"\n{'='*60}")
        print(f"STEP 3: ANALYZING SEGMENTS WITH BERT")
        print(f"{'='*60}")
        
        call.status = "analyzing"
        call.analysis_status = "analyzing with BERT"
        db.commit()
        
        all_bert_predictions = {}
        
        for i, segment in enumerate(agent_segments):
            segment_text = segment["text"]
            print(f"\n📝 Segment {i+1}/{len(agent_segments)}: '{segment_text[:50]}...'")
            
            bert_output = analyze_with_modal_bert(segment_text)
            
            if bert_output and bert_output.get("success"):
                predictions = bert_output.get("predictions", {})
                
                for metric, value in predictions.items():
                    if isinstance(value, dict) and "score" in value:
                        score = value["score"]
                        print(f"   {metric}: {score:.3f} ({value.get('prediction', 'N/A')})")
                    else:
                        score = value
                        print(f"   {metric}: {score:.3f} (flat)")
                    
                    if metric not in all_bert_predictions:
                        all_bert_predictions[metric] = score
                    else:
                        all_bert_predictions[metric] = max(all_bert_predictions[metric], score)
        
        # ==================== ADDED: CANCELLATION CHECK 5 ====================
        db.refresh(call)
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled after BERT analysis")
            return
        # =====================================================================
        
        # Wav2Vec2
        print(f"\n🎵 Calling Wav2Vec2 with full agent audio...")
        agent_text_combined = " ".join([seg["text"] for seg in agent_segments])
        wav2vec2_output = analyze_with_modal_wav2vec2(file_path, call_id, agent_text_combined)
        
        bert_output_combined = {
            "success": True,
            "predictions": all_bert_predictions,
            "method": "segment-by-segment evaluation"
        }
        
        print(f"\n📊 Aggregated BERT Predictions:")
        for metric, score in all_bert_predictions.items():
            status = "✓" if score >= 0.5 else "✗"
            print(f"   {status} {metric}: {score:.3f}")
        
        # ==================== ADDED: CANCELLATION CHECK 6 ====================
        db.refresh(call)
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled before scoring")
            return
        # =====================================================================
        
        # STEP 4: CREATE CALL STRUCTURE
        print(f"\n{'='*60}")
        print(f"STEP 4: ANALYZING CALL STRUCTURE")
        print(f"{'='*60}")
        
        call_structure = {
            'total_duration': duration_seconds,
            'opening_threshold': min(30, duration_seconds * 0.15),
            'closing_threshold': max(duration_seconds - 30, duration_seconds * 0.85)
        }
        
        print(f"✅ Call Structure:")
        print(f"   Total Duration: {duration_seconds:.1f}s ({call.duration})")
        print(f"   Opening: 0 - {call_structure['opening_threshold']:.1f}s")
        print(f"   Middle: {call_structure['opening_threshold']:.1f}s - {call_structure['closing_threshold']:.1f}s")
        print(f"   Closing: {call_structure['closing_threshold']:.1f}s - {duration_seconds:.1f}s")
        
        # STEP 5: PHASE-AWARE BINARY SCORING
        print(f"\n{'='*60}")
        print(f"STEP 5: PHASE-AWARE BINARY SCORECARD EVALUATION")
        print(f"{'='*60}")
        
        binary_scores = calculate_binary_scores(
            agent_segments,
            call_structure,
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
        
        # ==================== ADDED: CANCELLATION CHECK 7 ====================
        db.refresh(call)
        if call.status == "cancelled":
            print(f"⚠️ Call {call_id} was cancelled before marking complete")
            return
        # =====================================================================
        
        # SAVE RESULTS
        call.status = "completed"
        call.analysis_status = "completed"
        call.score = total_score
        call.bert_analysis = json.dumps(bert_output_combined)
        call.wav2vec2_analysis = json.dumps(wav2vec2_output) if wav2vec2_output else None
        call.binary_scores = json.dumps(binary_scores)
        
        db.commit()
        db.refresh(call)

        # ADD THIS AUDIT LOG AFTER SUCCESSFUL ANALYSIS
        log_call_analysis_complete(call_id, call.filename, call.score)
        
        print(f"\n{'='*60}")
        print(f"✅ PROCESSING COMPLETE!")
        print(f"   Call ID: {call_id}")
        print(f"   Final Score: {total_score:.1f}/100")
        print(f"{'='*60}\n")

        if call.agent_id and call.score:
            update_agent_stats(call.agent_id, db)
        
    except Exception as e:
        print(f"\n❌ ERROR processing call {call_id}: {e}")
        import traceback
        traceback.print_exc()
        
        if call:
            # ==================== ADDED: DON'T OVERWRITE CANCELLED STATUS ====================
            db.refresh(call)
            if call.status != "cancelled":
                call.status = "failed"
                call.analysis_status = f"error: {str(e)}"
            # =================================================================================
            db.commit()
    
    finally:
        db.close()


@app.get("/")
async def root():
    return {
        "message": "CallEval API - Full Modal Stack with Phase-Aware Evaluation",
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
    agent_id: str = Form(...),
    current_user = Depends(get_current_admin_or_manager),  # ADDED: Admin/Manager only
    background_tasks: BackgroundTasks = BackgroundTasks(),
    db: Session = Depends(get_db)
):
    """Upload audio file for evaluation - Admin/Manager only"""
    
    if not file.filename.endswith(('.mp3', '.wav', '.m4a')):
        raise HTTPException(status_code=400, detail="Invalid file type")
    
    # Verify agent exists
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    timestamp = datetime.now().strftime('%Y%m%d%H%M%S')
    call_id = f"REC-{timestamp}-{str(uuid.uuid4().int)[:4]}"
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}_{file.filename}")
    
    with open(file_path, "wb") as f:
        content = await file.read()
        f.write(content)
    
    # Create call with agent assignment
    call = CallEvaluation(
        id=call_id,
        filename=file.filename,
        file_path=file_path,
        status="processing",
        analysis_status="queued",
        agent_id=agent_id,
        agent_name=agent.agentName
    )
    db.add(call)
    db.commit()
    
    # ADD AUDIT LOG
    log_call_upload(
        call_id=call_id,
        filename=file.filename,
        agent_name=agent.agentName,
        user=current_user.full_name  # ADDED: Track who uploaded
    )
    
    background_tasks.add_task(process_call, call_id, file_path)
    
    return {
        "id": call_id,
        "filename": file.filename,
        "agent_id": agent_id,
        "agent_name": agent.agentName,
        "status": "processing"
    }


@app.get("/api/calls/{call_id}")
async def get_call(
    call_id: str,
    current_user = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Get call evaluation results with access control
    - Admin/Manager: Can view any call
    - Agent: Can only view their own calls
    """
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # ADDED: Check if user has permission to view this call
    if current_user.role == "Agent" and call.agent_id != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You don't have permission to access this call"
        )
    
    # Helper function for safe JSON parsing
    def safe_json_parse(json_str):
        if not json_str or json_str.strip() == '':
            return None
        try:
            return json.loads(json_str)
        except (json.JSONDecodeError, ValueError, TypeError):
            print(f"Warning: Failed to parse JSON: {json_str[:100]}")
            return None
    
    # Parse JSON fields safely
    bert_analysis = safe_json_parse(call.bert_analysis)
    wav2vec2_analysis = safe_json_parse(call.wav2vec2_analysis)
    binary_scores = safe_json_parse(call.binary_scores)
    scores = safe_json_parse(call.scores)
    transcript = call.transcript
    
    # ADDED: Extract segments and speakers from binary_scores
    segments = None
    speakers = None
    
    if scores and isinstance(scores, dict):
        segments = scores.get("segments")

    if call.speakers:
        speakers = safe_json_parse(call.speakers)
    
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "duration": call.duration,
        "score": call.score,
        "agent_id": call.agent_id,
        "agent_name": call.agent_name,
        "bert_analysis": bert_analysis,
        "wav2vec2_analysis": wav2vec2_analysis,
        "binary_scores": binary_scores,
        "transcript": transcript,
        "segments": segments,          # ADDED
        "speakers": speakers,          # ADDED
        "processing_time": call.processing_time,
        "error_message": call.error_message,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None,
    }


@app.post("/api/calls/{call_id}/cancel")
async def cancel_call_processing(
    call_id: str,
    current_user = Depends(get_current_admin_or_manager),  # ADD THIS LINE
    db: Session = Depends(get_db)
):
    """Cancel an ongoing call processing/analysis - Admin/Manager only"""
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        if call.status in ["completed", "failed", "cancelled"]:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel call with status: {call.status}"
            )
        
        # Update status to cancelled
        call.status = "cancelled"
        call.analysis_status = "cancelled by user"
        call.updated_at = datetime.utcnow()
        db.commit()
        
        # Add audit log
        log_call_cancel(call_id, call.filename)
        
        print(f"✓ Call {call_id} cancelled successfully")
        
        return {
            "message": "Call processing cancelled successfully",
            "id": call.id,
            "filename": call.filename,
            "status": "cancelled"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error cancelling call {call_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/api/calls/{call_id}/retry")
async def retry_call_processing(
    call_id: str, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Retry a cancelled or failed call processing"""
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        # Check if call can be retried
        if call.status not in ["cancelled", "failed"]:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot retry call with status: {call.status}"
            )
        
        # Check if audio file still exists
        file_path = call.file_path
        if not file_path or not os.path.exists(file_path):
            raise HTTPException(
                status_code=404, 
                detail="Audio file not found. Cannot retry processing."
            )
        
        # Reset call status to processing
        call.status = "processing"
        call.analysis_status = "queued"
        call.score = None
        call.transcript = None
        call.bert_analysis = None
        call.wav2vec2_analysis = None
        call.binary_scores = None
        call.updated_at = datetime.utcnow()
        db.commit()
        
        # Add audit log
        log_call_retry(call_id, call.filename)
        
        # Restart background processing
        background_tasks.add_task(process_call, call_id, file_path)
        
        print(f"✓ Call {call_id} queued for retry")
        
        return {
            "id": call.id,
            "filename": call.filename,
            "status": "processing",
            "message": "Call processing restarted successfully"
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error retrying call {call_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.delete("/api/calls/{call_id}")
async def delete_call(
    call_id: str,
    current_user = Depends(get_current_active_admin),  # ADDED: Admin only
    db: Session = Depends(get_db)
):
    """Delete call evaluation - Admin only"""
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            raise HTTPException(status_code=404, detail="Call not found")
        
        filename = call.filename
        file_path = call.file_path
        agent_name = call.agent_name
        
        # Delete audio file if it exists
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
                print(f"✓ Deleted audio file: {file_path}")
            except Exception as e:
                print(f"⚠ Failed to delete audio file: {e}")
        
        # Delete from database
        db.delete(call)
        db.commit()
        
        # ADD AUDIT LOG
        log_call_deleted(
            call_id=call_id,
            filename=filename,
            agent_name=agent_name,
            user=current_user.full_name  # ADDED: Track who deleted
        )
        
        print(f"✓ Call {call_id} deleted successfully")
        
        return {
            "message": "Call deleted successfully",
            "id": call_id,
            "filename": filename
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error deleting call {call_id}: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/calls")
async def list_calls(
    current_user = Depends(get_current_user),  # ADDED: Require authentication
    db: Session = Depends(get_db)
):
    """
    List call evaluations based on user role:
    - Admin/Manager: See all calls
    - Agent: See only their own calls
    """
    calls = db.query(CallEvaluation).order_by(CallEvaluation.created_at.desc()).all()
    
    # ADDED: Filter calls based on role
    if current_user.role == "Agent":
        # Agents only see their own calls
        calls = [call for call in calls if call.agent_id == current_user.id]
    # Admin and Manager see all calls (no filtering needed)
    
    return [{
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "duration": call.duration,
        "score": call.score,
        "agent_id": call.agent_id,
        "agent_name": call.agent_name,
        "binary_scores": call.binary_scores,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None,
    } for call in calls]


@app.get("/api/temp-audio/{call_id}")
async def get_temp_audio(call_id: str, db: Session = Depends(get_db)):
    """Serve audio file temporarily for Modal to download"""
    # NO AUTHENTICATION - Modal needs access
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


@app.get("/api/agents")
async def get_all_agents(
    current_user = Depends(get_current_admin_or_manager),  # ADDED: Require Admin or Manager
    db: Session = Depends(get_db)
):
    """Get all agents - Admin/Manager only"""
    try:
        agents = db.query(Agent).all()
        return agents
    except Exception as e:
        print(f"Error fetching agents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/{agent_id}")
async def get_agent(
    agent_id: str,
    current_user = Depends(get_current_user),  # ADDED: Require authentication
    db: Session = Depends(get_db)
):
    """Get a specific agent by ID - Authenticated users"""
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    return agent


@app.post("/api/agents")
async def create_agent(
    agent: AgentCreate,
    current_user = Depends(get_current_user),  # ✅ Allow all authenticated
    db: Session = Depends(get_db)
):
    """Create new agent - All authenticated users"""
    try:
        # ✅ AUTO-GENERATE agent ID
        timestamp = datetime.now().strftime('%Y%m')
        agent_id = f"AGT-{timestamp}-{str(uuid.uuid4().int)[:6]}"
        
        # Create new agent
        new_agent = Agent(
            agentId=agent_id,  # ✅ Use generated ID
            agentName=agent.agentName,
            position=agent.position,
            status=agent.status or "Active",
            avgScore=0.0,
            callsHandled=0
        )
        
        db.add(new_agent)
        db.commit()
        db.refresh(new_agent)
        
        # ADD AUDIT LOG
        log_agent_created(
            agent_id=new_agent.agentId,
            agent_name=new_agent.agentName,
            user=current_user.full_name  # ADDED: Track who created
        )
        
        return new_agent
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error creating agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/agents/{agent_id}")
async def update_agent(
    agent_id: str,
    agent_update: AgentUpdate,
    current_user = Depends(get_current_admin_or_manager),  # ADDED: Admin/Manager only
    db: Session = Depends(get_db)
):
    """Update agent information - Admin/Manager only"""
    try:
        agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
        
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        # Track changes for audit log
        changes = {}
        
        if agent_update.agentName is not None:
            changes['agentName'] = agent_update.agentName
            agent.agentName = agent_update.agentName

            # ADD THIS BLOCK
            db.query(CallEvaluation).filter(
                CallEvaluation.agent_id == agent_id
            ).update(
                {"agent_name": agent_update.agentName},
                synchronize_session=False
            )
            print(f"✅ Updated agent_name in all call records")

        if agent_update.position is not None:
            changes['position'] = agent_update.position
            agent.position = agent_update.position
        if agent_update.status is not None:
            changes['status'] = agent_update.status
            agent.status = agent_update.status
        
        db.commit()
        
        # ADD AUDIT LOG
        log_agent_updated(
            agent_id=agent.agentId,
            agent_name=agent.agentName,
            changes=changes,
            user=current_user.full_name  # ADDED: Track who updated
        )
        
        return agent
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        print(f"Error updating agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/agents/{agent_id}")
async def delete_agent(
    agent_id: str,
    current_user = Depends(get_current_active_admin),  # ADDED: Admin only
    db: Session = Depends(get_db)
):
    """Delete an agent - Admin only"""
    try:
        agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
        
        if not agent:
            raise HTTPException(status_code=404, detail="Agent not found")
        
        agent_name = agent.agentName
        
        # Delete related call evaluations first (or handle as needed)
        db.query(CallEvaluation).filter(CallEvaluation.agent_id == agent_id).update(
            {"agent_id": None, "agent_name": f"{agent_name} (Deleted)"}
        )
        
        # Delete the agent
        db.delete(agent)
        db.commit()
        
        # ADD AUDIT LOG
        log_agent_deleted(
            agent_id=agent_id,
            agent_name=agent_name,
            user=current_user.full_name  # ADDED: Track who deleted
        )
        
        return {"message": "Agent deleted successfully", "agentId": agent_id}
        
    except Exception as e:
        db.rollback()
        print(f"Error deleting agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/api/agents/{agent_id}/calls")
async def get_agent_calls(
    agent_id: str,
    current_user = Depends(get_current_user),  # ADDED: Require authentication
    db: Session = Depends(get_db)
):
    """
    Get all calls for a specific agent
    - Admin/Manager: Can view any agent's calls
    - Agent: Can only view their own calls
    """
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    # ADDED: Check if user has permission to view this agent's calls
    if current_user.role == "Agent" and current_user.id != agent_id:
        raise HTTPException(
            status_code=403,
            detail="You can only view your own calls"
        )
    
    calls = db.query(CallEvaluation).filter(
        CallEvaluation.agent_id == agent_id
    ).order_by(CallEvaluation.created_at.desc()).all()
    
    return {
        "agent": {
            "agentId": agent.agentId,
            "agentName": agent.agentName,
            "position": agent.position,
            "avgScore": agent.avgScore,
            "callsHandled": agent.callsHandled
        },
        "calls": [{
            "id": call.id,
            "filename": call.filename,
            "status": call.status,
            "score": call.score,
            "duration": call.duration,
            "created_at": call.created_at.isoformat() if call.created_at else None
        } for call in calls]
    }


@app.get("/api/agents/stats/summary")
async def get_agent_stats(
    current_user = Depends(get_current_user),  # ADDED: Require authentication
    db: Session = Depends(get_db)
):
    """
    Get aggregate statistics for agents
    - Admin/Manager: See all agent stats
    - Agent: See only their own stats
    """
    try:
        # ADDED: Filter agents based on role
        if current_user.role == "Agent":
            # Agent sees only their own stats
            agents = db.query(Agent).filter(Agent.agentId == current_user.id).all()
        else:
            # Admin/Manager see all agents
            agents = db.query(Agent).all()
        
        if not agents:
            return {
                "total": 0,
                "active": 0,
                "inactive": 0,
                "avgScore": 0,
                "totalCalls": 0
            }
        
        total = len(agents)
        active = len([a for a in agents if a.status == "Active"])
        avg_score = sum(a.avgScore for a in agents) / total if total > 0 else 0
        total_calls = sum(a.callsHandled for a in agents)
        
        return {
            "total": total,
            "active": active,
            "inactive": total - active,
            "avgScore": round(avg_score, 1),
            "totalCalls": total_calls
        }
    except Exception as e:
        print(f"Error fetching stats: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.post("/api/reports")
async def create_report(
    report: ReportCreate,
    current_user = Depends(get_current_admin_or_manager),  # ADDED: Admin/Manager only
    db: Session = Depends(get_db)
):
    """Create evaluation report - Admin/Manager only"""
    try:
        import uuid
        
        report_id = f"REP-{str(uuid.uuid4())[:8].upper()}"
        
        # Helper function to parse ISO datetime strings with 'Z' timezone
        def parse_datetime(date_string):
            if not date_string:
                return None
            # Replace 'Z' with '+00:00' for proper parsing
            date_string = date_string.replace('Z', '+00:00')
            return datetime.fromisoformat(date_string)
        
        db_report = Report(
            id=report_id,
            type=report.type,
            format=report.format,
            status="completed",
            agent_id=report.agent_id,
            agent_name=report.agent_name,
            classification=report.classification,
            start_date=parse_datetime(report.start_date),
            end_date=parse_datetime(report.end_date),
            total_calls=report.total_calls,
            avg_score=report.avg_score
        )
        
        db.add(db_report)
        db.commit()
        db.refresh(db_report)
        
        # ADD AUDIT LOG
        log_report_generated(report_id, report.type, user="Admin")
        
        return {
            "id": db_report.id,
            "type": db_report.type,
            "format": db_report.format,
            "status": db_report.status,
            "agent_name": db_report.agent_name or "All Agents",
            "classification": db_report.classification or "All Classifications",
            "total_calls": db_report.total_calls,
            "avg_score": db_report.avg_score,
            "created_at": db_report.created_at.isoformat() if db_report.created_at else None
        }
    except Exception as e:
        db.rollback()
        print(f"Error creating report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reports")
async def list_reports(
    current_user = Depends(get_current_admin_or_manager),  # ADDED: Admin/Manager only
    db: Session = Depends(get_db)
):
    """List all reports - Admin/Manager only"""
    try:
        from database import Report
        reports = db.query(Report).order_by(Report.created_at.desc()).all()
        
        return [{
            "id": report.id,
            "type": report.type,
            "format": report.format,
            "status": report.status,
            "agent_name": report.agent_name or "All Agents",
            "classification": report.classification or "All Classifications",
            "total_calls": report.total_calls,
            "avg_score": report.avg_score,
            "created_at": report.created_at.isoformat() if report.created_at else None
        } for report in reports]
    except Exception as e:
        print(f"Error fetching reports: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/reports/{report_id}")
async def get_report(report_id: str, db: Session = Depends(get_db)):
    """Get a specific report"""
    try:
        from database import Report
        report = db.query(Report).filter(Report.id == report_id).first()
        
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        return {
            "id": report.id,
            "type": report.type,
            "format": report.format,
            "status": report.status,
            "agent_name": report.agent_name or "All Agents",
            "classification": report.classification or "All Classifications",
            "total_calls": report.total_calls,
            "avg_score": report.avg_score,
            "created_at": report.created_at.isoformat() if report.created_at else None
        }
    except Exception as e:
        print(f"Error fetching report: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


# GET settings
@app.get("/api/settings")
async def get_settings(
    current_user = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
    ):
    try:
        settings_record = db.query(Settings).first()
        
        if not settings_record:
            # Create default settings if none exist
            settings_record = Settings(
                email_notifications=True,
                language="English",
                retention_period=12,
                theme="light"
            )
            db.add(settings_record)
            db.commit()
            db.refresh(settings_record)
        
        return {
            "emailNotifications": settings_record.email_notifications,
            "language": settings_record.language,
            "retentionPeriod": settings_record.retention_period,
            "theme": settings_record.theme
        }
    except Exception as e:
        print(f"Error fetching settings: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to fetch settings: {str(e)}")

# UPDATE settings
@app.put("/api/settings")
async def update_settings(
    settings_data: dict, 
    current_user = Depends(get_current_active_admin),
    db: Session = Depends(get_db)
    ):
    try:
        settings = db.query(Settings).first()
        
        if not settings:
            settings = Settings()
            db.add(settings)
        
        # Track changes for audit log
        changes = {}
        
        old_email = settings.email_notifications
        old_lang = settings.language
        old_retention = settings.retention_period
        old_theme = settings.theme
        
        # Update fields
        settings.email_notifications = settings_data.get("emailNotifications", True)
        settings.language = settings_data.get("language", "English")
        settings.retention_period = settings_data.get("retentionPeriod", 12)
        settings.theme = settings_data.get("theme", "light")
        
        # Track what changed
        if old_email != settings.email_notifications:
            changes["emailNotifications"] = settings.email_notifications
        if old_lang != settings.language:
            changes["language"] = settings.language
        if old_retention != settings.retention_period:
            changes["retentionPeriod"] = settings.retention_period
        if old_theme != settings.theme:
            changes["theme"] = settings.theme
        
        db.commit()
        
        # Log the changes
        if changes:
            log_settings_updated(changes, user="Admin")
        
        return {"message": "Settings updated successfully"}
        
    except Exception as e:
        print(f"Error updating settings: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

# GET users
@app.get("/api/users")
async def get_users(db: Session = Depends(get_db)):
    # Return users from database
    return [
        {
            "id": "1",
            "name": "Admin",
            "email": "admin@example.com",
            "role": "Admin",
            "status": "Active",
            "lastLogin": "2024-01-15T10:30:00"
        }
    ]

# CREATE user
@app.post("/api/users")
async def create_user(user: dict, db: Session = Depends(get_db)):
    # Create user in database
    return {"message": "User created successfully", "user": user}

# GET audit logs
@app.get("/api/audit-logs")
async def get_audit_logs(
    current_user = Depends(get_current_active_admin),
    limit: int = 100,
    resource_type: Optional[str] = None,
    action: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get audit logs with optional filtering
    
    Query params:
    - limit: Maximum number of logs to return (default: 100)
    - resource_type: Filter by resource type (call, agent, settings, etc.)
    - action: Filter by action type (create, update, delete, etc.)
    """
    try:
        query = db.query(AuditLog)
        
        # Apply filters if provided
        if resource_type:
            query = query.filter(AuditLog.resource_type == resource_type)
        if action:
            query = query.filter(AuditLog.action == action)
        
        # Order by most recent first and limit results
        logs = query.order_by(AuditLog.timestamp.desc()).limit(limit).all()
        
        return [log.to_dict() for log in logs]
        
    except Exception as e:
        print(f"Error fetching audit logs: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))