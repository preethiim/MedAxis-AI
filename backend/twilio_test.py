import os
from dotenv import load_dotenv
from routers.auth_helpers import send_sms

load_dotenv()

def test_twilio():
    # Attempt to force IPv4 if DNS is acting up
    import socket
    old_getaddrinfo = socket.getaddrinfo
    def new_getaddrinfo(*args, **kwargs):
        responses = old_getaddrinfo(*args, **kwargs)
        return [r for r in responses if r[0] == socket.AF_INET]
    socket.getaddrinfo = new_getaddrinfo

    test_number = "9892101300"
    message = "DEMO: MedAxis AI Twilio integration is active! Your security OTP is: 123456"
    
    print(f"Testing Twilio SMS to {test_number}...")
    success = send_sms(test_number, message)
    
    if success:
        print("\nSUCCESS: Demo message sent successfully via Twilio!")
    else:
        print("\nFAILURE: Failed to send demo message. Check terminal for errors.")

if __name__ == "__main__":
    test_twilio()
