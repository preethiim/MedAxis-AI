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
from routers.auth_helpers import RegisterRequest


@app.post("/auth/register")
def register_user(req: RegisterRequest):
    """
    Registers a user directly via FastAPI to bypass Firebase Cloud Functions
    HTTP limitations. Handles Auth user creation, custom claims, and Firestore init.
    """
    from fastapi import HTTPException

    if not req.email or not req.password or not req.role:
        raise HTTPException(status_code=400, detail="Missing essential fields: email, password, or role.")
    if req.role not in ["patient", "doctor", "hospital", "superadmin"]:
        raise HTTPException(status_code=400, detail="Invalid role provided.")

    try:
        from firebase_admin import auth
        user_record = auth.create_user(email=req.email, password=req.password, display_name=req.name)
        auth.set_custom_user_claims(user_record.uid, {"role": req.role})

        db = firestore.client()
        user_data = {
            "uid": user_record.uid,
            "role": req.role,
            "email": req.email,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        if req.name:
            user_data["name"] = req.name
        if req.role == "patient":
            generated_health_id = "PAT-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            user_data["healthId"] = req.healthId if req.healthId else generated_health_id
            user_data["height"] = req.height
            user_data["weight"] = req.weight
            user_data["bmi"] = req.bmi
        elif req.role == "hospital":
            user_data["employeeId"] = req.employeeId
        elif req.role == "doctor":
            user_data["doctorId"] = "DOC-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))

        db.collection("users").document(user_record.uid).set(user_data)
        return {"success": True, "uid": user_record.uid, "message": f"User {req.role} registered successfully"}
    except Exception as e:
        error_msg = str(e)
        if "EMAIL_EXISTS" in error_msg:
            raise HTTPException(status_code=400, detail="The email address is already in use by another account.")
        raise HTTPException(status_code=500, detail=f"Registration failed: {error_msg}")


# ─── Register Routers ─────────────────────────────────────────────────────────

from routers import patient, doctor, hospital, superadmin

app.include_router(patient.router)
app.include_router(doctor.router)
app.include_router(hospital.router)
app.include_router(superadmin.router)
