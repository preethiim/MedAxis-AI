from firebase_config import initialize_firebase
from firebase_admin import auth
import os

def test_sign_blob():
    print("Testing IAM signBlob permission by attempting to create a custom token...")
    try:
        # Initialize Firebase using the actual app logic
        initialize_firebase()
        
        # Attempt to create a custom token for a dummy UID
        # This triggers the signBlob internally
        token = auth.create_custom_token("test-id")
        print("SUCCESS: Custom token generated successfully. IAM permission is active.")
        return True
    except Exception as e:
        print(f"FAILED: Still getting permission error.")
        print(f"Error detail: {e}")
        return False

if __name__ == "__main__":
    test_sign_blob()
