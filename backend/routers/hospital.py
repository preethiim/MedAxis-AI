# routers/hospital.py
# ─────────────────────────────────────────────────────────────────────────────
# All /hospital/* and /admin/* endpoints.
# ─────────────────────────────────────────────────────────────────────────────
import random
import string

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore, auth

from routers.auth_helpers import (
    get_current_hospital_uid,
    RoleAssignRequest,
    PatientAssignRequest,
    CreateDoctorRequest,
    generate_unique_id,
    build_standard_user_doc,
)

router = APIRouter()


# ─── Hospital: Create Doctor Account ─────────────────────────────────────────

@router.post("/hospital/create-doctor")
def hospital_create_doctor(req: CreateDoctorRequest, hospital_uid: str = Depends(get_current_hospital_uid)):
    """
    Allows a hospital admin to create a new doctor account.
    - Requires a valid Bearer token with role = 'hospital'.
    - Auto-generates a DOC-XXXXXX doctor ID.
    - Sets Firebase custom claim role = 'doctor'.
    - Writes Firestore user document.
    - Logs action to audit_logs.
    """
    try:
        db = firestore.client()

        # Resolve the creating hospital's hospitalId — required to affiliate the doctor
        hosp_doc = db.collection("users").document(hospital_uid).get()
        hosp_data = hosp_doc.to_dict() if hosp_doc.exists else {}
        hospital_id = hosp_data.get("hospitalId", "")
        if not hospital_id:
            raise HTTPException(
                status_code=403,
                detail="Hospital account setup is incomplete (missing hospitalId). "
                       "Contact your super admin."
            )

        # Extract numeric code (e.g. "HOSP-4821" → "4821") for employeeId prefix
        hospital_code = hospital_id.split("-")[-1]

        user_record = auth.create_user(
            email=req.email,
            password=req.password,
            display_name=req.name
        )
        auth.set_custom_user_claims(user_record.uid, {"role": "doctor"})

        doctor_id = generate_unique_id(db, "doctorId", "DOC-", 4)
        employee_id = generate_unique_id(db, "employeeId", f"EMP-{hospital_code}-", 4, digits_only=True)

        user_data = build_standard_user_doc(
            uid=user_record.uid,
            role="doctor",
            email=req.email,
            name=req.name,
            doctorId=doctor_id,
            employeeId=employee_id,
            hospitalId=hospital_id,
            hospitalUid=hospital_uid,
            created_by=hospital_uid,
        )
        db.collection("users").document(user_record.uid).set(user_data)

        db.collection("audit_logs").document().set({
            "action": "HOSPITAL_CREATE_DOCTOR",
            "hospital_uid": hospital_uid,
            "hospital_id": hospital_id,
            "created_uid": user_record.uid,
            "doctor_id": doctor_id,
            "employee_id": employee_id,
            "email": req.email,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {
            "success": True,
            "uid": user_record.uid,
            "doctorId": doctor_id,
            "employeeId": employee_id,
            "hospitalId": hospital_id,
            "message": "Doctor account created and affiliated successfully",
        }
    except Exception as e:
        error_msg = str(e)
        if "EMAIL_EXISTS" in error_msg or "email-already-exists" in error_msg:
            raise HTTPException(status_code=400, detail="The email address is already in use by another account.")
        raise HTTPException(status_code=500, detail=f"Failed to create doctor account: {error_msg}")


@router.get("/hospital/doctors")
def get_hospital_doctors(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns only the doctors affiliated with THIS hospital
    (matched by hospitalId stored on each doctor's Firestore doc).
    Includes per-doctor active patient assignment count.
    """
    try:
        db = firestore.client()

        # Resolve this hospital's own hospitalId
        hosp_doc = db.collection("users").document(uid).get()
        hosp_data = hosp_doc.to_dict() if hosp_doc.exists else {}
        hospital_id = hosp_data.get("hospitalId", "")
        if not hospital_id:
            raise HTTPException(
                status_code=403,
                detail="Hospital account setup is incomplete (missing hospitalId)."
            )

        # Only fetch doctors whose hospitalId matches
        docs = (
            db.collection("users")
            .where("role", "==", "doctor")
            .where("hospitalId", "==", hospital_id)
            .stream()
        )
        doctors = []
        for doc in docs:
            doc_data = doc.to_dict()
            # Count only active assignments
            assignments = (
                db.collection("doctor_assignments")
                .document(doc.id)
                .collection("patients")
                .where("status", "==", "active")
                .get()
            )
            doctors.append({
                "uid": doc.id,
                "email": doc_data.get("email", ""),
                "name": doc_data.get("name", ""),
                "doctorId": doc_data.get("doctorId", ""),
                "employeeId": doc_data.get("employeeId", ""),
                "patient_count": len(assignments),
                "profileImage": doc_data.get("profileImage", ""),
                "specialization": doc_data.get("specialization", ""),
            })
        return {"doctors": doctors, "total": len(doctors)}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to fetch doctors: {str(e)}")


@router.get("/hospital/patients")
def get_hospital_patients(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns the set of patients that are actively assigned to THIS hospital's doctors.
    Does NOT expose patient reports, clinical records, or consent data.
    """
    try:
        db = firestore.client()

        # Resolve hospitalId
        hosp_doc = db.collection("users").document(uid).get()
        hosp_data = hosp_doc.to_dict() if hosp_doc.exists else {}
        hospital_id = hosp_data.get("hospitalId", "")
        if not hospital_id:
            raise HTTPException(
                status_code=403,
                detail="Hospital account setup is incomplete (missing hospitalId)."
            )

        # Get UIDs of all doctors affiliated with this hospital
        doctor_docs = (
            db.collection("users")
            .where("role", "==", "doctor")
            .where("hospitalId", "==", hospital_id)
            .stream()
        )
        doctor_uids = [d.id for d in doctor_docs]

        # Gather unique patient UIDs across all doctors' assignment lists
        patient_uid_set: set = set()
        for doc_uid in doctor_uids:
            assignments = (
                db.collection("doctor_assignments")
                .document(doc_uid)
                .collection("patients")
                .where("status", "==", "active")
                .stream()
            )
            for a in assignments:
                patient_uid_set.add(a.id)

        # Fetch minimal patient profile data (NO clinical records)
        patients = []
        for p_uid in patient_uid_set:
            p_doc = db.collection("users").document(p_uid).get()
            if p_doc.exists:
                p_data = p_doc.to_dict()
                patients.append({
                    "uid": p_uid,
                    "name": p_data.get("name", ""),
                    "email": p_data.get("email", ""),
                    "healthId": p_data.get("healthId", ""),
                })

        return {"patients": patients, "total": len(patients)}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to fetch patients: {str(e)}")


@router.get("/hospital/stats")
def get_hospital_stats(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns stats scoped to THIS hospital only:
      - total_doctors    : doctors affiliated with this hospital
      - total_patients   : unique patients assigned to those doctors
      - high_risk_alerts : unresolved High-risk alerts for those patients
    Hospital cannot see platform-wide totals or other hospitals' data.
    """
    try:
        db = firestore.client()

        # Resolve hospitalId
        hosp_doc = db.collection("users").document(uid).get()
        hosp_data = hosp_doc.to_dict() if hosp_doc.exists else {}
        hospital_id = hosp_data.get("hospitalId", "")
        if not hospital_id:
            raise HTTPException(
                status_code=403,
                detail="Hospital account setup is incomplete (missing hospitalId)."
            )

        # Doctors under this hospital
        doctor_docs = list(
            db.collection("users")
            .where("role", "==", "doctor")
            .where("hospitalId", "==", hospital_id)
            .stream()
        )
        doctor_uids = [d.id for d in doctor_docs]
        total_doctors = len(doctor_uids)

        # Unique patients assigned to those doctors
        patient_uid_set: set = set()
        for doc_uid in doctor_uids:
            for a in (
                db.collection("doctor_assignments")
                .document(doc_uid)
                .collection("patients")
                .where("status", "==", "active")
                .stream()
            ):
                patient_uid_set.add(a.id)
        total_patients = len(patient_uid_set)

        # High-risk unresolved alerts scoped to this hospital's patients only
        high_risk_alerts = 0
        if patient_uid_set:
            all_alerts = (
                db.collection("alerts")
                .where("status", "==", "unresolved")
                .where("risk_level", "==", "High")
                .stream()
            )
            high_risk_alerts = sum(
                1 for a in all_alerts
                if a.to_dict().get("patient_uid") in patient_uid_set
            )

        return {
            "total_doctors": total_doctors,
            "total_patients": total_patients,
            "high_risk_alerts": high_risk_alerts,
            # Removed: total_reports and platform-wide totals
        }
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
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

        db = firestore.client()

        # Verify doctor exists, has doctor role, AND belongs to THIS hospital
        try:
            doc_record = auth.get_user(req.doctor_uid)
            if (doc_record.custom_claims or {}).get('role') != 'doctor':
                raise HTTPException(status_code=400, detail="Target user is not a verified doctor.")
        except Exception as auth_e:
            if hasattr(auth_e, 'status_code'):
                raise auth_e
            raise HTTPException(status_code=404, detail="Doctor user not found.")

        # Enforce hospital ownership — doctor must be affiliated with this hospital
        doctor_doc = db.collection("users").document(req.doctor_uid).get()
        if not doctor_doc.exists:
            raise HTTPException(status_code=404, detail="Doctor profile not found.")
        doctor_data = doctor_doc.to_dict()
        hosp_doc = db.collection("users").document(uid).get()
        hosp_data = hosp_doc.to_dict() if hosp_doc.exists else {}
        if doctor_data.get("hospitalId") != hosp_data.get("hospitalId"):
            raise HTTPException(
                status_code=403,
                detail="Doctor is not affiliated with your hospital. "
                       "You can only assign patients to doctors under your hospital."
            )

        try:
            auth.get_user(req.patient_uid)
        except Exception:
            raise HTTPException(status_code=404, detail="Patient user not found.")

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
