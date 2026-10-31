"""Record assistant source inspection and a separate cropped screening reference.

No upload, original-label mutation, inferred missing prices or new human truth.
Run only after viewing the six exact PNGs and their original source images.
"""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image, ImageChops

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
BASE = ROOT / "receipt_training/annotations/private/priced-rows-v2-labels.jsonl"


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def field(raw=None, value=None):
    return {"raw": raw, "value": value, "review_required": value is None}


def item(index, name, raw_price=None, price=None, quantity=None, unit=None):
    return {"id": f"screen-item-{index}", "description": field(name, name),
            "item_number": field(), "quantity": field(quantity, quantity),
            "unit": field(), "pack_size": field(),
            "unit_price": field(unit, unit), "line_total": field(raw_price, price),
            "discount": field(), "tax_code": field(),
            "line_total_basis": "printed_visible_sale_amount",
            "raw": {"source": "assistant inspection of exact original and prepared crop"}}


def main():
    manifest_bytes = (FOLDER / "manifest.json").read_bytes()
    manifest = json.loads(manifest_bytes)
    base_bytes = BASE.read_bytes()
    base = {d["receipt_id"]: d for d in map(json.loads, base_bytes.decode("utf-8").splitlines())}
    review_notes = [
        "Member heading and payment footer excluded; nine purchase rows, three negative coupon rows and two genuine repeated cashews remain. VAT legend is absent in the source, so no A/Z rate is inferred.",
        "Invoice number/date/header and right-side member name/card/payment box excluded. Only item table, negative redemption, total and New Taiwan Dollar wording remain. Faint reverse-side print remains; no readable person/card identifier was observed.",
        "Footer with date, operator/reference and contact details excluded. Product branding, ten purchase descriptions, reduced-price labels, total and cash/change remain. First reduced price is too faint for a firm value and stays unknown.",
        "Publisher-blurred header/transaction/footer excluded. Three products, service, tax, discount, subtotal and final total remain.",
        "Merchant/transaction header/footer excluded. One product, subtotal, tax, final total and cash/change remain. A narrow upstream-blurred band between subtotal and tax is retained; no readable identifier was observed.",
        "Publisher-blurred header/transaction and queue/footer excluded. Purchase, separately priced add-on, subtotal, final total, printed item count and cash/change remain.",
    ]
    reviewed, labels = [], []
    for row, note in zip(manifest["cases"], review_notes, strict=True):
        pixels = (FOLDER / row["crop_file"]).read_bytes()
        archive = (FOLDER / row["archive_file"]).read_bytes()
        original = (ROOT / row["original_source"]).read_bytes()
        if sha(pixels) != row["crop_sha256"] or sha(archive) != row["archive_sha256"] or sha(original) != row["original_sha256"]:
            raise ValueError("Source/crop/archive changed")
        with zipfile.ZipFile(io.BytesIO(archive)) as bundle:
            if bundle.namelist() != ["receipt.png"] or bundle.read("receipt.png") != pixels:
                raise ValueError("Archive differs from the exact inspected PNG")
        with Image.open(io.BytesIO(original)) as source, Image.open(io.BytesIO(pixels)) as crop:
            if crop.info or ImageChops.difference(source.convert("RGB").crop(row["crop_xyxy"]), crop.convert("RGB")).getbbox() is not None:
                raise ValueError("Crop pixels changed or copied image metadata remains")
        label = deepcopy(base[row["receipt_id"]])
        label["merchant"] = field("TESCO", "Tesco") if row["receipt_id"] == "tesco-gb-1994" else field()
        label["date"] = field()
        label["verification"] = {
            "status": "manual_visual_partial", "model_generated": True,
            "origin": "assistant_source_inspection", "checked_against_source": True,
            "independent_human_verified": False,
            "notes": [note, "Reference for these exact cropped inputs only; original corpus labels, splits and external-processing permissions are unchanged. Source-informed retrospective screen, not a blind holdout."]}
        label["coverage"] = {"item_metrics_eligible": True, "items_complete_for_visible_body": True,
                             "financial_fields_complete": False, "full_receipt_visible": False}
        label["screening_case"] = row["case"]
        label["screening_crop_sha256"] = row["crop_sha256"]
        if row["receipt_id"] == "costco-tw-20170303":
            label["currency"] = {**field("總計新台幣", "TWD"), "evidence": "visible currency wording"}
            label["items"] = [item(1, "FY17 金星會員主卡", "1,350", "1350", "1", "1350")]
            label["discounts"] = []
            label["visible_unclassified_deductions"] = [{"description": "紅利折抵", "quantity": "1", "unit_price_raw": "-192", "line_total_raw": "-192", "line_total": "-192", "type_and_purchase_association_verified": False}]
            label["review_flags"].append("A separate negative redemption is visible, but no payment-versus-discount classification or ownership is inferred. It must remain in the source-row audit; unmatched negative rows are not automatically extra purchases.")
        elif row["receipt_id"] == "tesco-gb-1994":
            values = [("6 JAM DOUGHNTS", None), ("6 JAM DOUGHNTS", "0.55"),
                      ("MLD WHT CHDR", "1.45"), ("RICH TEA", "0.39"),
                      ("C/CHP COOKIE", "0.44"), ("4 TEACAKES", "0.50"),
                      ("18 BROWN ROLLS", "0.85"), ("TUNA STEAKS", "0.55"),
                      ("L/GRAIN RICE", "0.64"), ("ORANGE NET", "0.79")]
            label["items"] = [item(index, name, price, price) for index, (name, price) in enumerate(values, 1)]
            label["payments"] = [{"kind": "cashprice", "amount": field("7.00", "7.00")},
                                 {"kind": "changeprice", "amount": field("0.29", "0.29")}]
            label["review_flags"].append("Product-name numbers are pack contents, not demonstrated purchased quantities. Reduced prices are the visible payable line prices; original prices and reduction magnitudes are not printed. No price is derived by subtracting known rows from the final total.")
        labels.append(label)
        reviewed.append({"case": row["case"], "crop_sha256": row["crop_sha256"], "assistant_viewed_original_and_exact_crop": True, "notes": note})
    outputs = {
        "screening-labels-v1.jsonl": ("\n".join(json.dumps(label, ensure_ascii=False) for label in labels) + "\n").encode("utf-8"),
        "labels-base.jsonl": base_bytes,
        "review-builder.py": Path(__file__).read_bytes(),
    }
    review = {"reviewed_at": datetime.now(timezone.utc).isoformat(), "reviewer": "assistant; not independent human verification",
              "manifest_sha256": sha(manifest_bytes), "base_labels_sha256": sha(base_bytes),
              "screening_labels_sha256": sha(outputs["screening-labels-v1.jsonl"]),
              "original_permissions_changed": False, "external_upload_authorized": False,
              "reviewed_cases": reviewed, "priced_rows": sum(len(label["items"]) for label in labels),
              "missing_values_inferred": False, "external_requests": 0}
    outputs["source-review.json"] = (json.dumps(review, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    if any((FOLDER / name).exists() for name in outputs):
        raise ValueError("Preserve the existing screening reference")
    for name, raw in outputs.items():
        with (FOLDER / name).open("xb") as handle:
            handle.write(raw)
    print(json.dumps({"reviewed_cases": len(labels), "priced_rows": review["priced_rows"],
                      "new_Tesco_and_Taiwan_reference_rows": 11, "external_requests": 0,
                      "original_labels_changed": False}))


if __name__ == "__main__":
    main()
