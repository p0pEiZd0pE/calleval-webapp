from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # API Keys
    ASSEMBLYAI_API_KEY: str
    REPLICATE_API_TOKEN: str
    
    # Database
    DATABASE_URL: str = "sqlite:///./calleval.db"
    
    # File Upload
    UPLOAD_DIR: str = "./uploads"
    MAX_FILE_SIZE: int = 100 * 1024 * 1024  # 100MB
    
    # CORS
    FRONTEND_URL: str = "http://localhost:5173"
    
    class Config:
        env_file = ".env"

settings = Settings()