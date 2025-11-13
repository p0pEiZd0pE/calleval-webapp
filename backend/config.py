import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Modal Configuration - WhisperX
    MODAL_WHISPERX_APP: str = "whisperx-calleval"
    MODAL_WHISPERX_FUNCTION: str = "transcribe_with_diarization"
    
    # Modal Configuration - BERT
    MODAL_BERT_APP: str = "calleval-bert"
    MODAL_BERT_FUNCTION: str = "analyze_text_bert"
    
    # Modal Configuration - Wav2Vec2-BERT
    MODAL_WAV2VEC2_APP: str = "calleval-wav2vec2"
    MODAL_WAV2VEC2_FUNCTION: str = "analyze_audio_wav2vec2"
    
    # Backend URL (for Modal to access audio files)
    BACKEND_URL: str = "http://localhost:8000"  # Will be set to Render URL in production
    
    # Frontend URL for CORS
    FRONTEND_URL: str = "http://localhost:5173"
    
    # File upload settings
    # Use /data for persistent storage on Render, fallback to local for development
    UPLOAD_DIR: str = os.getenv("UPLOAD_DIR", "/data/uploads" if os.path.exists("/data") else "uploads")
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    
    # Database
    # Use /data for persistent storage on Render, fallback to local for development
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "sqlite:////data/calleval.db" if os.path.exists("/data") else "sqlite:///./calleval.db"
    )
    
    # JWT Authentication - NEW
    JWT_SECRET_KEY: str = "your-secret-key-change-this-in-production"
    
    class Config:
        env_file = ".env"

settings = Settings()