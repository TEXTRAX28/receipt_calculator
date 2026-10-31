"""Reproduce a versioned source-image review, preserving historical labels.

The observations below were made from the actual images in this session. This
does not perform a new inspection or infer new truth from scanner predictions.
"""
from copy import deepcopy
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
TRAINING = ROOT / "receipt_training"
OUT = TRAINING / "annotations/private/priced-rows-v2-labels.jsonl"
REPORT = TRAINING / "evaluation/advanced-priced-row-truth-v2.json"
BASE_SHA = "b6c82c9d6fb4e23a38c18152dc24e5bd70e1b179d68b87e23bb886afb7523dfe"
MANIFEST_SHA = "2a28b64096cfff5de8dd6ca857f016e95a4a7316674b96a7dda6916c2c3ccd53"

# Only these five visibly printed, priced child rows are added. Name-only size,
# doneness, sugar and ice options are not promoted into monetary line items.
REVIEW = {
    "cord-v2-test-002": {
        "raw_sha256": "7d6b9c9061a91026331f33e928ba40f75af220857c323d029dad773ecf34622c",
        "rows": [(0, 0, "COCONUT JELLY ( L )", "4,000", "4000", None)],
        "observation": "A separate indented COCONUT JELLY ( L ) 4,000 line follows JASMINE MT ( L ) 24,000. SUB TOTAL and TOTAL SALES are 28,000; TOTAL ITEMS is 1, so priced-row count is distinct from till item count. No quantity or unit price is printed on the add-on row. The image has glare and a publisher-blurred header/footer; use the retained upstream description alongside the inspected financial area. No tax amount is inferred from the absence of a tax line.",
    },
    "cord-v2-test-007": {
        "raw_sha256": "ed8cc1040c9a424a1b5bb3bc05a99354d8285d1fbb743ea823d27cda99558f5b",
        "rows": [(0, 0, "ADD CHICKEN BOX", "909", "909", None)],
        "observation": "ADD CHICKEN BOX 909 is a separate positive priced line after Kupon 15 100,000, followed by Subtotal 100,909, PB1 (10%) 10,091 and Total 111,000. The word Kupon does not turn either printed positive charge into a deduction. No purchase quantity or unit price is legible for the added row; retain null. The header is publisher-blurred.",
    },
    "cord-v2-test-008": {
        "raw_sha256": "5e3e781f41642b76e2c32aa57e0d488ae73de21020aca7e52bf83e512c6ebb1b",
        "rows": [(0, 0, "COOKIE DOH SAUCES", "0", "0", "1"),
                 (0, 1, "NATA DE COCO", "0", "0", "1")],
        "observation": "Below 1 [REG] BLACK SAKURA 45,455 are two distinct printed rows: 1 COOKIE DOH SAUCES 0 and 1 NATA DE COCO 0. Both are attached zero-price choices, not new paid purchases. Sub Total 45,455, PB1 (10%) 4,545, Rounding 0 and Total 50,000 are legible. The label amendment adds only the two source rows and their explicitly printed quantities; other financial metadata remains unchanged.",
    },
    "cord-v2-validation-004": {
        "raw_sha256": "715620c971cbcc0fc3c1e61dbf7c799bb6eef18fe1731be2c8d27103cc01c6a9",
        "rows": [(0, 0, "Sedang", "0", "0", "1")],
        "observation": "The image prints 1 BBQ Chicken 41,000 and an indented 1 - Sedang 0. ITEMS:1 and the 41,000 total confirm that the zero row is an attached priced option, rather than a second paid purchase. Pay Cash 50,000 and Change 9,000 are payments, not charges. No tax absence is converted into a numeric zero.",
    },
}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def field(raw, value):
    return {"raw": raw, "value": value, "review_required": value is None}


