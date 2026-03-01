import os
import firebase_admin
from firebase_admin import credentials

def initialize_firebase():
    """
    Initializes the Firebase Admin SDK using the credentials
    specified by the environment variable GOOGLE_APPLICATION_CREDENTIALS.
    """
    if not firebase_admin._apps:
        # Check if GOOGLE_APPLICATION_CREDENTIALS is set
        if not os.environ.get("GOOGLE_APPLICATION_CREDENTIALS"):
            print("WARNING: GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.")
            print("Be sure to set it to the path of your Firebase service account JSON key file.")
            
        try:
            cred = credentials.ApplicationDefault()
            
            # Allow bucket customization via environment, default to MedAxis
            bucket_name = os.environ.get("FIREBASE_STORAGE_BUCKET", "medaxis-ai-4faec.firebasestorage.app")
            project_id = os.environ.get("VITE_FIREBASE_PROJECT_ID", "medaxis-ai-4faec")
            
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
