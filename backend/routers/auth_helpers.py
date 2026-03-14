# routers/auth_helpers.py
# ─────────────────────────────────────────────────────────────────────────────
# Shared authentication dependency functions and all Pydantic request models.
# Import these in each router file.
# ─────────────────────────────────────────────────────────────────────────────

import random
import string
from typing import List, Optional

from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from pydantic import BaseModel as PydanticBaseModel

security = HTTPBearer()


# ─── ID Generation Helpers ────────────────────────────────────────────────────

def _random_digits(n: int) -> str:
    """Return n random decimal digits."""
    return ''.join(random.choices(string.digits, k=n))

def _random_alphanum(n: int) -> str:
    """Return n random uppercase letters + digits."""
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=n))

def normalize_phone(phone: str) -> str:
    """
    Standardizes phone numbers to the last 10 digits.
    Useful for Fast2SMS and consistent Firestore lookups in India.
    """
    if not phone:
        return ""
    digits = "".join(filter(str.isdigit, phone))
    return digits[-10:] if len(digits) >= 10 else digits

def send_sms(to_number: str, message: str):
    """
    Sends an SMS using Twilio.
    Expects TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env.
    """
    import os
    import socket
    from twilio.rest import Client
    
    # Force IPv4 for reliable resolution on this machine
    old_getaddrinfo = socket.getaddrinfo
    def new_getaddrinfo(*args, **kwargs):
        responses = old_getaddrinfo(*args, **kwargs)
        return [r for r in responses if r[0] == socket.AF_INET]
    socket.getaddrinfo = new_getaddrinfo
    
    account_sid = os.getenv("TWILIO_ACCOUNT_SID")
    auth_token = os.getenv("TWILIO_AUTH_TOKEN")
    from_number = os.getenv("TWILIO_PHONE_NUMBER")
    
    if not account_sid or not auth_token or not from_number:
        print(f"ERROR: Twilio credentials missing. Message would have been: {message}")
        return False
        
    try:
        # Ensure number has +91 if it's 10 digits
        if len(to_number) == 10:
            to_number = f"+91{to_number}"
            
        client = Client(account_sid, auth_token)
        msg = client.messages.create(
            body=message,
            from_=from_number,
            to=to_number
        )
        print(f"DEBUG: Twilio SMS sent. SID: {msg.sid}")
        return True
    except Exception as e:
        import traceback
        print(f"ERROR: Twilio failed: {e}")
        traceback.print_exc()
        return False

def send_email_otp(to_email: str, otp_code: str):
    """
    Sends an OTP via email using SMTP (e.g., Gmail App Password).
    Expects EMAIL_SENDER and EMAIL_APP_PASSWORD in .env.
    """
    import os
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    sender_email = os.getenv("EMAIL_SENDER")
    sender_password = os.getenv("EMAIL_APP_PASSWORD")

    if not sender_email or not sender_password:
        print(f"ERROR: Email credentials missing. OTP {otp_code} for {to_email} not sent.")
        return False

    message = MIMEMultipart("alternative")
    message["Subject"] = "MedAxis AI - Your Security OTP"
    message["From"] = f"MedAxis AI <{sender_email}>"
    message["To"] = to_email

    text = f"Your MedAxis AI security OTP is: {otp_code}\n\nThis code is valid for 5 minutes. If you did not request this, please ignore this email."
    html = f"""
    <html>
    <body style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 20px;">
        <div style="background-color: #ffffff; padding: 30px; border-radius: 12px; max-width: 500px; margin: auto; border: 1px solid #e0e0e0;">
            <h2 style="color: #6366f1; text-align: center;">MedAxis AI Security</h2>
            <p style="font-size: 1.1rem; color: #333 text-align: center;">Your one-time security code is:</p>
            <div style="background-color: #f0fdf4; border: 2px dashed #10b981; padding: 15px; text-align: center; font-size: 2rem; font-weight: bold; color: #059669; letter-spacing: 5px; margin: 20px 0;">
                {otp_code}
            </div>
            <p style="font-size: 0.9rem; color: #666; text-align: center;">This code is valid for <b>5 minutes</b>.</p>
            <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;">
            <p style="font-size: 0.8rem; color: #999; text-align: center;">If you didn't request this code, you can safely ignore this email.</p>
        </div>
    </body>
    </html>
    """

    message.attach(MIMEText(text, "plain"))
    message.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(sender_email, sender_password)
            server.sendmail(sender_email, to_email, message.as_string())
        print(f"DEBUG: Email OTP sent to {to_email}")
        return True
    except Exception as e:
        print(f"ERROR: Failed to send email OTP: {e}")
        return False

