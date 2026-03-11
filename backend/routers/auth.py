from fastapi import APIRouter, HTTPException, Depends
from firebase_admin import firestore, auth
import random
import requests
import os
import uuid
from datetime import datetime, timedelta
from .auth_helpers import PhoneOTPGenerateRequest, PhoneOTPVerifyRequest

router = APIRouter(prefix="/auth", tags=["auth"])

@router.post("/phone/generate-otp")
def generate_phone_otp(req: PhoneOTPGenerateRequest):
    """
    1. Search for a user with the given phone number.
    2. Generate a 6-digit OTP.
    3. Save OTP to Firestore with 5-min expiry.
    4. Send OTP via Fast2SMS.
    """
    try:
        db = firestore.client()
        
        # 1. Search for user by phone number
        # Note: We should handle both '+91' and raw '10-digit' matches if possible
        # For now, we expect exact match as stored in DB.
        users_ref = db.collection("users").where("phoneNumber", "==", req.phoneNumber).limit(1).stream()
        user_docs = list(users_ref)
        
        if not user_docs:
            # Also try without the +91 if the request has it
            if req.phoneNumber.startswith("+91"):
                clean_phone = req.phoneNumber.replace("+91", "").strip()
                users_ref = db.collection("users").where("phoneNumber", "==", clean_phone).limit(1).stream()
                user_docs = list(users_ref)
        
        if not user_docs:
            raise HTTPException(status_code=404, detail="User with this phone number not found.")
            
        user_data = user_docs[0].to_dict()
        uid = user_docs[0].id
        
        # 2. Generate OTP
        otp_code = str(random.randint(100000, 999999))
        
        # 3. Save to Firestore (expiry 5 mins)
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        db.collection("login_otps").document(uid).set({
            "otp": otp_code,
            "expires_at": expires_at,
            "created_at": firestore.SERVER_TIMESTAMP,
            "phoneNumber": req.phoneNumber
        })
        
        # 4. Send via Fast2SMS
        api_key = os.getenv("FAST2SMS_API_KEY")
        clean_phone_for_sms = req.phoneNumber.replace("+91", "").strip()
        
        if api_key and len(clean_phone_for_sms) >= 10:
            try:
                print(f"DEBUG: Sending OTP {otp_code} to {clean_phone_for_sms} via Fast2SMS...")
                response = requests.get(
                    "https://www.fast2sms.com/dev/bulkV2",
                    params={
                        "authorization": api_key,
                        "route": "otp",
                        "variables_values": otp_code,
                        "numbers": clean_phone_for_sms,
                        "flash": "0",
                        "schedule_time": ""
                    },
                    timeout=5
                )
                print(f"DEBUG: Fast2SMS Response: {response.status_code} - {response.text}")
            except Exception as e:
                print(f"ERROR: Fast2SMS failed: {e}")
        else:
            print(f"DEBUG: FAST2SMS_API_KEY missing or phone invalid. OTP: {otp_code}")
            
        return {"message": "OTP sent successfully", "success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/phone/verify-otp")
def verify_phone_otp(req: PhoneOTPVerifyRequest):
    """
    1. Find user by phone number.
    2. Verify OTP.
    3. Generate and return Firebase Custom Token.
    """
    try:
        db = firestore.client()
        
        # 1. Find UID
        users_ref = db.collection("users").where("phoneNumber", "==", req.phoneNumber).limit(1).stream()
        user_docs = list(users_ref)
        
        if not user_docs and req.phoneNumber.startswith("+91"):
            clean_phone = req.phoneNumber.replace("+91", "").strip()
            users_ref = db.collection("users").where("phoneNumber", "==", clean_phone).limit(1).stream()
            user_docs = list(users_ref)
            
        if not user_docs:
            raise HTTPException(status_code=404, detail="User not found.")
            
        uid = user_docs[0].id
        
        # 2. Verify OTP
        otp_ref = db.collection("login_otps").document(uid)
        otp_doc = otp_ref.get()
        
        if not otp_doc.exists:
            raise HTTPException(status_code=400, detail="No active OTP found. Please request a new one.")
            
        otp_data = otp_doc.to_dict()
        
        # Check Expiry
        expires_at = otp_data.get("expires_at")
        if isinstance(expires_at, str):
            expires_at = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            
        if datetime.utcnow().timestamp() > expires_at.timestamp():
            otp_ref.delete()
            raise HTTPException(status_code=400, detail="OTP expired.")
            
        if otp_data.get("otp") != req.otp:
            raise HTTPException(status_code=400, detail="Invalid OTP code.")
            
        # 3. Success -> Generate Custom Token
        custom_token = auth.create_custom_token(uid)
        
        # Cleanup
        otp_ref.delete()
        
        return {
            "success": True,
            "customToken": custom_token.decode('utf-8') if isinstance(custom_token, bytes) else custom_token,
            "uid": uid
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
