from fastapi import FastAPI, UploadFile, File, Depends, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from datetime import datetime
import os
import uuid
import assemblyai as aai
import replicate
import librosa
from pathlib import Path

from config import settings
from database import get_db, CallEvaluation, SessionLocal

# Initialize APIs
os.environ["REPLICATE_API_TOKEN"] = settings.REPLICATE_API_TOKEN
aai.settings.api_key = settings.ASSEMBLYAI_API_KEY
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

# FastAPI app
app = FastAPI(title="CallEval API - Binary Scorecard")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def process_call(call_id: str, file_path: str):
    """
    BACKGROUND TASK: Process the call following CallEval Binary Scorecard
    
    This runs asynchronously after upload. Status updates:
    - pending → transcribing → analyzing → completed/failed
    
    Frontend should poll /api/calls/{call_id} to get status updates.
    
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
        # STEP 1: TRANSCRIBE WITH ASSEMBLYAI
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 1: TRANSCRIBING WITH ASSEMBLYAI")
        print(f"{'='*60}")
        
        call.status = "transcribing"
        call.analysis_status = "transcribing"
        db.commit()
        
        # AssemblyAI Configuration
        config = aai.TranscriptionConfig(
            language_code="en",  # Global English
            speaker_labels=True,  # Speaker diarization
            punctuate=True,  # Auto punctuation
            format_text=True,  # Text formatting
            content_safety=True,  # Profanity detection
            iab_categories=False,  # We don't need IAB categories
            disfluencies=True,  # Filler words (um, uh, etc.)
            redact_pii=False,  # Don't remove PII
            redact_pii_policies=None,  # Don't redact anything
            entity_detection=False  # Disabled due to SDK version compatibility
        )
        
        transcriber = aai.Transcriber()
        transcript = transcriber.transcribe(file_path, config=config)
        
        if transcript.status == aai.TranscriptStatus.error:
            raise Exception(transcript.error)
        
        # Check for profanity in agent speech
        profanity_detected = False
        agent_profanity_count = 0
        
        if hasattr(transcript, 'content_safety_labels') and transcript.content_safety_labels:
            print(f"✓ Checking for profanity...")
            # We'll check this after identifying speaker roles
            profanity_labels = transcript.content_safety_labels
        else:
            profanity_labels = None
        
        # Save transcription
        call.transcript = transcript.text
        duration_minutes = int(transcript.audio_duration // 60)
        duration_seconds = int(transcript.audio_duration % 60)
        call.duration = f"{duration_minutes}:{duration_seconds:02d}"
        
        # Save speaker diarization
        if transcript.utterances:
            speakers_data = [
                {
                    "speaker": utt.speaker,
                    "text": utt.text,
                    "start": utt.start,
                    "end": utt.end
                }
                for utt in transcript.utterances
            ]
            call.speakers = speakers_data
            
            # Identify speaker roles to determine who is the agent
            print(f"✓ Identifying speaker roles...")
            
            # Simple role identification based on first speaker and greeting patterns
            speakers = list(set(s["speaker"] for s in speakers_data))
            agent_speaker = None
            
            if len(speakers) >= 1:
                # Check first utterances for greeting patterns (agent typically speaks first)
                first_utterances = speakers_data[:3]
                for utt in first_utterances:
                    text_lower = utt["text"].lower()
                    if any(word in text_lower for word in ["thank you for calling", "good morning", "good afternoon", "hello"]):
                        agent_speaker = utt["speaker"]
                        break
                
                # If no greeting found, assume first speaker is agent
                if not agent_speaker:
                    agent_speaker = speakers_data[0]["speaker"]
            
            print(f"✓ Agent identified as: {agent_speaker}")
            
            # NOW check for profanity specifically from the agent
            if profanity_labels:
                for label in profanity_labels.results:
                    # Check if this profanity timestamp matches agent utterances
                    label_timestamp = label.timestamp.start / 1000  # Convert to seconds
                    
                    # Find which speaker was talking at this timestamp
                    for utt in speakers_data:
                        utt_start = utt["start"] / 1000 if isinstance(utt["start"], (int, float)) else utt["start"]
                        utt_end = utt["end"] / 1000 if isinstance(utt["end"], (int, float)) else utt["end"]
                        
                        if utt_start <= label_timestamp <= utt_end:
                            if utt["speaker"] == agent_speaker:
                                # Agent used profanity!
                                for result in label.results:
                                    if result.text and result.confidence > 0.5:
                                        profanity_detected = True
                                        agent_profanity_count += 1
                                        print(f"⚠ AGENT PROFANITY DETECTED: '{result.text}' at {label_timestamp:.2f}s")
                            break
        
        call.status = "completed"
        call.analysis_status = "processing"
        db.commit()
        
        print(f"✓ Transcription completed")
        print(f"✓ Duration: {call.duration}")
        print(f"✓ Transcript preview: {transcript.text[:150]}...")
        
        # Auto-fail if AGENT used profanity
        if profanity_detected:
            print(f"\n{'='*60}")
            print(f"⚠ AGENT PROFANITY DETECTED: {agent_profanity_count} instances")
            print(f"⚠ Automatically setting status to FAILED")
            print(f"{'='*60}\n")
            
            call.status = "failed"
            call.analysis_status = "failed"
            call.classification = "Failed - Profanity Detected"
            call.script_score = 0.0
            call.tone_score = 0.0
            call.resolution_score = 0.0
            call.quality_score = 0.0
            call.enthusiasm_score = 0.0
            call.politeness_score = 0.0
            call.has_fillers = "N/A"
            call.phase = "N/A"
            db.commit()
            
            return  # Exit early, don't continue processing
        
        # ============================================================
        # STEP 2: ANALYZE WITH WAV2VEC2-BERT (Audio + Text)
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 2: ANALYZING WITH WAV2VEC2-BERT")
        print(f"{'='*60}")
        
        wav2vec_scores = {
            "enthusiasm": 0.0,
            "politeness": 0.0,
            "has_fillers": False
        }
        
        try:
            wav2vec_output = replicate.run(
                "p0peizd0pe/calleval-wav2vec2:4f9414167eff508260c6981379338743da77cbf37f4715fd1f56e73b68237399",
                input={
                    "audio": open(file_path, "rb"),
                    "text": transcript.text
                }
            )
            
            print(f"✓ Wav2Vec2-BERT output received")
            
            # Parse results
            if isinstance(wav2vec_output, dict):
                call.phase = wav2vec_output.get("predicted_phase", "middle")
                
                # Enthusiasm score
                enthusiasm_data = wav2vec_output.get("enthusiasm", {})
                if isinstance(enthusiasm_data, dict):
                    wav2vec_scores["enthusiasm"] = enthusiasm_data.get("score", 0.0)
                    call.enthusiasm_score = wav2vec_scores["enthusiasm"] * 100
                
                # Politeness score
                politeness_data = wav2vec_output.get("politeness", {})
                if isinstance(politeness_data, dict):
                    wav2vec_scores["politeness"] = politeness_data.get("score", 0.0)
                    call.politeness_score = wav2vec_scores["politeness"] * 100
                
                # Filler detection
                has_fillers_data = wav2vec_output.get("has_fillers", {})
                if isinstance(has_fillers_data, dict):
                    has_fillers_score = has_fillers_data.get("score", 0.0)
                    wav2vec_scores["has_fillers"] = has_fillers_score > 0.5
                    call.has_fillers = "Yes" if wav2vec_scores["has_fillers"] else "No"
                
                # Quality score (average of enthusiasm and politeness)
                call.quality_score = (call.enthusiasm_score + call.politeness_score) / 2
                
                print(f"✓ Phase: {call.phase}")
                print(f"✓ Enthusiasm: {call.enthusiasm_score:.1f}%")
                print(f"✓ Politeness: {call.politeness_score:.1f}%")
                print(f"✓ Has Fillers: {call.has_fillers}")
        
        except Exception as e:
            print(f"⚠ Wav2Vec2-BERT analysis failed: {e}")
            call.phase = "unknown"
            call.has_fillers = "unknown"
            call.quality_score = 0.0
            call.enthusiasm_score = 0.0
            call.politeness_score = 0.0
        
        db.commit()
        
        # ============================================================
        # STEP 3: ANALYZE WITH BERT (Text Classification)
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 3: ANALYZING WITH BERT TEXT CLASSIFIER")
        print(f"{'='*60}")
        
        bert_scores = {}
        
        try:
            bert_output = replicate.run(
                "p0peizd0pe/calleval-bert:89f41f4389e3ccc573950905bf1784905be3029014a573a880cbcd47d582cc12",
                input={"text": transcript.text}
            )
            
            print(f"✓ BERT output received")
            
            # Helper function to get binary score (0 or 1)
            def get_binary_score(task_name):
                task_data = bert_output.get(task_name, {})
                if isinstance(task_data, dict):
                    score = float(task_data.get("score", 0.0))
                    # Binary: score > 0.5 = 1 (detected), else 0 (not detected)
                    return 1.0 if score > 0.5 else 0.0
                return 0.0
            
            # Extract all BERT scores
            bert_scores = {
                "professional_greeting": get_binary_score("professional_greeting"),
                "verifies_patient_online": get_binary_score("verifies_patient_online"),
                "patient_verification": get_binary_score("patient_verification"),
                "active_listening": get_binary_score("active_listening"),
                "handled_with_care": get_binary_score("handled_with_care"),
                "asks_permission_hold": get_binary_score("asks_permission_hold"),
                "returns_properly_from_hold": get_binary_score("returns_properly_from_hold"),
                "shows_enthusiasm": get_binary_score("shows_enthusiasm"),
                "sounds_polite_courteous": get_binary_score("sounds_polite_courteous"),
                "recaps_time_date": get_binary_score("recaps_time_date"),
                "offers_further_assistance": get_binary_score("offers_further_assistance"),
                "ended_call_properly": get_binary_score("ended_call_properly")
            }
            
            print(f"✓ BERT scores extracted")
            
        except Exception as e:
            print(f"⚠ BERT analysis failed: {e}")
            # Set all scores to 0
            bert_scores = {key: 0.0 for key in [
                "professional_greeting", "verifies_patient_online", "patient_verification",
                "active_listening", "handled_with_care", "asks_permission_hold",
                "returns_properly_from_hold", "shows_enthusiasm", "sounds_polite_courteous",
                "recaps_time_date", "offers_further_assistance", "ended_call_properly"
            ]}
        
        # ============================================================
        # STEP 4: CALCULATE BINARY SCORECARD (Following CallEval Metrics)
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 4: CALCULATING BINARY SCORECARD")
        print(f"{'='*60}")
        
        total_score = 0.0
        detailed_scores_dict = {}
        
        # ALL PHASES (10%)
        # enthusiasm_markers | shows_enthusiasm | sounds_polite_courteous
        enthusiasm_markers = max(bert_scores.get("shows_enthusiasm", 0), wav2vec_scores["enthusiasm"])
        sounds_polite = max(bert_scores.get("sounds_polite_courteous", 0), wav2vec_scores["politeness"])
        
        all_phases_found = (enthusiasm_markers > 0.5 or sounds_polite > 0.5)
        all_phases_score = 10.0 if all_phases_found else 0.0
        
        detailed_scores_dict["enthusiasm_markers"] = {
            "score": 5.0 if enthusiasm_markers > 0.5 else 0.0,
            "max_score": 5.0,
            "found": enthusiasm_markers > 0.5,
            "confidence": float(enthusiasm_markers),
            "category": "All Phases"
        }
        
        detailed_scores_dict["sounds_polite_courteous"] = {
            "score": 5.0 if sounds_polite > 0.5 else 0.0,
            "max_score": 5.0,
            "found": sounds_polite > 0.5,
            "confidence": float(sounds_polite),
            "category": "All Phases"
        }
        
        total_score += all_phases_score
        
        print(f"All Phases: {all_phases_score:.1f}/10")
        print(f"  - Enthusiasm: {detailed_scores_dict['enthusiasm_markers']['score']:.1f}/5 (confidence: {enthusiasm_markers:.2%})")
        print(f"  - Politeness: {detailed_scores_dict['sounds_polite_courteous']['score']:.1f}/5 (confidence: {sounds_polite:.2%})")
        
        # I. OPENING SPIEL (10%)
        # professional_greeting (5%) + verifies_patient_online (5%)
        greeting_found = bert_scores.get("professional_greeting", 0) > 0.5
        verify_found = bert_scores.get("verifies_patient_online", 0) > 0.5
        
        opening_greeting = 5.0 if greeting_found else 0.0
        opening_verify = 5.0 if verify_found else 0.0
        opening_total = opening_greeting + opening_verify
        
        detailed_scores_dict["professional_greeting"] = {
            "score": opening_greeting,
            "max_score": 5.0,
            "found": greeting_found,
            "confidence": float(bert_scores.get("professional_greeting", 0)),
            "category": "Opening Spiel"
        }
        
        detailed_scores_dict["verifies_patient_online"] = {
            "score": opening_verify,
            "max_score": 5.0,
            "found": verify_found,
            "confidence": float(bert_scores.get("verifies_patient_online", 0)),
            "category": "Opening Spiel"
        }
        
        total_score += opening_total
        
        print(f"\nI. Opening Spiel:")
        print(f"  - Professional Greeting: {opening_greeting:.1f}/5 {'✓ PASS' if greeting_found else '✗ FAIL'}")
        print(f"  - Verifies Patient Online: {opening_verify:.1f}/5 {'✓ PASS' if verify_found else '✗ FAIL'}")
        print(f"  - Subtotal: {opening_total:.1f}/10")
        
        # II. MIDDLE/CLIMAX (70%)
        # patient_verification (25%)
        verification_found = bert_scores.get("patient_verification", 0) > 0.5
        middle_verification = 25.0 if verification_found else 0.0
        
        detailed_scores_dict["patient_verification"] = {
            "score": middle_verification,
            "max_score": 25.0,
            "found": verification_found,
            "confidence": float(bert_scores.get("patient_verification", 0)),
            "category": "Middle/Climax"
        }
        
        # active_listening | handled_with_care (10%)
        active_listening_found = bert_scores.get("active_listening", 0) > 0.5
        handled_with_care_found = bert_scores.get("handled_with_care", 0) > 0.5
        listening_care_found = active_listening_found or handled_with_care_found
        middle_listening = 10.0 if listening_care_found else 0.0
        
        detailed_scores_dict["active_listening_or_handled_with_care"] = {
            "score": middle_listening,
            "max_score": 10.0,
            "found": listening_care_found,
            "active_listening": {"found": active_listening_found, "confidence": float(bert_scores.get("active_listening", 0))},
            "handled_with_care": {"found": handled_with_care_found, "confidence": float(bert_scores.get("handled_with_care", 0))},
            "category": "Middle/Climax"
        }
        
        # asks_permission_hold | returns_properly_from_hold (10%)
        asks_hold_found = bert_scores.get("asks_permission_hold", 0) > 0.5
        returns_hold_found = bert_scores.get("returns_properly_from_hold", 0) > 0.5
        hold_found = asks_hold_found or returns_hold_found
        middle_hold = 10.0 if hold_found else 0.0
        
        detailed_scores_dict["hold_etiquette"] = {
            "score": middle_hold,
            "max_score": 10.0,
            "found": hold_found,
            "asks_permission_hold": {"found": asks_hold_found, "confidence": float(bert_scores.get("asks_permission_hold", 0))},
            "returns_properly_from_hold": {"found": returns_hold_found, "confidence": float(bert_scores.get("returns_properly_from_hold", 0))},
            "category": "Middle/Climax"
        }
        
        # has_fillers, filler_count | no_fillers_stammers (10%)
        # Binary inverse: if has_fillers = True, score = 0; if False, score = 10
        middle_fillers = 0.0 if wav2vec_scores["has_fillers"] else 10.0
        
        detailed_scores_dict["no_fillers_stammers"] = {
            "score": middle_fillers,
            "max_score": 10.0,
            "found": not wav2vec_scores["has_fillers"],
            "has_fillers": wav2vec_scores["has_fillers"],
            "category": "Middle/Climax"
        }
        
        # recaps_time_date (15%)
        recap_found = bert_scores.get("recaps_time_date", 0) > 0.5
        middle_recap = 15.0 if recap_found else 0.0
        
        detailed_scores_dict["recaps_time_date"] = {
            "score": middle_recap,
            "max_score": 15.0,
            "found": recap_found,
            "confidence": float(bert_scores.get("recaps_time_date", 0)),
            "category": "Middle/Climax"
        }
        
        middle_total = middle_verification + middle_listening + middle_hold + middle_fillers + middle_recap
        
        total_score += middle_total
        
        print(f"\nII. Middle/Climax:")
        print(f"  - Patient Verification: {middle_verification:.1f}/25 {'✓ PASS' if verification_found else '✗ FAIL'}")
        print(f"  - Active Listening | Handled with Care: {middle_listening:.1f}/10 {'✓ PASS' if listening_care_found else '✗ FAIL'}")
        print(f"  - Hold Permission | Returns from Hold: {middle_hold:.1f}/10 {'✓ PASS' if hold_found else '✗ FAIL'}")
        print(f"  - No Fillers/Stammers: {middle_fillers:.1f}/10 {'✓ PASS' if not wav2vec_scores['has_fillers'] else '✗ FAIL'}")
        print(f"  - Recaps Time/Date: {middle_recap:.1f}/15 {'✓ PASS' if recap_found else '✗ FAIL'}")
        print(f"  - Subtotal: {middle_total:.1f}/70")
        
        # III. CLOSING/WRAP-UP (10%)
        # offers_further_assistance (5%) + ended_call_properly (5%)
        assistance_found = bert_scores.get("offers_further_assistance", 0) > 0.5
        ending_found = bert_scores.get("ended_call_properly", 0) > 0.5
        
        closing_assistance = 5.0 if assistance_found else 0.0
        closing_ending = 5.0 if ending_found else 0.0
        closing_total = closing_assistance + closing_ending
        
        detailed_scores_dict["offers_further_assistance"] = {
            "score": closing_assistance,
            "max_score": 5.0,
            "found": assistance_found,
            "confidence": float(bert_scores.get("offers_further_assistance", 0)),
            "category": "Closing/Wrap-up"
        }
        
        detailed_scores_dict["ended_call_properly"] = {
            "score": closing_ending,
            "max_score": 5.0,
            "found": ending_found,
            "confidence": float(bert_scores.get("ended_call_properly", 0)),
            "category": "Closing/Wrap-up"
        }
        
        total_score += closing_total
        
        print(f"\nIII. Closing/Wrap-up:")
        print(f"  - Offers Further Assistance: {closing_assistance:.1f}/5 {'✓ PASS' if assistance_found else '✗ FAIL'}")
        print(f"  - Ended Call Properly: {closing_ending:.1f}/5 {'✓ PASS' if ending_found else '✗ FAIL'}")
        print(f"  - Subtotal: {closing_total:.1f}/10")
        
        # ============================================================
        # STEP 5: UPDATE DATABASE WITH COMPREHENSIVE SCORES
        # ============================================================
        print(f"\n{'='*60}")
        print(f"STEP 5: SAVING COMPREHENSIVE RESULTS")
        print(f"{'='*60}")
        
        # Calculate percentage
        percentage = total_score  # Already out of 100
        
        # Map to database summary fields (for dashboard/quick view)
        call.script_score = opening_total  # Opening Spiel
        call.tone_score = all_phases_score  # All Phases (politeness/enthusiasm)
        call.resolution_score = middle_total  # Middle/Climax
        
        # Save detailed scorecard breakdown (NEW - complete JSON structure)
        call.detailed_scores = detailed_scores_dict
        
        # Save scorecard summary (NEW - for comprehensive reporting)
        call.scorecard_summary = {
            "total_score": total_score,
            "percentage": percentage,
            "categories": {
                "all_phases": {
                    "score": all_phases_score,
                    "max_score": 10.0,
                    "percentage": (all_phases_score / 10.0) * 100
                },
                "opening_spiel": {
                    "score": opening_total,
                    "max_score": 10.0,
                    "percentage": (opening_total / 10.0) * 100
                },
                "middle_climax": {
                    "score": middle_total,
                    "max_score": 70.0,
                    "percentage": (middle_total / 70.0) * 100
                },
                "closing_wrap_up": {
                    "score": closing_total,
                    "max_score": 10.0,
                    "percentage": (closing_total / 10.0) * 100
                }
            },
            "model_scores": {
                "bert": {k: float(v) for k, v in bert_scores.items()},
                "wav2vec2": {
                    "enthusiasm": float(wav2vec_scores["enthusiasm"]),
                    "politeness": float(wav2vec_scores["politeness"]),
                    "has_fillers": wav2vec_scores["has_fillers"]
                }
            }
        }
        
        # Overall classification
        if percentage >= 70:
            call.classification = "Satisfactory"
        elif percentage >= 50:
            call.classification = "Needs Improvement"
        else:
            call.classification = "Unsatisfactory"
        
        call.status = "completed"
        call.analysis_status = "completed"
        db.commit()
        
        # Print final summary
        print(f"\n{'='*60}")
        print(f"EVALUATION COMPLETE")
        print(f"{'='*60}")
        print(f"Total Score: {total_score:.1f}/100")
        print(f"Percentage: {percentage:.1f}%")
        print(f"Classification: {call.classification}")
        print(f"")
        print(f"Category Breakdown:")
        print(f"  - All Phases: {all_phases_score:.1f}/10 ({(all_phases_score/10)*100:.0f}%)")
        print(f"  - Opening Spiel: {opening_total:.1f}/10 ({(opening_total/10)*100:.0f}%)")
        print(f"  - Middle/Climax: {middle_total:.1f}/70 ({(middle_total/70)*100:.0f}%)")
        print(f"  - Closing/Wrap-up: {closing_total:.1f}/10 ({(closing_total/10)*100:.0f}%)")
        print(f"{'='*60}\n")
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}\n")
        if call:
            call.status = "failed"
            call.analysis_status = "failed"
            db.commit()
        raise
    
    finally:
        db.close()


@app.post("/api/upload")
async def upload_audio(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    agent_name: str = None,
    db: Session = Depends(get_db)
):
    """Upload and process audio file - returns immediately, processing happens in background"""
    
    # Validate file type
    if not file.filename.endswith(('.wav', '.mp3', '.m4a')):
        raise HTTPException(400, "Only WAV, MP3, M4A files are supported")
    
    # Generate unique ID and file path (matching GitHub convention)
    call_id = f"CE-{datetime.now().strftime('%Y')}-{str(uuid.uuid4())[:4]}"
    file_ext = Path(file.filename).suffix
    file_path = os.path.join(settings.UPLOAD_DIR, f"{call_id}{file_ext}")
    
    # Save file
    with open(file_path, "wb") as f:
        content = await file.read()
        if len(content) > settings.MAX_FILE_SIZE:
            raise HTTPException(400, "File too large (max 100MB)")
        f.write(content)
    
    # Create database entry with "pending" status
    call = CallEvaluation(
        id=call_id,
        file_name=file.filename,
        agent_name=agent_name,
        audio_path=file_path,
        status="pending",
        analysis_status="pending"
    )
    
    db.add(call)
    db.commit()
    
    # Start background processing - DOES NOT WAIT
    background_tasks.add_task(process_call, call_id, file_path)
    
    # Return immediately so frontend can show it in Recently Uploaded Calls
    return {
        "id": call_id,
        "filename": file.filename,
        "status": "pending",
        "analysis_status": "pending",
        "message": "File uploaded successfully. Processing started."
    }


@app.get("/api/calls")
async def get_calls(db: Session = Depends(get_db)):
    """Get all call evaluations"""
    calls = db.query(CallEvaluation).order_by(CallEvaluation.date_time.desc()).all()
    return calls


@app.get("/api/calls/{call_id}")
async def get_call(call_id: str, db: Session = Depends(get_db)):
    """Get specific call evaluation with full details"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    if not call:
        raise HTTPException(404, "Call not found")
    
    # Convert to dict and include all fields
    call_dict = {
        "id": call.id,
        "file_name": call.file_name,
        "agent_name": call.agent_name,
        "date_time": call.date_time.isoformat() if call.date_time else None,
        "duration": call.duration,
        "transcript": call.transcript,
        "speakers": call.speakers,
        "tone_score": call.tone_score,
        "script_score": call.script_score,
        "resolution_score": call.resolution_score,
        "phase": call.phase,
        "has_fillers": call.has_fillers,
        "quality_score": call.quality_score,
        "enthusiasm_score": call.enthusiasm_score,
        "politeness_score": call.politeness_score,
        "classification": call.classification,
        "status": call.status,
        "analysis_status": call.analysis_status,
        "audio_path": call.audio_path,
        # NEW: Include detailed scorecard
        "detailed_scores": call.detailed_scores,
        "scorecard_summary": call.scorecard_summary
    }
    
    return call_dict