def generate_unique_id(db, field: str, prefix: str, length: int, digits_only: bool = False) -> str:
    """
    Generate a prefixed ID that is guaranteed unique within the users collection.
    Retries up to 10 times before raising RuntimeError.
    """
    for _ in range(10):
        suffix = _random_digits(length) if digits_only else _random_alphanum(length)
        candidate = f"{prefix}{suffix}"
        # Check uniqueness
        existing = list(db.collection("users").where(field, "==", candidate).limit(1).stream())
        if not existing:
            return candidate
    raise RuntimeError(f"Could not generate a unique {field} after 10 attempts. Please retry.")


# ─── Auth Dependencies ────────────────────────────────────────────────────────

def get_current_patient_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "patient")
        if role != "patient":
            raise HTTPException(status_code=403, detail="Unauthorized: Only patients can access their reports.")
        return decoded_token.get("uid")
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def get_current_doctor_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """
    Verify the caller is a doctor with a valid hospitalId.
    Raises 403 if:
      - token role != 'doctor'
      - Firestore user doc has no hospitalId (unaffiliated doctor)
    """
    try:
        from firebase_admin import auth, firestore as fb_firestore
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "")
        if role != "doctor":
            raise HTTPException(status_code=403, detail="Unauthorized: Only doctors can perform this action.")
        uid = decoded_token.get("uid")

        # Verify doctor has a hospitalId on file — unaffiliated doctors are blocked
        db = fb_firestore.client()
        doc = db.collection("users").document(uid).get()
        if not doc.exists:
            raise HTTPException(status_code=403, detail="Doctor profile not found. Please contact your hospital admin.")
        doctor_data = doc.to_dict()
        if not doctor_data.get("hospitalId"):
            raise HTTPException(
                status_code=403,
                detail="Doctor is not affiliated with any hospital. "
                       "Contact your hospital admin to complete account setup."
            )
        return uid
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def get_current_hospital_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "")
        if role != "hospital":
            raise HTTPException(status_code=403, detail="Unauthorized: Only hospital administrators can access this.")
        return decoded_token.get("uid")
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def get_current_superadmin_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "")
        if role != "superadmin":
            raise HTTPException(status_code=403, detail="Unauthorized: Super Admin access required.")
        return decoded_token.get("uid")
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")


def get_any_authenticated_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    """Accepts a valid Firebase ID token from any role (patient/doctor/hospital/superadmin)."""
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        return decoded_token.get("uid")
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication required. Please provide a valid token.")


