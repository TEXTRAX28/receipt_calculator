"""Score paired saved-reading replays against unchanged original references."""
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

    def read(path, expected=None):
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or digest == expected, path
        hashes[path.relative_to(ROOT).as_posix()] = digest
        return raw

    def load(path):
        return json.loads(read(path))

    meta = load(folder / "metadata.json")
    assert meta["new_model_calls"] == meta["external_receipt_uploads"] == 0
    for side, files in meta["source_sha256"].items():
        for name, expected in files.items():
            read(folder / "source" / side / name, expected)
    for name, expected in meta["input_sha256"].items():
        read(ROOT / name, expected)
    labels = {}
    for name in ("priced-rows-v5-financial-labels.jsonl", "supplement-financial-v2-labels.jsonl"):
        labels.update({r["receipt_id"]: r for line in read(ROOT / "receipt_training/annotations/private" / name).decode("utf-8").splitlines() if (r := json.loads(line))})
    config = load(ROOT / "receipt_training/evaluation/config.json")
    counts, results, changed = defaultdict(Counter), [], []
    financial = lambda r: {**{k: r.get(k) for k in ("merchant", "currency", "currencyUnresolved", "subtotal", "printedTotal", "printedTax", "pricesIncludeTax", "taxMode", "taxCodes")},
                           "items": [{k: i.get(k) for k in ("description", "quantity", "unitPrice", "lineTotal", "discount", "taxCode", "kind")} for i in r["items"]],
                           "adjustments": [{k: a.get(k) for k in ("label", "amount", "kind", "allocation")} for a in r["adjustments"]]}
    for c in meta["cases"]:
        pair = {}
        for side in ("before", "after"):
            data = load(folder / side / c["group"] / c["reader"] / (c["id"] + ".json"))
            assert data["image_sha256"] == c["image_sha256"]
            assert data["financial_edits"] == data["checks_confirmed"] == 0
            pair[side] = data
            for prediction in data["predictions"]:
                score = score_with_adjustments(data["record"], labels[c["id"]], {**prediction, "elapsed_ms": None}, config)
                key = "/".join([c["group"], c["reader"], prediction["mode"], side])
                counts[key].update(score["counts"])
                results.append({"group": c["group"], "reader": c["reader"], "mode": prediction["mode"], "side": side, **score})
        for before, after in zip(pair["before"]["predictions"], pair["after"]["predictions"]):
            if financial(before["receipt"]) != financial(after["receipt"]):
                changed.append({**c, "mode": before["mode"], "before_items": len(before["receipt"]["items"]), "after_items": len(after["receipt"]["items"]),
                                "before_discrepancy": before["calculation"].get("discrepancy"), "after_discrepancy": after["calculation"].get("discrepancy"),
                                "overlap_purchases": sum(o["purchases"] for o in pair["after"]["output"].get("overlaps", []))})
    for name in ("score.py", "score_adjustments.py", "score_footer_overlap.py"):
        read(ROOT / "receipt_training/scripts" / name)
    read(folder / "runner.mjs")
    result = {"scope": "Paired source-assembly/parser replay on identical retained observations, unchanged v5 and UK-v2 reference/scorer. Original50 and genuine supplement kept separate; assistant-reviewed familiar data, not independent blind complete-receipt truth. App-level review and hybrid VLM orchestration are not replayed. No new model calls, latency measurement or financial edits.",
              "counts": {k: dict(v) for k, v in counts.items()}, "changed_financial_predictions": changed, "scores": results, "evidence_sha256": hashes}
    with (folder / "scores.json").open("x", encoding="utf-8") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"scored_predictions": len(results), "changed_financial_predictions": changed, "original50_changed_predictions": sum(c["group"] == "original50" for c in changed)}))


if __name__ == "__main__":
    main()
