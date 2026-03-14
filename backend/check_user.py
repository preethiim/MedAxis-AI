import firebase_admin
from firebase_admin import credentials, firestore
import os
from dotenv import load_dotenv

load_dotenv()

def check_users():
    if not firebase_admin._apps:
        cred_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
    
    import json
    db = firestore.client()
    users_list = []
    
    users = db.collection("users").order_by("createdAt", direction=firestore.Query.DESCENDING).limit(10).stream()
    
    for user in users:
        data = user.to_dict()
        user_info = {
            "uid": user.id,
            "name": data.get('fullName', 'N/A'),
            "email": data.get('email', 'N/A'),
            "phone": data.get('phoneNumber', 'N/A'),
            "role": data.get('role', 'N/A')
        }
        users_list.append(user_info)
    
    with open("users_debug.json", "w") as f:
        json.dump(users_list, f, indent=4)
    print("Done. Saved to users_debug.json")

if __name__ == "__main__":
    check_users()