def get_authenticated_user_info(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """
    Returns {"uid": str, "role": str} for any valid Firebase ID token.
    Used by endpoints that need role-aware access control beyond a single-role gate.
    """
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        return {
            "uid": decoded_token.get("uid"),
            "role": decoded_token.get("role", ""),
        }
    except Exception:
        raise HTTPException(status_code=401, detail="Authentication required. Please provide a valid token.")


# ─── Shared Request Models ────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str = ""
    email: str
    password: str
    role: str = "patient"   # always overridden server-side to 'patient' on /auth/register
    healthId: str = ""
    employeeId: str = ""
    phoneNumber: str = ""
    profileImage: str = ""
    height: str = ""
    weight: str = ""
    bmi: str = ""


class PatientRequest(BaseModel):
    uid: str
    firstName: Optional[str] = ""
    lastName: Optional[str] = ""
    gender: Optional[str] = ""
    birthDate: Optional[str] = ""
    healthId: Optional[str] = ""


class OTPGenerateRequest(BaseModel):
    uid: str


class OTPVerifyRequest(BaseModel):
    uid: str
    otp: str


class PhoneOTPGenerateRequest(BaseModel):
    phoneNumber: str


class PhoneOTPVerifyRequest(BaseModel):
    phoneNumber: str
    otp: str


class VitalsRequest(BaseModel):
    uid: str
    height_cm: Optional[float] = None
    weight_kg: Optional[float] = None
    heartRate: Optional[float] = None
    oxygen: Optional[float] = None


class LabValues(BaseModel):
    hemoglobin: float = None
    vitaminD: float = None
    glucose: float = None


class DiagnosticReportRequest(BaseModel):
    uid: str
    labValues: LabValues


class DoctorCommentRequest(BaseModel):
    doctor_uid: str
    patient_uid: str
    report_id: str
    comment: str


class PrescriptionCommentRequest(BaseModel):
    doctor_uid: str
    patient_uid: str
    prescription_id: str
    comment: str


class RoleAssignRequest(BaseModel):
    assigner_uid: str
    target_uid: str
    role: str


class PatientAssignRequest(BaseModel):
    hospital_uid: str
    doctor_uid: str
    patient_uid: str


class PatientConsentRequest(BaseModel):
    doctor_uid: str
    granted: bool = True


class AlertResolveRequest(BaseModel):
    doctor_uid: str
    alert_id: str


class StepLogRequest(BaseModel):
    steps: int


class SyncStepsRequest(BaseModel):
    google_access_token: str


class MedicationItem(PydanticBaseModel):
    name: str
    dosage: str
    frequency: str
    duration: str


class PrescriptionRequest(PydanticBaseModel):
    patient_uid: str
    medications: List[MedicationItem]
    notes: Optional[str] = ""


class SuperAdminCreateUserRequest(BaseModel):
    name: str = ""
    email: str
    password: str
    role: str  # "patient" | "doctor" | "hospital"


class CreateDoctorRequest(BaseModel):
    """Used by hospitals to create a new doctor account."""
    name: str = ""
    email: str
    password: str

class DoctorProfileUpdateRequest(BaseModel):
    specialization: Optional[str] = None
    qualification: Optional[str] = None
    yearsOfExperience: Optional[int] = None
    bio: Optional[str] = None


# ─── Shared Constants ─────────────────────────────────────────────────────────

REWARD_TIERS = [
    (15000, 50),
    (10000, 25),
    (5000, 10),
]


# ─── Schema Standardization ───────────────────────────────────────────────────

def build_standard_user_doc(
    uid: str,
    role: str,
    email: str,
    name: str = "",
    created_by: str = "",
    **kwargs
) -> dict:
    """
    Constructs a standardized Firestore user document conforming to:
    {
      role: "patient" | "doctor" | "hospital" | "superadmin",
      fullName: "", email: "", profileImage: "",
      hospitalId: "", doctorId: "", employeeId: "", healthId: "",
      specialization: "", qualification: "", yearsOfExperience: 0,
      bio: "", createdBy: ""
    }
    Enforces that specific IDs exist only for specific roles.
    """
    from firebase_admin import firestore
    
    doc = {
        "uid": uid,
        "role": role,
        "fullName": name,
        "name": name,  # Kept for backward compatibility
        "email": email,
        "profileImage": kwargs.get("profileImage", ""),
        "specialization": kwargs.get("specialization", ""),
        "qualification": kwargs.get("qualification", ""),
        "yearsOfExperience": kwargs.get("yearsOfExperience", 0),
        "bio": kwargs.get("bio", ""),
        "createdBy": created_by,
        "createdAt": firestore.SERVER_TIMESTAMP,
    }

    # Conditionally inject IDs based on role
    if role == "patient":
        doc["healthId"] = kwargs.get("healthId", "")
    elif role == "doctor":
        doc["doctorId"] = kwargs.get("doctorId", "")
        doc["employeeId"] = kwargs.get("employeeId", "")
        doc["hospitalId"] = kwargs.get("hospitalId", "")
        if "hospitalUid" in kwargs:
            doc["hospitalUid"] = kwargs["hospitalUid"]
    elif role == "hospital":
        # Hospitals historically need their own hospitalId to assign doctors
        if "hospitalId" in kwargs:
            doc["hospitalId"] = kwargs["hospitalId"]

    # Merge any other legacy fields (like height, weight) without overriding standards
    for k, v in kwargs.items():
        if k not in doc and k not in ["healthId", "doctorId", "employeeId", "hospitalId", "hospitalUid"]:
            doc[k] = v

    return doc
