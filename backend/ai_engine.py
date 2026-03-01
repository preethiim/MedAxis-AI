import os
import json
from openai import OpenAI
from typing import Dict, Any

def get_openai_client() -> OpenAI:
    """
    Initializes and returns the OpenAI client.
    Expects OPENAI_API_KEY to be set in the environment.
    """
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable is missing. Please set it before running the AI Engine.")
    
    # max_retries handles basic timeout/transient network issues automatically
    return OpenAI(api_key=api_key, max_retries=2, timeout=30.0)

def analyze_lab_values(lab_summary: str) -> Dict[str, Any]:
    """
    Analyzes a structured lab summary using GPT-4o-mini.
    Returns a dictionary containing:
    - risk_level: (Low/Moderate/High)
    - clinical_summary: Short clinical summary
    - recommendations: List of lifestyle recommendations
    """
    try:
        client = get_openai_client()
        
        system_prompt = (
            "You are a clinical decision support assistant. "
            "Analyze the provided patient laboratory values and return a structured JSON response. "
            "You must:\n"
            "1. Give a clinical analysis.\n"
            "2. Suggest medication dosages if applicable based on guidelines.\n"
            "3. Offer lifestyle suggestions.\n"
            "4. Clearly classify the risk level (Low/Moderate/High).\n"
            "You MUST return ONLY a raw JSON object adhering strictly to this schema:\n"
            "{\n"
            '  "risk_level": "Low" | "Moderate" | "High",\n'
            '  "clinical_summary": "A short clinical summary of the findings including any medication dosage suggestions.",\n'
            '  "lifestyle_recommendations": ["Recommendation 1", "Recommendation 2"]\n'
            "}"
        )
        
        user_prompt = f"Here are the lab values for analysis:\n\n{lab_summary}"
        
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2, # Keep hallucination risk low
            response_format={ "type": "json_object" } # Force JSON output
        )
        
        raw_json_str = response.choices[0].message.content
        
        if not raw_json_str:
            raise ValueError("Empty response received from OpenAI.")
            
        ai_response = json.loads(raw_json_str)
        
        # Validation fallback to ensure required keys exist
        return {
            "risk_level": ai_response.get("risk_level", "Unknown"),
            "clinical_summary": ai_response.get("clinical_summary", "No clinical summary provided."),
            "lifestyle_recommendations": ai_response.get("lifestyle_recommendations", [])
        }

    except json.JSONDecodeError as e:
        print(f"AI Engine Error: Failed to parse JSON from OpenAI response: {getattr(e, 'doc', '')}")
        return {
            "risk_level": "Unknown",
            "clinical_summary": "Failed to parse AI response into structured JSON.",
            "lifestyle_recommendations": []
        }
    except Exception as e:
        print(f"AI Engine Error: Exception during OpenAI call: {e}")
        return {
            "risk_level": "Unknown",
            "clinical_summary": f"Failed to analyze lab values: {str(e)}",
            "lifestyle_recommendations": []
        }
