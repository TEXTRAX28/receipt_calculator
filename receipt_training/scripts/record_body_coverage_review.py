"""Source-reviewed purchase coverage; rescore retained predictions without inference.

Only eight development receipt coverage/verification records change. Existing
item identities, money, unknowns, tax basis, splits and permissions stay intact.
"""
from collections import Counter, defaultdict
from copy import deepcopy
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
BASE = DATA / "annotations/private/priced-rows-v5-financial-labels.jsonl"
LABELS = DATA / "annotations/private/priced-rows-v6-coverage-labels.jsonl"
OUT = DATA / "evaluation/advanced-body-coverage-review-v1.json"
QA = ROOT / "qa-artifacts/body-coverage-review-v1"
BASE_SHA = "2a233ec9e5dce77a3c546ef5e65afa6e54a00db71a14633718b7f7415a4598c9"
HASHES = {}

# Written after inspecting the original images, before the paired rescore.
# These observations cover the visible purchase body, not obscured headers.
REVIEWS = {
    "cord-v2-train-000": (22, "Twenty-two quantity/name/amount rows between the upper rule and Sub-Total. Both Free Ice Tea rows (quantities 3 and 1) and both Tahu Telor Asin rows remain distinct. The first Tahu amount remains unknown in the existing reference; this count review does not resolve it."),
    "cord-v2-train-001": (6, "Six priced purchases. WELL DONE belongs to PEPPER AUS and MEDIUM WELL to WAGYU RIBEYE; neither cooking instruction has a separate amount. SUBTOTAL, PB1, SVC CHRG and DUE are summary rows."),
    "cord-v2-train-003": (3, "Three purchases: Bintang Bremer, Chicken H-H and Ades. Sub Total, Service, Tax, Discount and TOTAL follow the body separator. No additional purchase appears in the visible body."),
    "cord-v2-train-005": (5, "Five purchases from Lasagna through Gypsy Gelato Ice Tea. Coupon 100,000 and BCA Card 161,333 occur after TOTAL as payment entries, not more purchases or an additional purchase discount."),
    "cord-v2-train-011": (5, "Five purchases: Ayam Bakar, Nasi Putih, Nila Bakar/Goreng, Sop Gurame and Teh Poci. SUBTOTAL, Service, Pajak Restoran and TOTAL follow the separator. The first two printed quantities are 2."),
    "cord-v2-train-013": (4, "Four purchases from BLACK PEPPER MEATBALL through ORIGINAL BREWED TEA, followed by SUBTTL, SVC CHG, PB1 and TOTAL. The torn lower edge and blurred header prevent a full-document visibility claim."),
    "cord-v2-train-015": (4, "Four purchases from BLACK PEPPER MEATBALL through ORIGINAL BREWED TEA. Tea quantity 2 is one purchase row, not a duplicate. SUBTTL, SVC CHG, PB1 and TOTAL are summary rows; the bottom is torn."),
    "cord-v2-train-019": (8, "Eight purchases from UDANG RE through NASI PUTIH. Five unpriced LARGE/MEDIUM size lines stay with their preceding purchases; ASAM MANIS continues GURAME FILLET M. FOOD, BEVERAGES and OTHERS are category subtotals, followed by SUBTOTAL, SERVICE CHARGE, Tax and DU."),
}


def read(path, expected=None):
    path = path.resolve()
    name = path.relative_to(ROOT).as_posix()
    if any(part.startswith(".env") for part in path.parts):
        raise ValueError("Credentials are not evidence")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected is not None and digest != expected:
        raise ValueError("Evidence changed: " + name)
    HASHES[name] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path, expected=None):
    return [json.loads(line) for line in read(path, expected).decode("utf-8").splitlines()]


