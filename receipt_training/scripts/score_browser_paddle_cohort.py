"""Unchanged v5 field scorer, paired original50 browser-reader observations."""
from collections import Counter, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    folder = "qa-artifacts/" + tag
    hashes = {}

    def read(name, expected=None):
        raw = (ROOT / name).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or expected == digest, name
        hashes[name] = digest
        return raw

    def load(name, expected=None):
        return json.loads(read(name, expected))

    meta = load(folder + "/metadata.json")
    assert meta["cohort"] == "original50" and meta["source_unchanged"]
    assert meta["requests"] == {"writes": [], "external": []}
    plan = load(folder + "/input-plan.json", meta["input_plan_sha256"])
    assert len(plan["cases"]) == 50
    for name, digest in meta["source_sha256"].items():
        read(folder + "/source/" + name, digest)
    for name, digest in plan["input_sha256"].items():
        read(name, digest)
    read(folder + "/runner.mjs", meta["runner_sha256"])
    labels = {r["receipt_id"]: r for line in read("receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl").decode("utf-8").splitlines() if (r := json.loads(line))}
    config = load("receipt_training/evaluation/config.json")
    counts, scores, latency = defaultdict(Counter), [], []
    for entry in plan["cases"]:
        record = entry["record"]
        result = load(f"{folder}/{record['receipt_id']}-original.json")
        assert result["image_sha256"] == record["sha256"] and not result.get("error")
        for frame in result["frames"]:
            read(frame["path"], frame["sha256"])
        assert len(result["predictions"]) == 4
        for prediction in result["predictions"]:
            view = {**prediction, "elapsed_ms": result["reading_ms"] if prediction["reader"] == "paddle-ppocrv6-tiny-browser-wasm" else None}
            score = score_with_adjustments(record, labels[record["receipt_id"]], view, config)
            method = prediction["reader"] + "/" + prediction["mode"]
            for group in ("all", record["split"], record["category"]):
                counts[group + "/" + method].update(score["counts"])
            scores.append({"method": method, **score})
        latency.append(result["reading_ms"])
    for name in ("score.py", "score_adjustments.py", "score_browser_paddle_cohort.py"):
        read("receipt_training/scripts/" + name)
    result = {"counts": {k: dict(v) for k, v in counts.items()}, "scores": scores,
              "timing": {"n": len(latency), "mean_ms": statistics.mean(latency), "median_ms": statistics.median(latency),
                         "p95_nearest_rank_ms": sorted(latency)[math.ceil(.95 * len(latency)) - 1],
                         "scope": "Only new tiny browser warm inference/decode on frozen prepared JPEGs. Excludes initialization, preparation and offline parsing; no Tesseract timing comparison or handset claim."},
              "scope": "Same original fifty and exact prepared JPEG hashes. Unchanged v5 partial ground truth and field scorer, same frozen parser for saved Tesseract and new tiny browser OCR. Original category/split denominators retained; no money edits or confirmed checks. Familiar evaluation set, not new blind validation. Complete receipt accuracy is unscorable when labels are incomplete.",
              "new_ocr_jobs_in_scoring": 0, "api_cost_usd": "0", "compute_cost_usd": None,
              "evidence_sha256": hashes}
    with (ROOT / folder / "scores.json").open("x", encoding="utf-8") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    fields = ("expected_items", "predicted_items", "matched_items", "description_correct", "quantity_correct", "quantity_known", "unit_price_correct", "unit_price_known", "item_price_correct", "item_price_known", "total_correct", "total_known", "tax_correct", "tax_known", "processing_errors", "trusted_reconciliation_correct", "complete_receipt_known", "complete_receipt_unscorable")
    print(json.dumps({"counts": {k: {f: v.get(f, 0) for f in fields} for k, v in counts.items() if k.startswith("all/")}, "timing": result["timing"]}))


if __name__ == "__main__":
    main()
