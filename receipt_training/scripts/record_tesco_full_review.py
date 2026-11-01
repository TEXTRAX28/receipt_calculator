"""Record a source-checked Tesco row revision without altering historical truth."""
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
BASE = DATA / "annotations/private/priced-rows-v2-labels.jsonl"
OUT = DATA / "annotations/private/priced-rows-v3-labels.jsonl"
REPORT = DATA / "evaluation/advanced-tesco-full-truth-v1.json"
BASE_SHA = "185330649fb804e4468b0c40776c4e8e5005a655cc85c389de2947c5f3de6fdf"
IMAGE_SHA = "b6514c32520456a3b94e5012da84d22c5968c099d4c1d8c8113c17d6fc3785c3"

# Observations from the full original image viewed on 1 November 2026.
# The first price is deliberately unknown; never derive it from TOTAL 6.71.
ROWS = (
    ("6 JAM DOUGHNTS", None, True),
    ("6 JAM DOUGHNTS", "0.55", True),
    ("MLD WHT CHDR", "1.45", False),
    ("RICH TEA", "0.39", False),
    ("C/CHP COOKIE", "0.44", False),
    ("4 TEACAKES", "0.50", True),
    ("18 BROWN ROLLS", "0.85", True),
    ("TUNA STEAKS", "0.55", False),
    ("L/GRAIN RICE", "0.64", False),
    ("ORANGE NET", "0.79", False),
)


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def field(raw=None, value=None):
    return {"raw": raw, "value": value, "review_required": value is None}


def revised_tesco(base):
    label = deepcopy(base)
    assert label["receipt_id"] == "tesco-gb-1994" and not label["items"]
    label["items"] = []
    for index, (name, price, reduced) in enumerate(ROWS, 1):
        label["items"].append({
            "id": f"tesco-full-row-{index}", "description": field(name, name),
            "item_number": field(), "quantity": field(), "unit": field(),
            "pack_size": field(), "unit_price": field(), "line_total": field(price, price),
            "discount": field(), "tax_code": field(),
            "line_total_basis": "printed_visible_payable_sale_amount",
            "raw": {"source": "assistant inspection of full original image", "source_sha256": IMAGE_SHA,
                    "printed_purchase_order": index,
                    "price_row": "following REDUCED PRICE row" if reduced else "same purchase row",
                    "source_description": name},
        })
    label["verification"] = {**label["verification"], "status": "manual_visual_partial",
        "model_generated": True, "origin": "assistant_source_inspection", "checked_against_source": True,
        "independent_human_verified": False,
        "visual_review": "full original Tesco image opened at original resolution; ten purchase groups and nine legible payable prices checked",
        "notes": [
            "Retrospective source-informed review after prior scanner outputs were measured. Not independent human verification or a fresh holdout.",
            "Two distinct 6 JAM DOUGHNTS purchases remain separate. The first following reduced price is too faint and remains null; it is not calculated from the final total.",
            "The 6, 4 and 18 in descriptions are product/pack wording, not explicitly printed purchased quantities. All purchased quantities, unit prices and pack sizes remain unknown.",
            "REDUCED PRICE gives the payable amount following that purchase. Original prices and reduction magnitudes are not printed; no numeric discount, tax, fee, rounding or tax-inclusive basis is inferred from absence.",
            "TOTAL 6.71, 10 ITEMS, CASH 7.00 and CHANGE DUE 0.29 are visible. Payment rows and the footer are not purchases. Existing receipt-level truth is preserved.",
        ]}
    label["coverage"] = {**label.get("coverage", {}), "item_metrics_eligible": True,
        "items_complete_for_visible_body": True, "full_receipt_visible": True,
        "financial_fields_complete": False, "tax_legend_visible": False}
    label["review_flags"] = [
        "Ten source-checked purchase groups, nine known payable prices and one unreadable price; no complete financial truth.",
        "Quantities, unit prices, discount magnitudes and tax basis are not printed and stay unknown. Literal product-name counts must not become purchased quantity.",
    ]
    return label


def main():
    if "--check" in sys.argv:
        value = json.loads(REPORT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            assert sha(ROOT / name) == expected, "Evidence changed: " + name
        print(json.dumps({"verified_files": len(value["evidence_sha256"]), "added_purchases": 10, "known_prices": 9}))
        return
    assert not OUT.exists() and not REPORT.exists(), "Preserve this revision; use --check"
    assert sha(BASE) == BASE_SHA
    labels = [json.loads(line) for line in BASE.read_text(encoding="utf-8").splitlines()]
    manifest_path = DATA / "manifest.jsonl"
    record = next(json.loads(line) for line in manifest_path.read_text(encoding="utf-8").splitlines()
                  if json.loads(line)["receipt_id"] == "tesco-gb-1994")
    image = DATA / record["file_path"]
    assert sha(image) == IMAGE_SHA == record["sha256"] and record["split"] == "development"
    changed = [i for i, label in enumerate(labels) if label["receipt_id"] == "tesco-gb-1994"]
    assert len(changed) == 1
    labels[changed[0]] = revised_tesco(labels[changed[0]])
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write("".join(json.dumps(label, ensure_ascii=False) + "\n" for label in labels))
    value = {
        "revision": "original-priced-rows-v3", "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "scope": "One retrospective full-source Tesco row annotation added to the unchanged original inventory. No scanner change, new inference, provider upload or permission expansion.",
        "label_file": OUT.relative_to(ROOT).as_posix(), "changed_receipt_id": "tesco-gb-1994",
        "changed_split": "development", "added_purchase_groups": 10, "added_known_line_prices": 9,
        "added_known_quantities": 0, "added_known_unit_prices": 0, "complete_financial_truth_available": False,
        "selection_limits": "Assistant source review, not independent human verification. Known prior outputs and the identical source-informed comparison crop limit generalization. The original benchmark and v2 labels remain unchanged; v3 scores must use the same predictions on both label versions.",
        "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in
                            (BASE, OUT, image, manifest_path, Path(__file__), DATA / "annotations/schema.json")},
    }
    with REPORT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"changed_receipts": 1, "added_purchases": 10, "known_prices": 9, "new_inference": 0}))


if __name__ == "__main__":
    main()
