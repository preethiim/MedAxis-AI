import os
import firebase_admin
from firebase_admin import credentials

import json

def initialize_firebase():
    """
    Initializes the Firebase Admin SDK.
    Checks for `FIREBASE_CREDENTIALS_JSON` (used in production on Render).
    Falls back to `GOOGLE_APPLICATION_CREDENTIALS` (used locally).
    """
    if not firebase_admin._apps:
        try:
            cred = None
            if os.environ.get("FIREBASE_CREDENTIALS_JSON"):
                # Production: Parse the JSON string from the environment variable
                cert_dict = json.loads(os.environ.get("FIREBASE_CREDENTIALS_JSON"))
                cred = credentials.Certificate(cert_dict)
                print("Using FIREBASE_CREDENTIALS_JSON for Firebase Auth")
            elif os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                # Local Development: Read from path
                cred = credentials.ApplicationDefault()
                print("Using GOOGLE_APPLICATION_CREDENTIALS for Firebase Auth")
            else:
                print("WARNING: Neither FIREBASE_CREDENTIALS_JSON nor GOOGLE_APPLICATION_CREDENTIALS are set.")
                return
            
            # Allow bucket customization via environment, default to MedAxis
            bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET", "medaxis-ai.appspot.com")
            project_id = os.environ.get("VITE_FIREBASE_PROJECT_ID", "medaxis-ai")
            
            # Explicitly pass project_id to fix "A project ID is required" local errors
            firebase_admin.initialize_app(cred, {
                'storageBucket': bucket_name,
                'projectId': project_id
            })
            print("Firebase Admin SDK initialized successfully with Storage and Project ID.")
        except Exception as e:
            print(f"Failed to initialize Firebase Admin SDK: {e}")

# Note: The function can be called on import if needed, 
# but it's often better to call it explicitly in the main app file.
