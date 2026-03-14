import os
from dotenv import load_dotenv

load_dotenv()
path = os.environ.get('GOOGLE_APPLICATION_CREDENTIALS')
print(f"Path in env: '{path}'")
if path:
    # Clean quotes if they are embedded in the string (happens with some .env parsers)
    clean_path = path.strip('"').strip("'")
    print(f"Cleaned path: '{clean_path}'")
    print(f"Exists: {os.path.exists(clean_path)}")
    
    # Check if relative works
    rel_path = "serviceAccountKey.json"
    print(f"Relative 'serviceAccountKey.json' exists: {os.path.exists(rel_path)}")
    print(f"Current Directory: {os.getcwd()}")
    print(f"Files in current dir: {os.listdir('.')[:5]}")
else:
    print("GOOGLE_APPLICATION_CREDENTIALS not found in .env")
