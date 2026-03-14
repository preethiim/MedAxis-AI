import firebase_admin
from firebase_admin import auth, credentials
import os

def test_sign_blob():
    print("Testing IAM signBlob permission by attempting to create a custom token...")
    try:
        # Initialize Firebase if not already
        if not firebase_admin._apps:
            # We use the project ID from environment or default
            project_id = os.environ.get("VITE_FIREBASE_PROJECT_ID", "medaxis-ai")
            firebase_admin.initialize_app(options={'projectId': project_id})
        
        # Attempt to create a custom token for a dummy UID
        # This triggers the signBlob internally
        token = auth.create_custom_token("test-id")
        print("✅ SUCCESS: Custom token generated successfully. IAM permission is active.")
        return True
    except Exception as e:
        print(f"❌ FAILED: Still getting permission error.")
        print(f"Error detail: {e}")
        return False

if __name__ == "__main__":
    test_sign_blob()
