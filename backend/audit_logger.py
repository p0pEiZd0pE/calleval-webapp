from database import AuditLog, SessionLocal
from datetime import datetime
from typing import Optional
import json

def log_action(
    action: str,
    resource_type: str,
    message: str,
    resource_id: Optional[str] = None,
    user: str = "System",
    role: str = "Admin",
    status: str = "success",
    details: Optional[dict] = None,
    ip_address: Optional[str] = None,
    user_agent: Optional[str] = None
):
    """
    Create an audit log entry
    
    Args:
        action: Type of action (create, update, delete, view, login, etc.)
        resource_type: Type of resource (call, agent, settings, user, etc.)
        message: Human-readable description of the action
        resource_id: ID of the affected resource (optional)
        user: Username or identifier of who performed the action
        role: User's role
        status: Status of the action (success, failed, warning)
        details: Additional details as a dictionary
        ip_address: Client IP address
        user_agent: Browser/client info
    """
    db = SessionLocal()
    try:
        audit_log = AuditLog(
            action=action,
            resource_type=resource_type,
            resource_id=resource_id,
            message=message,
            user=user,
            role=role,
            status=status,
            details=json.dumps(details) if details else None,
            ip_address=ip_address,
            user_agent=user_agent,
            timestamp=datetime.utcnow()
        )
        
        db.add(audit_log)
        db.commit()
        print(f"✓ Audit log created: {message}")
        
    except Exception as e:
        print(f"✗ Failed to create audit log: {e}")
        db.rollback()
    finally:
        db.close()


# Convenience functions for common actions

def log_call_upload(call_id: str, filename: str, agent_name: str, user: str = "Admin"):
    """Log when a call is uploaded"""
    log_action(
        action="create",
        resource_type="call",
        resource_id=call_id,
        message=f"Uploaded call '{filename}' for agent {agent_name}",
        user=user,
        role="Admin"
    )

def log_call_analysis_complete(call_id: str, filename: str, score: float):
    """Log when call analysis completes"""
    log_action(
        action="update",
        resource_type="call",
        resource_id=call_id,
        message=f"Completed analysis for call '{filename}' with score {score}%",
        user="System",
        role="System"
    )

def log_agent_created(agent_id: str, agent_name: str, user: str = "Admin"):
    """Log when an agent is created"""
    log_action(
        action="create",
        resource_type="agent",
        resource_id=agent_id,
        message=f"Created new agent: '{agent_name}'",
        user=user,
        role="Admin"
    )

def log_agent_updated(agent_id: str, agent_name: str, changes: dict, user: str = "Admin"):
    """Log when an agent is updated"""
    change_desc = ", ".join([f"{k}={v}" for k, v in changes.items()])
    log_action(
        action="update",
        resource_type="agent",
        resource_id=agent_id,
        message=f"Updated agent '{agent_name}': {change_desc}",
        user=user,
        role="Admin",
        details=changes
    )

def log_agent_deleted(agent_id: str, agent_name: str, user: str = "Admin"):
    """Log when an agent is deleted"""
    log_action(
        action="delete",
        resource_type="agent",
        resource_id=agent_id,
        message=f"Deleted agent: '{agent_name}'",
        user=user,
        role="Admin"
    )

def log_settings_updated(changes: dict, user: str = "Admin"):
    """Log when settings are updated"""
    change_desc = ", ".join([f"{k}={v}" for k, v in changes.items()])
    log_action(
        action="update",
        resource_type="settings",
        message=f"Updated application settings: {change_desc}",
        user=user,
        role="Admin",
        details=changes
    )

def log_report_generated(report_id: str, report_type: str, user: str = "Admin"):
    """Log when a report is generated"""
    log_action(
        action="create",
        resource_type="report",
        resource_id=report_id,
        message=f"Generated {report_type} report",
        user=user,
        role="Admin"
    )

def log_user_login(user: str, role: str, ip_address: str = None):
    """Log when a user logs in"""
    log_action(
        action="login",
        resource_type="user",
        message=f"User '{user}' logged in",
        user=user,
        role=role,
        ip_address=ip_address
    )

def log_call_deleted(call_id: str, filename: str, user: str = "Admin"):
    """Log when a call is deleted"""
    log_action(
        action="delete",
        resource_type="call",
        resource_id=call_id,
        message=f"Deleted call '{filename}'",
        user=user,
        role="Admin"
    )