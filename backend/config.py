import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Keys
    REPLICATE_API_TOKEN: str
    
    # Modal Configuration
    MODAL_APP_NAME: str = "whisperx-calleval"  # Your Modal app name
    MODAL_FUNCTION_NAME: str = "transcribe_with_diarization"  # Your Modal function name
    
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