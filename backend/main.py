# =========================================
# CallEval Backend API - AI-Only Binary Scoring System
# Modal Integration + Pure AI Scorecard Evaluation
# No Pattern Matching - 100% Model-Based Predictions
# =========================================

import os
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Any

from fastapi import FastAPI, File, UploadFile, HTTPException, Depends, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import create_engine, Column, String, Text, DateTime
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session
from pydantic import BaseModel

from config import settings

# Database setup
Base = declarative_base()
engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)

class CallEvaluation(Base):
    __tablename__ = "call_evaluations"
    
    id = Column(String, primary_key=True)
    filename = Column(String)
    file_path = Column(String)
    duration = Column(String, nullable=True)
    transcript = Column(Text, nullable=True)
    speakers = Column(Text, nullable=True)
    status = Column(String, default="queued")
    analysis_status = Column(String, default="pending")
    scorecard_results = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# ==========================================
# COMPLETE BINARY SCORECARD CONFIGURATION
# AI-ONLY (No Pattern Matching)
# ==========================================

SCORECARD_CONFIG = {
    # All Phases (10%) - Universal metrics
    "enthusiasm_markers": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "all"
    },
    "sounds_polite_courteous": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "all"
    },
    
    # Opening Spiel (10%)
    "professional_greeting": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "opening"
    },
    "verifies_patient_online": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "opening"
    },
    
    # Middle/Climax (70%)
    "patient_verification": {
        "weight": 25,
        "threshold": 0.5,
        "phase": "middle"
    },
    "active_listening": {
        "weight": 10,
        "threshold": 0.5,
        "phase": "middle"
    },
    "asks_permission_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "middle"
    },
    "returns_properly_from_hold": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "middle"
    },
    "no_fillers_stammers": {
        "weight": 10,
        "threshold": 0.5,
        "phase": "middle"
    },
    "recaps_time_date": {
        "weight": 15,
        "threshold": 0.5,
        "phase": "middle"
    },
    
    # Closing/Wrap up (10%)
    "offers_further_assistance": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "closing"
    },
    "ended_call_properly": {
        "weight": 5,
        "threshold": 0.5,
        "phase": "closing"
    }
}

# ==========================================
# MODAL INTEGRATION FUNCTIONS
# ==========================================

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


def analyze_with_modal_bert(text: str, task: str = "all"):
    """Analyze text using Modal BERT"""
    try:
        print(f"🔍 Calling Modal BERT for task: {task}")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_BERT_APP, settings.MODAL_BERT_FUNCTION)
        
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
        print(f"🔍 Calling Modal Wav2Vec2-BERT")
        
        import modal
        
        try:
            f = modal.Function.lookup(settings.MODAL_WAV2VEC2_APP, settings.MODAL_WAV2VEC2_FUNCTION)
        except AttributeError:
            f = modal.Function.from_name(settings.MODAL_WAV2VEC2_APP, settings.MODAL_WAV2VEC2_FUNCTION)
        
        audio_url = f"{settings.BACKEND_URL}/api/temp-audio/{call_id}"
        
        result = f.remote(audio_url=audio_url, text=text)
        return result
        
    except Exception as e:
        print(f"❌ Wav2Vec2 Modal error: {e}")
        import traceback
        traceback.print_exc()
        return None

# ==========================================
# BINARY SCORING EVALUATION ENGINE
# ==========================================

