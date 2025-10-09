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
    UPLOAD_DIR: str = "uploads"
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    
    # Database
    DATABASE_URL: str = "sqlite:///./calleval.db"
    
    class Config:
        env_file = ".env"

settings = Settings()