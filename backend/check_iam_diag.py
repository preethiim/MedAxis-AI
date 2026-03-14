import google.auth
from google.auth.transport.requests import Request
from google.oauth2 import id_token
import firebase_admin
from firebase_admin import credentials, auth
import os

def check_identity():
    print("--- Diagnostic Info ---")
    try:
        # 1. Check ADC Identity
        cred, project = google.auth.default()
        print(f"Project ID: {project}")
        
        # Refresh to get identity info if possible
        if not cred.valid:
            cred.refresh(Request())
            
        print(f"Credential Type: {type(cred).__name__}")
        
        if hasattr(cred, 'service_account_email'):
            print(f"Service Account Email: {cred.service_account_email}")
        elif hasattr(cred, 'signer_email'):
             print(f"Signer Email: {cred.signer_email}")
        else:
            print("No service account email found in credentials object (likely using user account or ADC).")
            
        # 2. Check Firebase SDK Discovery
        if not firebase_admin._apps:
            firebase_admin.initialize_app(options={'projectId': project})
            
        try:
             # This will fail with the permission error, but we want to see the service account it TRIES to use
             # Actually create_custom_token doesn't tell us unless we look at internal logs, 
             # but we can try to guess it.
             print("Attempting to create custom token...")
             auth.create_custom_token("diagnostic-test")
             print("✅ Success! (Wait, it worked now?)")
        except Exception as e:
            print(f"❌ Failed as expected (or unexpectedly).")
            print(f"Error: {e}")
            
    except Exception as e:
        print(f"Error during diagnostics: {e}")

if __name__ == "__main__":
    check_identity()
