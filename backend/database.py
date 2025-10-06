from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, JSON
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config import settings

engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class CallEvaluation(Base):
    __tablename__ = "call_evaluations"
    
    id = Column(String, primary_key=True, index=True)
    file_name = Column(String)
    agent_name = Column(String, nullable=True)
    date_time = Column(DateTime, default=datetime.utcnow)
    duration = Column(String, nullable=True)
    
    # Transcription
    transcript = Column(Text, nullable=True)
    speakers = Column(JSON, nullable=True)  # Speaker diarization data
    
    # BERT Analysis Results
    classification = Column(String, nullable=True)  # Satisfactory/Unsatisfactory
    tone_score = Column(Float, nullable=True)
    script_score = Column(Float, nullable=True)
    resolution_score = Column(Float, nullable=True)
    
    # Wav2Vec2-BERT Analysis Results
    phase = Column(String, nullable=True)
    has_fillers = Column(String, nullable=True)
    quality_score = Column(Float, nullable=True)
    enthusiasm_score = Column(Float, nullable=True)
    politeness_score = Column(Float, nullable=True)
    
    # Status
    status = Column(String, default="pending")  # pending, completed, failed
    analysis_status = Column(String, default="pending")
    
    # File path
    audio_path = Column(String)

# Create tables
Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()