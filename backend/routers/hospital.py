# routers/hospital.py
# ─────────────────────────────────────────────────────────────────────────────
# All /hospital/* and /admin/* endpoints.
# ─────────────────────────────────────────────────────────────────────────────

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore, auth

from routers.auth_helpers import (
    get_current_hospital_uid,
    RoleAssignRequest,
    PatientAssignRequest,
)

router = APIRouter()


@router.get("/hospital/doctors")
def get_hospital_doctors(uid: str = Depends(get_current_hospital_uid)):
    """Returns a list of all users with the 'doctor' role, including patient assignment counts."""
    try:
        db = firestore.client()
        docs = db.collection("users").where("role", "==", "doctor").stream()
        doctors = []
        for doc in docs:
            doc_data = doc.to_dict()
            assignments = db.collection("doctor_assignments").document(doc.id).collection("patients").get()
            doctors.append({
                "uid": doc.id,
                "email": doc_data.get("email", ""),
                "name": doc_data.get("name", ""),
                "patient_count": len(assignments),
            })
        return {"doctors": doctors}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch doctors: {str(e)}")


@router.get("/hospital/patients")
def get_hospital_patients(uid: str = Depends(get_current_hospital_uid)):
    """Returns a list of all users with the 'patient' role."""
    try:
        db = firestore.client()
        docs = db.collection("users").where("role", "==", "patient").stream()
        patients = [{"uid": d.id, "email": d.to_dict().get("email", ""), "name": d.to_dict().get("name", "")} for d in docs]
        return {"patients": patients}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch patients: {str(e)}")


@router.get("/hospital/stats")
def get_hospital_stats(uid: str = Depends(get_current_hospital_uid)):
    """Returns aggregate stats: Total patients, doctors, reports, and high-risk reports."""
    try:
        db = firestore.client()
        total_patients = sum(1 for _ in db.collection("users").where("role", "==", "patient").stream())
        total_doctors = sum(1 for _ in db.collection("users").where("role", "==", "doctor").stream())
        total_reports = sum(1 for _ in db.collection_group("reports").stream())
        high_risk_reports = len(list(
            db.collection("alerts").where("status", "==", "unresolved").where("risk_level", "==", "High").stream()
        ))
        return {
            "total_patients": total_patients,
            "total_doctors": total_doctors,
            "total_reports": total_reports,
            "high_risk_reports": high_risk_reports,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch hospital stats: {str(e)}")


@router.get("/hospital/audit-logs")
def get_audit_logs(uid: str = Depends(get_current_hospital_uid)):
    """Returns the 50 most recent audit logs."""
    try:
        db = firestore.client()
        docs = db.collection("audit_logs").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(50).stream()
        logs = []
        for doc in docs:
            log_data = doc.to_dict()
            if "timestamp" in log_data and log_data["timestamp"]:
                log_data["timestamp"] = log_data["timestamp"].isoformat()
            logs.append(log_data)
        return {"audit_logs": logs}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch audit logs: {str(e)}")


@router.post("/hospital/assign-patient")
def assign_patient_to_doctor(req: PatientAssignRequest, uid: str = Depends(get_current_hospital_uid)):
    """Assigns a specific patient to a specific doctor. Only hospital role can do this."""
    try:
        if req.hospital_uid != uid:
            raise HTTPException(status_code=400, detail="Mismatched assigner ID.")

        try:
            doc_record = auth.get_user(req.doctor_uid)
            if (doc_record.custom_claims or {}).get('role') != 'doctor':
                raise HTTPException(status_code=400, detail="Target user is not a verified doctor.")
        except Exception as auth_e:
            if hasattr(auth_e, 'status_code'):
                raise auth_e
            raise HTTPException(status_code=404, detail="Doctor user not found.")

        try:
            auth.get_user(req.patient_uid)
        except Exception:
            raise HTTPException(status_code=404, detail="Patient user not found.")

        db = firestore.client()
        db.collection("doctor_assignments").document(req.doctor_uid).collection("patients").document(req.patient_uid).set({
            "assigned_by": req.hospital_uid,
            "assigned_at": firestore.SERVER_TIMESTAMP,
            "status": "active",
        })

        db.collection("audit_logs").document().set({
            "action": "ASSIGN_PATIENT",
            "hospital_uid": req.hospital_uid,
            "doctor_uid": req.doctor_uid,
            "patient_uid": req.patient_uid,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"message": "Patient successfully assigned to doctor."}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to assign patient: {str(e)}")


@router.post("/admin/assign-role")
def assign_user_role(req: RoleAssignRequest):
    """
    Assigns a role (doctor or hospital) to a user.
    Only users with the 'hospital' role can perform this action.
    """
    try:
        if req.role not in ["doctor", "hospital"]:
            raise HTTPException(status_code=400, detail="Invalid role. Must be 'doctor' or 'hospital'.")

        try:
            assigner_record = auth.get_user(req.assigner_uid)
        except Exception:
            raise HTTPException(status_code=404, detail="Assigner user not found.")

        if (assigner_record.custom_claims or {}).get('role') != 'hospital':
            raise HTTPException(status_code=403, detail="Unauthorized: Only hospital administrators can assign roles.")

        try:
            auth.get_user(req.target_uid)
        except Exception:
            raise HTTPException(status_code=404, detail="Target user not found.")

        auth.set_custom_user_claims(req.target_uid, {"role": req.role})

        db = firestore.client()
        db.collection("users").document(req.target_uid).set({"role": req.role}, merge=True)
        db.collection("audit_logs").document().set({
            "action": "ASSIGN_ROLE",
            "assigner_uid": req.assigner_uid,
            "target_uid": req.target_uid,
            "assigned_role": req.role,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"message": f"Successfully assigned role '{req.role}' to user {req.target_uid}."}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to assign role: {str(e)}")
