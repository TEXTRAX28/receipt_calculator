"""Unchanged v5/strict scorers on saved before/after OCR interpretations and UI states."""
from collections import Counter, defaultdict
from pathlib import Path
import hashlib
import json
import re
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
HASHES = {}


def read(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT.resolve())
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, name
    HASHES[name] = digest
    return raw


def load(name, expected=None):
    return json.loads(read(name, expected))


def rows(name, expected=None):
    return [json.loads(line) for line in read(name, expected).decode("utf-8").splitlines()]


def main():
    retained, hybrid = sys.argv[1:3]
    assert all(re.fullmatch(r"ocr-invoice-[\w-]+", name) for name in (retained, hybrid))
    output = ROOT / "qa-artifacts" / retained / "scores.json"
    assert not output.exists(), "Preserve prior scored evidence"
    labels = {r["receipt_id"]: r for r in rows("receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl")}
    records = {r["receipt_id"]: r for r in rows("receipt_training/manifest.jsonl")}
    config = load("receipt_training/evaluation/config.json")
    label = load("qa-artifacts/public-scan-v1/strict-label-v2.json")
    score_rows, counts, paired = [], defaultdict(Counter), {}

    for run, prediction_file in ((retained, "predictions.ndjson"), (hybrid, "replay/predictions.jsonl")):
        base = "qa-artifacts/" + run
        meta = load(base + ("/metadata.json" if run == retained else "/replay/metadata.json"))
        assert meta["external_requests"] == 0
        for name, digest in meta["input_sha256"].items():
            read(name, digest)
        for variant, files in meta["source_sha256"].items():
            folder = "qa-artifacts/ocr-invoice-v1/before" if variant == "before" else base + "/after"
            for name, digest in files.items():
                read(folder + "/" + name, digest)
            for name, digest in meta["loaded_frozen_source_sha256"][variant].items():
                assert files[name] == digest
        read(base + ("/runner.mjs" if run == retained else "/replay/runner.mjs"), meta["runner_sha256"])
        predictions = rows(base + "/" + prediction_file, meta["predictions_sha256"])
        assert len(predictions) == meta["prediction_views"]
        for prediction in predictions:
            # Saved-reading interpretation has no scanner-latency measurement.
            prediction = {"elapsed_ms": 0, **prediction}
            identity = prediction["receipt_id"]
            if identity in records:
                assert prediction["image_sha256"] == records[identity]["sha256"]
                key = "/".join((prediction.get("reader", "on-device"), prediction.get("mode", "automatic"), prediction["variant"]))
                result = score_with_adjustments(records[identity], labels[identity], prediction, config)
                counts[key].update(result["counts"])
                paired[(identity, key)] = result["counts"]
            elif identity == label["receipt_id"]:
                key = "/".join((prediction["cohort"], prediction["variant"]))
                record = {"receipt_id": identity, "category": "non_costco/physical", "country": "GB", "split": "supplementary_source_reviewed"}
                result = score_with_adjustments(record, label, prediction, config)
                counts[key].update(result["counts"])
            else:
                continue
            score_rows.append({"method": key, **result})

    regressions, changes = [], []
    for (identity, key), before in paired.items():
        if not key.endswith("/before"):
            continue
        after = paired[(identity, key.removesuffix("before") + "after")]
        difference = {field: after.get(field, 0) - before.get(field, 0) for field in set(before) | set(after) if after.get(field, 0) != before.get(field, 0)}
        if difference:
            changes.append({"receipt_id": identity, "method": key, "count_deltas": difference})
        for field, delta in difference.items():
            if field.endswith("_correct") and delta < 0:
                regressions.append({"receipt_id": identity, "method": key, "field": field, "delta": delta})
    assert not changes, "Audit every original-fifty score change"
    previous = load("receipt_training/evaluation/advanced-payment-rows-v1.json")
    for reader in ("primary", "hybrid"):
        for mode in ("automatic", "known-currency"):
            key = f"{reader}/{mode}/after"
            assert dict(counts[key]) == previous["counts"][key], key
    assert counts["public-scans/before"]["complete_receipt_correct"] == 0
    assert counts["public-scans/after"]["complete_receipt_correct"] == 0
    assert counts["fresh-ui/state"]["complete_receipt_correct"] == 0
    assert counts["fresh-ui/reviewed_state"]["complete_receipt_correct"] == 1
    for path in ("receipt_training/scripts/score.py", "receipt_training/scripts/score_adjustments.py", "receipt_training/scripts/score_ocr_invoice.py"):
        read(path)
    result = {"scope": "Original fifty: 400 primary/hybrid and 100 on-device saved-reading views under unchanged v5 truth. One separate source-reviewed public scan under unchanged strict truth/scorer. Initial automatic complete score remains 0/1; reviewed 1/1 requires an explicit source-supported merchant correction and automated check interactions, not independent human verification.",
              "counts": {k: dict(v) for k, v in counts.items()}, "original50_changes": changes,
              "original50_scored_regressions": regressions, "scores": score_rows,
              "original_labels_changed": False, "new_inference_calls": 0, "evidence_sha256": HASHES}
    with output.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"original50_views": 500, "original50_changes": len(changes), "original50_scored_regressions": len(regressions),
                      "public_initial_strict_complete": "0/1", "public_source_corrected_reviewed_complete": "1/1"}))


if __name__ == "__main__":
    main()
