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
    """Verify the caller is a doctor and return their UID."""
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "")
        if role != "doctor":
            raise HTTPException(status_code=403, detail="Unauthorized: Only doctors can perform this action.")
        return decoded_token.get("uid")
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


# ─── Shared Request Models ────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    name: str = ""
    email: str
    password: str
    role: str = "patient"   # always overridden server-side to 'patient' on /auth/register
    healthId: str = ""
    employeeId: str = ""
    height: str = ""
    weight: str = ""
    bmi: str = ""


class PatientRequest(BaseModel):
    uid: str
    firstName: str = ""
    lastName: str = ""
    gender: str = ""
    birthDate: str = ""
    healthId: str = ""


class VitalsRequest(BaseModel):
    uid: str
    height_cm: float
    weight_kg: float


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


# ─── Shared Constants ─────────────────────────────────────────────────────────

REWARD_TIERS = [
    (15000, 50),
    (10000, 25),
    (5000, 10),
]
