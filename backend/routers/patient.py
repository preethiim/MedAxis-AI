# routers/patient.py
# ─────────────────────────────────────────────────────────────────────────────
# All /patient/* and /fhir/* endpoints, plus /upload/blood-report.
# ─────────────────────────────────────────────────────────────────────────────

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from firebase_admin import firestore, storage

from fhir_utils import (
    build_fhir_patient,
    calculate_bmi,
    build_fhir_observation,
    build_fhir_diagnostic_report,
)
from ai_engine import analyze_blood_report
from pdf_parser import extract_text_from_file
from report_builder import extract_lab_values
from prescription_utils import build_prescription_bundle

from routers.auth_helpers import (
    get_current_patient_uid,
    get_any_authenticated_uid,
    get_authenticated_user_info,
    PatientRequest,
    VitalsRequest,
    DiagnosticReportRequest,
    PatientConsentRequest,
    StepLogRequest,
    SyncStepsRequest,
    PrescriptionRequest,
    OTPGenerateRequest,
    OTPVerifyRequest,
    normalize_phone,
    REWARD_TIERS,
)

router = APIRouter()


# ─── FHIR Resource Creation ────────────────────────────────────────────────────

@router.post("/fhir/patient")
def create_fhir_patient(patient: PatientRequest):
    """
    Converts a generic patient payload to a FHIR R4 Patient resource,
    saves it to the `fhir_patients` Firestore collection, AND
    updates the core `users` profile for UI persistence.
    """
    try:
        db = firestore.client()
        
        # 1. Update the UI-facing `users` collection so data persists on refresh
        user_updates = {
            "firstName": patient.firstName,
            "lastName": patient.lastName,
            "name": f"{patient.firstName} {patient.lastName}".strip() or "Patient",
            "gender": patient.gender,
            "birthDate": patient.birthDate,
            "updatedAt": firestore.SERVER_TIMESTAMP
        }
        db.collection("users").document(patient.uid).set(user_updates, merge=True)

        # 2. Build and save the FHIR R4 Resource
        fhir_patient_json = build_fhir_patient(
            uid=patient.uid,
            first_name=patient.firstName,
            last_name=patient.lastName,
            gender=patient.gender,
            birth_date=patient.birthDate,
            health_id=patient.healthId or "",
        )
        db.collection("fhir_patients").document(patient.uid).set(fhir_patient_json)
        
        return {"message": "FHIR Patient registered successfully", "data": fhir_patient_json}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Patient: {str(e)}")


