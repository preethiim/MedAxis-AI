import io
import os
from PyPDF2 import PdfReader

def extract_text_from_file(file_bytes: bytes, filename: str) -> str:
    """
    Routes file extraction based on the file extension.
    If the file is a PDF, uses PyPDF2 (and OCR fallback).
    If the file is an image, uses Tesseract directly.
    """
    ext = os.path.splitext(filename)[1].lower()
    if ext in ['.png', '.jpg', '.jpeg']:
        return extract_text_from_image(file_bytes)
    elif ext == '.pdf':
        return extract_text_from_pdf(file_bytes)
    elif ext == '.txt':
        return file_bytes.decode('utf-8', errors='replace')
    else:
        raise ValueError(f"Unsupported file type: {ext}")

def extract_text_from_image(file_bytes: bytes) -> str:
    """
    Extracts text from an image directly using Tesseract OCR.
    """
    try:
        from PIL import Image
        import pytesseract
        
        image = Image.open(io.BytesIO(file_bytes))
        # Ensure it's in a format Tesseract likes, such as RGB
        if image.mode != 'RGB':
            image = image.convert('RGB')
            
        ocr_text = pytesseract.image_to_string(image)
        return ocr_text
    except Exception as e:
        print(f"Image OCR Extraction failed: {e}")
        return "Image OCR Extraction failed."



def extract_text_from_pdf(file_bytes: bytes) -> str:
    """
    Extracts text from a PDF file provided as raw bytes.
    Attempts basic PyPDF2 text extraction first.
    If the extracted text is too short (indicating a scanned image),
    it falls back to Tesseract OCR.
    """
    pdf_file = io.BytesIO(file_bytes)
    reader = PdfReader(pdf_file)
    extracted_text = ""
    
    for page in reader.pages:
        text = page.extract_text()
        if text:
            extracted_text += text + "\n"
            
    # Fallback to OCR if the native extraction yielded barely any text (e.g. less than 50 chars)
    if len(extracted_text.strip()) < 50:
        print("Standard PDF extraction failed or yielded little text. Falling back to OCR...")
        extracted_text = perform_ocr_on_pdf(file_bytes)
        
    return extracted_text

def perform_ocr_on_pdf(file_bytes: bytes) -> str:
    """
    Converts PDF bytes to images and runs Tesseract OCR on them.
    Requires poppler and tesseract installed on the host system.
    """
    try:
        from pdf2image import convert_from_bytes
        import pytesseract
        
        images = convert_from_bytes(file_bytes)
        ocr_text = ""
        for img in images:
            text = pytesseract.image_to_string(img)
            ocr_text += text + "\n"
        return ocr_text
    except Exception as e:
        print(f"OCR Extraction failed: {e}")
        return "OCR Extraction failed."
