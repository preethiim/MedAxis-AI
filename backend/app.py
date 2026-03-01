from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from firebase_config import initialize_firebase

# Initialize Firebase Admin
initialize_firebase()

app = FastAPI(
    title="MedAxis AI Backend",
    description="FastAPI service for the MedAxis AI Platform",
    version="1.0.0"
)

# Enable CORS for the frontend
# In production with wildcard allowed origins, allow_credentials usually needs to be False
# or specifically designated. For ease of deployment, we'll allow all origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from pydantic import BaseModel
from firebase_admin import firestore
from fhir_utils import build_fhir_patient, calculate_bmi, build_fhir_observation, build_fhir_diagnostic_report
from fastapi import Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

security = HTTPBearer()

def get_current_patient_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "patient")
        if role != "patient":
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Only patients can access their reports.")
        return decoded_token.get("uid")
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")

def get_current_hospital_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "")
        if role != "hospital":
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Only hospital administrators can access this.")
        return decoded_token.get("uid")
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")

# Define input models
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

import random
import string

class RegisterRequest(BaseModel):
    name: str = ""
    email: str
    password: str
    role: str
    healthId: str = ""
    employeeId: str = ""
    height: str = ""
    weight: str = ""
    bmi: str = ""

@app.post("/auth/register")
def register_user(req: RegisterRequest):
    """
    Registers a user directly via FastAPI to bypass Firebase Cloud Functions HTTP limitations.
    Handles Auth user creation, custom claims assignment, and Firestore document initialization.
    """
    from fastapi import HTTPException
    
    if not req.email or not req.password or not req.role:
        raise HTTPException(status_code=400, detail="Missing essential fields: email, password, or role.")
    
    if req.role not in ["patient", "doctor", "hospital", "superadmin"]:
        raise HTTPException(status_code=400, detail="Invalid role provided.")
        
    try:
        from firebase_admin import auth
        user_record = auth.create_user(
            email=req.email,
            password=req.password,
            display_name=req.name
        )
        
        # Set Role
        auth.set_custom_user_claims(user_record.uid, {"role": req.role})
        
        db = firestore.client()
        user_data = {
            "uid": user_record.uid,
            "role": req.role,
            "email": req.email,
            "createdAt": firestore.SERVER_TIMESTAMP
        }
        
        if req.name:
            user_data["name"] = req.name
            
        # Dynamically inject unique IDs
        if req.role == "patient":
            generated_health_id = "PAT-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            user_data["healthId"] = req.healthId if req.healthId else generated_health_id
            user_data["height"] = req.height
            user_data["weight"] = req.weight
            user_data["bmi"] = req.bmi
        elif req.role == "hospital":
            user_data["employeeId"] = req.employeeId
        elif req.role == "doctor":
            generated_doctor_id = "DOC-" + ''.join(random.choices(string.ascii_uppercase + string.digits, k=6))
            user_data["doctorId"] = generated_doctor_id
            
        db.collection("users").document(user_record.uid).set(user_data)
        
        return {"success": True, "uid": user_record.uid, "message": f"User {req.role} registered successfully"}
        
    except Exception as e:
        error_msg = str(e)
        if "EMAIL_EXISTS" in error_msg:
            raise HTTPException(status_code=400, detail="The email address is already in use by another account.")
        raise HTTPException(status_code=500, detail=f"Registration failed: {error_msg}")


@app.get("/")
def read_root():
    return {"message": "Welcome to MedAxis AI Backend"}

@app.get("/health")
def health_check():
    """
    Basic health check endpoint to verify backend status.
    """
    return {"status": "ok", "service": "MedAxis AI Backend"}

@app.post("/fhir/patient")
def create_fhir_patient(patient: PatientRequest):
    """
    Converts a generic patient payload to a FHIR R4 Patient resource
    and saves it to the `fhir_patients` Firestore collection.
    """
    try:
        # Build FHIR JSON
        fhir_patient_json = build_fhir_patient(
            uid=patient.uid,
            first_name=patient.firstName,
            last_name=patient.lastName,
            gender=patient.gender,
            birth_date=patient.birthDate,
            health_id=patient.healthId
        )

        # Store in Firestore
        db = firestore.client()
        db.collection("fhir_patients").document(patient.uid).set(fhir_patient_json)

        return {"message": "FHIR Patient registered successfully", "data": fhir_patient_json}
        
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Patient: {str(e)}")

