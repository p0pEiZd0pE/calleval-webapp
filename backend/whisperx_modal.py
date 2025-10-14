"""
WhisperX Modal Deployment - Simple telephony-optimized version
No librosa needed - just uses telephony defaults for all audio
"""

import modal
import subprocess
import json
from pathlib import Path

# Create Modal app
app = modal.App("whisperx-calleval")

# Simple image - no librosa needed
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "git")
    .pip_install(
        "numpy<2",  # Pin NumPy to 1.x
        "whisperx",
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
    timeout=900,
    volumes={"/outputs": volume},
    secrets=[modal.Secret.from_name("huggingface-secret")],
)
def transcribe_with_diarization(
    audio_url: str,
    language: str = "en",
    min_speakers: int = 2,
    max_speakers: int = 2,
):
    """
    Run WhisperX with telephony-optimized parameters (for 8kHz audio)
    
    OPTIMIZED FOR PHONE RECORDINGS:
    - temperature=0.0 (more deterministic)
    - compression_ratio_threshold=2.0 (more permissive)
    - no_speech_threshold=0.3 (conservative)
    - model=large-v3 (best for degraded audio)
    """
    import os
    import urllib.request
    
    # Get HF token from environment
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
    print(f"✅ Downloaded")
    
    # TELEPHONY-OPTIMIZED PARAMETERS (assumes 8kHz phone audio)
    temperature = 0.0
    compression_ratio_threshold = 2.0
    no_speech_threshold = 0.3
    model = "large-v3"
    
    print(f"\n🎯 Using TELEPHONY optimization:")
    print(f"  - Model: {model}")
    print(f"  - Temperature: {temperature}")
    print(f"  - Compression ratio threshold: {compression_ratio_threshold}")
    print(f"  - No speech threshold: {no_speech_threshold}")
    
    # Build WhisperX command
    command = [
        "whisperx", str(audio_path),
        "--model", model,
        "--language", language,
        "--compute_type", "float16",
        "--output_dir", str(output_dir),
        "--output_format", "all",
        "--device", "cuda",
        "--temperature", str(temperature),
        "--no_speech_threshold", str(no_speech_threshold),
        "--logprob_threshold", "-1.0",
        "--compression_ratio_threshold", str(compression_ratio_threshold),
        "--initial_prompt", "Include all speech sounds like um, uh, er, ah, and repeated words exactly as spoken.",
        "--diarize",
        "--min_speakers", str(min_speakers),
        "--max_speakers", str(max_speakers),
        "--hf_token", hf_token,
        "--condition_on_previous_text", "False"  # Important for phone audio
    ]
    
    # Run WhisperX
    print(f"\n🚀 Running WhisperX...")
    
    result = subprocess.run(command, capture_output=True, text=True)
    
    if result.returncode != 0:
        print(f"❌ STDERR: {result.stderr}")
        raise Exception(f"WhisperX failed: {result.stderr}")
    
    print(f"✅ WhisperX completed")
    
    # Read output files
    base_name = audio_path.stem
    json_file = output_dir / f"{base_name}.json"
    srt_file = output_dir / f"{base_name}.srt"
    txt_file = output_dir / f"{base_name}.txt"
    
    with open(json_file, "r") as f:
        transcription_data = json.load(f)
    
    full_text = ""
    if txt_file.exists():
        with open(txt_file, "r") as f:
            full_text = f.read()
    
    srt_content = ""
    if srt_file.exists():
        with open(srt_file, "r") as f:
            srt_content = f.read()
    
    segments = transcription_data.get("segments", [])
    
    # Return results
    output = {
        "text": full_text,
        "segments": segments,
        "word_segments": transcription_data.get("word_segments", []),
        "language": transcription_data.get("language", language),
        "srt": srt_content,
        "raw_json": transcription_data
    }
    
    print(f"\n✅ Complete: {len(segments)} segments\n")
    
    return output


@app.function(image=image)
@modal.fastapi_endpoint(method="POST")
def api_transcribe(item: dict):
    """HTTP endpoint"""
    audio_url = item.get("audio_url")
    language = item.get("language", "en")
    min_speakers = item.get("min_speakers", 2)
    max_speakers = item.get("max_speakers", 2)
    
    if not audio_url:
        return {"error": "audio_url is required"}, 400
    
    result = transcribe_with_diarization.remote(
        audio_url, language, min_speakers, max_speakers
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