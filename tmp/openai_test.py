
import os
from dotenv import load_dotenv
from openai import OpenAI

load_dotenv('c:/Users/Kartik/Desktop/MedAxis AI/backend/.env')

def test_openai():
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("ERROR: OPENAI_API_KEY not found in environment.")
        return

    print(f"Testing OpenAI with key starting with: {api_key[:8]}...")
    client = OpenAI(api_key=api_key)
    
    try:
        # Try a tiny completion
        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": "Hello"}],
            max_tokens=5
        )
        print("SUCCESS: Connection successful!")
        print(f"Response: {response.choices[0].message.content}")
    except Exception as e:
        print(f"FAILED: OpenAI API Error: {e}")

if __name__ == "__main__":
    test_openai()