@router.post("/fhir/observation/vitals")
def create_fhir_vitals(vitals: VitalsRequest):
    """
    Creates FHIR Observation resources for Height, Weight, BMI, Heart Rate, and Oxygen.
    Stores them in the `fhir_observations/{uid}/vitals` subcollection.
    """
    try:
        observations = []
        
        if vitals.height_cm is not None and vitals.weight_kg is not None:
            bmi = calculate_bmi(vitals.height_cm, vitals.weight_kg)
            observations.append(build_fhir_observation(vitals.uid, "8302-2", "Body Height", vitals.height_cm, "cm", "cm"))
            observations.append(build_fhir_observation(vitals.uid, "29463-7", "Body Weight", vitals.weight_kg, "kg", "kg"))
            observations.append(build_fhir_observation(vitals.uid, "39156-5", "Body Mass Index", bmi, "kg/m2", "kg/m2"))
            
        if vitals.heartRate is not None:
            observations.append(build_fhir_observation(vitals.uid, "8867-4", "Heart rate", vitals.heartRate, "/min", "/min"))
            
        if vitals.oxygen is not None:
            observations.append(build_fhir_observation(vitals.uid, "59408-5", "Oxygen saturation in Arterial blood by Pulse oximetry", vitals.oxygen, "%", "%"))

        db = firestore.client()
        if observations:
            vitals_ref = db.collection("fhir_observations").document(vitals.uid).collection("vitals")
            for obs in observations:
                vitals_ref.document(obs["id"]).set(obs)

        return {"message": "FHIR Vitals Observations created successfully", "data": observations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Vitals: {str(e)}")


@router.post("/fhir/diagnostic-report")
def create_diagnostic_report(report_req: DiagnosticReportRequest):
    """
    Creates multiple FHIR Observation resources from lab values, and links them
    to a generated FHIR DiagnosticReport resource.
    """
    try:
        observations = []
        labs = report_req.labValues

        if labs.hemoglobin is not None:
            observations.append(build_fhir_observation(report_req.uid, "718-7", "Hemoglobin", labs.hemoglobin, "g/dL", "g/dL"))
        if labs.vitaminD is not None:
            observations.append(build_fhir_observation(report_req.uid, "62292-8", "25-hydroxyvitamin D", labs.vitaminD, "ng/mL", "ng/mL"))
        if labs.glucose is not None:
            observations.append(build_fhir_observation(report_req.uid, "2345-7", "Glucose", labs.glucose, "mg/dL", "mg/dL"))

        obs_ids = [obs["id"] for obs in observations]
        diagnostic_report = build_fhir_diagnostic_report(report_req.uid, obs_ids)

        db = firestore.client()
        report_ref = db.collection("fhir_reports").document(report_req.uid).collection("reports").document(diagnostic_report["id"])

        batch = db.batch()
        batch.set(report_ref, diagnostic_report)
        for obs in observations:
            obs_ref = db.collection("fhir_reports").document(report_req.uid).collection("observations").document(obs["id"])
            batch.set(obs_ref, obs)
        batch.commit()

        return {
            "message": "FHIR Diagnostic Report created successfully",
            "data": diagnostic_report,
            "observations_created": len(observations),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Diagnostic Report: {str(e)}")


# ─── Blood Report Upload & AI Analysis ────────────────────────────────────────

@router.post("/upload/blood-report")
async def upload_blood_report(uid: str = Form(...), file: UploadFile = File(...)):
    """
    1. Accepts a PDF Blood Report and User UID.
    2. Uploads the raw PDF to Firebase Storage.
    3. Extracts text via PyPDF2 / OCR.
    4. Sends FULL text to GPT-4o-mini for comprehensive analysis.
    5. Stores a FHIR DiagnosticReport with the AI structured summary.
    """
    try:
        file_bytes = await file.read()

        bucket = storage.bucket()
        safe_filename = file.filename.replace(" ", "_")
        blob = bucket.blob(f"blood_reports/{uid}/{safe_filename}")
        blob.upload_from_string(file_bytes, content_type=file.content_type)
        blob.make_public()
        pdf_url = blob.public_url

        print(f"DEBUG: Received file for extraction. Filename: '{file.filename}', Content-Type: '{file.content_type}'")
        raw_text = extract_text_from_file(file_bytes, file.filename)
        ai_summary = analyze_blood_report(raw_text)

        observations = []
        for val in ai_summary.get("all_values", []):
            try:
                numeric_val = float(''.join(c for c in str(val.get("value", "0")) if c.isdigit() or c == '.'))
                obs = build_fhir_observation(uid, "lab-value", val.get("test", "Unknown"), numeric_val, val.get("unit", ""), val.get("unit", ""))
                observations.append(obs)
            except (ValueError, TypeError):
                pass

        obs_ids = [obs["id"] for obs in observations]

        note_parts = [f"AI Risk Level: {ai_summary.get('risk_level', 'Unknown')}"]
        note_parts.append(f"\nClinical Summary: {ai_summary.get('clinical_summary', 'N/A')}")

        abnormals = ai_summary.get("abnormal_values", [])
        if abnormals:
            note_parts.append("\nAbnormal Values:")
            for ab in abnormals:
                note_parts.append(f"  • {ab.get('test', '?')}: {ab.get('value', '?')} (Ref: {ab.get('reference_range', '?')}) — {ab.get('status', '?')} — {ab.get('significance', '')}")

        meds = ai_summary.get("medication_suggestions", "")
        if meds and meds != "None required.":
            note_parts.append(f"\nMedication Suggestions: {meds}")

        recs = ai_summary.get("lifestyle_recommendations", [])
        if recs:
            note_parts.append("\nRecommendations:")
            for r in recs:
                note_parts.append(f"  - {r}")

        followups = ai_summary.get("follow_up_tests", [])
        if followups:
            note_parts.append("\nSuggested Follow-Up Tests:")
            for f in followups:
                note_parts.append(f"  - {f}")

        note_text = "\n".join(note_parts)

        diagnostic_report = build_fhir_diagnostic_report(uid, obs_ids)
        diagnostic_report["presentedForm"] = [{"url": pdf_url, "title": file.filename}]
        diagnostic_report["note"] = [{"text": note_text}]

        db = firestore.client()
        report_ref = db.collection("fhir_reports").document(uid).collection("reports").document(diagnostic_report["id"])

        batch = db.batch()
        batch.set(report_ref, diagnostic_report)
        for obs in observations:
            obs_ref = db.collection("fhir_reports").document(uid).collection("observations").document(obs["id"])
            batch.set(obs_ref, obs)

        if ai_summary.get("risk_level") == "High":
            alert_id = str(uuid.uuid4())
            alert_ref = db.collection("alerts").document(alert_id)
            batch.set(alert_ref, {
                "patient_uid": uid,
                "report_id": diagnostic_report["id"],
                "risk_level": "High",
                "status": "unresolved",
                "created_at": firestore.SERVER_TIMESTAMP,
            })

        batch.commit()

        return {
            "message": "Blood Report uploaded and analyzed successfully.",
            "pdf_url": pdf_url,
            "ai_analysis": ai_summary,
            "fhir_report": diagnostic_report,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to process Blood Report PDF: {str(e)}")


@router.post("/upload/prescription")
async def upload_prescription(uid: str = Form(...), file: UploadFile = File(...)):
    """
    1. Accepts a Prescription (PDF, Image, or TXT) and User UID.
    2. Uploads raw file to Storage.
    3. Extracts text and analyzes with AI.
    4. Stores result in fhir_prescriptions/{uid}/prescriptions/{id} (Aligned with fetch logic).
    """
    try:
        from ai_engine import analyze_prescription
        file_bytes = await file.read()
        
        # 1. Upload to Storage
        bucket = storage.bucket()
        safe_filename = file.filename.replace(" ", "_")
        unique_id = str(uuid.uuid4())[:8]
        storage_path = f"prescriptions/{uid}/{unique_id}_{safe_filename}"
        
        blob = bucket.blob(storage_path)
        blob.upload_from_string(file_bytes, content_type=file.content_type)
        blob.make_public()
        file_url = blob.public_url
        
        # 2. Extract and Analyze
        raw_text = extract_text_from_file(file_bytes, file.filename)
        ai_summary = analyze_prescription(raw_text)
        
        # 3. Save to Firestore (Aligned Path)
        db = firestore.client()
        report_id = str(uuid.uuid4())
        
        prescription_data = {
            "id": report_id,
            "patient_uid": uid,
            "filename": file.filename,
            "file_url": file_url,
            "created_at": firestore.SERVER_TIMESTAMP, # Aligned with fetch sorting
            "ai_analysis": ai_summary,
            "raw_text_preview": raw_text[:500]
        }
        
        # Consistent path used by get_patient_prescriptions
        doc_ref = (
            db.collection("fhir_prescriptions")
            .document(uid)
            .collection("prescriptions")
            .document(report_id)
        )
        doc_ref.set(prescription_data)
        
        return {
            "message": "Prescription uploaded and analyzed successfully.",
            "file_url": file_url,
            "ai_analysis": ai_summary,
            "report_id": report_id
        }
    except Exception as e:
        print(f"Error processing prescription: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to process Prescription: {str(e)}")


# ─── Patient Data Endpoints ────────────────────────────────────────────────────

@router.get("/patient/reports")
def get_patient_reports(uid: str = Depends(get_current_patient_uid)):
    """Fetches all DiagnosticReports and associated Observations for the authenticated patient."""
    try:
        db = firestore.client()
        reports = [doc.to_dict() for doc in db.collection("fhir_reports").document(uid).collection("reports").stream()]
        observations = [doc.to_dict() for doc in db.collection("fhir_reports").document(uid).collection("observations").stream()]
        return {"uid": uid, "reports": reports, "observations": observations}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch patient reports: {str(e)}")


@router.get("/patient/vitals")
def get_patient_vitals(uid: str = Depends(get_current_patient_uid)):
    """Fetches all Vitals Observations (Height, Weight, BMI) for the authenticated patient."""
    try:
        db = firestore.client()
        vitals = [doc.to_dict() for doc in db.collection("fhir_observations").document(uid).collection("vitals").stream()]
        return {"uid": uid, "vitals": vitals}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch patient vitals: {str(e)}")


@router.get("/patient/doctors")
def get_all_doctors(uid: str = Depends(get_current_patient_uid)):
    """Fetches a list of all verified doctors available for consent."""
    try:
        db = firestore.client()
        doctors = [doc.to_dict() | {"doc_id": doc.id} for doc in db.collection("users").where("role", "==", "doctor").stream()]
        
        cleaned_doctors = []
        for d in doctors:
            cleaned_doctors.append({
                "uid": d.get("uid", d.get("doc_id")),
                "name": d.get("name", "Unknown Doctor"),
                "email": d.get("email", ""),
                "specialization": d.get("specialization", "General Medicine"),
                "profileImage": d.get("profileImage", ""),
            })
        return {"doctors": cleaned_doctors}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch doctors: {str(e)}")


@router.get("/patient/consents")
def get_patient_consents(uid: str = Depends(get_current_patient_uid)):
    """Fetches a list of doctor UIDs the patient has granted consent to."""
    try:
        db = firestore.client()
        consents = [doc.id for doc in db.collection("consents").document(uid).collection("doctors").where("granted", "==", True).stream()]
        return {"consents": consents}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch consents: {str(e)}")


@router.post("/patient/grant-consent")
def grant_patient_consent(req: PatientConsentRequest, uid: str = Depends(get_current_patient_uid)):
    """Allows a patient to grant viewing consent to a specific doctor."""
    try:
        db = firestore.client()
        db.collection("consents").document(uid).collection("doctors").document(req.doctor_uid).set(
            {"granted": True, "timestamp": firestore.SERVER_TIMESTAMP}, merge=True
        )
        return {"message": "Consent granted successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to grant consent: {str(e)}")


@router.post("/patient/revoke-consent")
def revoke_patient_consent(req: PatientConsentRequest, uid: str = Depends(get_current_patient_uid)):
    """Allows a patient to revoke viewing consent from a specific doctor."""
    try:
        db = firestore.client()
        db.collection("consents").document(uid).collection("doctors").document(req.doctor_uid).set(
            {"granted": False, "timestamp": firestore.SERVER_TIMESTAMP}, merge=True
        )
        return {"message": "Consent revoked successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revoke consent: {str(e)}")


@router.post("/patient/log-steps")
def log_steps(req: StepLogRequest, uid: str = Depends(get_current_patient_uid)):
    """Log daily steps and calculate reward points."""
    try:
        db = firestore.client()
        today = datetime.utcnow().strftime("%Y-%m-%d")
        ref = db.collection("step_rewards").document(uid)
        doc = ref.get()
        data = doc.to_dict() if doc.exists else {"daily_steps": {}, "total_points": 0, "rewards_claimed": []}

        points_earned = 0
        for threshold, pts in REWARD_TIERS:
            if req.steps >= threshold:
                points_earned = pts
                break

        data["daily_steps"][today] = req.steps
        data["total_points"] = data.get("total_points", 0) + points_earned
        ref.set(data)

        return {
            "message": f"Logged {req.steps} steps for {today}",
            "points_earned": points_earned,
            "total_points": data["total_points"],
            "steps_today": req.steps,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/patient/sync-steps")
def sync_steps(req: SyncStepsRequest, uid: str = Depends(get_current_patient_uid)):
    """Sync daily steps directly from Google Fit REST API and calculate reward points."""
    import requests
    import pytz

    try:
        now = datetime.utcnow()
        start_of_day = datetime(now.year, now.month, now.day, 0, 0, 0)
        start_millis = int(start_of_day.timestamp() * 1000)
        end_millis = int(now.timestamp() * 1000)

        fit_url = "https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate"
        headers = {"Authorization": f"Bearer {req.google_access_token}", "Content-Type": "application/json"}
        payload = {
            "aggregateBy": [{"dataTypeName": "com.google.step_count.delta"}],
            "bucketByTime": {"durationMillis": 86400000},
            "startTimeMillis": start_millis,
            "endTimeMillis": end_millis,
        }

        resp = requests.post(fit_url, headers=headers, json=payload)
        if resp.status_code == 401:
            raise HTTPException(status_code=401, detail="Google Access Token expired or invalid")
        elif resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=f"Google Fit Error: {resp.text}")

        fit_data = resp.json()
        total_steps = 0
        for bucket in fit_data.get("bucket", []):
            for dataset in bucket.get("dataset", []):
                for point in dataset.get("point", []):
                    for val in point.get("value", []):
                        total_steps += val.get("intVal", 0)

        db = firestore.client()
        today_str = now.strftime("%Y-%m-%d")
        ref = db.collection("step_rewards").document(uid)
        doc = ref.get()
        data = doc.to_dict() if doc.exists else {"daily_steps": {}, "total_points": 0, "rewards_claimed": []}

        points_earned = 0
        for threshold, pts in REWARD_TIERS:
            if total_steps >= threshold:
                points_earned = pts
                break

        previous_steps = data["daily_steps"].get(today_str, 0)
        previous_points_earned = 0
        for threshold, pts in REWARD_TIERS:
            if previous_steps >= threshold:
                previous_points_earned = pts
                break

        data["total_points"] = data.get("total_points", 0) - previous_points_earned + points_earned
        data["daily_steps"][today_str] = total_steps
        ref.set(data)

        return {
            "message": f"Synced {total_steps} steps from Google Fit for {today_str}",
            "points_earned": points_earned,
            "total_points": data["total_points"],
            "steps_synced": total_steps,
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patient/step-rewards")
def get_step_rewards(uid: str = Depends(get_current_patient_uid)):
    """Get step history and reward points."""
    try:
        db = firestore.client()
        ref = db.collection("step_rewards").document(uid)
        doc = ref.get()
        if not doc.exists:
            return {"daily_steps": {}, "total_points": 0, "rewards_claimed": []}
        return doc.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patient/prescriptions")
def get_patient_prescriptions(uid: str = Depends(get_current_patient_uid)):
    """Fetch all prescriptions for the authenticated patient."""
    try:
        db = firestore.client()
        docs = (
            db.collection("fhir_prescriptions")
            .document(uid)
            .collection("prescriptions")
            .order_by("created_at", direction=firestore.Query.DESCENDING)
            .get()
        )
        return {"prescriptions": [doc.to_dict() for doc in docs]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/patient/checkup-date")
def update_patient_checkup_date(
    uid: str = Depends(get_current_patient_uid),
):
    """
    Not used directly — use the body-accepting version below.
    Kept as a stub placeholder.
    """
    raise HTTPException(status_code=400, detail="Provide lastCheckupDate in request body.")


from pydantic import BaseModel as _BaseModel

class CheckupDateRequest(_BaseModel):
    lastCheckupDate: str  # ISO date string, e.g. "2025-12-15"


@router.patch("/patient/update-checkup-date")
def update_checkup_date(req: CheckupDateRequest, uid: str = Depends(get_current_patient_uid)):
    """Save or update the patient's lastCheckupDate in their Firestore profile."""
    try:
        db = firestore.client()
        db.collection("users").document(uid).set(
            {"lastCheckupDate": req.lastCheckupDate, "updatedAt": firestore.SERVER_TIMESTAMP},
            merge=True
        )
        return {"message": "Checkup date updated.", "lastCheckupDate": req.lastCheckupDate}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))




@router.get("/patient/me")
def get_patient_me(uid: str = Depends(get_current_patient_uid)):
    """Returns the authenticated patient's own Firestore profile (includes healthId)."""
    try:
        db = firestore.client()
        doc = db.collection("users").document(uid).get()
        if not doc.exists:
            raise HTTPException(status_code=404, detail="Patient profile not found.")
        data = doc.to_dict()
        return {
            "uid": uid,
            "name": data.get("name", ""),
            "firstName": data.get("firstName", ""),
            "lastName": data.get("lastName", ""),
            "gender": data.get("gender", ""),
            "birthDate": data.get("birthDate", ""),
            "email": data.get("email", ""),
            "healthId": data.get("healthId", ""),
            "profileImage": data.get("profileImage", ""),
            "height": data.get("height", ""),
            "weight": data.get("weight", ""),
            "bmi": data.get("bmi", ""),
            "role": data.get("role", "patient"),
            "lastCheckupDate": data.get("lastCheckupDate", ""),
        }
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patient/lookup")
def lookup_patient_by_health_id(
    health_id: str,
    requester: dict = Depends(get_authenticated_user_info),
):
    """
    Search for a patient by Health ID.

    Access rules:
      - hospital / superadmin  → unrestricted (administrative oversight)
      - doctor                 → allowed ONLY IF:
                                   (1) patient explicitly granted consent to this doctor, OR
                                   (2) doctor is explicitly assigned to this patient
                                 Otherwise returns 403.
      - patient / other        → 403 (patients use /patient/me, not lookup)
    """
    requester_uid = requester["uid"]
    requester_role = requester["role"]

    # Block roles that should never use lookup
    if requester_role not in ("doctor", "hospital", "superadmin"):
        raise HTTPException(
            status_code=403,
            detail="Access denied — this endpoint is for clinical staff only.",
        )

    try:
        db = firestore.client()

        # ── Find the patient by healthId ────────────────────────────────────────
        users = db.collection("users").where("role", "==", "patient").stream()
        matched_uid = None
        matched_data = None
        for u in users:
            data = u.to_dict()
            if data.get("healthId", "") == health_id:
                matched_uid = u.id
                matched_data = data
                break

        if not matched_uid:
            raise HTTPException(status_code=404, detail=f"No patient found with Health ID: {health_id}")

        # ── Doctor access gate ──────────────────────────────────────────────────
        if requester_role == "doctor":
            has_access = False

            # Condition 1: patient granted consent to this doctor
            consent_doc = (
                db.collection("consents")
                .document(matched_uid)
                .collection("doctors")
                .document(requester_uid)
                .get()
            )
            if consent_doc.exists and consent_doc.to_dict().get("granted") is True:
                has_access = True

            # Condition 2: doctor is explicitly assigned to this patient
            if not has_access:
                assignment_doc = (
                    db.collection("doctor_assignments")
                    .document(requester_uid)
                    .collection("patients")
                    .document(matched_uid)
                    .get()
                )
                if assignment_doc.exists and assignment_doc.to_dict().get("status") == "active":
                    has_access = True

            if not has_access:
                raise HTTPException(
                    status_code=403,
                    detail="Access denied — patient consent required.",
                )

        # ── Build response (schema unchanged) ───────────────────────────────────
        reports = list(db.collection("fhir_reports").document(matched_uid).collection("reports").stream())
        if not reports:
            reports = list(db.collection("patients").document(matched_uid).collection("diagnostic_reports").stream())
        report_list = []
        for r in reports:
            rd = r.to_dict()
            if "id" not in rd:
                rd["id"] = r.id
            report_list.append(rd)

        prescriptions = [
            rx.to_dict()
            for rx in db.collection("fhir_prescriptions").document(matched_uid).collection("prescriptions").stream()
        ]

        return {
            "found": True,
            "patient": {
                "uid": matched_uid,
                "name": matched_data.get("name", "Unknown"),
                "email": matched_data.get("email", ""),
                "healthId": matched_data.get("healthId", ""),
                "height": matched_data.get("height", ""),
                "weight": matched_data.get("weight", ""),
                "bmi": matched_data.get("bmi", ""),
            },
            "reports": report_list,
            "prescriptions": prescriptions,
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── 3-Layer Security (OTP) ───────────────────────────────────────────────────

import random
import requests
import os
from datetime import timedelta

@router.post("/patient/generate-otp")
def generate_patient_otp(req: OTPGenerateRequest):
    """
    Generates a 6-digit OTP for the patient, saves it to Firestore with a 5-min expiry.
    """
    try:
        db = firestore.client()
        otp_code = str(random.randint(100000, 999999))
        
        # Save to DB
        expires_at = datetime.utcnow() + timedelta(minutes=5)
        db.collection("login_otps").document(req.uid).set({
            "otp": otp_code,
            "expires_at": expires_at,
            "created_at": firestore.SERVER_TIMESTAMP
        })
        
        # For this college project, we just print it to the terminal instead of sending a real SMS/Email
        print(f"\n{'='*50}\n[SECURITY LAYER 2] OTP for Patient {req.uid}: {otp_code}\n{'='*50}\n")
        
        # ── Fast2SMS Integration ──
        # We need the user's phone number from Firestore to send the SMS
        user_doc = db.collection("users").document(req.uid).get()
        if user_doc.exists:
            user_data = user_doc.to_dict()
            phone_number = user_data.get("phoneNumber")
            if phone_number:
                clean_phone = normalize_phone(phone_number)
                api_key = os.getenv("FAST2SMS_API_KEY")
                if api_key and len(clean_phone) >= 10:
                    try:
                        print(f"DEBUG: Sending Step 2 OTP {otp_code} to {clean_phone} via Fast2SMS...")
                        # Using params for better encoding
                        response = requests.get(
                            "https://www.fast2sms.com/dev/bulkV2",
                            params={
                                "authorization": api_key,
                                "route": "q",
                                "message": f"Your MedAxis AI OTP is: {otp_code}. Valid for 5 minutes.",
                                "language": "english",
                                "flash": "0",
                                "numbers": clean_phone
                            },
                            timeout=5
                        )
                        print(f"Fast2SMS Step 2 Response: {response.status_code} - {response.text}")
                    except Exception as sms_err:
                        print(f"Failed to send Step 2 SMS via Fast2SMS: {sms_err}")

        return {"message": "OTP generated and sent successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate OTP: {str(e)}")


@router.post("/patient/verify-otp")
def verify_patient_otp(req: OTPVerifyRequest):
    """
    Verifies the provided OTP against the database record for the patient.
    """
    try:
        db = firestore.client()
        doc_ref = db.collection("login_otps").document(req.uid)
        doc = doc_ref.get()
        
        if not doc.exists:
            raise HTTPException(status_code=400, detail="No active OTP found. Please request a new one.")
            
        data = doc.to_dict()
        
        # Check Expiry
        # Note: firestore datetimes are timezone-aware if fetched as DatetimeWithNanoseconds
        expires_at = data.get("expires_at")
        if expires_at:
            # Handle if expires_at is returned as string or datetime
            if isinstance(expires_at, str):
                expires_at_dt = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            else:
                expires_at_dt = expires_at
                
            if datetime.utcnow().timestamp() > expires_at_dt.timestamp():
                doc_ref.delete()
                raise HTTPException(status_code=400, detail="OTP has expired. Please request a new one.")
                
        # Check Match
        if data.get("otp") != req.otp:
            raise HTTPException(status_code=400, detail="Invalid OTP code.")
            
        # Success - Delete OTP so it can't be reused
        doc_ref.delete()
        return {"message": "OTP verified successfully", "success": True}
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to verify OTP: {str(e)}")


# ─── Family Health Tracking ───────────────────────────────────────────────────

from pydantic import BaseModel
from typing import Optional

class FamilyMemberRequest(BaseModel):
    name: str
    age: int
    relation: str
    lastCheckupDate: Optional[str] = ""
    medicalNotes: Optional[str] = ""


@router.post("/family/member")
def add_family_member(req: FamilyMemberRequest, uid: str = Depends(get_current_patient_uid)):
    """Add a new family member for the authenticated patient."""
    try:
        db = firestore.client()
        member_id = str(uuid.uuid4())
        member_data = {
            "id": member_id,
            "name": req.name,
            "age": req.age,
            "relation": req.relation,
            "lastCheckupDate": req.lastCheckupDate or "",
            "medicalNotes": req.medicalNotes or "",
            "uid": uid,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        db.collection("family_members").document(uid).collection("members").document(member_id).set(member_data)
        return {"message": "Family member added.", "member_id": member_id, "member": member_data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/family/members")
def get_family_members(uid: str = Depends(get_current_patient_uid)):
    """Get all family members for the authenticated patient."""
    try:
        db = firestore.client()
        docs = db.collection("family_members").document(uid).collection("members").stream()
        members = []
        for doc in docs:
            data = doc.to_dict()
            data["id"] = doc.id
            members.append(data)
        return {"members": members}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/family/member/{member_id}")
def update_family_member(member_id: str, req: FamilyMemberRequest, uid: str = Depends(get_current_patient_uid)):
    """Update an existing family member's details."""
    try:
        db = firestore.client()
        doc_ref = db.collection("family_members").document(uid).collection("members").document(member_id)
        doc_ref.update({
            "name": req.name,
            "age": req.age,
            "relation": req.relation,
            "lastCheckupDate": req.lastCheckupDate or "",
            "medicalNotes": req.medicalNotes or "",
            "updatedAt": firestore.SERVER_TIMESTAMP,
        })
        return {"message": "Family member updated."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/family/member/{member_id}")
def delete_family_member(member_id: str, uid: str = Depends(get_current_patient_uid)):
    """Delete a family member and all their subcollections."""
    try:
        db = firestore.client()
        member_ref = db.collection("family_members").document(uid).collection("members").document(member_id)
        # Delete subcollections first
        for sub in ["prescriptions", "reports"]:
            for doc in member_ref.collection(sub).stream():
                doc.reference.delete()
        member_ref.delete()
        return {"message": "Family member deleted."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/family/upload-prescription")
async def upload_family_prescription(
    uid: str = Form(...),
    member_id: str = Form(...),
    file: UploadFile = File(...)
):
    """
    Upload & AI-analyze a prescription for a family member.
    Stores file in Firebase Storage and result in Firestore.
    """
    try:
        from ai_engine import analyze_prescription

        file_bytes = await file.read()

        # Upload to Firebase Storage
        bucket = storage.bucket()
        unique_id = str(uuid.uuid4())[:8]
        safe_filename = file.filename.replace(" ", "_")
        storage_path = f"family/{uid}/{member_id}/prescriptions/{unique_id}_{safe_filename}"
        blob = bucket.blob(storage_path)
        blob.upload_from_string(file_bytes, content_type=file.content_type)
        blob.make_public()
        file_url = blob.public_url

        # Extract text & run AI
        raw_text = extract_text_from_file(file_bytes, file.filename)
        ai_summary = analyze_prescription(raw_text)

        # Store in Firestore
        db = firestore.client()
        report_id = str(uuid.uuid4())
        prescription_data = {
            "id": report_id,
            "member_id": member_id,
            "patient_uid": uid,
            "filename": file.filename,
            "file_url": file_url,
            "uploaded_at": firestore.SERVER_TIMESTAMP,
            "ai_analysis": ai_summary,
        }
        db.collection("family_members").document(uid).collection("members").document(member_id).collection("prescriptions").document(report_id).set(prescription_data)

        return {"message": "Prescription uploaded.", "file_url": file_url, "ai_analysis": ai_summary, "report_id": report_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Family prescription upload failed: {str(e)}")


@router.get("/family/member/{member_id}/prescriptions")
def get_family_member_prescriptions(member_id: str, uid: str = Depends(get_current_patient_uid)):
    """Get all prescriptions for a specific family member."""
    try:
        db = firestore.client()
        docs = (
            db.collection("family_members").document(uid).collection("members")
            .document(member_id).collection("prescriptions")
            .order_by("uploaded_at", direction=firestore.Query.DESCENDING)
            .stream()
        )
        return {"prescriptions": [doc.to_dict() for doc in docs]}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