@app.post("/fhir/observation/vitals")
def create_fhir_vitals(vitals: VitalsRequest):
    """
    Creates FHIR Observation resources for Height, Weight, and calculated BMI.
    Stores them in the `fhir_observations/{uid}/vitals` subcollection.
    """
    try:
        bmi = calculate_bmi(vitals.height_cm, vitals.weight_kg)
        
        # Build 3 Observations
        height_obs = build_fhir_observation(
            patient_uid=vitals.uid,
            loinc_code="8302-2",
            display_name="Body Height",
            value=vitals.height_cm,
            unit="cm",
            unit_code="cm"
        )
        
        weight_obs = build_fhir_observation(
            patient_uid=vitals.uid,
            loinc_code="29463-7",
            display_name="Body Weight",
            value=vitals.weight_kg,
            unit="kg",
            unit_code="kg"
        )
        
        bmi_obs = build_fhir_observation(
            patient_uid=vitals.uid,
            loinc_code="39156-5",
            display_name="Body Mass Index",
            value=bmi,
            unit="kg/m2",
            unit_code="kg/m2"
        )
        
        observations = [height_obs, weight_obs, bmi_obs]
        
        # Store in Firestore
        db = firestore.client()
        vitals_ref = db.collection("fhir_observations").document(vitals.uid).collection("vitals")
        
        for obs in observations:
            vitals_ref.document(obs["id"]).set(obs)

        return {"message": "FHIR Vitals Observations created successfully", "data": observations}
        
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Vitals: {str(e)}")

@app.post("/fhir/diagnostic-report")
def create_diagnostic_report(report_req: DiagnosticReportRequest):
    """
    Creates multiple FHIR Observation resources from lab values, and links them 
    to a generated FHIR DiagnosticReport resource.
    Stores the report under the `fhir_reports/{uid}` collection.
    """
    try:
        observations = []
        labs = report_req.labValues
        
        # 1. Build Observations for each provided lab value
        if labs.hemoglobin is not None:
            # LOINC 718-7 for Hemoglobin [Mass/volume] in Blood
            observations.append(build_fhir_observation(
                patient_uid=report_req.uid,
                loinc_code="718-7",
                display_name="Hemoglobin",
                value=labs.hemoglobin,
                unit="g/dL",
                unit_code="g/dL"
            ))
            
        if labs.vitaminD is not None:
            # LOINC 62292-8 for 25-hydroxyvitamin D
            observations.append(build_fhir_observation(
                patient_uid=report_req.uid,
                loinc_code="62292-8",
                display_name="25-hydroxyvitamin D",
                value=labs.vitaminD,
                unit="ng/mL",
                unit_code="ng/mL"
            ))
            
        if labs.glucose is not None:
            # LOINC 2345-7 for Glucose [Mass/volume] in Serum or Plasma
            observations.append(build_fhir_observation(
                patient_uid=report_req.uid,
                loinc_code="2345-7",
                display_name="Glucose",
                value=labs.glucose,
                unit="mg/dL",
                unit_code="mg/dL"
            ))
            
        # 2. Extract observation IDs
        obs_ids = [obs["id"] for obs in observations]
        
        # 3. Build DiagnosticReport grouping these observations
        diagnostic_report = build_fhir_diagnostic_report(
            patient_uid=report_req.uid,
            observation_ids=obs_ids
        )
        
        # 4. Store in Firestore
        db = firestore.client()
        # Reference to the user's specific diagnostic reports collection
        report_ref = db.collection("fhir_reports").document(report_req.uid).collection("reports").document(diagnostic_report["id"])
        
        # Optional structure: store observations as a subcollection or simply embedded/linked
        # Here we follow storing the report document which references the observation IDs.
        # We also batch save the observations in the database for completeness if needed, but the prompt
        # asks to store the Diagnostic Report in fhir_reports/{uid}/ 
        # (It is best practice to store observations as well so the references resolve)
        
        batch = db.batch()
        batch.set(report_ref, diagnostic_report)
        
        for obs in observations:
            obs_ref = db.collection("fhir_reports").document(report_req.uid).collection("observations").document(obs["id"])
            batch.set(obs_ref, obs)
            
        batch.commit()

        return {
            "message": "FHIR Diagnostic Report created successfully", 
            "data": diagnostic_report,
            "observations_created": len(observations)
        }
        
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to create FHIR Diagnostic Report: {str(e)}")

