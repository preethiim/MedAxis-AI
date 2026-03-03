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
    PatientRequest,
    VitalsRequest,
    DiagnosticReportRequest,
    PatientConsentRequest,
    StepLogRequest,
    SyncStepsRequest,
    PrescriptionRequest,
    REWARD_TIERS,
)

router = APIRouter()


# ─── FHIR Resource Creation ────────────────────────────────────────────────────

@router.post("/fhir/patient")
def create_fhir_patient(patient: PatientRequest):
    """
    Converts a generic patient payload to a FHIR R4 Patient resource
    and saves it to the `fhir_patients` Firestore collection.
    """
    try:
        fhir_patient_json = build_fhir_patient(
            uid=patient.uid,
            first_name=patient.firstName,
            last_name=patient.lastName,
            gender=patient.gender,
            birth_date=patient.birthDate,
            health_id=patient.healthId,
        )
        db = firestore.client()
        db.collection("fhir_patients").document(patient.uid).set(fhir_patient_json)
        return {"message": "FHIR Patient registered successfully", "data": fhir_patient_json}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Patient: {str(e)}")


@router.post("/fhir/observation/vitals")
def create_fhir_vitals(vitals: VitalsRequest):
    """
    Creates FHIR Observation resources for Height, Weight, and calculated BMI.
    Stores them in the `fhir_observations/{uid}/vitals` subcollection.
    """
    try:
        bmi = calculate_bmi(vitals.height_cm, vitals.weight_kg)
        height_obs = build_fhir_observation(vitals.uid, "8302-2", "Body Height", vitals.height_cm, "cm", "cm")
        weight_obs = build_fhir_observation(vitals.uid, "29463-7", "Body Weight", vitals.weight_kg, "kg", "kg")
        bmi_obs = build_fhir_observation(vitals.uid, "39156-5", "Body Mass Index", bmi, "kg/m2", "kg/m2")
        observations = [height_obs, weight_obs, bmi_obs]

        db = firestore.client()
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
            "email": data.get("email", ""),
            "healthId": data.get("healthId", ""),
            "height": data.get("height", ""),
            "weight": data.get("weight", ""),
            "bmi": data.get("bmi", ""),
            "role": data.get("role", "patient"),
        }
    except Exception as e:
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/patient/lookup")
def lookup_patient_by_health_id(health_id: str, requester_uid: str = Depends(get_any_authenticated_uid)):
    """
    Allows any authenticated user (doctor, hospital, superadmin) to search
    for a patient by their Health ID. Requires a valid Firebase Bearer token.
    """
    try:
        db = firestore.client()
        users = db.collection("users").where("role", "==", "patient").stream()
        for u in users:
            data = u.to_dict()
            if data.get("healthId", "") == health_id:
                reports = list(db.collection("fhir_reports").document(u.id).collection("reports").stream())
                if not reports:
                    reports = list(db.collection("patients").document(u.id).collection("diagnostic_reports").stream())
                report_list = []
                for r in reports:
                    rd = r.to_dict()
                    if "id" not in rd:
                        rd["id"] = r.id
                    report_list.append(rd)
                rx_docs = db.collection("fhir_prescriptions").document(u.id).collection("prescriptions").stream()
                prescriptions = [rx.to_dict() for rx in rx_docs]
                return {
                    "found": True,
                    "patient": {
                        "uid": u.id,
                        "name": data.get("name", "Unknown"),
                        "email": data.get("email", ""),
                        "healthId": data.get("healthId", ""),
                        "height": data.get("height", ""),
                        "weight": data.get("weight", ""),
                        "bmi": data.get("bmi", ""),
                    },
                    "reports": report_list,
                    "prescriptions": prescriptions,
                }
        raise HTTPException(status_code=404, detail=f"No patient found with Health ID: {health_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
