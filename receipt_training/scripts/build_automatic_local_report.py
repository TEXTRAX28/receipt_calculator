"""Audit saved local orchestration, actual native workflows and validation evidence."""
from collections import Counter
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import sys

from build_headerless_coupon_report import canonical
from score import aggregate, description, match_items, minor, score_one

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUNS = DATA / "evaluation/runs"
OUT = DATA / "evaluation/advanced-automatic-local-v1.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            assert sha(ROOT / name) == expected, "Evidence changed: " + name
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "cloud_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the report; use --check"
    evidence = {}

    def remember(path, expected=None):
        path = path.resolve()
        name = path.relative_to(ROOT).as_posix()
        assert not path.name.startswith(".env"), "Do not bind credential files"
        actual = sha(path)
        assert expected is None or expected == actual, "Changed frozen evidence: " + name
        evidence[name] = actual
        return path

    def load(path, expected=None):
        return json.loads(remember(path, expected).read_text(encoding="utf-8"))

    def tree(folder):
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                remember(path)

    config = load(DATA / "evaluation/config.json")
    records = {row["receipt_id"]: row for row in lines(remember(DATA / "manifest.jsonl"))}
    labels = {row["receipt_id"]: row for row in lines(remember(DATA / "annotations/private/priced-rows-v2-labels.jsonl"))}
    old_labels = {row["receipt_id"]: row for row in lines(remember(DATA / "annotations/labels.jsonl"))}
    supplement_records = {row["receipt_id"]: row for row in lines(remember(DATA / "annotations/private/supplement-manifest.jsonl"))}
    supplement_labels = {row["receipt_id"]: row for row in lines(remember(DATA / "annotations/private/supplement-labels.jsonl"))}
    for record in records.values():
        if record.get("real_receipt") and record.get("included_in_pilot") is not False and record["receipt_id"] in labels:
            remember(DATA / record["file_path"], record["sha256"])
    for record in supplement_records.values():
        for source in record.get("source_files", []):
            remember(DATA / source["file_path"], source["sha256"])

    runs = {}
    for cohort in ("original", "supplement"):
        folder = RUNS / ("automatic-local-" + cohort + "-v3")
        meta = load(folder / "metadata.json")
        assert meta["source_served_from_frozen_snapshot"] and meta["completed_at"]
        assert meta["api_requests"] == meta["native_inference_requests"] == meta["external_requests"] == 0
        assert not meta["unexpected_transport_attempts"]
        remember(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
        remember(folder / "package-lock.json", meta["package_lock_sha256"])
        for name, expected in meta["source_sha256"].items():
            remember(folder / "source" / name, expected)
        for name, actual in meta["loaded_frozen_source_sha256"].items():
            assert meta["source_sha256"][name] == actual
        for name, expected in meta["input_sha256"].items():
            remember(ROOT / name, expected)
        predictions = lines(remember(folder / "predictions.jsonl", meta["predictions_sha256"]))
        by_id = {}
        for row in predictions:
            assert row["mode"] not in by_id.setdefault(row["receipt_id"], {})
            by_id[row["receipt_id"]][row["mode"]] = row
        for variants in by_id.values():
            assert set(variants) == {"primary", "always", "auto"}
            a, b = variants["always"], variants["auto"]
            if "error" in a:
                assert a["error"] == b["error"] and len(a["simulated_requests"]) == len(b["simulated_requests"]) == 1
            else:
                assert canonical({key: a[key] for key in ("receipt", "calculation")}) == canonical({key: b[key] for key in ("receipt", "calculation")})
                assert a["comparison_complete"] and b["comparison_complete"] and b["decision"]["needed"]
                assert b["calculation"]["issues"], "No saved model result may be silently confirmed"
        assert all(row["decision"]["needed"] for row in meta["historical_evidence_decisions"])
        runs[cohort] = (meta, by_id)
    assert len(runs["original"][1]) == 50 and len(runs["supplement"][1]) == 3
    assert runs["original"][0]["source_sha256"] == runs["supplement"][0]["source_sha256"]

    def scores(rows, record_map, truth):
        result = aggregate([score_one(record_map[row["receipt_id"]], truth[row["receipt_id"]], row, config) for row in rows])
        result.pop("latency_ms")  # Saved-response replay is not OCR latency.
        return result

    def summarize(by_id, record_map, truth):
        return {mode: scores([variants[mode] for variants in by_id.values()], record_map, truth) for mode in ("primary", "always", "auto")}

    original = runs["original"][1]
    compatible = {key: variants for key, variants in original.items() if "error" not in variants["auto"]}
    rejected = sorted(set(original) - set(compatible))
    assert len(compatible) == 44 and len(rejected) == 6
    # Check actual complete orchestration results against the earlier frozen
    # verifier result on the exact same evidence, ignoring generated IDs only.
    baseline = {}
    for split in ("development", "evaluation"):
        folder = RUNS / ("source-price-baseline-" + split + "-v1")
        meta = load(folder / "metadata.json")
        for name, expected in meta["source_sha256"].items():
            remember(folder / "source" / name, expected)
        remember(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
        for row in lines(remember(folder / "predictions.jsonl", meta["predictions_sha256"])):
            baseline[row["receipt_id"]] = row
    assert baseline.keys() == original.keys()
    for key, variants in compatible.items():
        assert canonical({k: variants["auto"][k] for k in ("receipt", "calculation")}) == canonical({k: baseline[key][k] for k in ("receipt", "calculation")})

    def item_fields(label, prediction):
        actual = prediction.get("receipt", {}).get("items", [])
        matches = match_items(label["items"], actual, config["item_matching"]["minimum_similarity"])
        result = {}
        for index, item in enumerate(label["items"]):
            row = actual[matches[index]] if index in matches else {}
            result[item["id"], "description"] = index in matches and description(item["description"]["value"]) == description(row.get("description"))
            for field, target in (("line_total", "lineTotal"), ("unit_price", "unitPrice"), ("discount", "discount")):
                known = minor(item[field]["value"], label["currency"]["value"], config)
                if known is not None:
                    actual_amount = minor(row.get(target), label["currency"]["value"], config)
                    result[item["id"], field] = actual_amount is not None and actual_amount == (abs(known) if field == "discount" else known)
            if item["quantity"]["value"] is not None:
                try:
                    correct = Decimal(item["quantity"]["value"]) == Decimal(row.get("quantity", ""))
                except (InvalidOperation, TypeError):
                    correct = False
                result[item["id"], "quantity"] = correct
        return result

    changes, deltas = [], Counter()
    for receipt_id, variants in original.items():
        before = item_fields(labels[receipt_id], variants["primary"])
        after = item_fields(labels[receipt_id], variants["auto"])
        assert before.keys() == after.keys()
        for key in before:
            if before[key] != after[key]:
                direction = "gain" if after[key] else "loss"
                deltas[key[1] + "_" + direction] += 1
                changes.append({"receipt_id": receipt_id, "item_id": key[0], "field": key[1], "direction": direction})

    validation = ROOT / "qa-artifacts/automatic-local-validation-v1"
    checks = load(validation / "validation.json")
    assert checks["full_browser"]["expected"] == 167 and checks["full_browser"]["skipped"] == 1
    assert checks["observed_tool_results"]["npm test"]["passed"] == 455
    for name, expected in checks["source_sha256"].items():
        remember(validation / "source" / name, expected)
    tree(validation)
    native = {}
    for case, name in (("two-photo-uk", "automatic-local-native-uk-v1"), ("synthetic-clear", "automatic-local-native-clear-v2")):
        folder = RUNS / name
        meta, execution, memory = [load(folder / file) for file in ("metadata.json", "execution.json", "memory.json")]
        assert execution["source_unchanged"] and execution["observer_exit_code"] == 0 and not memory["errors"]
        assert meta["external_requests"] == 0 and not meta["blocked_requests"]
        assert memory["pid"] == execution["worker_pid"] == meta["pid"]
        assert memory["observed_process_count"] == len(memory["processes"]) and memory["samples"] > 0
        for key, expected in execution["source_sha256"].items():
            remember(folder / "source" / key, expected)
        assert sha(folder / "observe-app-memory.py") == execution["observer_sha256"]
        tree(folder)
        if case == "two-photo-uk":
            assert execution["worker_exit_code"] == 1 and [r["status"] for r in meta["native_http_requests"]] == [200, 504]
            assert meta.get("error") and not meta.get("completed_workflow")
        else:
            assert execution["worker_exit_code"] == 0 and meta["completed_workflow"] and meta["source_checked_financial_rows_match"]
            assert [r["path"] for r in meta["native_http_requests"]] == ["/api/receipts/recognize"]
            assert meta["shares"] == ["£1.84", "£1.83", "£1.83"]
            draft = load(folder / "app-draft.json")
            assert draft["calculation"]["total"] == "550" and draft["calculation"]["issues"]
            assert any(check["field"] == "items" and check["confirmedValue"] == "" for check in draft["receipt"]["reviewChecks"])
        native[case] = {"outcome": "vision timeout; source review remained required" if meta.get("error") else "actual OCR, automatic vision skip and exact source-reviewed split",
                        "click_to_review_ms": meta["click_to_review_ms"], "http_statuses": [r["status"] for r in meta["native_http_requests"]],
                        "completed_workflow": meta.get("completed_workflow", False), "browser": meta["browser"], "memory": memory,
                        "memory_scope": execution["memory_scope"]}
    # Keep both failed diagnostic replays; neither is counted as a successful run.
    for name in ("automatic-local-original-v1", "automatic-local-original-v2"):
        tree(RUNS / name)
    for folder in (ROOT / "qa-artifacts/e2e-runs").iterdir():
        test_file = folder / "test.json"
        if test_file.exists():
            test = json.loads(test_file.read_text(encoding="utf-8"))
            if test["title"].startswith("automatic local check is the phone-safe default"):
                tree(folder)
    remember(Path(__file__))
    for name in ("score.py", "build_headerless_coupon_report.py", "replay_automatic_local.mjs", "benchmark_automatic_local.mjs", "observe_process_memory.py"):
        remember(Path(__file__).with_name(name))
    report = {
        "scope": "Default-routing and failure-check preservation upgrade, measured with frozen model responses through actual orchestration plus two fresh local native workflow attempts. No new model or general accuracy certification.",
        "selection_limits": "Previously inspected original 38-development/12-evaluation receipts, assistant source checks and upstream annotations; not a fresh holdout. Three supplement views are one transaction, only the grouped view is separately scored. No cloud calls or stronger-model speed claim.",
        "original_50": {"counts_by_split": dict(Counter(records[key]["split"] for key in original)),
                        "priced_row_truth": summarize(original, records, labels), "original_truth": summarize(original, records, old_labels),
                        "current_transport_errors_per_mode": 6, "current_transport_rejected_ids": rejected,
                        "guard_failure": "Six retained historical JPEG panels are 1500×2667=4,000,500 pixels, exceeding today's 4,000,000 limit by 500. Both primary and comparison modes reject them. No pixels or guard were changed. Policy-only inspection of all 50 requests vision, but only 44 completed current orchestration replays.",
                        "compatible_44_priced_row_truth": summarize(compatible, records, labels),
                        "auto_vs_always_changed_semantic_results": 0, "compatible_auto_vs_prior_frozen_verifier_changed": 0,
                        "independent_policy_requested_on_historical_50": 50, "saved_model_calls_avoided_on_original": 0,
                        "source_item_field_deltas": dict(deltas), "changed_item_fields": changes,
                        "historical_always_comparison_reference": scores(list(baseline.values()), records, labels)},
        "supplement": {"diagnostic_views": 3, "transactions": 1, "auto_vs_always_changed": 0,
                       "grouped_only": summarize({key: value for key, value in runs["supplement"][1].items() if key.endswith("-group")}, supplement_records, supplement_labels)},
        "native_workflows": native, "validation": checks["observed_tool_results"] | {"browser": checks["full_browser"]},
        "safety": "Automatic mode selects only an already configured local vision reader. No currency/OCR hint enters the second model. Skipped comparisons retain source review; failures preserve existing negative-line and reduced-price checks. Agreement and arithmetic never clear mandatory checks.",
        "remaining_work": "Reprepare and freshly rerun six old oversized panels before claiming a complete current 50-receipt transport result. Resolve the actual two-photo vision timeout, calibrate routing on new independent examples, complete missing financial truth and genuine PDF/refund cases, test physical phones and production controls. Two native memory samples are not p95 or public sizing. Existing thirteen overwritten historical artifacts remain disclosed separately.",
        "new_cloud_requests": 0, "new_native_model_requests": 3, "new_paid_activation": False,
        "replay_latency_is_ocr_latency": False, "complete_original_financial_truth_available": False,
        "evidence_sha256": evidence,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"evidence_files": len(evidence), "original": 50, "current_transport_compatible": 44,
                      "browser_passed": 167, "unit_passed": 455, "actual_native_attempts": 2, "cloud_requests": 0}))


if __name__ == "__main__":
    main()