@app.get("/api/calls/{call_id}/scorecard")
async def get_call_scorecard(call_id: str, db: Session = Depends(get_db)):
    """Get detailed binary scorecard for a specific call"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    if not call:
        raise HTTPException(404, "Call not found")
    
    if not call.detailed_scores or not call.scorecard_summary:
        raise HTTPException(404, "Detailed scorecard not available for this call")
    
    # Return inference.py-style comprehensive scorecard
    return {
        "call_id": call.id,
        "file_name": call.file_name,
        "audio_file": call.audio_path,
        "classification": call.classification,
        "scorecard_results": {
            "total_score": call.scorecard_summary.get("total_score", 0),
            "percentage": call.scorecard_summary.get("percentage", 0),
            "detailed_scores": call.detailed_scores,
            "categories": call.scorecard_summary.get("categories", {})
        },
        "model_scores": call.scorecard_summary.get("model_scores", {}),
        "filler_analysis": {
            "has_fillers": call.has_fillers == "Yes",
            "detected_by": "Wav2Vec2-BERT"
        },
        "speaker_info": {
            "phase": call.phase,
            "speakers": call.speakers
        }
    }


@app.get("/api/calls/{call_id}/report")
async def get_call_report(call_id: str, db: Session = Depends(get_db)):
    """Generate comprehensive text report for a call (like inference.py)"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    if not call:
        raise HTTPException(404, "Call not found")
    
    if not call.detailed_scores or not call.scorecard_summary:
        raise HTTPException(404, "Detailed scorecard not available for this call")
    
    # Generate report similar to inference.py
    report_lines = []
    report_lines.append("=" * 100)
    report_lines.append("CALLEVAL AI BINARY SCORING EVALUATION REPORT")
    report_lines.append("=" * 100)
    report_lines.append(f"Call ID: {call.id}")
    report_lines.append(f"File Name: {call.file_name}")
    report_lines.append(f"Duration: {call.duration}")
    report_lines.append(f"Date/Time: {call.date_time}")
    report_lines.append("Scoring Method: BINARY (0% or Full Points)")
    report_lines.append("")
    
    # Overall score
    scorecard = call.scorecard_summary
    report_lines.append("OVERALL PERFORMANCE SCORE:")
    report_lines.append("-" * 50)
    report_lines.append(f"Total Score: {scorecard['total_score']:.1f}/100")
    report_lines.append(f"Percentage: {scorecard['percentage']:.1f}%")
    report_lines.append(f"Classification: {call.classification}")
    report_lines.append("")
    
    # Filler analysis
    report_lines.append("FILLER/STAMMER ANALYSIS:")
    report_lines.append("-" * 50)
    if call.has_fillers == "Yes":
        report_lines.append("✗ FILLERS DETECTED")
        report_lines.append("   No Fillers Score: 0/10")
    else:
        report_lines.append("✓ NO FILLERS DETECTED")
        report_lines.append("   No Fillers Score: 10/10")
    report_lines.append("")
    
    # Detailed scores by category
    report_lines.append("DETAILED BINARY SCORECARD:")
    report_lines.append("-" * 50)
    
    categories = {
        "All Phases (10%)": ['enthusiasm_markers', 'sounds_polite_courteous'],
        "Opening Spiel (10%)": ['professional_greeting', 'verifies_patient_online'],
        "Middle/Climax (70%)": ['patient_verification', 'active_listening_or_handled_with_care', 
                               'hold_etiquette', 'no_fillers_stammers', 'recaps_time_date'],
        "Closing/Wrap-up (10%)": ['offers_further_assistance', 'ended_call_properly']
    }
    
    detailed = call.detailed_scores
    
    for category, metrics in categories.items():
        report_lines.append(f"\n{category}:")
        category_total = 0
        category_max = 0
        
        for metric in metrics:
            if metric in detailed:
                score_data = detailed[metric]
                score = score_data['score']
                max_score = score_data['max_score']
                found = score_data['found']
                status = "✓ PASS" if found else "✗ FAIL"
                
                # Format metric name
                display_name = metric.replace('_', ' ').title()
                report_lines.append(f"  {display_name:<35} {score:>6.1f}/{max_score:<3} {status}")
                
                category_total += score
                category_max += max_score
        
        report_lines.append(f"  {'CATEGORY SUBTOTAL:':<35} {category_total:>6.1f}/{category_max:<3}")
    
    report_lines.append("")
    report_lines.append("=" * 100)
    
    return {
        "call_id": call.id,
        "report": "\n".join(report_lines)
    }