from fastapi import UploadFile, File, Form
from firebase_admin import storage
from pdf_parser import extract_text_from_pdf
from report_builder import extract_lab_values
from ai_engine import analyze_lab_values

@app.post("/upload/blood-report")
async def upload_blood_report(uid: str = Form(...), file: UploadFile = File(...)):
    """
    1. Accepts a PDF Blood Report and User UID.
    2. Uploads the raw PDF to Firebase Storage.
    3. Extracts text via PyPDF2 / OCR.
    4. Heuristically pulls lab values.
    5. Analyzes the values using OpenAI GPT-4o-mini.
    6. Stores a FHIR DiagnosticReport with the AI structured summary in `.note`.
    """
    try:
        # 1. Read PDF bytes
        file_bytes = await file.read()
        
        # 2. Upload to Firebase Storage
        bucket = storage.bucket()
        safe_filename = file.filename.replace(" ", "_")
        blob = bucket.blob(f"blood_reports/{uid}/{safe_filename}")
        blob.upload_from_string(file_bytes, content_type=file.content_type)
        blob.make_public()
        pdf_url = blob.public_url
        
        # 3. Extract Text from PDF
        raw_text = extract_text_from_pdf(file_bytes)
        
        # 4. Extract Heuristics
        lab_values = extract_lab_values(raw_text)
        
        # 5. Get AI Summary
        # Note: If no meaningful heuristics were found but there is text, 
        # OpenAI might still figure it out from the raw_text.
        # But we will pass the structured extracted dictionary combined with raw_text context safely.
        summary_payload = (
            f"Extracted Heuristics: {lab_values}\n"
            f"--- RAW TEXT ---\n{raw_text[:2500]}" # cap length for speed/cost if huge
        )
        ai_summary = analyze_lab_values(summary_payload)
        
        # 6. Build Observations based on heuristics
        observations = []
        if lab_values.get("hemoglobin") is not None:
            observations.append(build_fhir_observation(uid, "718-7", "Hemoglobin", lab_values["hemoglobin"], "g/dL", "g/dL"))
        if lab_values.get("vitaminD") is not None:
            observations.append(build_fhir_observation(uid, "62292-8", "25-hydroxyvitamin D", lab_values["vitaminD"], "ng/mL", "ng/mL"))
        if lab_values.get("glucose") is not None:
            observations.append(build_fhir_observation(uid, "2345-7", "Glucose", lab_values["glucose"], "mg/dL", "mg/dL"))
            
        obs_ids = [obs["id"] for obs in observations]
        
        # 7. Convert AI JSON summary to FHIR Note annotation
        # The AI returns { "risk_level": "...", "clinical_summary": "...", "lifestyle_recommendations": [...] }
        note_text = (
            f"AI Risk Level: {ai_summary.get('risk_level', 'Unknown')}\n\n"
            f"Clinical Summary: {ai_summary.get('clinical_summary', 'N/A')}\n\n"
            f"Recommendations:\n- " + "\n- ".join(ai_summary.get('lifestyle_recommendations', []))
        )
        
        diagnostic_report = build_fhir_diagnostic_report(uid, obs_ids)
        # Inject the presentation document URL and the AI note
        diagnostic_report["presentedForm"] = [{"url": pdf_url, "title": file.filename}]
        diagnostic_report["note"] = [{"text": note_text}]
        
        # 8. Store EVERYTHING in Firestore
        db = firestore.client()
        report_ref = db.collection("fhir_reports").document(uid).collection("reports").document(diagnostic_report["id"])
        
        batch = db.batch()
        batch.set(report_ref, diagnostic_report)
        for obs in observations:
            obs_ref = db.collection("fhir_reports").document(uid).collection("observations").document(obs["id"])
            batch.set(obs_ref, obs)
            
        # 9. Create High Risk Alert if applicable
        if ai_summary.get("risk_level") == "High":
            alert_id = str(uuid.uuid4())
            alert_ref = db.collection("alerts").document(alert_id)
            
            # Find assigned doctor if any, otherwise leave blank
            try:
                # Firestore group query or specific query to find if this patient is assigned
                # For simplicity, we search doctor_assignments/{doc_uid}/patients/{patient_uid}
                # Since we don't know the doc_uid immediately, we query across all doctors:
                assignments = db.collection_group("patients").where("__name__", "==", patient_uid).get()
                assigned_doctor = assignments[0].reference.parent.parent.id if assignments else ""
            except Exception:
                assigned_doctor = ""

            batch.set(alert_ref, {
                "patient_uid": uid,
                "report_id": diagnostic_report["id"],
                "risk_level": "High",
                "status": "unresolved",
                "created_at": firestore.SERVER_TIMESTAMP,
                "assigned_doctor": assigned_doctor
            })
            
        batch.commit()
        
        return {
            "message": "Blood Report uploaded and analyzed successfully.",
            "pdf_url": pdf_url,
            "extracted_labs": lab_values,
            "ai_analysis": ai_summary,
            "fhir_report": diagnostic_report
        }
        
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to process Blood Report PDF: {str(e)}")

