from typing import Dict, Any

def build_fhir_patient(
    uid: str,
    first_name: str,
    last_name: str,
    gender: str,
    birth_date: str,
    health_id: str
) -> Dict[str, Any]:
    """
    Converts raw patient data into a valid FHIR R4 Patient resource JSON structure.
    """
    fhir_patient = {
        "resourceType": "Patient",
        "id": uid,
        "identifier": [
            {
                "use": "official",
                "system": "http://medaxis.ai/identifiers/healthId",
                "value": health_id
            }
        ],
        "name": [
            {
                "use": "official",
                "family": last_name,
                "given": [first_name]
            }
        ],
        "gender": gender.lower() if gender else "unknown",
        "birthDate": birth_date,
        "active": True
    }
    
    return fhir_patient

import uuid
from datetime import datetime

def calculate_bmi(height_cm: float, weight_kg: float) -> float:
    """
    Calculates BMI given height in cm and weight in kg.
    """
    if height_cm <= 0 or weight_kg <= 0:
        return 0.0
    height_m = height_cm / 100.0
    bmi = weight_kg / (height_m * height_m)
    return round(bmi, 2)

def build_fhir_observation(
    patient_uid: str,
    loinc_code: str,
    display_name: str,
    value: float,
    unit: str,
    unit_code: str
) -> Dict[str, Any]:
    """
    Builds a FHIR R4 Observation resource for a vital sign.
    """
    obs_id = str(uuid.uuid4())
    observation = {
        "resourceType": "Observation",
        "id": obs_id,
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/observation-category",
                        "code": "vital-signs",
                        "display": "Vital Signs"
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": loinc_code,
                    "display": display_name
                }
            ]
        },
        "subject": {
            "reference": f"Patient/{patient_uid}"
        },
        "effectiveDateTime": datetime.utcnow().isoformat() + "Z",
        "valueQuantity": {
            "value": value,
            "unit": unit,
            "system": "http://unitsofmeasure.org",
            "code": unit_code
        }
    }
    return observation

from typing import List

def build_fhir_diagnostic_report(
    patient_uid: str,
    observation_ids: List[str]
) -> Dict[str, Any]:
    """
    Builds a FHIR R4 DiagnosticReport resource grouping multiple observations.
    """
    report_id = str(uuid.uuid4())
    
    # Create the result array holding references to the created Observations
    result_references = [{"reference": f"Observation/{obs_id}"} for obs_id in observation_ids]

    report = {
        "resourceType": "DiagnosticReport",
        "id": report_id,
        "status": "final",
        "category": [
            {
                "coding": [
                    {
                        "system": "http://terminology.hl7.org/CodeSystem/v2-0074",
                        "code": "LAB",
                        "display": "Laboratory"
                    }
                ]
            }
        ],
        "code": {
            "coding": [
                {
                    "system": "http://loinc.org",
                    "code": "11502-2",  # General laboratory report
                    "display": "Blood Report"
                }
            ],
            "text": "Blood Report"
        },
        "subject": {
            "reference": f"Patient/{patient_uid}"
        },
        "effectiveDateTime": datetime.utcnow().isoformat() + "Z",
        "issued": datetime.utcnow().isoformat() + "Z",
        "result": result_references
    }
    
    return report
