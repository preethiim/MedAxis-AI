import os
import random
import string
import time
from datetime import datetime, timedelta, timezone

from dotenv import load_dotenv
load_dotenv()

# We need to initialize Firebase before any auth/firestore calls
from firebase_config import initialize_firebase
initialize_firebase()

from firebase_admin import auth, firestore
from routers.auth_helpers import build_standard_user_doc, generate_unique_id

db = firestore.client()

INDIAN_FIRST_NAMES_M = ["Rahul", "Amit", "Rohan", "Vikram", "Sanjay", "Rajesh", "Suresh", "Sunil", "Ramesh", "Arun", "Karan", "Arjun", "Vivek", "Siddharth"]
INDIAN_FIRST_NAMES_F = ["Priya", "Anjali", "Sneha", "Pooja", "Neha", "Kavita", "Sunita", "Rita", "Geeta", "Anita", "Deepa", "Divya", "Swati", "Meera"]
INDIAN_LAST_NAMES = ["Sharma", "Verma", "Singh", "Kumar", "Gupta", "Patel", "Reddy", "Rao", "Das", "Shah", "Jain", "Agarwal", "Iyer", "Nair"]

DEPARTMENTS = ["Cardiology", "General Medicine", "Pediatrics", "Orthopedics"]

HOSPITAL_NAMES = [
    "Apollo Hospitals",
    "Fortis Healthcare",
    "Max Super Speciality"
]

def random_string(length=6):
    return ''.join(random.choices(string.ascii_uppercase + string.digits, k=length))

def generate_name(gender=None):
    if not gender:
        gender = random.choice(["M", "F"])
    if gender == "M":
        first = random.choice(INDIAN_FIRST_NAMES_M)
    else:
        first = random.choice(INDIAN_FIRST_NAMES_F)
    last = random.choice(INDIAN_LAST_NAMES)
    return f"{first} {last}"

def create_firebase_user(email, password, name, role):
    try:
        user_record = auth.get_user_by_email(email)
        print(f"User {email} already exists, deleting first...")
        auth.delete_user(user_record.uid)
        db.collection("users").document(user_record.uid).delete()
    except auth.UserNotFoundError:
        pass

    user_record = auth.create_user(
        email=email,
        password=password,
        display_name=name
    )
    auth.set_custom_user_claims(user_record.uid, {"role": role})
    return user_record

def seed_hospitals():
    print("--- Seeding Hospitals ---")
    hospitals = []
    
    for i, name in enumerate(HOSPITAL_NAMES):
        email = f"hospital{i+1}@medaxis.local"
        user_record = create_firebase_user(email, "Password@123", name, "hospital")
        
        hospital_id = f"HOSP-{random.randint(1000, 9999)}"
        # Simplified ID generation since we're just seeding
        
        doc_data = build_standard_user_doc(
            uid=user_record.uid,
            role="hospital",
            email=email,
            name=name,
            password="Password@123", # Store in Firestore
            hospitalId=hospital_id
        )
        db.collection("users").document(user_record.uid).set(doc_data)
        hospitals.append({
            "uid": user_record.uid,
            "hospitalId": hospital_id,
            "name": name
        })
        print(f"Created Hospital: {name} ({hospital_id})")
        
    return hospitals

def seed_doctors(hospitals, count=10):
    print(f"\n--- Seeding {count} Doctors ---")
    doctors = []
    
    for i in range(count):
        gender = random.choice(["M", "F"])
        name = f"Dr. {generate_name(gender)}"
        email = f"doctor{i+1}@medaxis.local"
        
        hospital = random.choice(hospitals)
        user_record = create_firebase_user(email, "Password@123", name, "doctor")
        
        doctor_id = f"DOC-{random.randint(1000, 9999)}"
        hosp_short = hospital["hospitalId"].split("-")[1]
        employee_id = f"EMP-{hosp_short}-{random.randint(1000, 9999)}"
        dept = random.choice(DEPARTMENTS)
        
        doc_data = build_standard_user_doc(
            uid=user_record.uid,
            role="doctor",
            email=email,
            name=name,
            password="Password@123", # Store in Firestore
            hospitalId=hospital["hospitalId"],
            hospitalUid=hospital["uid"],
            doctorId=doctor_id,
            employeeId=employee_id,
            specialization=dept,
            yearsOfExperience=random.randint(5, 25)
        )
        db.collection("users").document(user_record.uid).set(doc_data)
        doctors.append({
            "uid": user_record.uid,
            "doctorId": doctor_id,
            "name": name,
            "hospitalUid": hospital["uid"]
        })
        print(f"Created Doctor: {name} ({doctor_id}) at {hospital['name']}")
        
    return doctors

