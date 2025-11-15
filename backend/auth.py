"""
Authentication utilities for JWT tokens and password hashing
Enhanced with Role-Based Access Control (RBAC)
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
import os

# JWT Configuration
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "your-secret-key-change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

# Password hashing - Updated for bcrypt 4.0+ compatibility
pwd_context = CryptContext(
    schemes=["bcrypt"],
    deprecated="auto",
    bcrypt__rounds=12  # Explicit rounds for better compatibility
)

# OAuth2 scheme for token extraction
# FIXED: Changed from /api/auth/login to /api/auth/login/form for /docs authorization compatibility
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login/form")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Hash a password"""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def verify_token(token: str) -> dict:
    """Verify and decode a JWT token"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )


# CRITICAL FIX: Properly handle database dependency without circular imports
def get_db_dependency():
    """
    Wrapper to get database session - resolves circular import
    This function is called by FastAPI's dependency injection system
    """
    from database import get_db
    # This returns the generator function itself, which FastAPI will then call
    yield from get_db()


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db_dependency)  # FIXED: Proper dependency injection!
):
    """
    Dependency to get the current authenticated user
    FIXED: Database session is properly managed by FastAPI's dependency system
    """
    from database import User  # Import here to avoid circular dependency
    
    # Verify token
    payload = verify_token(token)
    user_id: str = payload.get("sub")
    
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Get user from database
    user = db.query(User).filter(User.id == user_id).first()
    
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    
    return user


# ============================================================================
# ROLE-BASED ACCESS CONTROL DEPENDENCIES
# ============================================================================

async def get_current_active_admin(current_user = Depends(get_current_user)):
    """Dependency to ensure the current user is an admin"""
    if current_user.role != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Admin access required."
        )
    return current_user


async def get_current_admin_or_manager(current_user = Depends(get_current_user)):
    """Dependency to ensure the current user is an admin or manager"""
    if current_user.role not in ["Admin", "Manager"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not enough permissions. Admin or Manager access required."
        )
    return current_user


async def get_current_active_user(current_user = Depends(get_current_user)):
    """Dependency to ensure user is active (any role)"""
    if not current_user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive"
        )
    return current_user


def check_resource_access(current_user, resource_owner_id: str, allow_manager: bool = True):
    """
    Helper function to check if user can access a specific resource
    
    Args:
        current_user: The authenticated user
        resource_owner_id: The ID of the user who owns the resource
        allow_manager: Whether managers should have access (default: True)
    
    Returns:
        bool: True if access allowed
    
    Raises:
        HTTPException: If access denied
    """
    # Admins can access everything
    if current_user.role == "Admin":
        return True
    
    # Managers can access if allowed
    if allow_manager and current_user.role == "Manager":
        return True
    
    # Users can access their own resources
    if current_user.id == resource_owner_id:
        return True
    
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="You don't have permission to access this resource"
    )


def filter_data_by_role(current_user, data_list, owner_id_field: str = "agent_id"):
    """
    Filter data based on user role
    
    Args:
        current_user: The authenticated user
        data_list: List of data to filter
        owner_id_field: Field name that contains the owner ID
    
    Returns:
        Filtered list based on user permissions
    """
    # Admin and Manager can see all data
    if current_user.role in ["Admin", "Manager"]:
        return data_list
    
    # Agents can only see their own data
    if current_user.role == "Agent":
        return [item for item in data_list if getattr(item, owner_id_field, None) == current_user.id]
    
    return []