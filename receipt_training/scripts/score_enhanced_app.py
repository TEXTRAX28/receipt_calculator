"""Score the unedited, actual private app draft after its local-only scan."""
import hashlib
import json
from pathlib import Path
import re
import sys
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    folder = ROOT / "qa-artifacts" / tag
    hashes = {}

    def load(path):
        raw = path.read_bytes()
        hashes[path.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
        return json.loads(raw)

    result = load(folder / "result.json")
    assert result["noFinancialEdits"] and result["noChecksConfirmed"]
    assert result["external"] == result["writes"] == result["errors"] == []
    assert result["receipt"].get("rawText", "") == ""
    label_path = ROOT / "receipt_training/annotations/private/supplement-financial-v2-labels.jsonl"
    raw = label_path.read_bytes()
    hashes[label_path.relative_to(ROOT).as_posix()] = hashlib.sha256(raw).hexdigest()
    label = next(r for line in raw.decode("utf-8").splitlines() if (r := json.loads(line))["receipt_id"] == result["receipt_id"])
    score = score_with_adjustments(result["record"], label, result, load(ROOT / "receipt_training/evaluation/config.json"))
    for name in ("score.py", "score_adjustments.py", "score_enhanced_app.py"):
        path = ROOT / "receipt_training/scripts" / name
        hashes[path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    with (folder / "scores.json").open("x", encoding="utf-8") as file:
        file.write(json.dumps({"scope": "Actual production app, original two-photo familiar UK transaction, unedited automatic-currency draft, unchanged complete UK-v2 assistant-reviewed development reference/scorer; not independent human validation.", "score": score, "evidence_sha256": hashes}, indent=2) + "\n")
    print(json.dumps({"counts": score["counts"], "discrepancy_minor": score["scanner_discrepancy_minor"], "observed_scan_to_review_ms": result["elapsed_ms"]}))


if __name__ == "__main__":
    main()
