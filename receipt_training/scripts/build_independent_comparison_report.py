"""Verify retained local evidence and publish aggregates only; never calls a model."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

from score import aggregate, read_jsonl, score_one

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
QA = ROOT / "qa-artifacts/advanced-ocr"
OUTPUT = DATA / "evaluation/advanced-independent-comparison.json"
RUNS = DATA / "evaluation/runs"
PREFIX = "independent-compare-v2"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def check_caches():
    paths = []
    for cohort in ["development", "evaluation", "supplement"]:
        folder = RUNS / f"{PREFIX}-{cohort}"
        meta = load(folder / "metadata.json")
        if not meta["source_unchanged"] or meta["label_files_read_for_comparison"]:
            raise ValueError("Comparison lacks a stable independent snapshot")
        checks = {folder / "predictions.jsonl": meta["predictions_sha256"],
                  folder / "replay-runner.mjs": meta["comparison_runner_sha256"],
                  **{folder / "source" / name: value for name, value in meta["source_sha256"].items()},
                  **{ROOT / name: value for name, value in meta["input_sha256"].items()}}
        for path, expected in checks.items():
            if digest(path) != expected:
                raise ValueError("Cached comparison provenance changed")
        paths.extend([folder / "metadata.json", folder / "predictions.jsonl", folder / "replay-runner.mjs"])
    return paths


def main():
    cached_paths = check_caches()
    if "--check" in sys.argv:
        report = load(OUTPUT)
        hashes = report["source_sha256"] | report["evidence_sha256"]
        changed = [name for name, expected in hashes.items() if not (ROOT / name).is_file() or digest(ROOT / name) != expected]
        if changed:
            raise SystemExit("Missing or changed checkpoint files: " + ", ".join(changed))
        print(json.dumps({"verified_checkpoint_files": len(hashes), "frozen_cohorts_verified": 3}))
        return
    original_path = RUNS / f"{PREFIX}-development/original-score.json"
    original = load(original_path)
    for path, key in [(DATA / "manifest.jsonl", "manifest_sha256"), (DATA / "annotations/labels.jsonl", "labels_sha256")]:
        if digest(path) != original[key]:
            raise ValueError("Original scoring truth or manifest changed")
    labels_path = DATA / "annotations/private/supplement-labels.jsonl"
    manifest_path = DATA / "annotations/private/supplement-manifest.jsonl"
    labels = {row["receipt_id"]: row for row in read_jsonl(labels_path)}
    records = {row["receipt_id"]: row for row in read_jsonl(manifest_path)}
    predictions = read_jsonl(RUNS / f"{PREFIX}-supplement/predictions.jsonl")
    config = load(DATA / "evaluation/config.json")
    scored = [score_one(records[p["receipt_id"]], labels[p["receipt_id"]], p, config) for p in predictions if p["receipt_id"] in labels]
    supplement = aggregate(scored)
    original_metrics = dict(original["overall"])
    original_metrics.pop("latency_ms", None)
    supplement.pop("latency_ms", None)
    real_path = QA / "independent-real-costco-desktop.json"
    split_path = QA / "independent-real-costco-split-desktop.json"
    real, split = load(real_path), load(split_path)
    protection_path = QA / "independent-protection-audit.json"
    protection = load(protection_path)
    if protection["remaining_feature_runtime_jobs"] or protection["improvement_branch"] != "feature/advanced-ocr-vision-ai":
        raise ValueError("Runtime cleanup or improvement branch audit failed")
    if not real["financialRowsMatch"] or real["finalMinor"] != "17678" or len(real["receipt"]["items"]) != 18:
        raise ValueError("Real development receipt financial check failed")
    if not split["noFinancialEdits"] or split["participants"] != ["58.93", "58.93", "58.92"]:
        raise ValueError("Real checked split failed")
    if real["externalBrowserRequests"] or real["postEndpoints"] != ["/api/receipts/recognize", "/api/receipts/vision"]:
        raise ValueError("Unexpected external or provider traffic")
    unit = (QA / "independent-unit-final.log").read_text(encoding="utf-8")
    browser = (QA / "independent-browser-final.log").read_text(encoding="utf-8")
    build = (QA / "independent-build-final.log").read_text(encoding="utf-8")
    formatting = (QA / "independent-format-final.log").read_text(encoding="utf-8")
    if re.search(r"\b(?:failed|FAIL)\b", unit + browser) or "built in" not in build or "All matched files use Prettier" not in formatting:
        raise ValueError("Final verification is incomplete or failed")
    originals = [p for cohort in ["development", "evaluation"] for p in read_jsonl(RUNS / f"{PREFIX}-{cohort}/predictions.jsonl")]
    report = {
        "scope": "Optional independent local comparison checkpoint, not production certification or a new blind holdout",
        "cached_replay": {"original_financial_receipts": len(originals), "supplemental_diagnostics": len(predictions),
                          "supplemental_truth_cases": len(scored), "original_metrics": original_metrics, "grouped_supplement_metrics": supplement,
                          "original_receipts_with_pending_checks": sum(bool(p["receipt"]["reviewChecks"]) for p in originals),
                          "timing_scope": "No new model calls. Comparison-only times excluded from public scanner-latency metrics.",
                          "api_calls": 0, "api_cost_usd": "0",
                          "limits": ["Original differing panel preparation and some panels beyond today's API pixel/section limits", "Evaluation has already been inspected; no fresh holdout claim", "Complete original financial truth denominator remains zero"]},
        "real_development_workflow": {"unique_receipts": 1, "scan_to_review_ms": real["elapsedMs"], "timing_scope": real["timingScope"],
                                      "native_purchases": len(real["nativeReceipt"]["items"]), "combined_purchases": len(real["receipt"]["items"]),
                                      "combined_coupons": sum(float(item["discount"]) > 0 for item in real["receipt"]["items"]),
                                      "financial_row_vector_match": True, "final_minor": real["finalMinor"], "pending_checks_before_review": len(real["receipt"]["reviewChecks"]),
                                      "issue_paths_before_review": real["issuePaths"], "review_controls_exercised": split["reviewChecksExplicitlyConfirmed"],
                                      "split": split["participants"], "no_financial_edits": True, "external_browser_requests": 0,
                                      "accuracy_scope": "Source-informed development receipt; complete-receipt correctness is not claimed", "p95_estimated": False,
                                      "whole_app_peak_memory_measured": False},
        "tests": {"unit_passes": int(re.search(r"Tests\s+(\d+) passed", unit).group(1)),
                  "standard_browser_passes": int(re.search(r"(\d+) passed \(", browser).group(1)),
                  "standard_browser_skips": int(re.search(r"(\d+) skipped", browser).group(1)),
                  "fresh_real_model_workflow_passes": 1, "typecheck_build_format_passed": True,
                  "python_scope": "Backend unchanged; no new Python inference-code changes. Previous 35-test checkpoint remains separate."},
        "remaining": ["Long local vision receipts", "Efficient recovery/uncertainty calibration on broader ground truth", "Digital/PDF text and image-quality/edge/perspective processing", "Item rescan", "Refunds", "Public authentication/TLS/OS isolation and all other full-objective requirements"],
        "source_commit_before_checkpoint": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "git_protection_audit": protection,
    }
    sources = [path for directory in ["src", "server", "tests"] for path in (ROOT / directory).rglob("*") if path.is_file() and path.suffix in [".ts", ".tsx", ".mjs", ".py", ".css", ".json"]]
    sources += [ROOT / name for name in ["README.md", "vite.config.ts", "playwright.config.ts", "package.json", "package-lock.json", ".gitignore", ".env.example", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md", "receipt_training/scripts/replay_independent_readings.mjs", "receipt_training/scripts/build_independent_comparison_report.py", "receipt_training/scripts/score.py"]]
    evidence = cached_paths + [original_path, labels_path, manifest_path, real_path, split_path, protection_path]
    evidence += [QA / name for name in ["independent-unit-final.log", "independent-browser-final.log", "independent-build-final.log", "independent-format-final.log", "verification-current-costco-replay.json", "independent-real-costco-review-desktop.png"]]
    report["source_sha256"] = {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(sources))}
    report["evidence_sha256"] = {path.relative_to(ROOT).as_posix(): digest(path) for path in evidence}
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "tests": report["tests"], "original_samples": len(originals)}))


if __name__ == "__main__":
    main()
