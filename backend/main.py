# main.py
# ─────────────────────────────────────────────────────────────────────────────
# Application entrypoint. Initialises Firebase, wires up CORS, and registers
# all APIRouter modules. Run with: uvicorn main:app --reload
# ─────────────────────────────────────────────────────────────────────────────

import random
import string
from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_config import initialize_firebase

# Initialise Firebase Admin SDK before any router imports touch it
initialize_firebase()

app = FastAPI(
    title="MedAxis AI Backend",
    description="FastAPI service for the MedAxis AI Platform",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Root / Health ────────────────────────────────────────────────────────────

@app.get("/")
def read_root():
    return {"message": "Welcome to MedAxis AI Backend"}


@app.get("/health")
def health_check():
    """Basic health check endpoint to verify backend status."""
    return {"status": "ok", "service": "MedAxis AI Backend"}


# ─── Auth Register ────────────────────────────────────────────────────────────
# Kept in main.py because it is a public endpoint with no router grouping.

from pydantic import BaseModel
from firebase_admin import firestore
from routers.auth_helpers import RegisterRequest, generate_unique_id, build_standard_user_doc


@app.post("/auth/register")
def register_user(req: RegisterRequest):
    """
    Public self-registration endpoint — patients ONLY.
    - Doctor accounts must be created by a hospital via POST /hospital/create-doctor.
    - Hospital accounts must be created by a superadmin via POST /superadmin/create-user.
    Role is enforced server-side regardless of what the client sends.
    """
    from fastapi import HTTPException

    if not req.email or not req.password:
        raise HTTPException(status_code=400, detail="Missing essential fields: email and password are required.")

    # ── Server-side role gate ──────────────────────────────────────────────────
    if req.role in ("doctor", "hospital", "superadmin"):
        raise HTTPException(
            status_code=403,
            detail=(
                "Self-registration is not allowed for this role. "
                "Doctor accounts are created by hospitals. "
                "Hospital accounts are created by super admins."
            ),
        )

    # Only patients reach here
    if req.role != "patient":
        raise HTTPException(status_code=400, detail="Invalid role. Only 'patient' self-registration is allowed.")

    try:
        from firebase_admin import auth
        user_record = auth.create_user(email=req.email, password=req.password, display_name=req.name)
        auth.set_custom_user_claims(user_record.uid, {"role": "patient"})

        db = firestore.client()
        health_id = generate_unique_id(db, "healthId", "PAT-", 6)
        
        user_data = build_standard_user_doc(
            uid=user_record.uid,
            role="patient",
            email=req.email,
            name=req.name,
            healthId=health_id,
            height=req.height,
            weight=req.weight,
            bmi=req.bmi
        )

        db.collection("users").document(user_record.uid).set(user_data)
        return {
            "success": True,
            "uid": user_record.uid,
            "healthId": health_id,
            "message": "Patient account registered successfully",
        }
    except Exception as e:
        error_msg = str(e)
        if "EMAIL_EXISTS" in error_msg or "email-already-exists" in error_msg:
            raise HTTPException(status_code=400, detail="The email address is already in use by another account.")
        raise HTTPException(status_code=500, detail=f"Registration failed: {error_msg}")


# ─── Register Routers ─────────────────────────────────────────────────────────

from routers import patient, doctor, hospital, superadmin

app.include_router(patient.router)
app.include_router(doctor.router)
app.include_router(hospital.router)
app.include_router(superadmin.router)
