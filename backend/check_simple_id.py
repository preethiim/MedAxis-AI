import google.auth
import os

def check_identity():
    print("--- Identity Check ---")
    try:
        cred, project = google.auth.default()
        print(f"Project ID: {project}")
        print(f"Credential Type: {type(cred).__name__}")
        
        # Identity identification
        if hasattr(cred, 'service_account_email'):
             print(f"Identity: {cred.service_account_email} (Service Account)")
        elif hasattr(cred, 'signer_email'):
             print(f"Identity: {cred.signer_email} (Signer)")
        else:
             # Try to get from environment
             print(f"Identity: Likely User/ADC (Not a service account key)")
             print(f"GOOGLE_APPLICATION_CREDENTIALS: {os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')}")
             
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    check_identity()
