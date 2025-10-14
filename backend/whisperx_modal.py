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
        "whisperx",  # Use latest version (removes the 301 error)
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
):
    """
    Run WhisperX CLI with full parameters including diarization
    
    Args:
        audio_url: URL to audio file
        language: Language code
        min_speakers: Minimum number of speakers
        max_speakers: Maximum number of speakers
    
    Returns:
        dict with transcription, segments, and diarization results
    """
    import os
    import urllib.request
    
    # Get HF token from environment (set via Modal secret)
    hf_token = os.environ.get("HUGGINGFACE_TOKEN")
    
    # Create temp directories
    temp_dir = Path("/tmp/whisperx")
    temp_dir.mkdir(exist_ok=True)
    output_dir = Path("/outputs")
    
    # Download audio file
    audio_filename = "input_audio.wav"
    audio_path = temp_dir / audio_filename
    
    print(f"Downloading audio from {audio_url}...")
    urllib.request.urlretrieve(audio_url, audio_path)
    
    # Build WhisperX command with your exact parameters
    command = [
        "whisperx", str(audio_path),
        "--model", "large-v2",
        "--language", language,
        "--compute_type", "float16",
        "--output_dir", str(output_dir),
        "--output_format", "all",
        "--device", "cuda",
        "--temperature", "1.0",
        "--no_speech_threshold", "0.1",
        "--logprob_threshold", "-1.5",
        "--compression_ratio_threshold", "3.0",
        "--initial_prompt", "Include all speech sounds like um, uh, er, ah, and repeated words exactly as spoken.",
        "--diarize",
        "--min_speakers", str(min_speakers),
        "--max_speakers", str(max_speakers),
        "--hf_token", hf_token
    ]
    
    # Run WhisperX
    print("Running WhisperX with diarization...")
    print(f"Command: {' '.join(command)}")
    
    result = subprocess.run(
        command,
        capture_output=True,
        text=True
    )
    
    if result.returncode != 0:
        print(f"STDERR: {result.stderr}")
        raise Exception(f"WhisperX failed: {result.stderr}")
    
    print(f"STDOUT: {result.stdout}")
    
    # Read output files
    base_name = audio_path.stem
    json_file = output_dir / f"{base_name}.json"
    srt_file = output_dir / f"{base_name}.srt"
    txt_file = output_dir / f"{base_name}.txt"
    
    # Load JSON output (contains segments with speaker labels)
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
    
    # Return all results
    return {
        "text": full_text,
        "segments": transcription_data.get("segments", []),
        "word_segments": transcription_data.get("word_segments", []),
        "language": transcription_data.get("language", language),
        "srt": srt_content,
        "raw_json": transcription_data
    }


# Web endpoint
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
        "max_speakers": 2
    }
    """
    audio_url = item.get("audio_url")
    language = item.get("language", "en")
    min_speakers = item.get("min_speakers", 2)
    max_speakers = item.get("max_speakers", 2)
    
    if not audio_url:
        return {"error": "audio_url is required"}, 400
    
    result = transcribe_with_diarization.remote(
        audio_url,
        language,
        min_speakers,
        max_speakers
    )
    
    return result


# Local test
@app.local_entrypoint()
def test():
    """Test transcription locally"""
    test_url = "https://github.com/m-bain/whisperX/raw/main/sample.wav"
    
    print("Testing WhisperX with diarization...")
    result = transcribe_with_diarization.remote(test_url)
    
    print(f"\n=== TRANSCRIPTION ===")
    print(result['text'])
    print(f"\n=== SEGMENTS ({len(result['segments'])} total) ===")
    for seg in result['segments'][:3]:  # Show first 3
        speaker = seg.get('speaker', 'Unknown')
        print(f"[{speaker}] {seg['text']}")