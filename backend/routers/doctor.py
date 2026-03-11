# routers/doctor.py
# ─────────────────────────────────────────────────────────────────────────────
# All /doctor/* endpoints.
# ─────────────────────────────────────────────────────────────────────────────

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from firebase_admin import firestore, auth

from routers.auth_helpers import (
    get_current_doctor_uid,
    DoctorCommentRequest,
    PrescriptionCommentRequest,
    AlertResolveRequest,
    PrescriptionRequest,
    DoctorProfileUpdateRequest,
)

router = APIRouter()


@router.get("/doctor/reports")
def get_doctor_reports(doctor_uid: str):
    """
    Retrieves all DiagnosticReports from patients ASSIGNED to this doctor.
    """
    try:
        user_record = auth.get_user(doctor_uid)
        claims = user_record.custom_claims or {}
        if claims.get('role') != 'doctor':
            raise HTTPException(status_code=403, detail="Unauthorized: Only verified doctors can view reports.")

        db = firestore.client()
        assignments_ref = db.collection("doctor_assignments").document(doctor_uid).collection("patients").stream()
        assigned_patient_uids = [doc.id for doc in assignments_ref]

        if not assigned_patient_uids:
            return {"reports": []}

        all_reports = []
        for p_uid in assigned_patient_uids:
            consent_doc = db.collection("consents").document(p_uid).collection("doctors").document(doctor_uid).get()
            if not consent_doc.exists or not consent_doc.to_dict().get("granted", False):
                continue

            reports_ref = db.collection("fhir_reports").document(p_uid).collection("reports").stream()
            for doc in reports_ref:
                report_data = doc.to_dict()
                report_data["patient_uid"] = p_uid
                alert_query = db.collection("alerts").where("report_id", "==", report_data["id"]).limit(1).stream()
                alert_docs = list(alert_query)
                if alert_docs:
                    report_data["alert_status"] = alert_docs[0].to_dict().get("status", "unresolved")
                    report_data["alert_id"] = alert_docs[0].id
                else:
                    report_data["alert_status"] = "none"
                all_reports.append(report_data)

        return {"reports": all_reports}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to fetch reports: {str(e)}")


