"""
Script to create the first admin user for CallEval system
Run this script once after deploying to create your initial admin account
"""
import sys
import uuid
from datetime import datetime

# Add parent directory to path to import modules
sys.path.append('.')

from database import SessionLocal, User
from auth import get_password_hash


def create_admin_user():
    """Create the first admin user"""
    db = SessionLocal()
    
    try:
        # Check if admin already exists
        existing_admin = db.query(User).filter(User.role == "Admin").first()
        if existing_admin:
            print("⚠️  Admin user already exists!")
            print(f"   Email: {existing_admin.email}")
            print(f"   Username: {existing_admin.username}")
            response = input("\nDo you want to create another admin? (y/n): ")
            if response.lower() != 'y':
                print("Cancelled.")
                return
        
        # Get user input
        print("\n" + "="*50)
        print("CREATE FIRST ADMIN USER")
        print("="*50)
        
        email = input("\nEnter admin email: ").strip()
        username = input("Enter admin username: ").strip()
        full_name = input("Enter admin full name: ").strip()
        password = input("Enter admin password (8-72 chars): ").strip()
        
        # Validate inputs
        if not all([email, username, full_name, password]):
            print("❌ All fields are required!")
            return
        
        if len(password) < 8:
            print("❌ Password must be at least 8 characters long!")
            return
        
        if len(password) > 72:
            print("❌ Password cannot be longer than 72 characters!")
            print("   (This is a bcrypt security limitation)")
            return
        
        if len(password) > 50:
            print("❌ Password is too long! Please use 8-50 characters.")
            return
        
        # Check for valid password complexity
        if not any(c.isdigit() for c in password):
            print("⚠️  Warning: Password should contain at least one number")
        
        if not any(c.isupper() for c in password):
            print("⚠️  Warning: Password should contain at least one uppercase letter")
        
        # Check if email or username already exists
        existing_email = db.query(User).filter(User.email == email).first()
        if existing_email:
            print(f"❌ Email {email} is already registered!")
            return
        
        existing_username = db.query(User).filter(User.username == username).first()
        if existing_username:
            print(f"❌ Username {username} is already taken!")
            return
        
        # Create admin user
        admin_user = User(
            id=str(uuid.uuid4()),
            email=email,
            username=username,
            hashed_password=get_password_hash(password),
            full_name=full_name,
            role="Admin",
            is_active=True,
            created_at=datetime.utcnow()
        )
        
        db.add(admin_user)
        db.commit()
        
        print("\n" + "="*50)
        print("✅ ADMIN USER CREATED SUCCESSFULLY!")
        print("="*50)
        print(f"\nEmail:    {email}")
        print(f"Username: {username}")
        print(f"Role:     Admin")
        print(f"\n🔐 Please save these credentials securely!")
        print(f"   You can now login at: http://localhost:5173/login")
        print("="*50)
        
    except Exception as e:
        print(f"\n❌ Error creating admin user: {str(e)}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    create_admin_user()