"""Retain the original timeout, standalone trial and fresh app regression separately."""
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
OUT = DATA / "evaluation/advanced-long-single-photo-deadline-v1.json"
CAPTURE = ROOT / "qa-artifacts/long-single-photo-deadline-summary-v1"
EVIDENCE = {}


def remember(path, expected=None):
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    name = path.relative_to(ROOT).as_posix()
    assert expected is None or actual == expected, name
    assert not path.name.startswith(".env")
    EVIDENCE[name] = actual
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def folder(path):
    for source in sorted(path.rglob("*")):
        if source.is_file():
            remember(source)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "cloud_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve published evidence; use --check"
    original = load(DATA / "evaluation/advanced-current-native-original50-v1.json")
    for name, expected in original["evidence_sha256"].items():
        remember(ROOT / name, expected)
    config = load(DATA / "evaluation/config.json")
    labels = [json.loads(line) for line in remember(DATA / "annotations/private/priced-rows-v4-labels.jsonl").read_text(encoding="utf-8").splitlines()]
    name = "cord-v2-train-000"
    label = next(row for row in labels if row["receipt_id"] == name)
    old_run = DATA / "evaluation/runs/current-native-original50-v1"
    old_plan = load(old_run / "plan.json")
    record = next(row for row in old_plan["records"] if row["receipt_id"] == name)
    before = load(old_run / name / "metadata.json")
    assert [packet["status"] for packet in before["http"]] == [200, 504]
    diagnostic_dir = ROOT / "qa-artifacts/long-one-photo-budget-v2"
    diagnostic_native = ROOT / "qa-artifacts/advanced-ocr/long-one-photo-budget-v2"
    diagnostic = load(diagnostic_native / "metadata.json")
    execution = load(diagnostic_dir / "execution.json")
    assert execution["native_requests"] == 1 and execution["cloud_requests"] == execution["automatic_retries"] == 0
    assert diagnostic["exit_code"] == 0 and diagnostic["parsed_json"] and not diagnostic["decoder_schema_warning"]
    assert diagnostic["images"][0]["sha256"] == load(old_run / name / "result.json")["panels"][0]["sha256"]
    diagnostic_scores = {}
    for view in ("auto", "context-idr"):
        prediction = load(diagnostic_dir / f"verified-{view}.json")
        prediction["elapsed_ms"] = diagnostic["elapsed_ms"]
        diagnostic_scores[view] = score_with_adjustments(record, label, prediction, config)
    folder(diagnostic_dir)
    folder(diagnostic_native)
    actual_dir = DATA / "evaluation/runs/long-single-photo-current-v1"
    actual = load(actual_dir / "metadata.json")
    assert actual["exit_code"] == 0 and actual["source_unchanged"] and actual["comparison_complete"]
    assert actual["http_statuses"] == [200, 200] and len(actual["records"]) == 1
    meta = load(actual_dir / name / "metadata.json")
    assert not meta["blocked_requests"] and meta["cloud_requests"] == meta["automatic_retries"] == 0
    assert meta["http"][0]["request_sha256"] == meta["http"][1]["request_sha256"] == before["http"][0]["request_sha256"]
    result = load(actual_dir / name / "result.json")
    assert result["comparison_complete"] and result["auto"]["calculation"]["issues"]
    receipt = result["auto"]["receipt"]
    protected_prices = []
    for index in (10, 11, 14, 16):
        checks = [check for check in receipt["reviewChecks"]
                  if check.get("itemId") == receipt["items"][index]["id"]
                  and check["field"] == "lineTotal"]
        assert checks and all(check["confirmedValue"] == "" for check in checks)
        protected_prices.append({"purchase": index + 1, "checks": checks})
    changed = [path for path, sha in old_plan["source_sha256"].items() if actual["source_sha256"][path] != sha]
    assert set(changed) == {"server/local-vision.mjs", "src/lib/local-vision.ts", "src/lib/vision-plan.mjs"}
    actual_scores = {}
    for mode in ("primary", "auto"):
        prediction = {**result[mode], "elapsed_ms": meta["elapsed_ms"]}
        actual_scores[mode] = score_with_adjustments(record, label, prediction, config)
    folder(actual_dir)
    validation = ROOT / "qa-artifacts/long-single-photo-validation-v1"
    assert "489 passed" in (validation / "unit-final.log").read_text(encoding="utf-8")
    assert "built in" in (validation / "build.log").read_text(encoding="utf-8")
    assert "All matched files use Prettier" in (validation / "format.log").read_text(encoding="utf-8")
    folder(validation)
    validation_report = load(DATA / "evaluation/advanced-long-single-photo-validation-v1.json")
    assert validation_report["browser_stats"]["expected"] == 167
    assert validation_report["browser_stats"]["unexpected"] == 0
    assert validation_report["configured_secret_matches_in_source_and_build"] == 0
    for path, expected in validation_report["evidence_sha256"].items():
        remember(ROOT / path, expected)
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name
        with target.open("xb") as output:
            output.write(source.read_bytes())
        remember(target)
    report = {
        "scope": "One measured canonical single-photo timeout fix, supported by a standalone longer-budget diagnostic and a separate fresh current browser/native pipeline regression. The original fresh fifty-case run is preserved without replacing its failure.",
        "original_failure": {"receipt_id": name, "http_statuses": [200, 504], "native_vision_ms": next(row["elapsed_ms"] for row in before["native_processes"] if row["stage"] == "vision-inference")},
        "standalone_diagnostic": {"native_ms": diagnostic["elapsed_ms"], "peak_process_working_set_bytes": diagnostic["peak_process_working_set_bytes"], "memory_limits": "Native process working set only, excluding GPU and browser/backend; sampled on this laptop, not handset or production sizing.", "scores": diagnostic_scores},
        "fresh_current_case": {"receipt_id": name, "worker_wall_ms": actual["worker_wall_ms"], "preparation_through_draft_ms": meta["elapsed_ms"], "native_processes": meta["native_processes"], "http_statuses": actual["http_statuses"], "scores": actual_scores, "source_check_count": len(receipt["reviewChecks"]), "incorrect_prices_have_unconfirmed_checks": protected_prices, "calculation": {key: value for key, value in result["auto"]["calculation"].items() if key != "items"}},
        "changed_frozen_application_files": changed,
        "deadlines_ms": {"native_model": 180000, "reader_and_http": 200000, "browser": 205000, "whole_batch_job": 900000},
        "validation": {"unit_passes": 489, "browser_stats": validation_report["browser_stats"], "browser_attempt_directories": len(validation_report["browser_attempt_directories"]), "configured_secret_matches_in_source_and_build": 0, "stable_commit": validation_report["stable_commit"], "original_checkout": validation_report["original_checkout"]},
        "limits": "One previously inspected development receipt. Longer time recovers a structured draft but does not repair model price or tax errors, infer currency or remove source checks. The IDR diagnostic is explicit post-extraction context and is not automatic currency accuracy. The fresh app regression supplies no currency context. No new post-change fifty-case metrics, p95, speed ratio, physical-phone evidence or complete financial success is claimed. Unit fixtures initially failed because the new test passed the fixture function rather than calling it; the first log is retained and the corrected 489-test run passes.",
        "cloud_requests": 0, "automatic_retries": 0, "api_cost": "0", "compute_cost": None,
        "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(EVIDENCE), "current_counts": actual_scores["auto"]["counts"], "cloud_requests": 0}))


if __name__ == "__main__":
    main()
