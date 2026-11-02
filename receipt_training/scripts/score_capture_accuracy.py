"""Existing v5/UK-v2 labels and unchanged scorers; original cohort stays separate."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
HASHES = {}


def read(name, expected=None):
    raw = (ROOT / name).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, name
    HASHES[name] = digest
    return raw


def load(name, expected=None):
    return json.loads(read(name, expected))


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    folder = "qa-artifacts/" + tag
    output = ROOT / folder / "scores.json"
    assert not output.exists()
    metadata = load(folder + "/metadata.json")
    assert metadata["source_unchanged"] and metadata["requests"] == {"writes": [], "external": []}
    plan = load(folder + "/input-plan.json", metadata["input_plan_sha256"])
    for name, digest in plan["input_sha256"].items():
        read(name, digest)
    for name, digest in metadata["source_sha256"].items():
        read(folder + "/source/" + name, digest)
    read(folder + "/runner.mjs", metadata["runner_sha256"])
    labels = {}
    for name in ("priced-rows-v5-financial-labels.jsonl", "supplement-financial-v2-labels.jsonl"):
        labels.update({r["receipt_id"]: r for line in read("receipt_training/annotations/private/" + name).decode("utf-8").splitlines() if (r := json.loads(line))})
    config = load("receipt_training/evaluation/config.json")
    scored, counts, timings, cases = [], defaultdict(Counter), defaultdict(list), []
    for case in plan["cases"]:
        record = case["record"]
        identity = record["receipt_id"]
        cohort = "supplied-uk" if identity.startswith("supplement-") else "original-cord-development"
        for variant in plan["variants"]:
            result = load(f"{folder}/{identity}-{variant}.json")
            assert not result.get("error") and result["image_sha256"] == record["sha256"]
            for frame in result.get("frames", []):
                read(frame["path"], frame["sha256"])
            for prediction in result["predictions"]:
                view = {**prediction, "elapsed_ms": result.get("elapsed_ms", 0)}
                score = score_with_adjustments(record, labels[identity], view, config)
                method = "/".join((cohort, prediction["mode"], variant))
                counts[method].update(score["counts"])
                scored.append({"method": method, **score})
            if not result.get("reused_original"):
                timings[variant].append({"id": identity, **{k:result[k] for k in ("preparation_ms", "reading_ms", "elapsed_ms")}})
            cases.append({"id": identity, "variant": variant, "reused_original": result.get("reused_original", False),
                          "new_ocr_sections": result["new_ocr_sections"], "panel_count": len(result.get("frames", [])),
                          "initial_confirmable": [not p["calculation"]["issues"] for p in result["predictions"]]})
    for name in ("score.py", "score_adjustments.py", "score_capture_accuracy.py"):
        read("receipt_training/scripts/" + name)
    result = {"scope": "Four preregistered familiar development transactions. Three original CORD cases and the separate supplied UK transaction never merge denominators. Unchanged scorers/truth; no independent human truth, blind holdout, model promotion or geometry-only causal claim.",
              "counts": {k:dict(v) for k,v in counts.items()}, "scores": scored, "timings": dict(timings), "cases": cases,
              "fresh_ocr_sections": metadata["actual_ocr_sections"], "source_references_changed": False,
              "new_model_or_external_calls": 0, "evidence_sha256": HASHES}
    with output.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    fields = ("predicted_items", "matched_items", "description_correct", "quantity_correct", "unit_price_correct", "item_price_correct", "total_correct", "tax_correct", "complete_receipt_correct")
    print(json.dumps({"counts": {k:{f:v.get(f,0) for f in fields} for k,v in counts.items()}, "fresh_ocr_sections": metadata["actual_ocr_sections"]}))


if __name__ == "__main__":
    main()
