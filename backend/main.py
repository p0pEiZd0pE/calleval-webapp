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
from database import get_db, CallEvaluation, SessionLocal, Agent

from config import settings
from database import get_db, CallEvaluation, SessionLocal
from pydantic import BaseModel
from typing import Optional
from fastapi import Form


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
    expose_headers=["Content-Disposition"],
)

# Binary Scorecard Configuration
SCORECARD_CONFIG = {
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
    """Update agent statistics after call processing"""
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    if not agent:
        return
    
    # Get all completed calls for this agent
    completed_calls = db.query(CallEvaluation).filter(
        CallEvaluation.agent_id == agent_id,
        CallEvaluation.status == "completed",
        CallEvaluation.score != None
    ).all()
    
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

def process_call(call_id: str, file_path: str):
    """Background task: Process call with phase-aware evaluation"""
    
    db = SessionLocal()
    
    try:
        call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
        
        if not call:
            print(f"Call {call_id} not found")
            return
        
        # STEP 1: TRANSCRIBE
        print(f"\n{'='*60}")
        print(f"STEP 1: TRANSCRIBING WITH MODAL WHISPERX")
        print(f"{'='*60}")
        
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        whisperx_result = transcribe_with_modal_whisperx(file_path, call_id)
        
        if not whisperx_result or "segments" not in whisperx_result:
            raise Exception("WhisperX transcription failed")
        
        # Store full text transcript
        full_text = " ".join([seg["text"] for seg in whisperx_result["segments"]])
        call.transcript = full_text
        
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
        
        # Store segments in the scores field
        call.scores = json.dumps({"segments": segments_data})
        print(f"✅ Stored {len(segments_data)} segments")
        
        # Calculate duration
        if whisperx_result["segments"]:
            last_segment = whisperx_result["segments"][-1]
            duration_seconds = int(last_segment.get("end", 0))
            minutes = duration_seconds // 60
            seconds = duration_seconds % 60
            call.duration = f"{minutes}:{seconds:02d}"
        else:
            duration_seconds = 0
        
        print(f"✅ Transcription complete!")
        print(f"   Transcript length: {len(full_text)} characters")
        print(f"   Duration: {call.duration}")
        print(f"   Segments: {len(segments_data)}")
        print(f"   Speakers: {speaker_roles}")
        
        db.commit()
        
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
        
        # SAVE RESULTS
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

        if call.agent_id and call.score:
            update_agent_stats(call.agent_id, db)
        
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
    agent_id: str = Form(...),  # NEW: Agent ID required
    background_tasks: BackgroundTasks = None,
    db: Session = Depends(get_db)
):
    """Upload and process audio file with agent assignment"""
    
    if not file.filename.endswith(('.mp3', '.wav', '.m4a', '.ogg')):
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
        agent_id=agent_id,  # NEW: Store agent ID
        agent_name=agent.agentName  # NEW: Store agent name
    )
    db.add(call)
    db.commit()
    
    background_tasks.add_task(process_call, call_id, file_path)
    
    return {
        "id": call_id,
        "filename": file.filename,
        "agent_id": agent_id,
        "agent_name": agent.agentName,
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
    
    # ADD THIS CODE BLOCK:
    # Parse segments from scores field
    segments = []
    if call.scores:
        try:
            scores_data = json.loads(call.scores)
            segments = scores_data.get("segments", [])
        except:
            pass
    
    return {
        "id": call.id,
        "filename": call.filename,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "transcript": call.transcript,
        "segments": segments,  # ADD THIS LINE
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
        "agent_id": call.agent_id,
        "agent_name": call.agent_name,
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


@app.get("/api/agents")
async def get_all_agents(db: Session = Depends(get_db)):
    """Get all agents"""
    try:
        agents = db.query(Agent).all()
        return agents
    except Exception as e:
        print(f"Error fetching agents: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/agents/{agent_id}")
async def get_agent(agent_id: str, db: Session = Depends(get_db)):
    """Get a specific agent by ID"""
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    return agent


@app.post("/api/agents", response_model=AgentResponse)
async def create_agent(agent: AgentCreate, db: Session = Depends(get_db)):
    """Create a new agent"""
    try:
        # Generate unique agent ID
        agent_id = f"AGT-{datetime.now().strftime('%Y%m')}-{str(uuid.uuid4().int)[:6]}"
        
        # Create new agent
        db_agent = Agent(
            agentId=agent_id,
            agentName=agent.agentName,
            position=agent.position,
            status=agent.status,
            avgScore=agent.avgScore or 0.0,
            callsHandled=agent.callsHandled or 0
        )
        
        db.add(db_agent)
        db.commit()
        db.refresh(db_agent)
        
        return db_agent
    except Exception as e:
        db.rollback()
        print(f"Error creating agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.put("/api/agents/{agent_id}", response_model=AgentResponse)
async def update_agent(
    agent_id: str, 
    agent_update: AgentUpdate, 
    db: Session = Depends(get_db)
):
    """Update an existing agent"""
    db_agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    try:
        # Update only provided fields
        update_data = agent_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(db_agent, field, value)
        
        db_agent.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(db_agent)
        
        return db_agent
    except Exception as e:
        db.rollback()
        print(f"Error updating agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))


@app.delete("/api/agents/{agent_id}")
async def delete_agent(agent_id: str, db: Session = Depends(get_db)):
    """Delete an agent"""
    db_agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    
    if not db_agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
    try:
        db.delete(db_agent)
        db.commit()
        return {"message": "Agent deleted successfully", "agentId": agent_id}
    except Exception as e:
        db.rollback()
        print(f"Error deleting agent: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    

@app.get("/api/agents/{agent_id}/calls")
async def get_agent_calls(agent_id: str, db: Session = Depends(get_db)):
    """Get all calls for a specific agent"""
    agent = db.query(Agent).filter(Agent.agentId == agent_id).first()
    
    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")
    
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
async def get_agent_stats(db: Session = Depends(get_db)):
    """Get aggregate statistics for all agents"""
    try:
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)