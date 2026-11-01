"""Record one visibly printed signed rounding amount; leave other unknowns alone."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
BASE = DATA / "annotations/private/priced-rows-v3-labels.jsonl"
OUT = DATA / "annotations/private/priced-rows-v4-labels.jsonl"
REPORT = DATA / "evaluation/advanced-rounding-truth-v1.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if "--check" in sys.argv:
        value = json.loads(REPORT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            assert sha(ROOT / name) == expected, "Evidence changed: " + name
        print(json.dumps({"verified_files": len(value["evidence_sha256"]), "new_known_rounding": 1}))
        return
    assert not OUT.exists() and not REPORT.exists(), "Preserve the source review; use --check"
    prior_path = DATA / "evaluation/advanced-tesco-full-truth-v1.json"
    prior = json.loads(prior_path.read_text(encoding="utf-8"))
    assert sha(BASE) == prior["evidence_sha256"][BASE.relative_to(ROOT).as_posix()]
    manifest = DATA / "manifest.jsonl"
    record = next(json.loads(line) for line in manifest.read_text(encoding="utf-8").splitlines()
                  if json.loads(line)["receipt_id"] == "cord-v2-train-000")
    image = DATA / record["file_path"]
    assert sha(image) == record["sha256"] == "a7efa7596757d7916c5e454e8bd98e3371cdf476ac737a269693804484cfc193"
    raw_path = DATA / "annotations/raw/cord-v2-train-000.json"
    raw = json.loads(raw_path.read_text(encoding="utf-8"))
    assert raw["gt_parse"]["sub_total"]["etc"] == "-45"
    labels = [json.loads(line) for line in BASE.read_text(encoding="utf-8").splitlines()]
    changed = 0
    for label in labels:
        if label["receipt_id"] != record["receipt_id"]:
            continue
        assert label["rounding"]["value"] is None
        label["rounding"] = {"raw": "Rounding -45", "value": "-45", "review_required": False}
        label["verification"] = {**label["verification"], "status": "manual_visual_partial",
            "model_generated": True, "checked_against_source": True, "independent_human_verified": False,
            "visual_review": "full original opened; footer explicitly prints Rounding -45",
            "notes": [*label["verification"]["notes"],
                "Only the rounding field was newly source-checked. Existing item/fee/tax values retain upstream provenance.",
                "The amount -45 is visibly printed beside Rounding; retained upstream sub_total.etc also says -45. This is not inferred by balancing the printed total.",
                "Retrospective assistant review after earlier output inspection, not independent human verification or a new holdout. Other absent/unknown rounding fields remain null."]}
        label["review_flags"].append("Source-checked signed rounding -45; header remains publisher-blurred and complete financial truth is not asserted.")
        changed += 1
    assert changed == 1
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in labels))
    value = {"revision": "original-priced-rows-v4", "reviewed_at": datetime.now(timezone.utc).isoformat(),
        "scope": "One previously unknown rounding value is now sourced from the actual original and its retained upstream token. No item, fee, tax, subtotal, total, quantity, coverage, split or processing permission is changed.",
        "labels": OUT.relative_to(ROOT).as_posix(), "changed_receipt_id": record["receipt_id"],
        "new_known_rounding_values": 1, "new_inference": 0, "external_requests": 0,
        "complete_financial_truth_available": False,
        "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in
                            (BASE, OUT, prior_path, image, raw_path, manifest, Path(__file__))}}
    with REPORT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"changed_receipts": 1, "known_rounding_added": 1, "new_inference": 0}))


if __name__ == "__main__":
    main()
