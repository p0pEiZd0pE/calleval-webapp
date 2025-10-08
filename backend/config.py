import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Keys
    ASSEMBLYAI_API_KEY: str  # ← ADD THIS LINE
    REPLICATE_API_TOKEN: str
    
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