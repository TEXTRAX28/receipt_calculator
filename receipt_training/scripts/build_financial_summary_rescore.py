"""Rescore unchanged stored pipelines on both financial-reference versions."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUN = ROOT / "qa-artifacts/financial-summary-truth-v1"
CAPTURE = RUN / "rescore-v1"
OUT = DATA / "evaluation/advanced-financial-summary-rescore-v1.json"
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path, expected=None):
    return list(map(json.loads, read(path, expected).decode("utf-8").splitlines()))


def sealed_rows(path):
    """Use the earlier immutable report's hash when a legacy metadata file lacks it."""
    name = path.relative_to(ROOT).as_posix()
    declarations = set()
    for packet in sorted((DATA / "evaluation").glob("*.json")):
        value = json.loads(packet.read_text(encoding="utf-8"))
        if name in value.get("evidence_sha256", {}):
            declarations.add(value["evidence_sha256"][name])
            read(packet)
    assert len(declarations) == 1, "One consistent prior declaration required: " + name
    return rows(path, declarations.pop())


def native_run(name):
    folder = DATA / "evaluation/runs" / name
    meta = load(folder / "metadata.json")
    assert meta.get("source_unchanged") or meta.get("source_served_from_frozen_snapshot")
    for filename, digest in meta["source_sha256"].items():
        read(folder / "source" / filename, digest)
    for filename, digest in meta.get("runtime_source_sha256", {}).items():
        read(folder / "runtime-source" / filename, digest)
    if meta.get("evaluation_runner_sha256"):
        read(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
    return rows(folder / "predictions.jsonl", meta["predictions_sha256"])


def coverage(label):
    issues = []
    if label["merchant"]["value"] is None:
        issues.append("merchant_unknown")
    if label["currency"]["value"] is None:
        issues.append("currency_unknown")
    for name in ("subtotal", "tax", "grand_total"):
        if label[name]["value"] is None:
            issues.append(name + "_unknown")
    if label.get("prices_include_tax") is None:
        issues.append("price_basis_unknown")
    if not label.get("coverage", {}).get("financial_fields_complete"):
        issues.append("financial_coverage_incomplete")
    if not label.get("coverage", {}).get("items_complete_for_visible_body"):
        issues.append("item_coverage_incomplete")
    if not label["items"]:
        issues.append("no_purchase_reference")
    for name in ("description", "quantity", "line_total", "discount"):
        if any(item[name]["value"] is None for item in label["items"]):
            issues.append("some_item_" + name + "_unknown")
    if label["rounding"]["value"] is None and label.get("coverage", {}).get("rounding_absence_verified") is not True:
        issues.append("rounding_or_absence_unknown")
    return issues


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for path, digest in report["evidence_sha256"].items():
            read(ROOT / path, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve scored evidence"
    truth = load(DATA / "evaluation/advanced-financial-truth-v1.json")
    for path, digest in truth["evidence_sha256"].items():
        read(ROOT / path, digest)
    old = {row["receipt_id"]: row for row in rows(DATA / "annotations/private/priced-rows-v4-labels.jsonl")}
    new = {row["receipt_id"]: row for row in rows(ROOT / truth["labels"])}
    old_uk = {row["receipt_id"]: row for row in rows(DATA / "annotations/private/supplement-labels.jsonl")}
    new_uk = {row["receipt_id"]: row for row in rows(ROOT / truth["supplement_labels"])}
    assert old.keys() == new.keys() and old_uk.keys() == new_uk.keys()
    plan = load(ROOT / "qa-artifacts/row-first-original50-v1/plan.json")
    records = {case["id"]: case["record"] for case in plan["cases"]}
    assert len(records) == 50
    for record in records.values():
        read(DATA / record["file_path"], record["sha256"])
        assert not record["external_processing_allowed"]
    uk = rows(DATA / "annotations/private/supplement-manifest.jsonl")[0]
    assert uk["receipt_id"] == "supplement-user-uk-20261026-group" and not uk["external_processing_allowed"]
    records[uk["receipt_id"]] = uk
    config = load(DATA / "evaluation/config.json")
    predictions = []
    for method, runs in (("tesseract-baseline", ("baseline-development", "baseline-evaluation")),
                         ("qwen-full-v2", ("qwen-full-v2-original-development", "qwen-full-v2-original-evaluation"))):
        items = [row for name in runs for row in native_run(name)]
        assert len(items) == 50 and {row["receipt_id"] for row in items} == set(records) - {uk["receipt_id"]}
        predictions.extend((method, "automatic", row) for row in items)
    replay = ROOT / "qa-artifacts/separate-purchase-expressions-v3/replay"
    meta = load(replay / "metadata.json")
    assert meta["new_model_requests"] == meta["external_requests"] == 0
    for path, digest in meta["input_sha256"].items():
        read(ROOT / path, digest)
    for path, digest in meta["source_sha256"]["after"].items():
        read(replay.parent / "after" / path, digest)
    for path, digest in meta["loaded_frozen_source_sha256"]["after"].items():
        assert digest == meta["source_sha256"]["after"][path]
    read(replay / "runner.mjs", meta["runner_sha256"])
    for method, name, key in (("paddle-primary-current", "primary-predictions.jsonl", "primary_predictions_sha256"),
                              ("hybrid-current", "predictions.jsonl", "predictions_sha256")):
        selected = [row for row in rows(replay / name, meta[key]) if row["variant"] == "after"]
        assert len(selected) == 100
        predictions.extend((method, row["mode"], row) for row in selected)
    for method, name in (("tesseract-baseline", "advanced-baseline-20261031-supplement"), ("qwen-full-v2", "qwen-full-v2-supplement")):
        selected = [row for row in native_run(name) if row["receipt_id"] == uk["receipt_id"]]
        assert len(selected) == 1
        predictions.append((method, "automatic", selected[0]))
    leading = ROOT / "qa-artifacts/leading-quantity-current-replay-v2"
    leading_meta = load(leading / "metadata.json")
    assert leading_meta["new_model_requests"] == leading_meta["cloud_requests"] == 0
    for path, digest in leading_meta["input_sha256"].items():
        read(ROOT / path, digest)
    for path, digest in leading_meta["source_sha256"]["candidate"].items():
        candidate = leading / "source-candidate" / path
        if not candidate.is_file():
            assert digest == leading_meta["source_sha256"]["control"][path]
            candidate = ROOT / "qa-artifacts/literal-total-prompt-v1/source" / path
        read(candidate, digest)
    for row in sealed_rows(leading / "predictions.jsonl"):
        if row["receipt_id"] == uk["receipt_id"] and row["variant"] == "candidate":
            method = "paddle-primary-earlier-uk" if row["reader"] == "primary" else "hybrid-earlier-uk"
            predictions.append((method, "automatic" if row["mode"] == "auto" else "known-currency", row))
    assert len(predictions) == 306
    scores, counts = [], defaultdict(Counter)
    unchanged = ("expected_items", "predicted_items", "matched_items", "description_known", "description_correct", "quantity_known", "quantity_correct", "item_price_known", "item_price_correct", "unit_price_known", "unit_price_correct", "subtotal_known", "subtotal_correct", "tax_known", "tax_correct", "total_known", "total_correct", "item_discount_known", "item_discount_correct", "receipt_discount_known", "receipt_discount_correct", "receipt_fee_known", "receipt_fee_correct")
    for method, mode, prediction in predictions:
        identity = prediction["receipt_id"]
        record = records[identity]
        assert prediction["image_sha256"] == record["sha256"]
        cohort = "uk-supplement" if identity == uk["receipt_id"] else "original-fifty"
        labels = (old_uk, new_uk) if cohort == "uk-supplement" else (old, new)
        paired = []
        for version, truth_labels in zip(("before", "after"), labels, strict=True):
            result = score_with_adjustments(record, truth_labels[identity], prediction, config)
            paired.append(result)
            scores.append({"method": method, "mode": mode, "truth": version, "cohort": cohort, **result})
            counts[f"{cohort}/{method}/{mode}/{version}"].update(result["counts"])
        for field in unchanged:
            assert paired[0]["counts"].get(field, 0) == paired[1]["counts"].get(field, 0), (identity, field)
    capture_paths = (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py"), Path(__file__).with_name("record_financial_summary_review.py"), Path(__file__).with_name("test_financial_summary_truth.py"))
    CAPTURE.mkdir()
    for path in capture_paths:
        raw = read(path)
        target = CAPTURE / path.name
        target.write_bytes(raw)
        read(target)
    (CAPTURE / "detail-scores.json").write_text(json.dumps(scores, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read(CAPTURE / "detail-scores.json")
    test_log = read(RUN / "tests-v1.log").decode("utf-8")
    assert "Ran 8 tests" in test_log and "\nOK" in test_log and "FAILED" not in test_log
    coverage_rows = [{"receipt_id": identity, "split": records[identity]["split"], "blocking_reference_gaps": coverage(new[identity])} for identity in records if identity in new]
    coverage_totals = Counter(reason for row in coverage_rows for reason in row["blocking_reference_gaps"])
    (CAPTURE / "coverage-gaps.json").write_text(json.dumps(coverage_rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read(CAPTURE / "coverage-gaps.json")
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    assert git("rev-parse", "stable/receipt-verified").decode().strip() == "ee725ba45e799bee8501d3de034e0302c0127afd"
    assert git("diff", "de24452", "--", "src", "server", "tests", "scripts", "package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts") == b""
    original = r"C:\Users\natan\VSC Code\costco_calc"
    assert hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest() == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    report = {"scope": "Source-informed financial-reference revision applied to unchanged stored outputs, before and after, on all original fifty and a separate supplied-UK supplement. No extraction gain, new inference, source change or permission expansion.",
              "prediction_views": len(predictions), "scored_truth_views": len(scores), "counts": {key: dict(value) for key, value in counts.items()},
              "all_existing_known_field_counts_preserved": True, "original_fifty_reference_gap_counts": dict(coverage_totals),
              "new_model_requests": 0, "external_requests": 0, "new_scanner_latency_samples": 0,
              "application_source_matches_commit": "de244529178ca142500586314d01fa17165cc55e", "stable_and_original_dirty_checkout_unchanged": True,
              "limits": ["Previously inspected source-informed assistant references, not independent human truth or a blind holdout. Tax basis is a financial-layout interpretation with its source transcriptions, not a literal printed boolean.",
                         "New rounding 0 is explicitly printed. UK verifies absence of a separate charge while its numeric rounding field remains null. Zero PB1/CHANGE controls remain unknown tax basis and unknown rounding.",
                         "All original complete receipts remain unscorable. The UK supplement can now be evaluated by the unchanged strict complete-receipt gate; new eligibility is not automatically a correct or accepted reading.",
                         "Current primary/hybrid original-fifty outputs use the retained final purchase-expression replay. UK primary/hybrid use an earlier leading-quantity snapshot. Native Qwen full-v2 predates row-first decoding. These scopes are not relabelled as a single new pipeline or current cloud comparison.",
                         "No prices, quantities, discounts, fees, tax amounts or totals are numerically repaired. The added Coupon tender is a source fact, not a scored purchase discount. There is no new accuracy, latency, device, cost or public-release certification."],
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "prediction_views": len(predictions), "truth_score_views": len(scores), "reference_gap_counts": dict(coverage_totals), "new_model_requests": 0}))


if __name__ == "__main__":
    main()