class BinaryScoringEngine:
    """Engine for evaluating binary scorecard metrics - AI-ONLY"""
    
    def __init__(self, scorecard_config: Dict):
        self.scorecard_config = scorecard_config
    
    def evaluate_metric_with_ai(
        self, 
        metric_name: str, 
        text: str, 
        phase: str,
        bert_predictions: Optional[Dict] = None,
        wav2vec2_predictions: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Evaluate a single metric using AI-ONLY approach:
        - BERT predictions (text-based AI)
        - Wav2Vec2 predictions (audio+text AI)
        - Combined logic (MAX operation - use highest confidence)
        """
        
        if metric_name not in self.scorecard_config:
            return {"score": 0, "found": False, "details": "Metric not configured"}
        
        config = self.scorecard_config[metric_name]
        
        # Check if metric applies to this phase
        if config.get("phase") != "all" and config.get("phase") != phase:
            return {"score": 0, "found": False, "details": f"Not applicable to {phase} phase"}
        
        # Initialize AI scores
        bert_score = 0.0
        wav2vec2_score = 0.0
        
        # 1. BERT PREDICTIONS (if available)
        if bert_predictions and metric_name in bert_predictions:
            bert_score = float(bert_predictions[metric_name])
        
        # 2. WAV2VEC2 PREDICTIONS (if available)
        if wav2vec2_predictions and metric_name in wav2vec2_predictions:
            wav2vec2_score = float(wav2vec2_predictions[metric_name])
        
        # 3. COMBINED LOGIC - Use the highest confidence score
        combined_score = max(bert_score, wav2vec2_score)
        
        # 4. Apply threshold
        threshold = config.get("threshold", 0.5)
        passed = combined_score >= threshold
        
        # 5. Calculate final score
        final_score = config["weight"] if passed else 0
        
        # 6. Build details
        details = f"BERT: {bert_score:.2f}, Wav2Vec2: {wav2vec2_score:.2f} → Combined: {combined_score:.2f} → {'✓ PASS' if passed else '✗ FAIL'}"
        
        return {
            "score": final_score,
            "max_score": config["weight"],
            "found": passed,
            "details": details,
            "bert_score": bert_score,
            "wav2vec2_score": wav2vec2_score,
            "combined_score": combined_score,
            "threshold": threshold
        }
    
    def detect_phase(self, segment_index: int, total_segments: int) -> str:
        """Detect conversation phase based on segment position"""
        position = segment_index / total_segments if total_segments > 0 else 0
        
        if position < 0.15:  # First 15%
            return "opening"
        elif position > 0.85:  # Last 15%
            return "closing"
        else:
            return "middle"
    
    def evaluate_call(
        self, 
        segments: List[Dict],
        bert_predictions: Optional[Dict] = None,
        wav2vec2_predictions: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Evaluate entire call using binary scorecard - AI-ONLY
        
        Args:
            segments: List of agent segments with text
            bert_predictions: BERT model predictions {metric_name: score}
            wav2vec2_predictions: Wav2Vec2 model predictions {metric_name: score}
        
        Returns:
            Complete scorecard evaluation
        """
        
        results = {}
        total_segments = len(segments)
        
        # Combine all agent text
        all_text = " ".join([seg.get("text", "") for seg in segments])
        
        # Evaluate each metric
        for metric_name, config in self.scorecard_config.items():
            phase = config.get("phase", "all")
            
            # Get segments for this phase
            if phase == "all":
                relevant_text = all_text
            else:
                phase_segments = [
                    seg for idx, seg in enumerate(segments)
                    if self.detect_phase(idx, total_segments) == phase
                ]
                relevant_text = " ".join([seg.get("text", "") for seg in phase_segments])
            
            # Evaluate metric using AI predictions only
            result = self.evaluate_metric_with_ai(
                metric_name=metric_name,
                text=relevant_text,
                phase=phase,
                bert_predictions=bert_predictions,
                wav2vec2_predictions=wav2vec2_predictions
            )
            
            results[metric_name] = result
        
        # Calculate total score
        total_score = sum(r["score"] for r in results.values())
        max_possible = sum(config["weight"] for config in self.scorecard_config.values())
        
        # Calculate phase breakdowns
        breakdown = {
            "all_phases": {
                "score": sum(r["score"] for k, r in results.items() if self.scorecard_config[k].get("phase") == "all"),
                "max": sum(c["weight"] for k, c in self.scorecard_config.items() if c.get("phase") == "all")
            },
            "opening": {
                "score": sum(r["score"] for k, r in results.items() if self.scorecard_config[k].get("phase") == "opening"),
                "max": sum(c["weight"] for k, c in self.scorecard_config.items() if c.get("phase") == "opening")
            },
            "middle": {
                "score": sum(r["score"] for k, r in results.items() if self.scorecard_config[k].get("phase") == "middle"),
                "max": sum(c["weight"] for k, c in self.scorecard_config.items() if c.get("phase") == "middle")
            },
            "closing": {
                "score": sum(r["score"] for k, r in results.items() if self.scorecard_config[k].get("phase") == "closing"),
                "max": sum(c["weight"] for k, c in self.scorecard_config.items() if c.get("phase") == "closing")
            }
        }
        
        return {
            "metrics": results,
            "total_score": total_score,
            "max_score": max_possible,
            "percentage": (total_score / max_possible * 100) if max_possible > 0 else 0,
            "breakdown": breakdown,
            "ai_method": "BERT + Wav2Vec2-BERT (No Pattern Matching)"
        }

# ==========================================
# BACKGROUND PROCESSING
# ==========================================

def process_call(call_id: str, file_path: str):
    """Background task: Complete call processing with binary scoring"""
    
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
        
        # Store transcript
        full_text = " ".join([seg["text"] for seg in whisperx_result["segments"]])
        call.transcript = full_text
        
        # Calculate duration
        if whisperx_result["segments"]:
            last_segment = whisperx_result["segments"][-1]
            duration_seconds = int(last_segment.get("end", 0))
            minutes = duration_seconds // 60
            seconds = duration_seconds % 60
            call.duration = f"{minutes}:{seconds:02d}"
        
        # Store speakers
        call.speakers = json.dumps(whisperx_result["segments"], indent=2)
        
        call.status = "completed"
        call.analysis_status = "analyzing"
        db.commit()
        
        print(f"✅ Transcription complete!")
        
        # STEP 2: IDENTIFY AGENT SEGMENTS
        print(f"\n{'='*60}")
        print(f"STEP 2: IDENTIFYING AGENT SEGMENTS")
        print(f"{'='*60}")
        
        # Simple heuristic: speaker with more segments is likely the agent
        speakers = {}
        for seg in whisperx_result["segments"]:
            speaker = seg.get("speaker", "UNKNOWN")
            speakers[speaker] = speakers.get(speaker, 0) + 1
        
        agent_speaker = max(speakers, key=speakers.get) if speakers else None
        
        agent_segments = [
            seg for seg in whisperx_result["segments"]
            if seg.get("speaker") == agent_speaker
        ]
        
        print(f"📊 Agent: {agent_speaker} ({len(agent_segments)} segments)")
        
        # STEP 3: RUN AI MODELS (OPTIONAL - for enhanced accuracy)
        print(f"\n{'='*60}")
        print(f"STEP 3: RUNNING AI MODELS")
        print(f"{'='*60}")
        
        agent_text = " ".join([seg["text"] for seg in agent_segments])
        
        # Get BERT predictions
        bert_predictions = analyze_with_modal_bert(agent_text, task="all")
        
        # Get Wav2Vec2 predictions
        wav2vec2_predictions = analyze_with_modal_wav2vec2(file_path, call_id, agent_text)
        
        # STEP 4: BINARY SCORECARD EVALUATION
        print(f"\n{'='*60}")
        print(f"STEP 4: BINARY SCORECARD EVALUATION")
        print(f"{'='*60}")
        
        scoring_engine = BinaryScoringEngine(SCORECARD_CONFIG)
        
        scorecard_results = scoring_engine.evaluate_call(
            segments=agent_segments,
            bert_predictions=bert_predictions,
            wav2vec2_predictions=wav2vec2_predictions
        )
        
        # Store results
        call.scorecard_results = json.dumps(scorecard_results, indent=2)
        call.analysis_status = "completed"
        db.commit()
        
        print(f"\n✅ CALL EVALUATION COMPLETE!")
        print(f"📊 Total Score: {scorecard_results['total_score']:.1f}/{scorecard_results['max_score']} ({scorecard_results['percentage']:.1f}%)")
        
    except Exception as e:
        print(f"❌ Error processing call {call_id}: {e}")
        import traceback
        traceback.print_exc()
        
        call.status = "failed"
        call.analysis_status = "failed"
        db.commit()
        
    finally:
        db.close()

# ==========================================
# FASTAPI APPLICATION
# ==========================================

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app = FastAPI(title="CallEval API - AI-Only Binary Scoring")

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

@app.get("/")
async def root():
    return {
        "message": "CallEval API - AI-Only Binary Scoring System",
        "status": "running",
        "version": "2.0",
        "features": {
            "transcription": "Modal WhisperX",
            "text_analysis": "Modal BERT",
            "audio_analysis": "Modal Wav2Vec2-BERT",
            "scoring": "Pure AI Binary Scorecard (BERT + Wav2Vec2)"
        },
        "note": "No pattern matching - 100% AI-powered evaluation"
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
        "status": "processing",
        "message": "File uploaded successfully. Processing started."
    }

@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, db: Session = Depends(get_db)):
    """Get call evaluation results"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    
    if not call:
        raise HTTPException(status_code=404, detail="Call not found")
    
    # Parse JSON fields
    result = {
        "id": call.id,
        "filename": call.filename,
        "duration": call.duration,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "created_at": call.created_at.isoformat() if call.created_at else None,
        "updated_at": call.updated_at.isoformat() if call.updated_at else None
    }
    
    # Add transcript if available
    if call.transcript:
        result["transcript"] = call.transcript
    
    # Add speakers if available
    if call.speakers:
        try:
            result["speakers"] = json.loads(call.speakers)
        except:
            result["speakers"] = call.speakers
    
    # Add scorecard results if available
    if call.scorecard_results:
        try:
            result["scorecard"] = json.loads(call.scorecard_results)
        except:
            result["scorecard"] = call.scorecard_results
    
    return result

@app.get("/api/temp-audio/{call_id}")
async def get_temp_audio(call_id: str, db: Session = Depends(get_db)):
    """Serve audio file for Modal to download"""
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

@app.get("/api/scorecard-config")
async def get_scorecard_config():
    """Get current scorecard configuration"""
    return {
        "config": SCORECARD_CONFIG,
        "total_weight": sum(c["weight"] for c in SCORECARD_CONFIG.values()),
        "metrics_count": len(SCORECARD_CONFIG)
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)