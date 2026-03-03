import sys
import os

sys.path.append(os.path.join(os.path.dirname(__file__), 'backend'))
try:
    from backend.pdf_parser import extract_text_from_file
    
    png_filename = "test_image.png"
    jpg_filename = "test_image.jpg"
    pdf_filename = "test_doc.pdf"
    bmp_filename = "test_image.bmp"
    
    print("PNG ROUTE:", os.path.splitext(png_filename)[1].lower() in ['.png', '.jpg', '.jpeg'])
    print("JPG ROUTE:", os.path.splitext(jpg_filename)[1].lower() in ['.png', '.jpg', '.jpeg'])
    print("PDF ROUTE:", os.path.splitext(pdf_filename)[1].lower() == '.pdf')
    print("BMP ROUTE:", os.path.splitext(bmp_filename)[1].lower() in ['.png', '.jpg', '.jpeg'])
except Exception as e:
    print(f"Error: {e}")