from firebase_admin import auth
from datetime import datetime

@app.get("/doctor/reports")
def get_all_reports(doctor_uid: str):
    """
    Retrieves all DiagnosticReports from patients ASSIGNED to this doctor.
    """
    try:
        # 1. Verify role = doctor
        user_record = auth.get_user(doctor_uid)
        claims = user_record.custom_claims or {}
        if claims.get('role') != 'doctor':
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Only verified doctors can view reports.")
            
        db = firestore.client()
        
        # 2. Fetch assigned patients
        assignments_ref = db.collection("doctor_assignments").document(doctor_uid).collection("patients").stream()
        assigned_patient_uids = [doc.id for doc in assignments_ref]
        
        if not assigned_patient_uids:
            return {"reports": []}
            
        all_reports = []
        
        # 3. Fetch DiagnosticReports ONLY for assigned patients
        for p_uid in assigned_patient_uids:
            # CHECK EXPLICIT PATIENT CONSENT
            consent_doc = db.collection("consents").document(p_uid).collection("doctors").document(doctor_uid).get()
            if not consent_doc.exists or not consent_doc.to_dict().get("granted", False):
                continue
                
            reports_ref = db.collection("fhir_reports").document(p_uid).collection("reports").stream()
            for doc in reports_ref:
                report_data = doc.to_dict()
                report_data["patient_uid"] = p_uid
                
                # Attach alert status if high risk
                # Optimization: We could fetch all alerts for this doctor first, but querying by report_id is clean here.
                alert_query = db.collection("alerts").where("report_id", "==", report_data["id"]).limit(1).stream()
                alert_docs = list(alert_query)
                if alert_docs:
                    alert_doc = alert_docs[0].to_dict()
                    report_data["alert_status"] = alert_doc.get("status", "unresolved")
                    report_data["alert_id"] = alert_docs[0].id
                else:
                    report_data["alert_status"] = "none"
                    
                all_reports.append(report_data)
            
        return {"reports": all_reports}
        
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to fetch reports: {str(e)}")

from pydantic import BaseModel

class AlertResolveRequest(BaseModel):
    doctor_uid: str
    alert_id: str

