import re
from typing import Dict, Any

def extract_lab_values(raw_text: str) -> Dict[str, float]:
    """
    A heuristic-based parser to extract common lab values from raw OCR/PDF text.
    It uses regular expressions to find known lab markers and extract the neighboring float values.
    Returns a dictionary of found lab values.
    """
    lab_values = {
        "hemoglobin": None,
        "vitaminD": None,
        "glucose": None
    }
    
    if not raw_text:
        return lab_values
        
    # Convert to lowercase for easier matching
    text_lower = raw_text.lower()
    
    # Heuristic 1: Hemoglobin (Hb, Hgb, Hemoglobin)
    # Looks for "hemoglobin" followed by optional characters and then a decimal number
    hb_match = re.search(r'(?:hemoglobin|hgb|hb)\s*[:=]?\s*(\d{1,2}(?:\.\d{1,2})?)', text_lower)
    if hb_match:
        try:
            lab_values["hemoglobin"] = float(hb_match.group(1))
        except ValueError:
            pass
            
    # Heuristic 2: Vitamin D (25-OH Vitamin D, Vitamin D)
    vit_d_match = re.search(r'(?:vitamin\s*d|25-oh\s*vit.*?d)\s*[:=]?\s*(\d{1,3}(?:\.\d{1,2})?)', text_lower)
    if vit_d_match:
        try:
            lab_values["vitaminD"] = float(vit_d_match.group(1))
        except ValueError:
            pass
            
    # Heuristic 3: Glucose (Fasting Glucose, Blood Glucose)
    glucose_match = re.search(r'glucose\s*[:=]?\s*(\d{2,4}(?:\.\d{1,2})?)', text_lower)
    if glucose_match:
        try:
            lab_values["glucose"] = float(glucose_match.group(1))
        except ValueError:
            pass
            
    return lab_values