@router.post("/doctor/resolve-alert")
def resolve_high_risk_alert(req: AlertResolveRequest):
    """Allows a doctor to mark an alert as resolved."""
    try:
        user_record = auth.get_user(req.doctor_uid)
        claims = user_record.custom_claims or {}
        if claims.get('role') != 'doctor':
            raise HTTPException(status_code=403, detail="Unauthorized: Only verified doctors can resolve alerts.")

        db = firestore.client()
        alert_ref = db.collection("alerts").document(req.alert_id)
        alert_doc = alert_ref.get()
        if not alert_doc.exists:
            raise HTTPException(status_code=404, detail="Alert not found.")

        alert_ref.update({
            "status": "resolved",
            "resolved_at": firestore.SERVER_TIMESTAMP,
            "resolved_by": req.doctor_uid,
        })

        db.collection("audit_logs").document().set({
            "action": "RESOLVE_ALERT",
            "doctor_uid": req.doctor_uid,
            "alert_id": req.alert_id,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"message": "Alert resolved successfully."}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to resolve alert: {str(e)}")


@router.post("/doctor/add-comment")
def add_doctor_comment(req: DoctorCommentRequest):
    """
    Allows a doctor to append a comment to a specific DiagnosticReport.
    Verifies 'doctor' custom claim, appends to note array, and writes audit log.
    """
    try:
        user_record = auth.get_user(req.doctor_uid)
        claims = user_record.custom_claims or {}
        if claims.get('role') != 'doctor':
            raise HTTPException(status_code=403, detail="Unauthorized: Only verified doctors can add comments.")

        db = firestore.client()
        report_ref = db.collection("fhir_reports").document(req.patient_uid).collection("reports").document(req.report_id)
        report_doc = report_ref.get()
        if not report_doc.exists:
            raise HTTPException(status_code=404, detail="DiagnosticReport not found.")

        new_note = {
            "author": req.doctor_uid,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "doctor_comment",
            "text": req.comment,
        }
        notes = report_doc.to_dict().get("note", [])
        notes.append(new_note)
        report_ref.update({"note": notes})

        db.collection("audit_logs").document().set({
            "action": "ADD_DOCTOR_COMMENT",
            "doctor_uid": req.doctor_uid,
            "patient_uid": req.patient_uid,
            "report_id": req.report_id,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"message": "Comment added successfully.", "note": new_note}
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to add comment: {str(e)}")


@router.post("/doctor/add-prescription")
def add_prescription(payload: PrescriptionRequest, doctor_uid: str = Depends(get_current_doctor_uid)):
    """
    Create a FHIR MedicationRequest-based prescription for a patient.
    Verifies doctor role via Firebase token, checks consent, builds FHIR bundle.
    """
    from prescription_utils import build_prescription_bundle

    try:
        db = firestore.client()

        consent_ref = db.collection("consents").document(payload.patient_uid).get()
        if consent_ref.exists:
            granted_doctors = consent_ref.to_dict().get("granted_doctors", [])
            if doctor_uid not in granted_doctors:
                raise HTTPException(status_code=403, detail="Patient has not granted you access. Request consent first.")

        medications_dicts = [med.dict() for med in payload.medications]
        prescription = build_prescription_bundle(
            patient_uid=payload.patient_uid,
            doctor_uid=doctor_uid,
            medications=medications_dicts,
            notes=payload.notes or "",
        )

        db.collection("fhir_prescriptions") \
          .document(payload.patient_uid) \
          .collection("prescriptions") \
          .document(prescription["id"]) \
          .set(prescription)

        db.collection("audit_logs").document().set({
            "action": "prescription_created",
            "doctor_uid": doctor_uid,
            "patient_uid": payload.patient_uid,
            "prescription_id": prescription["id"],
            "medication_names": prescription["medication_names"],
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"message": "Prescription created successfully.", "prescription": prescription}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create prescription: {str(e)}")

@router.put("/doctor/profile")
def update_doctor_profile(payload: DoctorProfileUpdateRequest, doctor_uid: str = Depends(get_current_doctor_uid)):
    """
    Updates the authenticated doctor's profile fields.
    """
    try:
        db = firestore.client()
        doctor_ref = db.collection("users").document(doctor_uid)
        
        updates = {}
        if payload.specialization is not None:
            updates["specialization"] = payload.specialization
        if payload.qualification is not None:
            updates["qualification"] = payload.qualification
        if payload.yearsOfExperience is not None:
            updates["yearsOfExperience"] = payload.yearsOfExperience
        if payload.bio is not None:
            updates["bio"] = payload.bio
            
        if updates:
            updates["updatedAt"] = firestore.SERVER_TIMESTAMP
            doctor_ref.update(updates)
            
        return {"message": "Profile updated successfully.", "updates": updates}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update profile: {str(e)}")


@router.get("/doctor/patient-prescriptions")
def get_patient_uploaded_prescriptions(
    patient_uid: str,
    doctor_uid: str = Depends(get_current_doctor_uid)
):
    """
    Returns all patient-uploaded & AI-analyzed prescriptions for a given patient UID.
    Doctor must be authenticated. Does NOT allow deletion.
    """
    try:
        db = firestore.client()
        docs = (
            db.collection("fhir_prescriptions")
            .document(patient_uid)
            .collection("prescriptions")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .stream()
        )
        prescriptions = []
        for doc in docs:
            d = doc.to_dict()
            d["id"] = doc.id
            prescriptions.append(d)
        return {"prescriptions": prescriptions}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/doctor/add-prescription-comment")
def add_prescription_comment(
    req: PrescriptionCommentRequest,
    doctor_uid: str = Depends(get_current_doctor_uid)
):
    """
    Allows a doctor to append a comment to a patient-uploaded prescription.
    Comment is appended to the doctor_comments array on the prescription document.
    Doctors may NOT delete prescriptions or patient data.
    """
    try:
        db = firestore.client()

        rx_ref = (
            db.collection("fhir_prescriptions")
            .document(req.patient_uid)
            .collection("prescriptions")
            .document(req.prescription_id)
        )
        rx_doc = rx_ref.get()
        if not rx_doc.exists:
            raise HTTPException(status_code=404, detail="Prescription not found.")

        new_comment = {
            "author": doctor_uid,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "doctor_comment",
            "text": req.comment,
        }
        existing = rx_doc.to_dict().get("doctor_comments", [])
        existing.append(new_comment)
        rx_ref.update({"doctor_comments": existing})

        db.collection("audit_logs").document().set({
            "action": "ADD_PRESCRIPTION_COMMENT",
            "doctor_uid": doctor_uid,
            "patient_uid": req.patient_uid,
            "prescription_id": req.prescription_id,
            "timestamp": firestore.SERVER_TIMESTAMP,
        })

        return {"message": "Comment added successfully.", "comment": new_comment}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add comment: {str(e)}")