def main():
    if "--check" in sys.argv:
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            if sha(ROOT / name) != expected:
                raise ValueError("Reviewed evidence changed: " + name)
        print(json.dumps({"verified_files": len(report["evidence_sha256"]),
                          "added_priced_rows": report["added_priced_rows"], "new_extraction_calls": 0}))
        return
    if OUT.exists() or REPORT.exists():
        raise ValueError("Preserve the recorded annotation revision; use --check")
    evidence = {}

    def remember(path, expected=None):
        digest = sha(path)
        if expected is not None and digest != expected:
            raise ValueError("Source changed before replaying its visual observations")
        evidence[path.relative_to(ROOT).as_posix()] = digest

    base = TRAINING / "annotations/labels.jsonl"
    manifest_path = TRAINING / "manifest.jsonl"
    remember(base, BASE_SHA)
    remember(manifest_path, MANIFEST_SHA)
    remember(Path(__file__))
    labels = [json.loads(line) for line in base.read_text(encoding="utf-8").splitlines()]
    records = {r["receipt_id"]: r for r in map(json.loads, manifest_path.read_text(encoding="utf-8").splitlines())}
    reviewed = []
    for label in labels:
        case = REVIEW.get(label["receipt_id"])
        if case is None:
            continue
        record = records[label["receipt_id"]]
        image = TRAINING / record["file_path"]
        raw_path = TRAINING / "annotations/raw" / (label["receipt_id"] + ".json")
        remember(image, record["sha256"])
        remember(raw_path, case["raw_sha256"])
        raw = json.loads(raw_path.read_text(encoding="utf-8"))["gt_parse"]["menu"]
        menu = raw if isinstance(raw, list) else [raw]
        parents = deepcopy(label["items"])
        additions = []
        for parent_index, child_index, name, raw_amount, amount, qty in case["rows"]:
            children = menu[parent_index]["sub"]
            children = children if isinstance(children, list) else [children]
            child = children[child_index]
            if child.get("nm") != name or child.get("price") != raw_amount or child.get("cnt") != qty:
                raise ValueError("Upstream child differs from its recorded visual review")
            parent_id = parents[parent_index]["id"]
            additions.append({"id": f"{parent_id}-priced-sub-{child_index + 1}",
                              "description": field(name, name), "item_number": field(None, None),
                              "quantity": field(qty, qty), "unit": field(None, None), "pack_size": field(None, None),
                              "unit_price": field(None, None), "line_total": field(raw_amount, amount),
                              "discount": field(None, None), "tax_code": field(None, None),
                              "line_total_basis": "separate_printed_addon_amount",
                              "raw": {"upstream_child": child, "parent_item_id": parent_id,
                                      "source_path": f"gt_parse.menu[{parent_index}].sub[{child_index}]",
                                      "row_kind": "paid_addon" if amount != "0" else "zero_price_option"}})
        # Preserve the historical top-level row order. Added row IDs carry parent
        # ownership; this view is for priced-row scoring, not a till item count.
        label["items"].extend(additions)
        label["verification"] = {**label["verification"], "status": "manual_visual_partial",
                                  "model_generated": True, "checked_against_source": True,
                                  "independent_human_verified": False,
                                  "visual_review": "specific priced child rows checked against actual image and upstream annotations",
                                  "notes": [*label["verification"]["notes"], case["observation"],
                                            "Retrospective annotation repair; not an untouched evaluation set or complete reannotation. Unprinted quantities/unit prices/discounts remain null."]}
        label["review_flags"].append("Priced-row revision v2 includes separately printed paid and zero-price add-ons. Parent ownership is preserved in raw.parent_item_id; physical purchase counts and complete financial coverage are not asserted.")
        reviewed.append({"receipt_id": label["receipt_id"]},)
        reviewed[-1].update({"split": record["split"], "added_rows": len(additions),
                             "paid_rows": sum(row["line_total"]["value"] != "0" for row in additions),
                             "source_observation": case["observation"]})
    if len(reviewed) != len(REVIEW) or sum(x["added_rows"] for x in reviewed) != 5:
        raise ValueError("Unexpected annotation repair coverage")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in labels), encoding="utf-8", newline="\n")
    remember(OUT)
    report = {"revision": "original-priced-rows-v2", "base_labels_sha256": BASE_SHA,
              "labels": OUT.relative_to(TRAINING).as_posix(), "added_priced_rows": 5,
              "added_paid_addons": 2, "added_zero_price_options": 3,
              "reviewed_transactions": reviewed,
              "annotation_basis": "Specific actual source images inspected in this session, cross-checked against retained upstream CORD child annotations. Assistant review, no independent human verification. No extraction output was read by this builder. Existing source-informed selection and previously measured evaluation membership are disclosed; no new blind holdout is claimed.",
              "unchanged": "All original top-level row values and receipt metadata, original labels/manifest/images, unknown fields, coverage flags, matching threshold and scanner sources. Complete financial/global receipt accuracy remains unscorable under the original contract.",
              "metric_scope": "Priced-row view includes separately printed paid add-ons and zero-price options. It is not a count of independently purchased products. Parent ownership is retained as truth provenance; the existing app schema/scorer does not evaluate nested ownership.",
              "new_extraction_calls": 0, "evidence_sha256": evidence}
    REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"labels": report["labels"], "added_priced_rows": 5,
                      "checked_transactions": len(reviewed), "new_extraction_calls": 0}))


if __name__ == "__main__":
    main()
