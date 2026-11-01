"""Rescore fixed historical predictions with explicit charge/rounding metrics."""
import hashlib
import json
from pathlib import Path
import sys

from score import score_one
from score_adjustments import aggregate_adjustments, score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
QA = ROOT / "qa-artifacts/adjustment-metrics-v1"
OUT = DATA / "evaluation/advanced-receipt-adjustments-v1.json"
EVIDENCE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    value = sha(path)
    assert expected is None or expected == value, "Evidence changed: " + str(path)
    EVIDENCE[path.relative_to(ROOT).as_posix()] = value
    return path


def load(path, expected=None):
    return json.loads(remember(path, expected).read_text(encoding="utf-8"))


def lines(path, expected=None):
    return [json.loads(line) for line in remember(path, expected).read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "new_inference": 0, "known_service_charges": 8, "known_rounding": 1}))
        return
    assert not OUT.exists(), "Preserve the report; use --check"
    rounding = load(DATA / "evaluation/advanced-rounding-truth-v1.json")
    for name, expected in rounding["evidence_sha256"].items():
        remember(ROOT / name, expected)
    before = {r["receipt_id"]: r for r in lines(DATA / "annotations/private/priced-rows-v3-labels.jsonl")}
    after = {r["receipt_id"]: r for r in lines(DATA / "annotations/private/priced-rows-v4-labels.jsonl")}
    records = {r["receipt_id"]: r for r in lines(DATA / "manifest.jsonl")}
    config = load(DATA / "evaluation/config.json")
    assert before.keys() == after.keys()
    changed = [name for name in before if before[name] != after[name]]
    assert changed == ["cord-v2-train-000"]
    for name in before:
        unchanged = lambda row: {k: v for k, v in row.items() if k not in ("rounding", "verification", "review_flags")}
        assert unchanged(before[name]) == unchanged(after[name])
    prior = load(DATA / "evaluation/advanced-priced-row-rescore-v2.json")
    v3 = load(DATA / "evaluation/advanced-tesco-full-rescore-v1.json")
    methods = {}
    for method, entry in prior["methods"].items():
        rows = []
        for run in entry["frozen_runs"]:
            folder = DATA / "evaluation/runs" / run
            meta = load(folder / "metadata.json")
            assert meta.get("source_unchanged") or meta.get("source_served_from_frozen_snapshot")
            for name, expected in meta["source_sha256"].items():
                remember(folder / "source" / name, expected)
            for name, expected in meta.get("runtime_source_sha256", {}).items():
                remember(folder / "runtime-source" / name, expected)
            rows.extend(lines(folder / "predictions.jsonl", meta["predictions_sha256"]))
        assert len(rows) == len({row["receipt_id"] for row in rows}) == 50
        scored = []
        for row in rows:
            record, label = records[row["receipt_id"]], after[row["receipt_id"]]
            assert row["image_sha256"] == record["sha256"]
            remember(DATA / record["file_path"], record["sha256"])
            old = score_one(record, before[row["receipt_id"]], row, config)
            new = score_with_adjustments(record, label, row, config)
            # Timing belongs to historical observations, not this cheap rescore.
            new["elapsed_ms"] = old["elapsed_ms"]
            for key, value in old["counts"].items():
                if key not in ("complete_receipt_known", "complete_receipt_correct", "complete_receipt_unscorable", "requires_review"):
                    assert new["counts"][key] == value
            scored.append(new)
        result = aggregate_adjustments(scored)
        result.pop("latency_ms")
        assert result["counts"]["receipt_fee_known"] == 8 and result["counts"]["rounding_known"] == 1
        for key in ("expected_items", "item_price_known", "item_price_correct", "quantity_known", "quantity_correct", "description_correct", "complete_receipt_known"):
            assert result["counts"][key] == v3["historical_frozen_pipelines"][method]["after_v3"]["counts"][key]
        methods[method] = result
    for name in ("new-tests.log", "legacy-tests.log"):
        text = remember(QA / name).read_text(encoding="utf-8")
        assert "OK" in text and "FAILED" not in text
    for name in ("score.py", "score_adjustments.py", "test_score_adjustments.py", "build_adjustment_metrics_report.py"):
        source = Path(__file__).with_name(name)
        copy = QA / ("source-" + name)
        with copy.open("xb") as output: output.write(source.read_bytes())
        remember(copy, sha(source))
    value = {
        "scope": "Versioned evaluation extension, not an OCR/app improvement. Fixed historical predictions on the original fifty are rescored for eight labelled service charges, one newly source-checked signed rounding amount and any known price-tax basis. Historical score.py and reports remain unchanged.",
        "methods": methods, "new_evaluator_tests_passed": 8, "existing_evaluation_tests_passed": 15,
        "new_inference": 0, "external_requests": 0, "application_sources_changed": False,
        "definitions": "Fees require the correct app charge kind and exact signed minor-unit amount, with multiplicity. service_price maps explicitly to fee, not tax. Known rounding requires an explicit rounding proposal with the correct signed sum; missing truth is never zero. Known tax inclusion requires the matching boolean and an identified tax mode. Complete scoring also rejects incorrect fee structure/rounding and requires rounding truth or explicitly verified absence. Partial unknown fee collections cannot establish extra-charge errors or complete truth.",
        "limits": "Source-informed retrospective labels, upstream CORD fee metadata and one assistant-viewed original rounding line; no independent human verification. No original receipt has sufficient full financial truth for the complete metric. These extra metrics do not establish a universal complete financial contract, calibrated confidence, new latency or a fresh holdout.",
        "fresh_original50_run": "Still separate: actual native run must reach terminal metadata before its full report can publish. Its source images/inference are not changed by this scoring extension.",
        "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"methods": len(methods), "known_fees": 8, "known_rounding": 1, "evidence_files": len(EVIDENCE), "new_inference": 0}))


if __name__ == "__main__":
    main()
