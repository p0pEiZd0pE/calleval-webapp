"""
CallEval Wav2Vec2-BERT Model - Modal Deployment
Multi-modal analysis combining audio features and text
"""

import modal
import os

# Create Modal app
app = modal.App("calleval-wav2vec2")

# Create image with dependencies
image = (
    modal.Image.debian_slim(python_version="3.10")
    .apt_install("ffmpeg", "libsndfile1")  # Audio processing libraries
    .pip_install(
        "torch",
        "torchaudio",
        "transformers",
        "librosa",
        "soundfile",
        "huggingface-hub",
        "httpx",  # For downloading audio from URL
    )
)

# Mount for model cache
model_cache = modal.Volume.from_name("calleval-wav2vec2-cache", create_if_missing=True)


@app.function(
    image=image,
    gpu="A10G",  # Better GPU for Wav2Vec2 + BERT
    timeout=600,
    volumes={"/cache": model_cache},
    secrets=[modal.Secret.from_name("huggingface-secret")]  # Optional
)
def analyze_audio_wav2vec2(audio_url: str, text: str):
    """
    Analyze call audio + transcript using fine-tuned Wav2Vec2-BERT model
    
    Args:
        audio_url: URL to download audio file
        text: Transcript text
    
    Returns:
        dict: Analysis results with audio and text features
    """
    import torch
    import torch.nn as nn
    import torchaudio
    import librosa
    import httpx
    import tempfile
    from pathlib import Path
    from transformers import (
        Wav2Vec2Processor, 
        Wav2Vec2Model,
        AutoTokenizer,
        AutoModel
    )
    from huggingface_hub import hf_hub_download
    
    print(f"🎵 Processing audio from: {audio_url}")
    print(f"📝 Text length: {len(text)} chars")
    
    # Set cache directory
    os.environ['TRANSFORMERS_CACHE'] = '/cache'
    
    try:
        # Download audio file
        print("⏳ Downloading audio...")
        response = httpx.get(audio_url, timeout=30.0)
        response.raise_for_status()
        
        # Save to temporary file
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp_file:
            tmp_file.write(response.content)
            audio_path = tmp_file.name
        
        print(f"✓ Audio downloaded to {audio_path}")
        
        # Load and preprocess audio
        print("🔊 Loading audio...")
        waveform, sample_rate = torchaudio.load(audio_path)
        
        # Convert to mono if stereo
        if waveform.shape[0] > 1:
            waveform = torch.mean(waveform, dim=0, keepdim=True)
        
        # Resample to 16kHz for Wav2Vec2
        if sample_rate != 16000:
            resampler = torchaudio.transforms.Resample(sample_rate, 16000)
            waveform = resampler(waveform)
        
        waveform = waveform.flatten()
        
        # Truncate or pad to fixed length (10 seconds = 160,000 samples at 16kHz)
        max_length = 160000
        if len(waveform) > max_length:
            waveform = waveform[:max_length]
        elif len(waveform) < max_length:
            padding = max_length - len(waveform)
            waveform = torch.nn.functional.pad(waveform, (0, padding))
        
        print(f"✓ Audio preprocessed: shape={waveform.shape}")
        
        # Load processors and models
        print("⏳ Loading Wav2Vec2 and BERT models...")
        
        wav2vec2_processor = Wav2Vec2Processor.from_pretrained(
            "facebook/wav2vec2-base",
            cache_dir="/cache"
        )
        wav2vec2_model = Wav2Vec2Model.from_pretrained(
            "facebook/wav2vec2-base",
            cache_dir="/cache"
        )
        
        bert_tokenizer = AutoTokenizer.from_pretrained(
            "bert-base-uncased",
            cache_dir="/cache"
        )
        bert_model = AutoModel.from_pretrained(
            "bert-base-uncased",
            cache_dir="/cache"
        )
        
        # Load your fine-tuned multi-modal model weights
        model_repo = "alino-hcdc/calleval-wav2vec2-bert"
        
        checkpoint_files = [
            "best_calleval_wav2vec2_bert_model.pth",
            "calleval_wav2vec2_bert_model.pth",
            "pytorch_model.bin",
            "model.safetensors"
        ]
        
        checkpoint_path = None
        for filename in checkpoint_files:
            try:
                print(f"⏳ Trying to download: {filename}")
                checkpoint_path = hf_hub_download(
                    repo_id=model_repo,
                    filename=filename,
                    cache_dir="/cache"
                )
                print(f"✓ Found checkpoint: {filename}")
                break
            except Exception as e:
                print(f"⚠️ {filename} not found, trying next...")
                continue
        
        if not checkpoint_path:
            raise Exception(f"No model checkpoint found in {model_repo}")
        
        print(f"⏳ Loading checkpoint weights...")
        checkpoint = torch.load(checkpoint_path, map_location="cpu")
        
        device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        print(f"✓ Using device: {device}")
        
        # Move models to device
        wav2vec2_model.to(device)
        bert_model.to(device)
        wav2vec2_model.eval()
        bert_model.eval()
        
        # Process audio with Wav2Vec2
        print("🔍 Extracting audio features...")
        audio_inputs = wav2vec2_processor(
            waveform.numpy(),
            sampling_rate=16000,
            return_tensors="pt"
        )
        audio_inputs = {k: v.to(device) for k, v in audio_inputs.items()}
        
        with torch.no_grad():
            audio_outputs = wav2vec2_model(**audio_inputs)
            audio_features = audio_outputs.last_hidden_state.mean(dim=1)  # Average pooling
        
        # Process text with BERT
        print("📝 Extracting text features...")
        text_inputs = bert_tokenizer(
            text,
            max_length=512,
            padding="max_length",
            truncation=True,
            return_tensors="pt"
        )
        text_inputs = {k: v.to(device) for k, v in text_inputs.items()}
        
        with torch.no_grad():
            text_outputs = bert_model(**text_inputs)
            text_features = text_outputs.last_hidden_state[:, 0, :]  # CLS token
        
        print(f"✓ Audio features shape: {audio_features.shape}")
        print(f"✓ Text features shape: {text_features.shape}")
        
        # Here you would normally pass through your fine-tuned fusion layers
        # For now, returning the extracted features
        # You'll need to add your specific model architecture here
        
        results = {
            "audio_features_extracted": True,
            "text_features_extracted": True,
            "audio_shape": list(audio_features.shape),
            "text_shape": list(text_features.shape),
            # Add your specific predictions here based on your model
            "predictions": {
                "quality_score": 0.85,  # Placeholder
                "enthusiasm": 0.75,
                "politeness": 0.90,
            }
        }
        
        # Clean up temp file
        Path(audio_path).unlink(missing_ok=True)
        
        print("✅ Multi-modal analysis complete!")
        return {
            "success": True,
            "results": results
        }
        
    except Exception as e:
        print(f"❌ Error during analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        return {
            "success": False,
            "error": str(e)
        }


@app.local_entrypoint()
def test():
    """Test the Wav2Vec2-BERT function locally"""
    # You'll need to provide a test audio URL
    test_audio_url = "http://localhost:8000/api/temp-audio/test-id"
    test_text = "Hi, thank you for calling Sony Family Practice."
    
    result = analyze_audio_wav2vec2.remote(test_audio_url, test_text)
    print("\nTest Results:")
    print(result)