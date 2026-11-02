"""Unchanged-truth before/after word-alignment replay, without extraction."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts" / (sys.argv[1] if len(sys.argv) > 1 else "grouped-amounts-v1")
assert RUN.parent == ROOT / "qa-artifacts" and RUN.name.startswith("grouped-amounts-v")
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or expected == digest, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path, expected=None):
    return [json.loads(line) for line in read(path, expected).decode("utf-8").splitlines()]


def main():
    output = RUN / "scores.json"
    assert not output.exists(), "Preserve scored evidence"
    meta = load(RUN / "replay/metadata.json")
    for variant, folder in meta["frozen_source_paths"].items():
        for filename, digest in meta["source_sha256"][variant].items():
            read(ROOT / folder / filename, digest)
        for filename, digest in meta["loaded_frozen_source_sha256"][variant].items():
            assert digest == meta["source_sha256"][variant][filename]
    read(RUN / "replay/runner.mjs", meta["runner_sha256"])
    predictions = rows(RUN / "replay/predictions.jsonl", meta["predictions_sha256"])
    assert len(predictions) == 400 and meta["new_model_requests"] == meta["external_requests"] == 0
    labels = {r["receipt_id"]: r for r in rows(ROOT / "receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl")}
    records = {r["receipt_id"]: r for r in rows(ROOT / "receipt_training/manifest.jsonl")}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    previous = load(ROOT / "receipt_training/evaluation/advanced-column-purchases-v1.json")
    counts, scores, paired = defaultdict(Counter), [], {}
    for prediction in predictions:
        identity = prediction["receipt_id"]
        assert records[identity]["sha256"] == prediction["image_sha256"]
        result = score_with_adjustments(records[identity], labels[identity], prediction, config)
        key = "/".join(prediction[k] for k in ("reader", "mode", "variant"))
        counts[key].update(result["counts"])
        scores.append({"method": key, **result})
        paired[(identity, prediction["reader"], prediction["mode"], prediction["variant"])] = result
    for mode in ("automatic", "known-currency"):
        assert dict(counts["hybrid/" + mode + "/before"]) == previous["counts"]["hybrid/" + mode + "/after"]
    regressions, improvements = [], []
    fields = ("matched_items", "description_correct", "quantity_correct", "item_price_correct", "unit_price_correct", "item_discount_correct", "receipt_discount_correct", "receipt_fee_correct", "subtotal_correct", "tax_correct", "total_correct", "price_basis_correct", "grouping_correct", "merchant_correct", "rounding_correct")
    for (identity, reader, mode, variant), before in paired.items():
        if variant != "before":
            continue
        after = paired[(identity, reader, mode, "after")]
        changes = {field: after["counts"].get(field, 0) - before["counts"].get(field, 0) for field in fields}
        for field, delta in changes.items():
            if delta:
                (improvements if delta > 0 else regressions).append({"receipt_id": identity, "reader": reader, "mode": mode, "field": field, "delta": delta})
    for path in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        raw = read(path)
        target = RUN / "scorer" / path.name
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(raw)
        read(target)
    result = {"counts": {key: dict(value) for key, value in counts.items()}, "improvements": improvements, "regressions": regressions, "scores": scores, "evidence_sha256": HASHES}
    output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"counts": result["counts"], "improvements": improvements, "regressions": regressions}))


if __name__ == "__main__":
    main()
