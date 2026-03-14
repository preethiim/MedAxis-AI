import os
import firebase_admin
from firebase_admin import credentials

import json
from dotenv import load_dotenv

# Load environment variables to ensure GOOGLE_APPLICATION_CREDENTIALS is found
load_dotenv()

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
                # Production (Render): Parse the JSON string from the environment variable
                cert_dict = json.loads(os.environ.get("FIREBASE_CREDENTIALS_JSON"))
                cred = credentials.Certificate(cert_dict)
                print("Using FIREBASE_CREDENTIALS_JSON for Firebase Auth")
            elif os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
                cred_path = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
                # If relative path, make it absolute based on this file's directory
                if not os.path.isabs(cred_path):
                    backend_dir = os.path.dirname(os.path.abspath(__file__))
                    abs_path = os.path.join(backend_dir, cred_path)
                    if os.path.exists(abs_path):
                        cred_path = abs_path
                
                if os.path.exists(cred_path):
                    # Local Development: Read explicitly from JSON key file
                    # This avoids IAM signBlob permission issues as signing happens locally
                    cred = credentials.Certificate(cred_path)
                    print(f"Using service account key file: {cred_path}")
                else:
                    print(f"Key file not found at: {cred_path}. Falling back to ADC.")
                    cred = credentials.ApplicationDefault()
            else:
                # Cloud Run / GCP or Fallback: Use Application Default Credentials
                cred = credentials.ApplicationDefault()
                print("Using Application Default Credentials (Cloud Run/GCP/ADC)")
            
            # Allow bucket customization via environment, default to MedAxis
            bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET", "medaxis-ai.firebasestorage.app")
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