@app.get("/api/calls/{call_id}/download")
async def download_audio(call_id: str, db: Session = Depends(get_db)):
    """Download audio file"""
    call = db.query(CallEvaluation).filter(CallEvaluation.id == call_id).first()
    if not call:
        raise HTTPException(404, "Call not found")
    
    if not os.path.exists(call.audio_path):
        raise HTTPException(404, "Audio file not found")
    
    return FileResponse(
        call.audio_path,
        media_type="audio/wav",
        filename=call.file_name
    )


@app.get("/api/stats")
async def get_stats(db: Session = Depends(get_db)):
    """Get dashboard statistics"""
    total_calls = db.query(CallEvaluation).count()
    satisfactory = db.query(CallEvaluation).filter(
        CallEvaluation.classification == "Satisfactory"
    ).count()
    
    completed_calls = db.query(CallEvaluation).filter(
        CallEvaluation.status == "completed"
    ).all()
    
    if completed_calls:
        avg_script = sum(c.script_score or 0 for c in completed_calls) / len(completed_calls)
        
        # Calculate average duration
        total_seconds = 0
        for c in completed_calls:
            if c.duration:
                parts = c.duration.split(':')
                total_seconds += int(parts[0]) * 60 + int(parts[1])
        
        avg_seconds = total_seconds / len(completed_calls) if completed_calls else 0
        avg_duration = f"{int(avg_seconds // 60)}:{int(avg_seconds % 60):02d}"
    else:
        avg_script = 0
        avg_duration = "0:00"
    
    return {
        "total_calls": total_calls,
        "satisfactory_rating": (satisfactory / total_calls * 100) if total_calls > 0 else 0,
        "avg_duration": avg_duration,
        "agent_adherence_score": round(avg_script, 1)
    }


