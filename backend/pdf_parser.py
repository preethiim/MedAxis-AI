import io
from PyPDF2 import PdfReader

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
