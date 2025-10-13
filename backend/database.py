from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, Integer
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
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(String, default="pending")
    analysis_status = Column(String, default="pending")
    
    # Results
    transcript = Column(Text, nullable=True)
    duration = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    
    # Modal AI Model Results
    bert_analysis = Column(Text, nullable=True)
    wav2vec2_analysis = Column(Text, nullable=True)
    binary_scores = Column(Text, nullable=True)
    
    # Legacy columns
    scores = Column(Text, nullable=True)
    speakers = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Agent(Base):
    """Database model for agents"""
    __tablename__ = "agents"
    
    agentId = Column(String, primary_key=True)
    agentName = Column(String, nullable=False)
    position = Column(String, nullable=False)
    status = Column(String, default="Active")  # Active or Inactive
    avgScore = Column(Float, default=0.0)
    callsHandled = Column(Integer, default=0)
    
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