def seed_patients(count=25):
    print(f"\n--- Seeding {count} Patients ---")
    patients = []
    
    for i in range(count):
        gender = random.choice(["M", "F"])
        name = generate_name(gender)
        email = f"patient{i+1}@medaxis.local"
        
        user_record = create_firebase_user(email, "Password@123", name, "patient")
        
        health_id = f"PAT-{random_string(6)}"
        
        doc_data = build_standard_user_doc(
            uid=user_record.uid,
            role="patient",
            email=email,
            name=name,
            password="Password@123", # Store in Firestore
            healthId=health_id,
            gender="male" if gender == "M" else "female",
            birthDate=(datetime.now() - timedelta(days=random.randint(20, 60)*365)).strftime("%Y-%m-%d")
        )
        db.collection("users").document(user_record.uid).set(doc_data)
        patients.append({
            "uid": user_record.uid,
            "healthId": health_id,
            "name": name
        })
        print(f"Created Patient: {name} ({health_id})")
        
    return patients

def seed_clinical_data(patients, doctors):
    print("\n--- Seeding Assignments & Clinical Data ---")
    
    for patient in patients:
        # Assign to 1-2 random doctors
        assigned_docs = random.sample(doctors, random.randint(1, 2))
        
        for doc in assigned_docs:
            # 1. Assignment
            assign_ref = db.collection("patient_assignments").document()
            assign_ref.set({
                "patient_uid": patient["uid"],
                "doctor_uid": doc["uid"],
                "hospital_uid": doc["hospitalUid"],
                "status": "active",
                "assigned_at": firestore.SERVER_TIMESTAMP,
            })
            
            # 2. Consent
            consent_ref = db.collection("patient_doctor_consent").document(f"{patient['uid']}_{doc['uid']}")
            consent_ref.set({
                "patient_uid": patient["uid"],
                "doctor_uid": doc["uid"],
                "granted": True,
                "updated_at": firestore.SERVER_TIMESTAMP,
            })
            
            print(f"Assigned & Consented: {patient['name']} -> {doc['name']}")
            
        # 3. Create Sample Vitals (FHIR Observation)
        obs_ref = db.collection("observations").document()
        height = random.randint(150, 185)
        weight = random.randint(55, 95)
        bmi = round(weight / ((height/100)**2), 1)
        
        obs_ref.set({
            "resourceType": "Observation",
            "status": "final",
            "subject": {"reference": f"Patient/{patient['uid']}"},
            "effectiveDateTime": datetime.now(timezone.utc).isoformat(),
            "code": {
                "coding": [
                    {"system": "http://loinc.org", "code": "39156-5", "display": "Body mass index (BMI) [Ratio]"}
                ],
                "text": "BMI"
            },
            "valueQuantity": {
                "value": bmi,
                "unit": "kg/m2",
                "system": "http://unitsofmeasure.org",
                "code": "kg/m2"
            }
        })
        
        # 4. Mock FHIR Report
        report_ref = db.collection("diagnostic_reports").document()
        report_ref.set({
            "resourceType": "DiagnosticReport",
            "status": "final",
            "subject": {"reference": f"Patient/{patient['uid']}"},
            "issued": datetime.now(timezone.utc).isoformat(),
            "conclusion": "Sample seeded diagnostic report. All values within normal parameters.",
            "presentedForm": [],
            "performer": [{"reference": f"Practitioner/{assigned_docs[0]['uid']}"}],
            "contained": [],
            "result": [],
            "medaxis_metadata": {
                "high_risk": random.choice([True, False, False, False]),
                "doctor_comments": [],
                "hospital_uid": assigned_docs[0]["hospitalUid"]
            }
        })

def main():
    print("Starting MedAxis AI Seed Script...\n")
    try:
        hospitals = seed_hospitals()
        doctors = seed_doctors(hospitals, count=10)
        patients = seed_patients(count=25)
        
        seed_clinical_data(patients, doctors)
        
        print("\n✅ Seed data generation complete!")
        print("Note: The script is safe to run multiple times. It will overwrite users with matching emails.")
        
    except Exception as e:
        print(f"\n❌ Error during seeding: {e}")

if __name__ == "__main__":
    main()
