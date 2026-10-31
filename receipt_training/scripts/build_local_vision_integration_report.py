"""Build/check this checkpoint's local integration evidence; never sends a request."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts/advanced-ocr"
OUTPUT = ROOT / "receipt_training/evaluation/advanced-local-vision-integration.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(name):
    return json.loads((QA / name).read_text(encoding="utf-8"))


def main():
    if "--check" in sys.argv:
        report = json.loads(OUTPUT.read_text(encoding="utf-8"))
        hashes = report["source_sha256"] | report["evidence_sha256"]
        changed = [path for path, expected in hashes.items() if not (ROOT / path).is_file() or digest(ROOT / path) != expected]
        if changed:
            raise SystemExit("Missing or changed checkpoint files: " + ", ".join(changed))
        print(json.dumps({"verified_checkpoint_files": len(hashes)}))
        return
    first = load("local-vision-real-first-desktop/metadata.json")
    desktop, mobile = [load(f"local-vision-real-{screen}.json") for screen in ["desktop", "mobile"]]
    three = load("local-vision-real-three-desktop.json")
    costco = load("local-vision-real-costco-desktop.json")
    smoke_path = ROOT / "receipt_training/evaluation/runs/local-vision-runtime-smoke-v1/metadata.json"
    smoke = json.loads(smoke_path.read_text(encoding="utf-8"))
    if not smoke.get("completed_at") or not smoke.get("runtime_source_unchanged") or smoke.get("temporary_jobs_remaining") != 0:
        raise ValueError("The frozen-runtime smoke must be complete and clean")
    unit = (QA / "local-vision-unit-final-v2.log").read_text(encoding="utf-8")
    browser = (QA / "local-vision-e2e-final.log").read_text(encoding="utf-8")
    python = (QA / "local-vision-python-final.log").read_text(encoding="utf-8")
    if not re.search(r"\bOK\s*$", python) or re.search(r"\b(?:FAIL|failed)\b", unit):
        raise ValueError("Verification contains a failure")
    report = {
        "scope": "Bounded opt-in app integration, not a new full-corpus accuracy benchmark or public-release certification",
        "model_manifest": "receipt_training/evaluation/vision-candidate-manifest.json",
        "profile": {"context": 8192, "output_tokens": 4000, "image_tokens": 1536, "temperature": 0, "seed": 20261031, "max_prepared_sections": 3, "native_deadline_seconds": 120, "jpeg_decode_deadline_seconds": 10, "max_decoded_pixels": 4000000},
        "privacy": {"provider_api_calls": 0, "private_external_uploads": 0, "os_network_capture_performed": False, "browser_external_requests_blocked": True, "api_cost_usd": "0", "compute_cost_usd": None, "development_private_file_requests_denied": 48, "public_control_still_served": True, "native_os_isolation": False, "crash_cleanup_complete": False},
        "initial_synthetic_probe": first,
        "synthetic_single_photo_after_date_fix": {
            "cases": 1, "repeated_on": ["desktop", "mobile"],
            "scan_to_review_ms": {"desktop": desktop["elapsedMs"], "mobile": mobile["elapsedMs"]},
            "purchases": 2, "printed_total": "5.50", "equal_shares": ["2.75", "2.75"], "financial_edits": 0,
            "scope": "Numeric extraction and upload-to-split workflow; unprinted metadata errors remain",
        },
        "synthetic_three_photo_boundary": {
            "scan_to_review_ms": three["elapsedMs"], "purchases": len(three["receipt"]["items"]), "expected_purchases": 4,
            "printed_total": three["receipt"]["printedTotal"], "expected_total": "8.75",
            "overlapping_purchases_preserved_once": True, "complete_receipt_accuracy_claimed": False,
            "unsupported_metadata": ["subtotal", "printedItemCount", "item taxCode"],
            "returned_item_count": three["receipt"]["printedItemCount"], "item_count_was_printed": False,
        },
        "supplied_uk_costco_development_diagnostic": {
            "scan_to_review_ms": costco["elapsedMs"], "purchases": len(costco["receipt"]["items"]), "expected_purchases": 18,
            "item_discount_count": sum(float(item["discount"] or "0") > 0 for item in costco["receipt"]["items"]), "expected_item_discounts": 4,
            "printed_total": costco["receipt"]["printedTotal"], "calculated_total_minor": costco["exactEngineTotalMinor"], "expected_total_minor": "17678",
            "financial_rows_match": costco["financialRowsMatch"], "engine_issue_paths": [issue["path"] for issue in costco["exactEngineIssues"]],
            "confirmation_blocked": bool(costco["exactEngineIssues"]), "accuracy_pass": False,
        },
        "timing_limits": "Existing model/shader/OS caches; fresh native process per scan. Asset verification happens before the first inference per server lifetime. UI sample latency is not directly comparable to frozen CLI-only cohort latency; no p95 is estimated from these few cases.",
        "tests": {
            "application_unit_passes": int(re.search(r"Tests\s+(\d+) passed", unit).group(1)),
            "standard_browser_passes": int(re.search(r"(\d+) passed \(", browser).group(1)), "standard_browser_skips": 1,
            "python_passes": int(re.search(r"Ran (\d+) tests", python).group(1)),
            "real_synthetic_full_workflow_passes": 2, "real_additional_protocol_diagnostics_passes": 2,
            "existing_paddle_original_two_photo_regression_passes": 1,
            "frozen_runtime_smoke_cases": smoke["local_http_requests"], "smoke_is_accuracy_benchmark": False,
        },
        "remaining": ["Long-receipt vision batching", "Independent OCR/vision field grounding and measured recovery", "Coupon association and unsupported metadata", "Other full-objective requirements retained in ADVANCED_OCR_REPORT.md"],
        "source_commit_before_checkpoint": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
    }
    sources = ["server/local-vision.mjs", "server/private-process.mjs", "server/private-paths.mjs", "server/local_image_guard.py", "server/local-ocr.mjs", "server/receipt-api.mjs", "server/extraction-instructions.mjs", "server/local_ocr_worker.py", "src/lib/local-vision.ts", "src/lib/local-model.ts", "src/lib/gemini.ts", "src/lib/receipt-date.ts", "src/lib/extraction-schema.mjs", "src/lib/scan-limits.mjs", "src/lib/model.ts", "src/lib/engine.ts", "src/App.tsx", "vite.config.ts", "playwright.config.ts", "README.md", "receipt_training/evaluation/vision-candidate-manifest.json", "receipt_training/scripts/setup_vision_candidate.py", "receipt_training/scripts/evaluate.mjs", "receipt_training/scripts/build_local_vision_integration_report.py"]
    sources += [path.relative_to(ROOT).as_posix() for directory in ["src", "server", "tests"] for path in (ROOT / directory).rglob("*") if path.is_file() and path.suffix in [".ts", ".tsx", ".mjs", ".py", ".css", ".json"]]
    sources += ["package.json", "package-lock.json", ".gitignore", ".env.example"]
    sources = sorted(set(sources))
    evidence = ["local-vision-unit-final-v2.log", "local-vision-e2e-final.log", "local-vision-python-final.log", "local-vision-build-final-v2.log", "local-vision-format-final-v2.log", "local-vision-real-first-desktop/metadata.json", "local-vision-real-desktop.json", "local-vision-real-mobile.json", "local-vision-real-three-desktop.json", "local-vision-real-costco-desktop.json", "local-vision-runtime-smoke-v1.log", "local-vision-paddle-regression-final.log"]
    evidence += ["local-vision-real-first-desktop/response.json", "local-vision-real-first-desktop/trace.zip", "local-vision-real-response-desktop.json", "local-vision-real-response-mobile.json"]
    report["source_sha256"] = {path: digest(ROOT / path) for path in sources}
    report["evidence_sha256"] = {"qa-artifacts/advanced-ocr/" + name: digest(QA / name) for name in evidence}
    report["evidence_sha256"][smoke_path.relative_to(ROOT).as_posix()] = digest(smoke_path)
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "tests": report["tests"]}))


if __name__ == "__main__":
    main()
