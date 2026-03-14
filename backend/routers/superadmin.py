# routers/superadmin.py
# ─────────────────────────────────────────────────────────────────────────────
# All /superadmin/* endpoints.
# ─────────────────────────────────────────────────────────────────────────────

import random
import string

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore

from routers.auth_helpers import (
    get_current_superadmin_uid,
    SuperAdminCreateUserRequest,
    generate_unique_id,
    build_standard_user_doc,
)

router = APIRouter()


@router.get("/superadmin/all-users")
def get_all_users(uid: str = Depends(get_current_superadmin_uid)):
    """Returns all users grouped by role."""
    try:
        db = firestore.client()
        users = db.collection("users").stream()
        result = {"patients": [], "doctors": [], "hospitals": [], "superadmins": []}
        for u in users:
            data = u.to_dict()
            data["id"] = u.id
            role = data.get("role", "patient")
            if role == "patient":
                result["patients"].append(data)
            elif role == "doctor":
                result["doctors"].append(data)
            elif role == "hospital":
                result["hospitals"].append(data)
            elif role == "superadmin":
                result["superadmins"].append(data)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/superadmin/platform-stats")
def get_platform_stats(uid: str = Depends(get_current_superadmin_uid)):
    """Returns platform-wide statistics."""
    try:
        db = firestore.client()
        users = list(db.collection("users").stream())
        patients = [u for u in users if u.to_dict().get("role") == "patient"]
        doctors = [u for u in users if u.to_dict().get("role") == "doctor"]
        hospitals = [u for u in users if u.to_dict().get("role") == "hospital"]

        total_reports = 0
        for p in patients:
            reports = list(db.collection("patients").document(p.id).collection("diagnostic_reports").stream())
            total_reports += len(reports)

        alerts = list(db.collection("alerts").where("status", "==", "unresolved").stream())

        return {
            "total_patients": len(patients),
            "total_doctors": len(doctors),
            "total_hospitals": len(hospitals),
            "total_reports": total_reports,
            "unresolved_alerts": len(alerts),
            "total_users": len(users),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/superadmin/all-reports")
def get_all_reports_superadmin(uid: str = Depends(get_current_superadmin_uid)):
    """Returns all diagnostic reports across all patients."""
    try:
        db = firestore.client()
        patients = list(db.collection("users").where("role", "==", "patient").stream())
        all_reports = []
        for p in patients:
            p_data = p.to_dict()
            for r in db.collection("patients").document(p.id).collection("diagnostic_reports").stream():
                report_data = r.to_dict()
                report_data["id"] = r.id
                report_data["patient_uid"] = p.id
                report_data["patient_name"] = p_data.get("name", "Unknown")
                report_data["patient_email"] = p_data.get("email", "")
                all_reports.append(report_data)
        return {"reports": all_reports}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/superadmin/create-user")
def superadmin_create_user(req: SuperAdminCreateUserRequest, admin_uid: str = Depends(get_current_superadmin_uid)):
    """
    SuperAdmin creates a new patient, doctor, or hospital account.
    Replicates the /auth/register logic with superadmin privilege enforcement.
    """
    if req.role not in ["patient", "doctor", "hospital"]:
        raise HTTPException(status_code=400, detail="Role must be 'patient', 'doctor', or 'hospital'.")
    try:
        from firebase_admin import auth as fb_auth
        user_record = fb_auth.create_user(email=req.email, password=req.password, display_name=req.name)
        fb_auth.set_custom_user_claims(user_record.uid, {"role": req.role})

        db = firestore.client()
        
        args = {
            "uid": user_record.uid,
            "role": req.role,
            "email": req.email,
            "name": req.name,
            "password": req.password,  # Store password in Firestore
            "created_by": admin_uid,
        }

        if req.role == "patient":
            args["healthId"] = generate_unique_id(db, "healthId", "PAT-", 6)
            args["height"] = ""
            args["weight"] = ""
            args["bmi"] = ""
        elif req.role == "doctor":
            args["doctorId"] = generate_unique_id(db, "doctorId", "DOC-", 4)
        elif req.role == "hospital":
            args["hospitalId"] = generate_unique_id(db, "hospitalId", "HOSP-", 4, digits_only=True)

        user_data = build_standard_user_doc(**args)

        db.collection("users").document(user_record.uid).set(user_data)

        db.collection("audit_logs").document().set({
            "action": "SUPERADMIN_CREATE_USER",
            "admin_uid": admin_uid,
            "created_uid": user_record.uid,
            "role": req.role,
            "email": req.email,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"success": True, "uid": user_record.uid, "user": user_data}
    except Exception as e:
        error_msg = str(e)
        if "EMAIL_EXISTS" in error_msg or "email-already-exists" in error_msg:
            raise HTTPException(status_code=400, detail="The email address is already in use.")
        raise HTTPException(status_code=500, detail=f"Failed to create user: {error_msg}")


@router.delete("/superadmin/delete-user/{target_uid}")
def superadmin_delete_user(target_uid: str, admin_uid: str = Depends(get_current_superadmin_uid)):
    """
    SuperAdmin permanently deletes a user from Firebase Auth and Firestore.
    Refuses to delete other superadmins.
    """
    from firebase_admin import auth as fb_auth
    try:
        try:
            target_record = fb_auth.get_user(target_uid)
            if (target_record.custom_claims or {}).get("role") == "superadmin":
                raise HTTPException(status_code=403, detail="Cannot delete a super admin account.")
        except HTTPException:
            raise
        except Exception:
            raise HTTPException(status_code=404, detail="User not found.")

        db = firestore.client()
        fb_auth.delete_user(target_uid)
        db.collection("users").document(target_uid).delete()

        db.collection("audit_logs").document().set({
            "action": "SUPERADMIN_DELETE_USER",
            "admin_uid": admin_uid,
            "deleted_uid": target_uid,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"success": True, "message": f"User {target_uid} deleted successfully."}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete user: {str(e)}")
