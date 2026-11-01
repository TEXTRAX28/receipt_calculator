"""Separate the original development/evaluation memberships without new inference."""
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import aggregate_adjustments, score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
OUT = DATA / "evaluation/advanced-current-native-original50-splits-v1.json"
CAPTURE = ROOT / "qa-artifacts/current-native-original50-splits-v1"
HASHES = {}


def remember(path, expected=None):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    name = path.relative_to(ROOT).as_posix()
    assert expected is None or digest == expected, name
    HASHES[name] = digest
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def lines(path):
    return [json.loads(line) for line in remember(path).read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve published evidence; use --check"
    original = load(DATA / "evaluation/advanced-current-native-original50-v1.json")
    for name, expected in original["evidence_sha256"].items():
        remember(ROOT / name, expected)
    plan = load(DATA / "evaluation/runs/current-native-original50-v1/plan.json")
    records = {row["receipt_id"]: row for row in plan["records"]}
    labels = {row["receipt_id"]: row for row in lines(DATA / "annotations/private/priced-rows-v4-labels.jsonl")}
    predictions = lines(ROOT / "qa-artifacts/current-native-original50-summary-v1/predictions.jsonl")
    config = load(DATA / "evaluation/config.json")
    result = {}
    for split, expected in (("development", 38), ("evaluation", 12)):
        ids = {name for name, row in records.items() if row["split"] == split}
        assert len(ids) == expected
        result[split] = {"receipt_ids": sorted(ids), "scores": {}}
        for mode in ("primary", "auto"):
            selected = [row for row in predictions if row["receipt_id"] in ids and row["mode"] == mode]
            assert len(selected) == len({row["receipt_id"] for row in selected}) == expected
            scores = [score_with_adjustments(records[row["receipt_id"]], labels[row["receipt_id"]], row, config) for row in selected]
            value = aggregate_adjustments(scores)
            value.pop("latency_ms")  # Shared-worker observations are not primary-only latency.
            assert value["counts"]["samples"] == value["counts"]["complete_receipt_unscorable"] == expected
            result[split]["scores"][mode] = value
    for mode in ("primary", "auto"):
        total = original["known_field_scores"]["priced_rows_v4"][mode]["counts"]
        for key, expected in total.items():
            assert sum(result[split]["scores"][mode]["counts"].get(key, 0) for split in result) == expected, key
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name
        with target.open("xb") as output:
            output.write(source.read_bytes())
        remember(target)
    report = {
        "scope": "Offline split of the same fully fresh original-fifty pre-deadline-change observations into their unchanged 38-development/12-evaluation memberships, under the same source-covered v4 truth and scorer. All fifty, including the one development timeout, remain included. No new model/provider requests.",
        "limits": "The original evaluation sources were already inspected; this is a regression subset, not a fresh blind holdout. No complete financial labels are eligible. This does not establish post-deadline twelve-case or fifty-case inference coverage.",
        "splits": result, "new_model_requests": 0, "cloud_requests": 0,
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({split: value["scores"]["auto"]["counts"] for split, value in result.items()}))


if __name__ == "__main__":
    main()
