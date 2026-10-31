"""Audit historical frozen predictions against both original and repaired truth."""
import hashlib
import json
from pathlib import Path
import sys

from score import aggregate, match_items, minor, score_one

ROOT = Path(__file__).resolve().parents[2]
TRAINING = ROOT / "receipt_training"
SCORES = TRAINING / "annotations/private/priced-row-score-v2"
OUT = TRAINING / "evaluation/advanced-priced-row-rescore-v2.json"
METHODS = ("baseline", "paddle-layout-v3", "doctr-layout-v3", "qwen", "hybrid")


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            if sha(ROOT / name) != expected:
                raise ValueError("Frozen scoring evidence changed: " + name)
        print(json.dumps({"verified_files": len(report["evidence_sha256"]),
                          "methods": len(report["methods"]), "new_extraction_calls": 0}))
        return
    if OUT.exists():
        raise ValueError("Preserve the original rescore checkpoint; use --check")
    evidence = {}

    def remember(path, expected=None):
        name = path.resolve().relative_to(ROOT).as_posix()
        digest = sha(path)
        if expected is not None and digest != expected:
            raise ValueError("Frozen scoring evidence changed: " + name)
        evidence[name] = digest

    def load(path, expected=None):
        remember(path, expected)
        return json.loads(path.read_text(encoding="utf-8"))

    truth = load(TRAINING / "evaluation/advanced-priced-row-truth-v2.json")
    for name, digest in truth["evidence_sha256"].items():
        remember(ROOT / name, digest)
    old_path = TRAINING / "annotations/labels.jsonl"
    new_path = TRAINING / truth["labels"]
    manifest_path = TRAINING / "manifest.jsonl"
    config_path = TRAINING / "evaluation/config.json"
    for path in (old_path, new_path, manifest_path, config_path, Path(__file__),
                 Path(__file__).with_name("score.py")):
        remember(path)
    old = {r["receipt_id"]: r for r in read_lines(old_path)}
    new = {r["receipt_id"]: r for r in read_lines(new_path)}
    records = {r["receipt_id"]: r for r in read_lines(manifest_path)}
    config = json.loads(config_path.read_text(encoding="utf-8"))
    if old.keys() != new.keys():
        raise ValueError("Annotation revision changed transaction membership")
    for receipt_id, label in old.items():
        repaired = new[receipt_id]
        if repaired["items"][:len(label["items"])] != label["items"]:
            raise ValueError("An original purchase was changed")
        unchanged = lambda x: {k: v for k, v in x.items() if k not in ("items", "verification", "review_flags")}
        if unchanged(label) != unchanged(repaired):
            raise ValueError("Existing financial metadata or coverage was changed")
    methods, cohort = {}, None
    for method in METHODS:
        saved = load(SCORES / (method + ".json"))
        if saved["labels_sha256"] != sha(new_path) or saved["manifest_sha256"] != sha(manifest_path):
            raise ValueError("The saved rescore used different truth or receipts")
        before, after, seen, added = [], [], set(), []
        for run_name in saved["run_names"]:
            folder = TRAINING / "evaluation/runs" / run_name
            meta = load(folder / "metadata.json")
            if not (meta.get("source_unchanged") or meta.get("source_served_from_frozen_snapshot")):
                raise ValueError("The retained run lacks a stable scanner snapshot")
            remember(folder / "predictions.jsonl", meta["predictions_sha256"])
            if meta["config_sha256"] != sha(config_path):
                raise ValueError("The frozen matching configuration changed")
            for name, digest in meta["source_sha256"].items():
                remember(folder / "source" / name, digest)
            for name, digest in meta.get("runtime_source_sha256", {}).items():
                remember(folder / "runtime-source" / name, digest)
            if meta.get("evaluation_runner_sha256"):
                remember(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
            for prediction in read_lines(folder / "predictions.jsonl"):
                receipt_id = prediction["receipt_id"]
                record = records[receipt_id]
                if receipt_id in seen or record["sha256"] != prediction["image_sha256"] or record["split"] != meta["split"]:
                    raise ValueError("Receipt identity, split or uniqueness changed")
                remember(TRAINING / record["file_path"], record["sha256"])
                seen.add(receipt_id)
                before.append(score_one(record, old[receipt_id], prediction, config))
                after.append(score_one(record, new[receipt_id], prediction, config))
                expected, actual = new[receipt_id]["items"], prediction.get("receipt", {}).get("items", [])
                pairs = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
                for index, item in enumerate(expected):
                    if item["id"] in {row["id"] for row in old[receipt_id]["items"]}:
                        continue
                    row = actual[pairs[index]] if index in pairs else {}
                    amount = minor(row.get("lineTotal"), record["currency"], config)
                    known = minor(item["line_total"]["value"], record["currency"], config)
                    added.append({"receipt_id": receipt_id, "row_kind": item["raw"]["row_kind"],
                                  "expected_amount": item["line_total"]["value"],
                                  "detected": index in pairs, "price_correct": amount is not None and amount == known})
        if len(seen) != 50 or (cohort is not None and seen != cohort):
            raise ValueError("Methods do not cover the identical original 50 transactions")
        cohort = seen
        old_counts, new_counts = aggregate(before)["counts"], aggregate(after)["counts"]
        if new_counts != saved["overall"]["counts"]:
            raise ValueError("Retained scoring output does not reproduce")
        delta = {key: new_counts.get(key, 0) - old_counts.get(key, 0) for key in sorted(old_counts.keys() | new_counts.keys())
                 if new_counts.get(key, 0) != old_counts.get(key, 0)}
        if any(delta.get(key, 0) for key in ("samples", "total_known", "total_correct", "trusted_reconciliation_correct", "complete_receipt_known")):
            raise ValueError("A row-only annotation repair changed receipt-level truth")
        methods[method] = {"frozen_runs": saved["run_names"], "before_counts": old_counts,
                           "repaired_truth_counts": new_counts, "count_delta_due_only_to_annotation": delta,
                           "added_rows": added}
    report = {"scope": "Retrospective priced-row annotation repair and rescoring of existing frozen pipelines on the identical original 50 transactions. No OCR/model/parser changes or new inference. Historical reports remain unchanged.",
              "truth_revision": "original-priced-rows-v2", "cohort_size": 50,
              "definitions": "The 135 labelled rows now include two separately priced paid add-ons and three separately printed zero-price options, in addition to the original 130 top-level purchases. This row view is not the till's product-count definition. Quantity remains unknown for both paid add-ons; no parent quantity is inherited.",
              "selection_limits": "Source-informed retrospective repair, including previously measured evaluation cases; not a fresh blind holdout or independent human verification. No application tuning was performed from these cases. Pipeline versions, preprocessing and historical runtime circumstances differ by method; this is not an isolated engine-only ablation.",
              "methods": methods, "new_extraction_calls": 0, "external_requests": 0,
              "new_scanner_latency_measured": False,
              "finding": "Four of five added rows are already detected by Qwen and the current hybrid. Three amounts are correct, including two zero-price options; only one of the two paid add-on amounts is correct. One saved draft has 4.000 for a source 4,000 add-on; exact IDR comparison fails rather than reinterpreting that canonical decimal using truth. The zero-price Sedang option is not a separate predicted item. Receipt-total and trusted-reconciliation counts are unchanged.",
              "remaining_truth_work": "Complete original financial/global accuracy is still unscorable. Unknown/blurred merchant fields, unprinted quantities, tax-basis/discount metadata and unreviewed financial details must not be fabricated. Fees, rounding and nested ownership also need explicit independent completeness checks before a future expanded complete-receipt metric can be trusted.",
              "evidence_sha256": evidence}
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"cohort": 50, "methods": len(methods), "source_priced_rows": 135,
                      "new_extraction_calls": 0, "complete_truth_available": False}))


if __name__ == "__main__":
    main()
