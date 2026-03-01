"""
prescription_utils.py
FHIR MedicationRequest builder for the MedAxis AI prescription feature.
"""
import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any


def build_fhir_medication_request(
    patient_uid: str,
    doctor_uid: str,
    medication: Dict[str, str],
    notes: str = ""
) -> Dict[str, Any]:
    """
    Builds a single FHIR R4 MedicationRequest resource for one medication.

    Args:
        patient_uid: The patient's UID (subject reference)
        doctor_uid:  The prescribing doctor's UID (requester reference)
        medication:  Dict with keys: name, dosage, frequency, duration
        notes:       Optional clinical notes from the doctor

    Returns:
        A FHIR-compliant MedicationRequest dict ready for Firestore storage.
    """
    request_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    dosage_text = f"{medication.get('dosage', '')} — {medication.get('frequency', '')}"
    if medication.get("duration"):
        dosage_text += f" for {medication['duration']}"

    resource = {
        "resourceType": "MedicationRequest",
        "id": request_id,
        "status": "active",
        "intent": "order",
        "authoredOn": now_iso,

        # What medication
        "medicationCodeableConcept": {
            "text": medication.get("name", "Unknown Medication")
        },

        # For whom
        "subject": {
            "reference": f"Patient/{patient_uid}"
        },

        # Prescribed by
        "requester": {
            "reference": f"Practitioner/{doctor_uid}"
        },

        # Dosage instructions
        "dosageInstruction": [
            {
                "text": dosage_text,
                "timing": {
                    "code": {
                        "text": medication.get("frequency", "")
                    }
                },
                "doseAndRate": [
                    {
                        "doseQuantity": {
                            "value": medication.get("dosage", ""),
                            "unit": "as prescribed"
                        }
                    }
                ]
            }
        ],

        # Duration as an extension (FHIR allows extensions for non-standard fields)
        "extension": [
            {
                "url": "http://medaxis.ai/fhir/duration",
                "valueString": medication.get("duration", "")
            }
        ],

        # Doctor's notes
        "note": [{"text": notes}] if notes else []
    }

    return resource


def build_prescription_bundle(
    patient_uid: str,
    doctor_uid: str,
    medications: List[Dict[str, str]],
    notes: str = ""
) -> Dict[str, Any]:
    """
    Builds a prescription bundle containing one MedicationRequest per medication.

    Returns a dict with:
        - id: unique prescription ID
        - patient_uid, doctor_uid: references
        - medications: list of FHIR MedicationRequest resources
        - created_at: ISO timestamp
        - notes: doctor's notes
    """
    prescription_id = f"RX-{uuid.uuid4().hex[:8].upper()}"
    now_iso = datetime.now(timezone.utc).isoformat()

    medication_requests = [
        build_fhir_medication_request(patient_uid, doctor_uid, med, notes)
        for med in medications
    ]

    return {
        "id": prescription_id,
        "patient_uid": patient_uid,
        "doctor_uid": doctor_uid,
        "medications": medication_requests,
        "medication_names": [m.get("name", "") for m in medications],
        "notes": notes,
        "created_at": now_iso,
        "status": "active"
    }