@app.get("/")
async def root():
    return {
        "message": "CallEval API - Binary Scorecard System",
        "version": "3.1",
        "endpoints": {
            "POST /api/upload": "Upload audio file for evaluation",
            "GET /api/calls": "Get all call evaluations",
            "GET /api/calls/{call_id}": "Get specific call with detailed scores",
            "GET /api/calls/{call_id}/scorecard": "Get comprehensive scorecard breakdown",
            "GET /api/calls/{call_id}/report": "Get text-based evaluation report",
            "GET /api/calls/{call_id}/download": "Download audio file",
            "GET /api/stats": "Get dashboard statistics"
        },
        "transcription": {
            "service": "AssemblyAI",
            "features": [
                "Global English language",
                "Speaker diarization (2 speakers)",
                "Auto punctuation",
                "Text formatting",
                "Profanity detection (auto-fail if agent uses profanity)",
                "Filler words detection (um, uh, etc.)",
                "PII/SSN preserved (not redacted)",
                "Entity detection (disabled - SDK compatibility)"
            ]
        },
        "models": {
            "wav2vec2_bert": "p0peizd0pe/calleval-wav2vec2 (audio + text analysis)",
            "bert": "p0peizd0pe/calleval-bert (text classification)"
        },
        "scorecard": {
            "All Phases (10%)": "enthusiasm_markers | shows_enthusiasm | sounds_polite_courteous",
            "I. Opening Spiel (10%)": {
                "professional_greeting": "5%",
                "verifies_patient_online": "5%"
            },
            "II. Middle/Climax (70%)": {
                "patient_verification": "25%",
                "active_listening | handled_with_care": "10%",
                "asks_permission_hold | returns_properly_from_hold": "10%",
                "has_fillers | no_fillers_stammers": "10%",
                "recaps_time_date": "15%"
            },
            "III. Closing/Wrap-up (10%)": {
                "offers_further_assistance": "5%",
                "ended_call_properly": "5%"
            },
            "Total": "100%"
        },
        "classification": {
            "Satisfactory": "≥70%",
            "Needs Improvement": "50-69%",
            "Unsatisfactory": "<50%",
            "Failed": "Profanity detected by agent"
        },
        "response_format": {
            "detailed_scores": "Complete breakdown of each metric with confidence scores",
            "scorecard_summary": "Category totals and model predictions",
            "comprehensive_report": "Text-based evaluation report (similar to inference.py)"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)