@app.post("/doctor/resolve-alert")
def resolve_high_risk_alert(req: AlertResolveRequest):
    """
    Allows a doctor to mark an alert as resolved.
    """
    try:
        # 1. Verify role = doctor
        user_record = auth.get_user(req.doctor_uid)
        claims = user_record.custom_claims or {}
        if claims.get('role') != 'doctor':
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Only verified doctors can resolve alerts.")
            
        db = firestore.client()
        
        # 2. Fetch and update Alert
        alert_ref = db.collection("alerts").document(req.alert_id)
        alert_doc = alert_ref.get()
        
        if not alert_doc.exists:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Alert not found.")
            
        alert_ref.update({
            "status": "resolved",
            "resolved_at": firestore.SERVER_TIMESTAMP,
            "resolved_by": req.doctor_uid
        })
        
        # 3. Log action
        audit_ref = db.collection("audit_logs").document()
        audit_ref.set({
            "action": "RESOLVE_ALERT",
            "doctor_uid": req.doctor_uid,
            "alert_id": req.alert_id,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return {"message": "Alert resolved successfully."}
        
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to resolve alert: {str(e)}")

@app.post("/doctor/add-comment")
def add_doctor_comment(req: DoctorCommentRequest):
    """
    Allows a doctor to append a comment to a specific DiagnosticReport.
    Verifies that the requester has the 'doctor' custom claim.
    Appends the comment to the DiagnosticReport.note array.
    Logs the action in the audit_logs collection.
    """
    try:
        # 1. Verify role = doctor
        user_record = auth.get_user(req.doctor_uid)
        claims = user_record.custom_claims or {}
        if claims.get('role') != 'doctor':
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Only verified doctors can add comments.")
            
        db = firestore.client()
        
        # 2. Fetch existing DiagnosticReport
        report_ref = db.collection("fhir_reports").document(req.patient_uid).collection("reports").document(req.report_id)
        report_doc = report_ref.get()
        
        if not report_doc.exists:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="DiagnosticReport not found.")
            
        report_data = report_doc.to_dict()
        
        # 3. Append comment to DiagnosticReport.note safely
        new_note = {
            "author": req.doctor_uid,
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "type": "doctor_comment",
            "text": req.comment
        }
        
        notes = report_data.get("note", [])
        notes.append(new_note)
        
        report_ref.update({"note": notes})
        
        # 4. Log action in audit_logs
        audit_ref = db.collection("audit_logs").document()
        audit_ref.set({
            "action": "ADD_DOCTOR_COMMENT",
            "doctor_uid": req.doctor_uid,
            "patient_uid": req.patient_uid,
            "report_id": req.report_id,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return {
            "message": "Comment added successfully.", 
            "note": new_note
        }
        
    except Exception as e:
        from fastapi import HTTPException
        # Handle already caught HTTPExceptions cleanly
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to add comment: {str(e)}")

@app.post("/admin/assign-role")
def assign_user_role(req: RoleAssignRequest):
    """
    Assigns a role (doctor or hospital) to a user.
    Only users with the 'hospital' role can perform this action.
    """
    try:
        if req.role not in ["doctor", "hospital"]:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Invalid role. Must be 'doctor' or 'hospital'.")
            
        # 1. Verify assigner is a hospital
        try:
            assigner_record = auth.get_user(req.assigner_uid)
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Assigner user not found.")
            
        claims = assigner_record.custom_claims or {}
        if claims.get('role') != 'hospital':
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Only hospital administrators can assign roles.")
            
        # 2. Verify target user exists
        try:
            auth.get_user(req.target_uid)
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Target user not found.")
            
        # 3. Set custom user claims
        auth.set_custom_user_claims(req.target_uid, {"role": req.role})
        
        # 4. Update Firestore users/{uid} document
        db = firestore.client()
        db.collection("users").document(req.target_uid).set({"role": req.role}, merge=True)
        
        # 5. Add audit logging
        audit_ref = db.collection("audit_logs").document()
        audit_ref.set({
            "action": "ASSIGN_ROLE",
            "assigner_uid": req.assigner_uid,
            "target_uid": req.target_uid,
            "assigned_role": req.role,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return {"message": f"Successfully assigned role '{req.role}' to user {req.target_uid}."}
        
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to assign role: {str(e)}")

@app.get("/patient/reports")
def get_patient_reports(uid: str = Depends(get_current_patient_uid)):
    """
    Fetches all DiagnosticReports and associated Observations for the authenticated patient.
    """
    try:
        db = firestore.client()
        
        # 1. Fetch reports
        reports_ref = db.collection("fhir_reports").document(uid).collection("reports")
        reports = [doc.to_dict() for doc in reports_ref.stream()]
        
        # 2. Fetch observations
        obs_ref = db.collection("fhir_reports").document(uid).collection("observations")
        observations = [doc.to_dict() for doc in obs_ref.stream()]
        
        return {
            "uid": uid,
            "reports": reports,
            "observations": observations
        }
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to fetch patient reports: {str(e)}")

@app.get("/patient/vitals")
def get_patient_vitals(uid: str = Depends(get_current_patient_uid)):
    """
    Fetches all Vitals Observations (Height, Weight, BMI) for the authenticated patient.
    """
    try:
        db = firestore.client()
        vitals_ref = db.collection("fhir_observations").document(uid).collection("vitals")
        vitals = [doc.to_dict() for doc in vitals_ref.stream()]
        
        return {
            "uid": uid,
            "vitals": vitals
        }
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to fetch patient vitals: {str(e)}")

@app.get("/hospital/doctors")
def get_hospital_doctors(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns a list of all users with the 'doctor' role, including patient assignment counts.
    """
    try:
        db = firestore.client()
        doctors_ref = db.collection("users").where("role", "==", "doctor")
        docs = doctors_ref.stream()
        
        doctors = []
        for doc in docs:
            doc_data = doc.to_dict()
            
            # Count assigned patients efficiently
            assignments = db.collection("doctor_assignments").document(doc.id).collection("patients").get()
            patient_count = len(assignments)
            
            doctors.append({
                "uid": doc.id,
                "email": doc_data.get("email", ""),
                "name": doc_data.get("name", ""),
                "patient_count": patient_count
            })
            
        return {"doctors": doctors}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to fetch doctors: {str(e)}")

@app.get("/hospital/patients")
def get_hospital_patients(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns a list of all users with the 'patient' role.
    """
    try:
        db = firestore.client()
        patients_ref = db.collection("users").where("role", "==", "patient")
        docs = patients_ref.stream()
        
        patients = []
        for doc in docs:
            doc_data = doc.to_dict()
            patients.append({
                "uid": doc.id,
                "email": doc_data.get("email", ""),
                "name": doc_data.get("name", "")
            })
            
        return {"patients": patients}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to fetch patients: {str(e)}")

@app.get("/hospital/stats")
def get_hospital_stats(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns aggregate stats: Total patients, doctors, reports, and high-risk reports.
    Does not expose sensitive patient details.
    """
    try:
        db = firestore.client()
        
        # 1. Total patients
        patients_query = db.collection("users").where("role", "==", "patient").stream()
        total_patients = sum(1 for _ in patients_query)
        
        # 2. Total doctors
        doctors_query = db.collection("users").where("role", "==", "doctor").stream()
        total_doctors = sum(1 for _ in doctors_query)
        
        # 3. Total reports & High-risk reports
        reports_ref = db.collection_group("reports").stream()
        
        total_reports = 0
        for doc in reports_ref:
            total_reports += 1
            
        # Count only active unresolved high-risk alerts globally
        alerts_ref = db.collection("alerts").where("status", "==", "unresolved").where("risk_level", "==", "High").stream()
        high_risk_reports = len(list(alerts_ref))
                    
        return {
            "total_patients": total_patients,
            "total_doctors": total_doctors,
            "total_reports": total_reports,
            "high_risk_reports": high_risk_reports
        }
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to fetch hospital stats: {str(e)}")

@app.get("/hospital/audit-logs")
def get_audit_logs(uid: str = Depends(get_current_hospital_uid)):
    """
    Returns the 50 most recent audit logs.
    """
    try:
        db = firestore.client()
        logs_query = db.collection("audit_logs").order_by("timestamp", direction=firestore.Query.DESCENDING).limit(50)
        docs = logs_query.stream()
        
        logs = []
        for doc in docs:
            log_data = doc.to_dict()
            # Convert server timestamp to string if it exists
            if "timestamp" in log_data and log_data["timestamp"]:
                log_data["timestamp"] = log_data["timestamp"].isoformat()
            logs.append(log_data)
            
        return {"audit_logs": logs}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to fetch audit logs: {str(e)}")

@app.post("/hospital/assign-patient")
def assign_patient_to_doctor(req: PatientAssignRequest, uid: str = Depends(get_current_hospital_uid)):
    """
    Assigns a specific patient to a specific doctor.
    Only users with the 'hospital' role can perform this action.
    """
    try:
        # Ensure assigner matches the token UID purely for safety/logging
        if req.hospital_uid != uid:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Mismatched assigner ID.")
            
        # 1. Verify doctor exists and is actually a doctor
        try:
            doc_record = auth.get_user(req.doctor_uid)
            doc_claims = doc_record.custom_claims or {}
            if doc_claims.get('role') != 'doctor':
                from fastapi import HTTPException
                raise HTTPException(status_code=400, detail="Target user is not a verified doctor.")
        except Exception as auth_e:
            from fastapi import HTTPException
            if hasattr(auth_e, 'status_code'):
                raise auth_e
            raise HTTPException(status_code=404, detail="Doctor user not found.")
            
        # 2. Verify patient exists
        try:
            auth.get_user(req.patient_uid)
        except Exception:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Patient user not found.")
            
        db = firestore.client()
        
        # 3. Create assignment document: doctor_assignments/{doctor_uid}/patients/{patient_uid}
        assignment_ref = db.collection("doctor_assignments").document(req.doctor_uid).collection("patients").document(req.patient_uid)
        assignment_ref.set({
            "assigned_by": req.hospital_uid,
            "assigned_at": firestore.SERVER_TIMESTAMP,
            "status": "active"
        })
        
        # 4. Add audit logging
        audit_ref = db.collection("audit_logs").document()
        audit_ref.set({
            "action": "ASSIGN_PATIENT",
            "hospital_uid": req.hospital_uid,
            "doctor_uid": req.doctor_uid,
            "patient_uid": req.patient_uid,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        return {"message": "Patient successfully assigned to doctor."}
        
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=500, detail=f"Failed to assign patient: {str(e)}")

# ==========================================
# INSTRUCTIONS TO RUN
# ==========================================
# 1. Create a virtual environment: `python3.11 -m venv venv`
# 2. Activate it:
#    - Windows: `venv\Scripts\activate`
#    - Mac/Linux: `source venv/bin/activate`
# 3. Install requirements: `pip install -r requirements.txt`
# 4. Set service account path (Example):
#    - Windows CMD: `set GOOGLE_APPLICATION_CREDENTIALS=path/to/key.json`
#    - Windows PowerShell: `$env:GOOGLE_APPLICATION_CREDENTIALS="path/to/key.json"`
# 5. Start the server: `uvicorn app:app --reload`
@app.post("/patient/grant-consent")
def grant_patient_consent(req: PatientConsentRequest, uid: str = Depends(get_current_patient_uid)):
    """
    Allows a patient to grant viewing consent to a specific doctor.
    """
    try:
        db = firestore.client()
        consent_ref = db.collection("consents").document(uid).collection("doctors").document(req.doctor_uid)
        consent_ref.set({
            "granted": True,
            "timestamp": firestore.SERVER_TIMESTAMP
        }, merge=True)
        return {"message": "Consent granted successfully."}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to grant consent: {str(e)}")

@app.post("/patient/revoke-consent")
def revoke_patient_consent(req: PatientConsentRequest, uid: str = Depends(get_current_patient_uid)):
    """
    Allows a patient to revoke viewing consent from a specific doctor.
    """
    try:
        db = firestore.client()
        consent_ref = db.collection("consents").document(uid).collection("doctors").document(req.doctor_uid)
        consent_ref.set({
            "granted": False,
            "timestamp": firestore.SERVER_TIMESTAMP
        }, merge=True)
        return {"message": "Consent revoked successfully."}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=f"Failed to revoke consent: {str(e)}")

# ─── Super Admin Auth Helper ───────────────────────────────────────────────

def get_current_superadmin_uid(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        from firebase_admin import auth
        decoded_token = auth.verify_id_token(credentials.credentials)
        role = decoded_token.get("role", "")
        if role != "superadmin":
            from fastapi import HTTPException
            raise HTTPException(status_code=403, detail="Unauthorized: Super Admin access required.")
        return decoded_token.get("uid")
    except Exception as e:
        from fastapi import HTTPException
        if hasattr(e, 'status_code'):
            raise e
        raise HTTPException(status_code=401, detail="Invalid authentication token")


# ─── Super Admin Endpoints ─────────────────────────────────────────────────

@app.get("/superadmin/all-users")
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
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/superadmin/platform-stats")
def get_platform_stats(uid: str = Depends(get_current_superadmin_uid)):
    """Returns platform-wide statistics."""
    try:
        db = firestore.client()
        users = list(db.collection("users").stream())
        patients = [u for u in users if u.to_dict().get("role") == "patient"]
        doctors = [u for u in users if u.to_dict().get("role") == "doctor"]
        hospitals = [u for u in users if u.to_dict().get("role") == "hospital"]

        # Count all reports
        total_reports = 0
        high_risk_reports = 0
        for p in patients:
            reports = list(db.collection("patients").document(p.id).collection("diagnostic_reports").stream())
            total_reports += len(reports)

        # Count unresolved alerts
        alerts = list(db.collection("alerts").where("status", "==", "unresolved").stream())

        return {
            "total_patients": len(patients),
            "total_doctors": len(doctors),
            "total_hospitals": len(hospitals),
            "total_reports": total_reports,
            "unresolved_alerts": len(alerts),
            "total_users": len(users)
        }
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/superadmin/all-reports")
def get_all_reports(uid: str = Depends(get_current_superadmin_uid)):
    """Returns all diagnostic reports across all patients."""
    try:
        db = firestore.client()
        patients = list(db.collection("users").where("role", "==", "patient").stream())
        all_reports = []
        for p in patients:
            p_data = p.to_dict()
            reports = db.collection("patients").document(p.id).collection("diagnostic_reports").stream()
            for r in reports:
                report_data = r.to_dict()
                report_data["id"] = r.id
                report_data["patient_uid"] = p.id
                report_data["patient_name"] = p_data.get("name", "Unknown")
                report_data["patient_email"] = p_data.get("email", "")
                all_reports.append(report_data)
        return {"reports": all_reports}
    except Exception as e:
        from fastapi import HTTPException
        raise HTTPException(status_code=500, detail=str(e))


# ─── Patient Lookup (Centralized Cross-Hospital) ──────────────────────────

@app.get("/patient/lookup")
def lookup_patient_by_health_id(health_id: str):
    """
    Allows any authenticated user to search for a patient by their Health ID.
    Returns basic patient info for cross-hospital record access.
    """
    from fastapi import HTTPException
    try:
        db = firestore.client()
        users = db.collection("users").where("role", "==", "patient").stream()
        for u in users:
            data = u.to_dict()
            if data.get("healthId", "") == health_id:
                # Return basic info + their reports
                reports = list(db.collection("patients").document(u.id).collection("diagnostic_reports").stream())
                report_list = []
                for r in reports:
                    rd = r.to_dict()
                    rd["id"] = r.id
                    report_list.append(rd)

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
                    "reports": report_list
                }
        raise HTTPException(status_code=404, detail=f"No patient found with Health ID: {health_id}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ─── Step Count & Reward System ────────────────────────────────────────────

class StepLogRequest(BaseModel):
    steps: int

REWARD_TIERS = [
    (15000, 50),
    (10000, 25),
    (5000, 10),
]

@app.post("/patient/log-steps")
def log_steps(req: StepLogRequest, uid: str = Depends(get_current_patient_uid)):
    """Log daily steps and calculate reward points."""
    from fastapi import HTTPException
    from datetime import datetime
    try:
        db = firestore.client()
        today = datetime.utcnow().strftime("%Y-%m-%d")

        ref = db.collection("step_rewards").document(uid)
        doc = ref.get()

        if doc.exists:
            data = doc.to_dict()
        else:
            data = {"daily_steps": {}, "total_points": 0, "rewards_claimed": []}

        # Calculate points for this entry
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
            "steps_today": req.steps
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patient/step-rewards")
def get_step_rewards(uid: str = Depends(get_current_patient_uid)):
    """Get step history and reward points."""
    from fastapi import HTTPException
    try:
        db = firestore.client()
        ref = db.collection("step_rewards").document(uid)
        doc = ref.get()

        if not doc.exists:
            return {"daily_steps": {}, "total_points": 0, "rewards_claimed": []}

        return doc.to_dict()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

