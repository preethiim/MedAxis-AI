import os
from dotenv import load_dotenv
from routers.auth_helpers import send_email_otp

load_dotenv()

def test_email():
    test_email = os.getenv("EMAIL_SENDER") # Send to self for test
    if not test_email or "@" not in test_email:
        print("Please set EMAIL_SENDER in .env before running this test.")
        return

    otp = "123456"
    print(f"Testing Email OTP to {test_email}...")
    success = send_email_otp(test_email, otp)
    
    if success:
        print("\nSUCCESS: Email OTP sent successfully!")
    else:
        print("\nFAILURE: Failed to send email. Check if your App Password is correct.")

if __name__ == "__main__":
    test_email()
