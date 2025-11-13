import os
from pydantic_settings import BaseSettings
from typing import Optional

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
    
    # File upload settings - FIXED: No filesystem I/O at module level
    UPLOAD_DIR: str = "/data/uploads"  # Default, will be overridden if needed
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    
    # Database - FIXED: No filesystem I/O at module level  
    DATABASE_URL: str = "sqlite:////data/calleval.db"  # Default, will be overridden if needed
    
    # JWT Authentication
    JWT_SECRET_KEY: str = "your-secret-key-change-this-in-production"
    
    class Config:
        env_file = ".env"
    
    def __init__(self, **kwargs):
        """
        Initialize settings with dynamic path resolution.
        Only performs filesystem checks when actually instantiated, not on import.
        """
        super().__init__(**kwargs)
        
        # Only check filesystem if no explicit env vars are set
        if "UPLOAD_DIR" not in os.environ:
            # Dynamically determine upload directory at runtime
            if os.path.exists("/data"):
                self.UPLOAD_DIR = "/data/uploads"
            else:
                self.UPLOAD_DIR = "/tmp/uploads"
        
        if "DATABASE_URL" not in os.environ:
            # Dynamically determine database path at runtime
            if os.path.exists("/data"):
                self.DATABASE_URL = "sqlite:////data/calleval.db"
            else:
                self.DATABASE_URL = "sqlite:////tmp/calleval.db"


# CRITICAL FIX: Use lazy initialization - only create settings when actually accessed
_settings_instance: Optional[Settings] = None

def get_settings() -> Settings:
    """
    Lazy initialization of settings.
    Only creates Settings instance when first accessed, not on module import.
    """
    global _settings_instance
    if _settings_instance is None:
        _settings_instance = Settings()
    return _settings_instance


# For backward compatibility, create a property-like access
class SettingsProxy:
    """Proxy object that lazily loads settings on attribute access"""
    
    def __getattr__(self, name):
        return getattr(get_settings(), name)
    
    def __setattr__(self, name, value):
        return setattr(get_settings(), name, value)


# Export as 'settings' for backward compatibility
# But it won't actually instantiate until accessed!
settings = SettingsProxy()