def revised(label):
    result = deepcopy(label)
    identity = label["receipt_id"]
    if identity not in REVIEWS:
        return result
    count, note = REVIEWS[identity]
    assert len(label["items"]) == count
    assert label["merchant"]["value"] is None
    assert not label.get("coverage", {}).get("items_complete_for_visible_body")
    assert not label.get("coverage", {}).get("financial_fields_complete")
    result["coverage"] = {**label.get("coverage", {}), "items_complete_for_visible_body": True,
                          "item_metrics_eligible": True, "financial_fields_complete": False}
    result["body_coverage_review"] = {"observed_purchase_rows": count, "observation": note,
        "scope": "All purchases in the visible unblurred body, including zero-priced/repeated purchases. Not complete financial truth or visibility of redacted/cropped areas.",
        "independent_human_verified": False, "merchant_header": "publisher-blurred; remains unknown"}
    result["verification"] = {**label["verification"], "status": "manual_visual_partial",
        "model_generated": True, "checked_against_source": True, "independent_human_verified": False,
        "notes": [*label["verification"].get("notes", []),
                  "Retrospective assistant review of visible purchase-list coverage. No new field values, independent human verification or unseen holdout."]}
    return result


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            read(ROOT / name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists() and not LABELS.exists() and not QA.exists(), "Preserve prior evidence"
    old_rows = rows(BASE, BASE_SHA)
    new_rows = [revised(label) for label in old_rows]
    assert sum(a != b for a, b in zip(old_rows, new_rows, strict=True)) == 8
    old = {r["receipt_id"]: r for r in old_rows}
    new = {r["receipt_id"]: r for r in new_rows}
    manifests = {r["receipt_id"]: r for r in rows(DATA / "manifest.jsonl")}
    for identity in REVIEWS:
        source = manifests[identity]
        assert source["split"] == "development" and not source["external_processing_allowed"]
        read(DATA / source["file_path"], source["sha256"])
        for key in old[identity].keys() - {"coverage", "verification"}:
            assert old[identity][key] == new[identity][key]
    QA.mkdir()
    with LABELS.open("x", encoding="utf-8", newline="\n") as file:
        file.write("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in new_rows))
    read(LABELS)
    source_review = {"recorded_at": datetime.now(timezone.utc).isoformat(), "source_review_precedes_this_rescore": True,
                     "reviewed_cases": REVIEWS, "base_sha256": BASE_SHA,
                     "revised_labels_sha256": HASHES[LABELS.relative_to(ROOT).as_posix()]}
    with (QA / "source-review.json").open("x", encoding="utf-8") as file:
        json.dump(source_review, file, ensure_ascii=False, indent=2)
    read(QA / "source-review.json")

    packet = load(DATA / "evaluation/advanced-financial-summary-fragments-v1.json")
    prior = load(DATA / "evaluation/advanced-financial-summary-rescore-v1.json")
    for name in ("score.py", "score_adjustments.py"):
        path = Path(__file__).with_name(name)
        read(path, packet["evidence_sha256"][path.relative_to(ROOT).as_posix()])
    config_path = DATA / "evaluation/config.json"
    config = load(config_path, packet["evidence_sha256"][config_path.relative_to(ROOT).as_posix()])
    plan_path = ROOT / "qa-artifacts/row-first-original50-v1/plan.json"
    plan = load(plan_path, packet["evidence_sha256"][plan_path.relative_to(ROOT).as_posix()])
    records = {case["id"]: case["record"] for case in plan["cases"]}
    assert len(records) == 50 and set(REVIEWS) <= records.keys()
    predictions = []
    for method, folders in (("tesseract-baseline", ("baseline-development", "baseline-evaluation")),
                            ("qwen-full-v2", ("qwen-full-v2-original-development", "qwen-full-v2-original-evaluation"))):
        for folder in folders:
            path = DATA / "evaluation/runs" / folder / "predictions.jsonl"
            predictions.extend((method, "automatic", row) for row in rows(path, prior["evidence_sha256"][path.relative_to(ROOT).as_posix()]))
    path = ROOT / "qa-artifacts/grouped-amounts-v6/replay/predictions.jsonl"
    predictions.extend(("current-" + row["reader"], row["mode"], row)
                       for row in rows(path, packet["evidence_sha256"][path.relative_to(ROOT).as_posix()]) if row["variant"] == "after")
    assert len(predictions) == 300
    details, counts, reviewed, seen = [], defaultdict(Counter), defaultdict(Counter), set()
    for method, mode, prediction in predictions:
        identity = prediction["receipt_id"]
        key = (method, mode, identity)
        assert key not in seen
        seen.add(key)
        assert identity in records and prediction["image_sha256"] == records[identity]["sha256"]
        pair = [score_with_adjustments(records[identity], labels[identity], prediction, config) for labels in (old, new)]
        changed = {name for name in set(pair[0]["counts"]) | set(pair[1]["counts"])
                   if pair[0]["counts"].get(name, 0) != pair[1]["counts"].get(name, 0)}
        assert changed <= {"extra_items_on_complete_labels"}, "A field score changed"
        assert pair[0]["errors"] == pair[1]["errors"]
        for version, result in zip(("v5", "v6"), pair, strict=True):
            counts[method + "/" + mode + "/" + version].update(result["counts"])
            details.append({"method": method, "mode": mode, "reference": version, **result})
        if identity in REVIEWS:
            result = pair[1]["counts"]
            reviewed[method + "/" + mode].update({
                "cases": 1, "expected_purchase_rows": result["expected_items"],
                "proposed_rows": result["predicted_items"], "matched_rows": result["matched_items"],
                "unmatched_proposed_rows": result["extra_items_on_complete_labels"],
                "missing_reference_matches": result["missing_items"]})
    assert len(seen) == 300 and all(row["cases"] == 8 for row in reviewed.values())
    with (QA / "scores.json").open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(details, ensure_ascii=False, indent=2) + "\n")
    read(QA / "scores.json")
    read(Path(__file__))
    report = {"revision": "visible-purchase-body-coverage-v1", "labels": LABELS.relative_to(ROOT).as_posix(),
              "scope": "Eight familiar development receipts, 57 unchanged reference purchases. Source-reviewed coverage metadata only; not new extraction accuracy or complete financial truth.",
              "reviewed_cases": {key: {"purchase_rows": value[0], "observation": value[1]} for key, value in REVIEWS.items()},
              "source_review_before_rescore": source_review["recorded_at"],
              "original50_visible_item_coverage": {version: sum(bool(labels[i].get("coverage", {}).get("items_complete_for_visible_body")) for i in records) for version, labels in (("v5", old), ("v6", new))},
              "prediction_views": 300, "paired_reference_scores": 600,
              "reviewed_subset_counts": {key: dict(value) for key, value in reviewed.items()},
              "all_original50_counts": {key: dict(value) for key, value in counts.items()},
              "all_existing_field_values_and_scores_preserved": True,
              "new_model_requests": 0, "external_requests": 0, "new_latency_measurements": 0,
              "limits": ["Unmatched rows use the unchanged description-only matcher; they are not automatically confirmed duplicates or manually classified false purchases.",
                         "Blurred merchants, the unresolved first Tahu amount, unprinted units, discounts and other unknown fields remain unknown. Complete financial coverage remains false and the strict metric is unchanged.",
                         "Tesseract and native Qwen are historical frozen pipelines; current primary/hybrid are saved-output parser replays. This is not a fresh same-runtime model or latency benchmark.",
                         "These development receipts were previously inspected during implementation; no held-out images, labels, split assignments or source permissions changed.",
                         "The existing paired browser-model plan still uses its frozen v5 reference. Version 6 is a separate coverage view, not a mutation of that prepared experiment."],
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "reference_views": 600,
                      "visible_item_coverage": report["original50_visible_item_coverage"],
                      "reviewed_subset_counts": report["reviewed_subset_counts"], "new_model_requests": 0}))


if __name__ == "__main__":
    main()
