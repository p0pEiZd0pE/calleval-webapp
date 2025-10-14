"""
WhisperX Modal Deployment - Optimized for 8kHz Telephony
Maintains your existing structure with telephony enhancements
"""

import modal
import subprocess
import json
from pathlib import Path

# Create Modal app
app = modal.App("whisperx-calleval")

# Define image with WhisperX, dependencies, AND NumPy <2.0
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "numpy<2",  # Pin NumPy to 1.x - CRITICAL FIX
        "whisperx",  # Use latest version
        "torch==2.1.0",
        "torchaudio==2.1.0",
        "fastapi[standard]",
    )
)

# Volume for storing output files temporarily
volume = modal.Volume.from_name("whisperx-outputs", create_if_missing=True)

@app.function(
    image=image,
    gpu="A10G",
    timeout=900,  # 15 minutes
    volumes={"/outputs": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
def transcribe_with_diarization(
    audio_url: str,
    language: str = "en",
    min_speakers: int = 2,
    max_speakers: int = 2,
    # NEW: Telephony-optimized parameters with defaults
    temperature: float = None,  # Will auto-detect based on audio
    condition_on_previous_text: bool = None,
    compression_ratio_threshold: float = None,
    no_speech_threshold: float = None,
    model: str = "large-v3",  # Upgraded to v3 by default
):
    """
    Run WhisperX CLI with full parameters including diarization
    NOW WITH TELEPHONY OPTIMIZATION
    
    Args:
        audio_url: URL to audio file
        language: Language code
        min_speakers: Minimum number of speakers
        max_speakers: Maximum number of speakers
        temperature: Sampling temperature (None = auto-detect)
        condition_on_previous_text: Whether to condition on previous (None = auto)
        compression_ratio_threshold: Compression threshold (None = auto)
        no_speech_threshold: No speech threshold (None = auto)
        model: Whisper model to use (default: large-v3)
    
    Returns:
        dict with transcription, segments, and diarization results
    """
    import os
    import urllib.request
    import librosa
    
    # Get HF token from environment (set via Modal secret)
    hf_token = os.environ.get("HUGGINGFACE_TOKEN")
    
    # Create temp directories
    temp_dir = Path("/tmp/whisperx")
    temp_dir.mkdir(exist_ok=True)
    output_dir = Path("/outputs")
    
    # Download audio file
    audio_filename = "input_audio.wav"
    audio_path = temp_dir / audio_filename
    
    print(f"\n{'='*60}")
    print(f"WHISPERX TELEPHONY-OPTIMIZED TRANSCRIPTION")
    print(f"{'='*60}")
    print(f"Downloading audio from {audio_url}...")
    urllib.request.urlretrieve(audio_url, audio_path)
    print(f"✅ Downloaded to: {audio_path}")
    
    # ========================================================================
    # AUTO-DETECT AUDIO QUALITY AND SET OPTIMAL PARAMETERS
    # ========================================================================
    print(f"\n📊 Analyzing audio quality...")
    try:
        # Load audio to check sample rate
        y, sr = librosa.load(str(audio_path), sr=None, duration=5)  # Check first 5s
        
        is_telephony = sr <= 8000
        print(f"Sample Rate: {sr}Hz")
        print(f"Audio Type: {'📞 Telephony (8kHz)' if is_telephony else '🎵 High Quality'}")
        
        # Set parameters based on audio quality if not specified
        if temperature is None:
            temperature = 0.0 if is_telephony else 1.0
        
        if condition_on_previous_text is None:
            condition_on_previous_text = False if is_telephony else True
        
        if compression_ratio_threshold is None:
            compression_ratio_threshold = 2.0 if is_telephony else 3.0
        
        if no_speech_threshold is None:
            no_speech_threshold = 0.3 if is_telephony else 0.1
        
        print(f"\n🎯 Using {'TELEPHONY' if is_telephony else 'STANDARD'} optimization:")
        print(f"  - Temperature: {temperature}")
        print(f"  - Condition on previous: {condition_on_previous_text}")
        print(f"  - Compression ratio threshold: {compression_ratio_threshold}")
        print(f"  - No speech threshold: {no_speech_threshold}")
        
    except Exception as e:
        print(f"⚠️  Could not analyze audio, using default parameters: {e}")
        # Fallback to telephony-safe defaults
        if temperature is None:
            temperature = 0.0
        if condition_on_previous_text is None:
            condition_on_previous_text = False
        if compression_ratio_threshold is None:
            compression_ratio_threshold = 2.5
        if no_speech_threshold is None:
            no_speech_threshold = 0.2
    
    # ========================================================================
    # BUILD WHISPERX COMMAND
    # ========================================================================
    command = [
        "whisperx", str(audio_path),
        "--model", model,
        "--language", language,
        "--compute_type", "float16",
        "--output_dir", str(output_dir),
        "--output_format", "all",
        "--device", "cuda",
        
        # Telephony-optimized parameters
        "--temperature", str(temperature),
        "--no_speech_threshold", str(no_speech_threshold),
        "--logprob_threshold", "-1.0",  # Less strict for degraded audio
        "--compression_ratio_threshold", str(compression_ratio_threshold),
        
        # Initial prompt for filler detection
        "--initial_prompt", "Include all speech sounds like um, uh, er, ah, and repeated words exactly as spoken.",
        
        # Diarization
        "--diarize",
        "--min_speakers", str(min_speakers),
        "--max_speakers", str(max_speakers),
        "--hf_token", hf_token
    ]
    
    # Add condition_on_previous_text flag if False (it's True by default in whisper)
    if not condition_on_previous_text:
        command.extend(["--condition_on_previous_text", "False"])
    
    # ========================================================================
    # RUN WHISPERX
    # ========================================================================
    print(f"\n🚀 Running WhisperX with diarization...")
    print(f"Command: {' '.join(command)}")
    print(f"{'='*60}\n")
    
    result = subprocess.run(
        command,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"❌ STDERR: {result.stderr}")
        raise Exception(f"WhisperX failed: {result.stderr}")
    
    print(f"✅ WhisperX completed successfully")
    if result.stdout:
        print(f"STDOUT: {result.stdout}")
    
    # ========================================================================
    # READ OUTPUT FILES
    # ========================================================================
    base_name = audio_path.stem
    json_file = output_dir / f"{base_name}.json"
    srt_file = output_dir / f"{base_name}.srt"
    txt_file = output_dir / f"{base_name}.txt"
    
    # Load JSON output (contains segments with speaker labels)
    print(f"\n📄 Reading output files...")
    with open(json_file, "r") as f:
        transcription_data = json.load(f)
    
    # Load plain text
    full_text = ""
    if txt_file.exists():
        with open(txt_file, "r") as f:
            full_text = f.read()
    
    # Load SRT (optional, for subtitles)
    srt_content = ""
    if srt_file.exists():
        with open(srt_file, "r") as f:
            srt_content = f.read()
    
    # ========================================================================
    # POST-PROCESSING: VALIDATE DIARIZATION
    # ========================================================================
    segments = transcription_data.get("segments", [])
    
    print(f"\n🔍 Validating diarization...")
    print(f"   Total segments: {len(segments)}")
    
    # Quick validation stats
    if segments:
        speakers = set(seg.get('speaker', 'unknown') for seg in segments)
        print(f"   Detected speakers: {speakers}")
        
        # Check for very short segments (potential errors)
        short_segments = sum(1 for seg in segments 
                           if (seg.get('end', 0) - seg.get('start', 0)) < 0.5)
        if short_segments > len(segments) * 0.2:
            print(f"   ⚠️  Warning: {short_segments} very short segments detected")
            print(f"      This may indicate diarization issues with 8kHz audio")
        
        # Calculate speaker distribution
        speaker_times = {}
        for seg in segments:
            speaker = seg.get('speaker', 'unknown')
            duration = seg.get('end', 0) - seg.get('start', 0)
            speaker_times[speaker] = speaker_times.get(speaker, 0) + duration
        
        total_time = sum(speaker_times.values())
        for speaker, time in speaker_times.items():
            percentage = (time / total_time * 100) if total_time > 0 else 0
            print(f"   {speaker}: {time:.1f}s ({percentage:.1f}%)")
    
    # ========================================================================
    # RETURN RESULTS
    # ========================================================================
    output = {
        "text": full_text,
        "segments": segments,
        "word_segments": transcription_data.get("word_segments", []),
        "language": transcription_data.get("language", language),
        "srt": srt_content,
        "raw_json": transcription_data,
        # Add metadata about processing
        "metadata": {
            "model": model,
            "temperature": temperature,
            "compression_ratio_threshold": compression_ratio_threshold,
            "no_speech_threshold": no_speech_threshold,
            "telephony_optimized": True
        }
    }
    
    print(f"\n{'='*60}")
    print(f"✅ TRANSCRIPTION COMPLETE")
    print(f"   Segments: {len(segments)}")
    print(f"   Duration: {segments[-1]['end']:.2f}s" if segments else "Unknown")
    print(f"{'='*60}\n")
    
    return output


# ============================================================================
# WEB ENDPOINT (unchanged from your original)
# ============================================================================

@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def api_transcribe(item: dict):
    """
    HTTP endpoint for transcription with diarization
    
    POST body:
    {
        "audio_url": "https://example.com/call.wav",
        "language": "en",
        "min_speakers": 2,
        "max_speakers": 2,
        "temperature": 0.0,  // Optional, auto-detected if not provided
        "model": "large-v3"  // Optional
    }
    """
    audio_url = item.get("audio_url")
    language = item.get("language", "en")
    min_speakers = item.get("min_speakers", 2)
    max_speakers = item.get("max_speakers", 2)
    temperature = item.get("temperature")  # Optional
    model = item.get("model", "large-v3")
    
    if not audio_url:
        return {"error": "audio_url is required"}, 400
    
    result = transcribe_with_diarization.remote(
        audio_url,
        language,
        min_speakers,
        max_speakers,
        temperature=temperature,
        model=model
    )
    
    return result


# ============================================================================
# LOCAL TEST
# ============================================================================

@app.local_entrypoint()
def test():
    """Test transcription locally"""
    # Test with WhisperX sample
    test_url = "https://github.com/m-bain/whisperX/raw/main/sample.wav"
    
    print("Testing WhisperX with telephony optimization...")
    result = transcribe_with_diarization.remote(test_url)
    
    print(f"\n{'='*60}")
    print(f"TEST RESULTS")
    print(f"{'='*60}")
    print(f"\nTranscription:")
    print(result['text'])
    print(f"\nFirst 3 segments:")
    for seg in result['segments'][:3]:
        speaker = seg.get('speaker', 'Unknown')
        start = seg.get('start', 0)
        end = seg.get('end', 0)
        text = seg.get('text', '')
        print(f"  [{start:.2f}-{end:.2f}] {speaker}: {text}")
    
    print(f"\nMetadata:")
    for key, value in result.get('metadata', {}).items():
        print(f"  {key}: {value}")