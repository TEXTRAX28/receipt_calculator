"""Check long local receipt evidence and publish aggregates without receipt content."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
QA = ROOT / "qa-artifacts/advanced-ocr"
RUNS = DATA / "evaluation/runs"
OUTPUT = DATA / "evaluation/advanced-long-vision-integration.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def verify_runs():
    evidence = []
    for split in ["development", "evaluation", "supplement"]:
        folder = RUNS / f"independent-compare-v3-{split}"
        meta = load(folder / "metadata.json")
        checks = {folder / "predictions.jsonl": meta["predictions_sha256"], folder / "replay-runner.mjs": meta["comparison_runner_sha256"],
                  **{folder / "source" / name: value for name, value in meta["source_sha256"].items()},
                  **{ROOT / name: value for name, value in meta["input_sha256"].items()}}
        if not meta["source_unchanged"] or meta["label_files_read_for_comparison"]:
            raise ValueError("Unstable or label-dependent frozen replay")
        if any(digest(path) != expected for path, expected in checks.items()):
            raise ValueError("Frozen replay inputs or implementation changed")
        evidence += [folder / "metadata.json", folder / "predictions.jsonl", folder / "replay-runner.mjs"]
    return evidence


def main():
    evidence = verify_runs()
    if "--check" in sys.argv:
        report = load(OUTPUT)
        hashes = report["source_sha256"] | report["evidence_sha256"]
        changed = [name for name, expected in hashes.items() if not (ROOT / name).is_file() or digest(ROOT / name) != expected]
        if changed:
            raise SystemExit("Changed checkpoint files: " + ", ".join(changed))
        print(json.dumps({"verified_checkpoint_files": len(hashes), "frozen_replay_cohorts": 3}))
        return
    real_path = QA / "long-vision-real-four-desktop.json"
    real = load(real_path)
    if not real["completeStream"] or real["batchCount"] != 2 or not real["moneyRowsMatch"] or real["finalMinor"] != "1950":
        raise ValueError("The actual four-section financial diagnostic failed")
    if real["bodyObserverError"] or real["externalBrowserRequests"] or real["postEndpoints"] != ["/api/receipts/recognize", "/api/receipts/vision-batches"]:
        raise ValueError("Unexpected stream observer or network outcome")
    smoke_path = RUNS / "long-vision-runtime-smoke-v1/metadata.json"
    smoke = load(smoke_path)
    if not smoke["runtime_source_unchanged"] or smoke["temporary_jobs_remaining"] or "src/lib/vision-plan.mjs" not in smoke["runtime_source_sha256"]:
        raise ValueError("The new runtime dependency/cleanup smoke is incomplete")
    score_path = RUNS / "independent-compare-v3-development/original-score.json"
    scored = load(score_path)
    for name, key in [("manifest.jsonl", "manifest_sha256"), ("annotations/labels.jsonl", "labels_sha256")]:
        if digest(DATA / name) != scored[key]:
            raise ValueError("Scoring truth or manifest changed")
    original_metrics = dict(scored["overall"])
    original_metrics.pop("latency_ms", None)
    logs = {kind: (QA / f"long-vision-{kind}-final.log").read_text(encoding="utf-8") for kind in ["unit", "browser", "build", "format"]}
    if re.search(r"\b(?:FAIL|failed)\b", logs["unit"] + logs["browser"]) or "built in" not in logs["build"] or "All matched files use Prettier" not in logs["format"]:
        raise ValueError("Final test/build/format evidence is incomplete")
    report = {
        "scope": "Bounded long-receipt local integration checkpoint; full production and full-objective acceptance remain incomplete",
        "limits": {"input_photos": 12, "prepared_sections": 24, "sections_per_native_context": 3, "max_native_contexts": 12,
                   "context_overlap_sections": 1, "context_tokens": 8192, "output_tokens_per_context": 4000,
                   "long_job_deadline_ms": 900000, "request_body_deadline_ms": 120000, "stream_output_max_bytes": 1048576},
        "actual_synthetic_four_section_diagnostic": {"unique_receipts": 1, "source_photos": 4, "native_contexts": real["batchCount"],
                                                     "scan_to_review_ms": real["elapsedMs"], "timing_scope": real["timingScope"],
                                                     "native_rows_across_contexts": sum(len(event["receipt"]["items"]) for event in real["events"] if event["type"] == "batch"),
                                                     "combined_purchases": len(real["receipt"]["items"]), "actual_repeated_chickens": sum("chicken" in item["description"].lower() for item in real["receipt"]["items"]),
                                                     "item_money_vector_match": True, "total_minor": real["finalMinor"], "no_edits": real["noEdits"],
                                                     "pending_issue_paths": real["issuePaths"], "confirmation_blocked": bool(real["issuePaths"]),
                                                     "complete_receipt_accuracy_claimed": False, "finalized_actual_long_split_tested": False,
                                                     "external_browser_requests": 0, "p95_estimated": False, "whole_app_peak_memory_measured": False},
        "original_cached_regression": {"financial_receipts": 50, "supplemental_diagnostics_processed": 4, "original_metrics": original_metrics,
                                       "scope": "Frozen independent outputs and original scoring truth; no fresh full-corpus native batching, no new model calls or blind holdout"},
        "tests": {"unit_passes": int(re.search(r"Tests\s+(\d+) passed", logs["unit"]).group(1)),
                  "standard_browser_passes": int(re.search(r"(\d+) passed \(", logs["browser"]).group(1)),
                  "standard_browser_skips": int(re.search(r"(\d+) skipped", logs["browser"]).group(1)),
                  "actual_installed_model_diagnostics_passed": 1, "original_frozen_runtime_http_smoke_cases": smoke["local_http_requests"],
                  "typecheck_build_format_passed": True, "backend_python_code_changed": False},
        "preserved_failures": ["First two actual long tests could not retrieve an NDJSON body via the debugger; traces retained", "Those traces exposed nine rows / 30.50 vs printed 19.50 caused by conflicting unprinted tax codes; review/financial checks blocked acceptance", "Twelve-photo protocol test exposed original-thumbnail overflow and unreachable controls; fixed by wrapping thumbnails"],
        "remaining": ["Genuine long twelve-photo receipt accuracy and correction through final split", "Unproved overlaps between distinct original photographs", "Efficient native inference and broader calibrated recovery", "Complete original financial truth and genuine digital/PDF cases", "Image quality/edge/perspective correction and item rescan", "Refunds and full public security/readiness requirements"],
        "source_commit_before_checkpoint": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    }
    sources = [path for directory in ["src", "server", "tests"] for path in (ROOT / directory).rglob("*") if path.is_file() and path.suffix in [".ts", ".tsx", ".mjs", ".py", ".css", ".json"]]
    sources += [ROOT / name for name in ["README.md", "vite.config.ts", "playwright.config.ts", "package.json", "package-lock.json", ".gitignore", ".env.example", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md", "receipt_training/scripts/build_long_vision_report.py", "receipt_training/scripts/replay_independent_readings.mjs", "receipt_training/scripts/evaluate.mjs"]]
    evidence += [real_path, smoke_path, score_path]
    evidence += [QA / f"long-vision-{kind}-final.log" for kind in ["unit", "browser", "build", "format"]]
    evidence += [QA / name for name in ["long-vision-real-four-v3.log", "long-vision-runtime-smoke.log", "long-real-first-v1/trace.zip", "long-real-second-v2/trace.zip", "long-real-second-v2/recognize.json", "long-layout-failure-v1/long-local-vision-12-origi-378fa--exact-split-mock-protocol--mobile-trace.zip"]]
    report["source_sha256"] = {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(sources))}
    report["evidence_sha256"] = {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(evidence))}
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "tests": report["tests"], "real_scan_to_review_ms": real["elapsedMs"]}))


if __name__ == "__main__":
    main()
