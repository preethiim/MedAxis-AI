import requests
import os
from dotenv import load_dotenv

load_dotenv()

def test_fast2sms():
    api_key = os.getenv("FAST2SMS_API_KEY")
    if not api_key:
        print("ERROR: FAST2SMS_API_KEY not found in .env")
        return

    print(f"Testing Fast2SMS with API Key: {api_key[:10]}...")
    
    # Let's try to get account balance or a test message
    # Route 'otp' is for OTPs in Fast2SMS
    # Route 'q' is Transactional
    
    test_number = input("Enter a 10-digit phone number to send a test OTP to: ")
    if len(test_number) != 10:
        print("Invalid number. Please enter 10 digits.")
        return

    # Try Route 'otp' first as it's specifically for OTPs
    print("\n--- Trying Route: otp ---")
    otp_code = "123456"
    url = "https://www.fast2sms.com/dev/bulkV2"
    params = {
        "authorization": api_key,
        "route": "otp",
        "variables_values": otp_code,
        "numbers": test_number
    }
    
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

    # Try Route 'q' (Transactional)
    print("\n--- Trying Route: q (Transactional) ---")
    params = {
        "authorization": api_key,
        "route": "q",
        "message": f"Test MedAxis OTP: {otp_code}",
        "language": "english",
        "flash": 0,
        "numbers": test_number
    }
    
    try:
        response = requests.get(url, params=params)
        print(f"Status Code: {response.status_code}")
        print(f"Response Body: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_fast2sms()
