from sqlalchemy import create_engine, Column, String, Float, DateTime, Text, Integer, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from config import settings

# Create engine
engine = create_engine(settings.DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


# NEW: User model for authentication
class User(Base):
    """Database model for users with authentication"""
    __tablename__ = "users"
    
    id = Column(String, primary_key=True)
    email = Column(String, unique=True, nullable=False, index=True)
    username = Column(String, unique=True, nullable=False, index=True)
    hashed_password = Column(String, nullable=False)
    full_name = Column(String, nullable=False)
    role = Column(String, default="Agent")  # Admin, Manager, Agent
    is_active = Column(Boolean, default=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)
    
    def to_dict(self):
        """Convert to dictionary for API response (excluding password)"""
        return {
            "id": self.id,
            "email": self.email,
            "username": self.username,
            "full_name": self.full_name,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_login": self.last_login.isoformat() if self.last_login else None
        }


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


class CallEvaluation(Base):
    """Database model for call evaluations"""
    __tablename__ = "call_evaluations"
    
    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    status = Column(String, default="pending")
    analysis_status = Column(String, default="pending")
    
    # Link to agent (no ForeignKey to avoid order issues)
    agent_id = Column(String, nullable=True)
    agent_name = Column(String, nullable=True)
    
    # Results
    transcript = Column(Text, nullable=True)
    duration = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    
    # Modal AI Model Results
    bert_analysis = Column(Text, nullable=True)
    wav2vec2_analysis = Column(Text, nullable=True)
    binary_scores = Column(Text, nullable=True)

    # Processing metadata
    processing_time = Column(Float, nullable=True)
    error_message = Column(Text, nullable=True)
    
    # Legacy columns
    scores = Column(Text, nullable=True)
    speakers = Column(Text, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class Report(Base):
    """Database model for generated reports"""
    __tablename__ = "reports"
    
    id = Column(String, primary_key=True)
    type = Column(String, nullable=False)  # weekly, monthly, custom
    format = Column(String, nullable=False)  # csv, xlsx, pdf
    status = Column(String, default="completed")  # completed, failed
    
    # Filters applied
    agent_id = Column(String, nullable=True)
    agent_name = Column(String, nullable=True)
    classification = Column(String, nullable=True)
    
    # Date range
    start_date = Column(DateTime, nullable=True)
    end_date = Column(DateTime, nullable=True)
    
    # Metadata
    total_calls = Column(Integer, default=0)
    avg_score = Column(Float, nullable=True)
    
    # File info (if you want to store the files)
    file_path = Column(String, nullable=True)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)


class Settings(Base):
    __tablename__ = "settings"
    
    id = Column(Integer, primary_key=True, index=True)
    email_notifications = Column(Boolean, default=True)
    language = Column(String, default="English")
    retention_period = Column(Integer, default=12)
    theme = Column(String, default="light")
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AuditLog(Base):
    """Database model for audit logs"""
    __tablename__ = "audit_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    action = Column(String, nullable=False)  # e.g., "create", "update", "delete", "view"
    resource_type = Column(String, nullable=False)  # e.g., "call", "agent", "settings", "user"
    resource_id = Column(String, nullable=True)  # ID of the affected resource
    message = Column(Text, nullable=False)  # Human-readable message
    user = Column(String, default="System")  # User who performed the action
    role = Column(String, default="Admin")  # User's role
    ip_address = Column(String, nullable=True)  # IP address of the user
    user_agent = Column(String, nullable=True)  # Browser/client info
    status = Column(String, default="success")  # success, failed, warning
    
    # Additional details (stored as JSON)
    details = Column(Text, nullable=True)
    
    # Timestamp
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    def to_dict(self):
        """Convert to dictionary for API response"""
        return {
            "id": self.id,
            "action": self.action,
            "resource_type": self.resource_type,
            "resource_id": self.resource_id,
            "message": self.message,
            "user": self.user,
            "role": self.role,
            "status": self.status,
            "timestamp": self.timestamp.isoformat() if self.timestamp else None
        }


# Create all tables
# Tables should be created in startup event, not here!
# This prevents sync loops from repeated Base.metadata.create_all() calls
# Base.metadata.create_all(bind=engine)

# Flag to ensure tables are created only once
_tables_created = False

def create_tables():
    """Create database tables - call this once in startup event"""
    global _tables_created
    if not _tables_created:
        Base.metadata.create_all(bind=engine)
        _tables_created = True
        print("✓ Database tables created/verified")

# Dependency for FastAPI
def get_db():
    """Get database session - does NOT create tables on every request"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()