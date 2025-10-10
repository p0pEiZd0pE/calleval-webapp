from sqlalchemy import create_engine, Column, String, Float, DateTime, Text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config import settings

# Create engine
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class CallEvaluation(Base):
    """Database model for call evaluations"""
    __tablename__ = "call_evaluations"
    
    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)  # Original filename
    file_path = Column(String, nullable=False)  # Path to stored file
    status = Column(String, default="pending")  # pending, transcribing, analyzing, completed, failed
    analysis_status = Column(String, default="pending")  # Detailed status message
    
    # Results
    transcript = Column(Text, nullable=True)  # Full transcription text
    duration = Column(String, nullable=True)  # Duration in MM:SS format
    score = Column(Float, nullable=True)  # Overall score (0-100)
    
    # Modal AI Model Results - NEW COLUMNS
    bert_analysis = Column(Text, nullable=True)  # BERT model output (JSON string)
    wav2vec2_analysis = Column(Text, nullable=True)  # Wav2Vec2-BERT model output (JSON string)
    binary_scores = Column(Text, nullable=True)  # Binary scorecard results (JSON string)
    
    # Legacy columns (kept for backward compatibility)
    scores = Column(Text, nullable=True)  # Detailed scores breakdown (JSON string)
    speakers = Column(Text, nullable=True)  # Speaker diarization data (JSON string)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# Create all tables
Base.metadata.create_all(bind=engine)


# Dependency for FastAPI
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()