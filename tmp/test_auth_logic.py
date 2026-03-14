
import firebase_admin
from firebase_admin import credentials, firestore, auth
import requests
import json
import os

# Initialize Firebase (assuming local credentials or default)
# For this test, we just want to verify the logic in a controlled way if possible
# or just mock the dependencies.

def test_normalize_phone():
    from routers.auth_helpers import normalize_phone
    assert normalize_phone("+91 98765-43210") == "9876543210"
    assert normalize_phone("9876543210") == "9876543210"
    assert normalize_phone("12345") == "12345"
    print("test_normalize_phone PASSED")

def test_registration_payload():
    # Mocking the build_standard_user_doc logic
    from routers.auth_helpers import build_standard_user_doc
    
    uid = "test_uid_123"
    role = "patient"
    email = "test@example.com"
    name = "Test User"
    profile_image = "https://example.com/photo.jpg"
    phone = "9876543210"
    
    doc = build_standard_user_doc(
        uid=uid,
        role=role,
        email=email,
        name=name,
        profileImage=profile_image,
        phoneNumber=phone
    )
    
    assert doc["profileImage"] == profile_image
    assert doc["role"] == "patient"
    assert doc["email"] == email
    print("test_registration_payload PASSED")

if __name__ == "__main__":
    # We need to add backend to sys.path to import routers
    import sys
    sys.path.append(os.path.join(os.getcwd(), 'backend'))
    
    try:
        test_normalize_phone()
        test_registration_payload()
        print("\nAll backend logic tests PASSED.")
    except Exception as e:
        print(f"\nTests FAILED: {e}")
