"""Same-reference comparison of primary OCR choices with fixed vision drafts."""
from collections import Counter, defaultdict
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

    def read(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or digest == expected, name
        hashes[name] = digest
        return raw

    def load(name):
        return json.loads(read(name))

    base = "qa-artifacts/" + tag
    plan = load(base + "/plan.json")
    meta = load(base + "/replay/metadata.json")
    assert meta["new_model_calls"] == meta["private_uploads"] == meta["financial_edits"] == meta["checks_confirmed"] == 0
    assert meta["plan_sha256"] == hashes[base + "/plan.json"]
    for name, digest in meta["input_sha256"].items():
        read(name, digest)
    for name, digest in meta["source_sha256"].items():
        read(base + "/source/" + name, digest)
    assert all(plan["source_sha256"][name] == digest for name, digest in meta["loaded_source_sha256"].items())
    predictions = [json.loads(line) for line in read(base + "/replay/predictions.jsonl", meta["predictions_sha256"]).decode("utf-8").splitlines()]
    assert len(predictions) == 400
    labels_name = "receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl"
    labels = {r["receipt_id"]: r for line in read(labels_name, plan["input_sha256"][labels_name]).decode("utf-8").splitlines() if (r := json.loads(line))}
    records = {r["receipt_id"]: r for line in read("receipt_training/manifest.jsonl").decode("utf-8").splitlines() if (r := json.loads(line))}
    config = load("receipt_training/evaluation/config.json")
    counts, raw_counts, scores, paired = defaultdict(Counter), defaultdict(Counter), [], {}
    for row in predictions:
        identity = row["receipt_id"]
        assert records[identity]["sha256"] == row["image_sha256"]
        result = score_with_adjustments(records[identity], labels[identity], row, config)
        key = "/".join(row[k] for k in ("primary", "reader", "mode"))
        metrics = {name: (0 if row.get("error") and name.endswith("_correct") else value) for name, value in result["counts"].items()}
        raw_counts[key].update(result["counts"])
        counts[key].update(metrics)
        scores.append({"method": key, **result, "delivered_counts": metrics, "delivery_error": row.get("error")})
        pair = (identity, row["reader"], row["mode"], row["primary"])
        assert pair not in paired
        paired[pair] = metrics
    baseline = load("qa-artifacts/grouped-amounts-v15/scores.json")
    for reader in ("primary", "hybrid"):
        for mode in ("automatic", "known-currency"):
            assert dict(counts[f"paddle/{reader}/{mode}"]) == baseline["counts"][f"{reader}/{mode}/after"], (reader, mode)
    fields = ("matched_items", "description_correct", "quantity_correct", "item_price_correct", "unit_price_correct", "item_discount_correct", "receipt_discount_correct", "receipt_fee_correct", "subtotal_correct", "tax_correct", "total_correct", "price_basis_correct", "grouping_correct", "merchant_correct", "rounding_correct")
    improvements, regressions = [], []
    for (identity, reader, mode, primary), before in paired.items():
        if primary != "paddle":
            continue
        after = paired[(identity, reader, mode, "doctr")]
        for field in fields:
            delta = after.get(field, 0) - before.get(field, 0)
            if delta:
                (improvements if delta > 0 else regressions).append({"receipt_id": identity, "reader": reader, "mode": mode, "field": field, "delta": delta})
    for path in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        read(path.relative_to(ROOT).as_posix())
    result = {"counts": {k: dict(v) for k, v in counts.items()}, "raw_counts": {k: dict(v) for k, v in raw_counts.items()}, "scores": scores, "improvements": improvements, "regressions": regressions, "paddle_baseline_counts_identical": True, "failure_policy": "All original reference denominators retained; delivered correct-field counts zeroed for any explicit failure. Raw scorer counts remain available.", "evidence_sha256": hashes}
    with (folder / "scores.json").open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2)
    print(json.dumps({"views": 400, "paddle_baseline_identical": True, "improvement_fields": len(improvements), "regression_fields": len(regressions), "failed_views": meta["errors"]}))


if __name__ == "__main__":
    main()
