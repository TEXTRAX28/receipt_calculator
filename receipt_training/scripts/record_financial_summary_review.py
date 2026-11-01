"""Version source-checked financial summaries; preserve original labels and splits."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
BASE = DATA / "annotations/private/priced-rows-v4-labels.jsonl"
SUPPLEMENT = DATA / "annotations/private/supplement-labels.jsonl"
OUT = DATA / "annotations/private/priced-rows-v5-financial-labels.jsonl"
SUPPLEMENT_OUT = DATA / "annotations/private/supplement-financial-v2-labels.jsonl"
REPORT = DATA / "evaluation/advanced-financial-truth-v1.json"
BASE_SHA = "04752d6e8b836ce54b388866d53769572e4fbf81b9ada71a8914da34132b312a"
SUPPLEMENT_SHA = "d81abf83edfb6a1bdc167cca359dabf14c3b2f20a84b4dcce7e54dad7e69430c"

# Transcribed from the original images during this review, before scoring any
# predictions against the new fields. No amount is derived from a balancing sum.
SUMMARIES = {
    "cord-v2-train-000": ("1346000", "100950", "144695", "1591600", "Sub-Total 1,346,000; Service 100,950; PB1 144,695; Rounding -45; Grand Total 1,591,600"),
    "cord-v2-train-001": ("503000", "25150", "52815", "580965", "SUBTOTAL 503,000; PB1 52,815; SVC CHRG 25,150; DUE 580,965"),
    "cord-v2-train-003": ("259000", "9600", "52416", "302016", "Sub Total 259,000; Service 9,600; Tax 52,416; Discount 19,000; TOTAL 302,016"),
    "cord-v2-train-005": ("221000", "16575", "23758", "261333", "SUBTOTAL 221,000; Service 16,575; PB1 23,758; TOTAL 261,333; payment section: Coupon 100,000, BCA Card 161,333"),
    "cord-v2-train-011": ("214500", "12870", "22737", "250107", "SUBTOTAL 214.500; Service 12.870; Pajak Restoran 22.737; TOTAL 250.107"),
    "cord-v2-train-013": ("212500", "12750", "22525", "247775", "SUBTTL 212,500; SVC CHG 6% 12,750; PB1 10% 22,525; TOTAL 247,775"),
    "cord-v2-train-015": ("261000", "15660", "27666", "304326", "SUBTTL 261,000; SVC CHG 6% 15,660; PB1 10% 27,666; TOTAL 304,326"),
    "cord-v2-train-019": ("1343000", "80580", "142358", "1565938", "FOOD 1,213,000; BEVERAGES 60,000; OTHERS 70,000; SUBTOTAL 1,343,000; SERVICE CHARGE 80,580; Tax 10% 142,358; DU 1,565,938"),
}
ZERO_TAX_CONTROLS = {
    "cord-v2-train-023": "1X S-Lemon Macchiato @21,000 21,000; Less Ice; 50%; PB1 0; Subtotal 21,000; Total 21,000; Cash 21,000; CHANGE 0",
    "cord-v2-validation-003": "1X M-Caramel Black Tea @28,000 28,000; 70%; Less Ice; PB1 0; Subtotal 28,000; Total 28,000; Cash 28,000; CHANGE 0",
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def revised(label):
    result = deepcopy(label)
    identity = label["receipt_id"]
    if identity not in SUMMARIES and identity != "cord-v2-test-008":
        return result
    if identity in SUMMARIES:
        subtotal, fee, tax, total, raw = SUMMARIES[identity]
        assert [label[key]["value"] for key in ("subtotal", "tax", "grand_total")] == [subtotal, tax, total]
        assert len(label["fees"]) == 1 and label["fees"][0]["amount"]["value"] == fee
    else:
        raw = "1 [REG] BLACK SAKURA 45,455; 1 COOKIE DOH SAUCES 0; 1 NATA DE COCO 0; Sub Total 45,455; PB1 (10%) 4,545; Rounding 0; Total 50,000; Card Payment 50,000"
        assert [label[key]["value"] for key in ("subtotal", "tax", "grand_total")] == ["45455", "4545", "50000"]
        assert label["rounding"]["value"] is None
        result["rounding"] = {"raw": "Rounding 0", "value": "0", "review_required": False}
    assert label["prices_include_tax"] is None and label["merchant"]["value"] is None
    result["prices_include_tax"] = False
    result["financial_summary_review"] = {
        "raw": raw, "basis": "Purchase/subtotal section followed by separately charged tax in the displayed total section; interpretation of printed financial structure, not a literal tax-inclusion phrase.",
        "merchant_header": "publisher-blurred; remains unknown", "independent_human_verified": False,
        "rounding_scope": "Only an explicitly printed rounding token becomes a value; absence is not converted to zero.",
    }
    result["coverage"] = {**(label.get("coverage") or {}), "financial_summary_source_checked": True,
                          "financial_fields_complete": False}
    result["verification"] = {**label["verification"], "status": "manual_visual_partial", "model_generated": True,
                              "checked_against_source": True, "independent_human_verified": False,
                              "notes": [*label["verification"]["notes"], "Original financial summary inspected retrospectively after prior OCR work. New tax-basis/rounding facts do not establish complete receipt truth or an unseen holdout."]}
    if identity == "cord-v2-train-005":
        assert not any(payment["kind"] == "coupon_tender" for payment in label["payments"])
        result["payments"].append({"kind": "coupon_tender", "amount": {"raw": "Coupon 100,000", "value": "100000", "review_required": False}})
        result["financial_summary_review"]["payment_note"] = "Coupon follows TOTAL alongside BCA Card: a payment tender, not an additional purchase discount. No discount or grand total is changed."
    return result


def revised_supplement(label):
    result = deepcopy(label)
    if label["receipt_id"] != "supplement-user-uk-20261026-group":
        return result
    assert label["coverage"]["financial_fields_complete"] and len(label["items"]) == 18
    assert label["rounding"]["value"] is None
    result["coverage"] = {**label["coverage"], "rounding_absence_verified": True, "fee_absence_verified": True}
    result["financial_summary_review"] = {
        "scope": "Both original photos show the complete priced body, four coupon rows, final total and VAT summary, despite the upper merchant heading crop.",
        "rounding": "No separate financial rounding line appears. The numeric rounding field stays null; printed VAT already reflects its own tax rounding.",
        "fees": "No standalone service, tip, delivery, deposit or other fee appears in the visible financial body or summary. Fees remain an empty list.",
        "basis": "Printed VAT Code table explicitly labels Excl VAT: A 20.00%, Z 0.00%; TOTAL(EXCL VAT), VAT Amount and TOTAL(INCL VAT) are visible.",
        "limits": "Assistant source review, not independent human verification. No change to receipt amount, coupons, VAT, item quantities, units, membership/payment identifiers or processing permission.",
    }
    return result


def main():
    if "--check" in sys.argv:
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        for path, digest in report["evidence_sha256"].items():
            assert sha(ROOT / path) == digest, path
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "new_extraction_calls": 0}))
        return
    assert not OUT.exists() and not SUPPLEMENT_OUT.exists() and not REPORT.exists(), "Preserve prior truth; use --check"
    assert sha(BASE) == BASE_SHA
    assert sha(SUPPLEMENT) == SUPPLEMENT_SHA
    labels = list(map(json.loads, BASE.read_text(encoding="utf-8").splitlines()))
    supplements = list(map(json.loads, SUPPLEMENT.read_text(encoding="utf-8").splitlines()))
    manifest_path = DATA / "manifest.jsonl"
    records = {row["receipt_id"]: row for row in map(json.loads, manifest_path.read_text(encoding="utf-8").splitlines())}
    evidence = {str(path.relative_to(ROOT).as_posix()): sha(path) for path in (BASE, SUPPLEMENT, manifest_path, DATA / "annotations/private/supplement-manifest.jsonl", Path(__file__), DATA / "annotations/schema.json")}
    checked = [*SUMMARIES, "cord-v2-test-008", *ZERO_TAX_CONTROLS]
    for identity in checked:
        record = records[identity]
        image = DATA / record["file_path"]
        assert sha(image) == record["sha256"] and not record["external_processing_allowed"]
        evidence[image.relative_to(ROOT).as_posix()] = sha(image)
    for record in map(json.loads, (DATA / "annotations/private/supplement-manifest.jsonl").read_text(encoding="utf-8").splitlines()):
        if record["receipt_id"] == "supplement-user-uk-20261026-group":
            for source in record["source_files"]:
                image = DATA / source["file_path"]
                assert sha(image) == source["sha256"]
                evidence[image.relative_to(ROOT).as_posix()] = sha(image)
    updated = [revised(label) for label in labels]
    assert sum(a != b for a, b in zip(labels, updated, strict=True)) == 9
    for path, items in ((OUT, updated), (SUPPLEMENT_OUT, [revised_supplement(label) for label in supplements])):
        with path.open("x", encoding="utf-8", newline="\n") as file:
            file.write("".join(json.dumps(item, ensure_ascii=False) + "\n" for item in items))
        evidence[path.relative_to(ROOT).as_posix()] = sha(path)
    report = {"revision": "source-financial-summaries-v1", "reviewed_at": datetime.now(timezone.utc).isoformat(),
              "labels": OUT.relative_to(ROOT).as_posix(), "supplement_labels": SUPPLEMENT_OUT.relative_to(ROOT).as_posix(),
              "changed_original_receipts": 9, "new_known_tax_basis": 9, "new_known_printed_rounding": 1,
              "source_confirmed_existing_service_amounts": 8, "new_known_payment_tender_not_scored": 1,
              "uk_separate_fee_and_rounding_absence_checked": True, "zero_tax_controls_still_unknown_basis": ZERO_TAX_CONTROLS,
              "summary_transcriptions": {identity: value[-1] for identity, value in SUMMARIES.items()},
              "scope": "Source-informed assistant reference revision. Original labels, amounts, item identities, image bytes, splits, permissions and all model predictions remain unchanged. Not an OCR accuracy gain or independent human truth.",
              "limits": "Publisher-blurred headers remain unknown; no original receipt is declared completely labelled. UK is a separate supplement and its new absence evidence does not become a numeric zero or change the strict scorer.",
              "new_model_requests": 0, "external_requests": 0, "evidence_sha256": evidence}
    with REPORT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"changed_original_receipts": 9, "new_tax_basis": 9, "new_printed_rounding": 1, "new_model_requests": 0, "external_requests": 0}))


if __name__ == "__main__":
    main()
