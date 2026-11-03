"""Unchanged v5/UK-v2 scoring of both retained-reading interpretation arms."""
from collections import Counter, defaultdict
import json
from pathlib import Path
import re
import sys
from audit_evidence_integrity import sha
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    folder = ROOT / "qa-artifacts" / tag
    hashes = {}

    def read(name, expected=None):
        p = ROOT / name
        digest = sha(p)
        assert expected is None or digest == expected, name
        hashes[name] = digest
        return p.read_bytes()

    meta = json.loads(read(f"qa-artifacts/{tag}/metadata.json"))
    assert meta["new_model_inferences"] == meta["private_uploads"] == 0
    for name, expected in meta["input_sha256"].items(): read(name, expected)
    for arm, files in meta["source_sha256"].items():
        for name, expected in files.items(): read(f"qa-artifacts/{tag}/source/{arm}/{name}", expected)
    labels = {}
    for name in ["priced-rows-v5-financial-labels.jsonl", "supplement-financial-v2-labels.jsonl"]:
        labels.update({r["receipt_id"]: r for line in read("receipt_training/annotations/private/" + name).splitlines() if (r := json.loads(line))})
    config = json.loads(read("receipt_training/evaluation/config.json"))
    counts, scores, regressions = defaultdict(Counter), [], []
    for identity in meta["cases"]:
        result = json.loads(read(f"qa-artifacts/{tag}/{identity}.json"))
        for before, after in zip(result["before"]["views"], result["after"]["views"], strict=True):
            assert before["mode"] == after["mode"]
            pair = []
            for arm, view in [("before", before), ("after", after)]:
                score = score_with_adjustments(result["record"], labels[result["receipt_id"]], view, config)
                method = "/".join([result["cohort"], result["variant"], view["mode"], arm])
                counts[method].update(score["counts"])
                scores.append({"method": method, **score})
                pair.append(score["counts"])
            losses = {k: [v, pair[1].get(k, 0)] for k, v in pair[0].items()
                      if (k.endswith("_correct") or k == "matched_items") and pair[1].get(k, 0) < v}
            additions = {k: [pair[0].get(k, 0), v] for k, v in pair[1].items()
                         if k in ["missing_items", "unmatched_predictions", "processing_errors"] and v > pair[0].get(k, 0)}
            if losses or additions: regressions.append({"identity": identity, "mode": before["mode"], "losses": losses, "additions": additions})
    for name in ["score.py", "score_adjustments.py", "score_prepared_windows.py"]:
        read("receipt_training/scripts/" + name)
    with (folder / "scores.json").open("x", encoding="utf-8") as f:
        json.dump({"counts": {k: dict(v) for k,v in counts.items()}, "scores": scores,
                   "scored_regressions": regressions, "evidence_sha256": hashes,
                   "scope": "Unchanged references/scorer; original50 and preparation supplements separate. Zero new OCR, price edits or human checks. Timing is not remeasured."}, f, indent=2)
    fields = ["predicted_items", "matched_items", "description_correct", "item_price_correct", "quantity_correct", "total_correct", "complete_receipt_correct"]
    print(json.dumps({"counts": {k:{f:v.get(f,0) for f in fields} for k,v in counts.items()}, "scored_regressions": regressions}))


if __name__ == "__main__": main()
