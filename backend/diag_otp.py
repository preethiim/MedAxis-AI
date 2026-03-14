import os
from dotenv import load_dotenv
from routers.auth_helpers import send_email_otp

load_dotenv()

def diagnostic():
    sender = os.getenv("EMAIL_SENDER")
    pwd = os.getenv("EMAIL_APP_PASSWORD")
    
    print(f"DIAGNOSTIC: SENDER={sender}")
    # Don't print full password for security, just check length
    print(f"DIAGNOSTIC: PWD_LENGTH={len(pwd) if pwd else 0}")
    
    test_target = "nskartik007@gmail.com" # The user's email from Firestore
    otp = "888888"
    
    print(f"Attempting to send OTP to {test_target}...")
    success = send_email_otp(test_target, otp)
    
    if success:
        print("RESULT: SUCCESS - Email sent according to smtplib.")
    else:
        print("RESULT: FAILURE - Check error logs above.")

if __name__ == "__main__":
    diagnostic()
