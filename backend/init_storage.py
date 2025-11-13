"""
Startup initialization for persistent storage
This ensures all necessary directories exist on Render's persistent disk
"""
import os
from config import settings

def initialize_persistent_storage():
    """
    Create persistent storage directories on startup
    This runs before FastAPI app starts
    """
    print("🔧 Initializing persistent storage...")
    
    # Check if persistent disk is mounted
    if os.path.exists("/data"):
        print("✓ Persistent disk detected at /data")
        
        # Create necessary subdirectories
        directories = [
            "/data/uploads",  # Audio files
            "/data"  # Database will be here
        ]
        
        for directory in directories:
            try:
                os.makedirs(directory, exist_ok=True)
                print(f"✓ Created/verified directory: {directory}")
            except Exception as e:
                print(f"⚠ Warning: Could not create {directory}: {e}")
    
    else:
        print("⚠ No persistent disk found - using ephemeral storage")
        print("  Data will be lost on redeploy!")
    
    # Create upload directory (works for both persistent and local)
    try:
        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        print(f"✓ Upload directory ready: {settings.UPLOAD_DIR}")
    except Exception as e:
        print(f"❌ Error creating upload directory: {e}")
    
    print(f"✓ Using database at: {settings.DATABASE_URL}")
    print("✅ Storage initialization complete!\n")

# Don't run on import - should be called explicitly from main.py startup