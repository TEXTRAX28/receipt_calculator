"""Regenerate wholly synthetic PDF fixtures; never reads any user receipt or API key.

Optional developer utility requiring reportlab, Pillow and pypdf. The generated
PDFs are committed so ordinary npm tests do not need Python or those packages.
"""
from pathlib import Path
from io import BytesIO
import hashlib
import json

import reportlab
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
from pypdf import PdfReader, PdfWriter
from pypdf.generic import DictionaryObject, NameObject, NumberObject, TextStringObject

OUT = Path(__file__).parent / "pdfs"
OUT.mkdir(exist_ok=True)
ROWS = ["Little Market", "Currency GBP", "Milk 2x 1.25 2.50", "Milk 2x 1.25 2.50", "Bread 1x 1.50 1.50", "TOTAL GBP 6.50", "PRICES INCLUDE TAX"]


def text_page(pdf, rows, height=420):
    pdf.setFont("Courier", 11)
    for index, row in enumerate(rows):
        pdf.drawString(20, height - 35 - index * 24, row)


def scanned_page(pdf):
    image = Image.new("RGB", (700, 900), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(Path(reportlab.__file__).parent / "fonts/Vera.ttf"), 24)
    for index, row in enumerate(ROWS):
        draw.text((35, 70 + index * 80), row, fill="black", font=font)
    pdf.drawImage(ImageReader(image), 0, 0, width=300, height=420)


def build(name, draw_pages):
    target = OUT / name
    pdf = canvas.Canvas(str(target), pagesize=(300, 420), pageCompression=1, invariant=1)
    pdf.setTitle("Synthetic receipt test fixture")
    pdf.setAuthor("Gather tests")
    draw_pages(pdf)
    pdf.save()
    return target


def digital(pdf):
    text_page(pdf, ROWS[:4])
    pdf.showPage()
    text_page(pdf, ROWS[4:])
    pdf.linkURL("https://example.invalid/receipt-probe", (15, 15, 200, 35), relative=0)
    pdf.showPage()


target = build("digital-two-page.pdf", digital)
writer = PdfWriter(clone_from=target)
writer._root_object[NameObject("/OpenAction")] = DictionaryObject({
    NameObject("/S"): NameObject("/JavaScript"),
    NameObject("/JS"): TextStringObject("globalThis.__receiptPdfExecuted = true; fetch('https://example.invalid/receipt-action');"),
})
with target.open("wb") as stream:
    writer.write(stream)

build("scanned-one-page.pdf", lambda pdf: (scanned_page(pdf), pdf.showPage()))
writer = PdfWriter(clone_from=OUT / "scanned-one-page.pdf")
for reference in writer.pages[0]["/Resources"]["/XObject"].values():
    image = reference.get_object()
    if image.get("/Subtype") == "/Image":
        image[NameObject("/Width")] = NumberObject(5000)
        image[NameObject("/Height")] = NumberObject(5000)
with (OUT / "oversized-image.pdf").open("wb") as stream:
    writer.write(stream)
build("mixed-two-page.pdf", lambda pdf: (text_page(pdf, ["Selectable header", "Reference 2026"]), pdf.showPage(), scanned_page(pdf), pdf.showPage()))
writer = PdfWriter(clone_from=target)
writer.encrypt("fixture-password", algorithm="RC4-128")
with (OUT / "password-protected.pdf").open("wb") as stream:
    writer.write(stream)

writer = PdfWriter()
writer.add_page(PdfReader(target).pages[0]).rotate(90)
with (OUT / "rotated-page.pdf").open("wb") as stream:
    writer.write(stream)

build("thirteen-pages.pdf", lambda pdf: [(text_page(pdf, [f"Page {number}", "Product 1.00"]), pdf.showPage()) for number in range(1, 14)])
build("oversized-page.pdf", lambda pdf: (pdf.setPageSize((30000, 420)), text_page(pdf, ROWS), pdf.showPage()))


def long(pdf):
    height = 2100
    pdf.setPageSize((300, height))
    text_page(pdf, ["Little Market", "Currency GBP", *[f"Product {index} 1x 1.00 1.00" for index in range(1, 61)], "TOTAL GBP 60.00", "PRICES INCLUDE TAX"], height)
    pdf.showPage()


build("long-digital.pdf", long)
metadata = {
    "scope": "Wholly synthetic PDF integration/security fixtures, not real-receipt accuracy truth or part of the original receipt cohort",
    "digital_two_page": {"purchases": [["Milk", "2", "1.25", "2.50"], ["Milk", "2", "1.25", "2.50"], ["Bread", "1", "1.50", "1.50"]], "currency": "GBP", "total_minor": "650", "equal_three_minor": ["217", "217", "216"]},
    "long_digital": {"purchases": 60, "total_minor": "6000"},
    "password": "fixture-password",
    "pdf_sha256": {path.name: hashlib.sha256(path.read_bytes()).hexdigest() for path in sorted(OUT.glob("*.pdf"))},
}
(OUT / "synthetic-truth.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"synthetic_pdfs": len(metadata["pdf_sha256"]), "digital_total_minor": "650"}))
