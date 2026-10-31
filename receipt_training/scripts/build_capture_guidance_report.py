"""Verify local advisory capture checks and the regression checkpoint; no requests."""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
OUTPUT = ROOT / "receipt_training/evaluation/advanced-capture-guidance.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if "--check" in sys.argv:
        report = json.loads(OUTPUT.read_text(encoding="utf-8"))
        for name, expected in (report["source_sha256"] | report["evidence_sha256"]).items():
            if sha(ROOT / name) != expected:
                raise ValueError("Capture checkpoint evidence changed: " + name)
        print(json.dumps({"verified_files": len(report["source_sha256"] | report["evidence_sha256"])}))
        return
    private = QA / "capture-guidance/representative-v2/metadata.json"
    real = json.loads(private.read_text(encoding="utf-8"))
    if len(real["records"]) != 7 or real["provider_api_requests"] or real["external_receipt_uploads"] or real["blocked_browser_origins"]:
        raise ValueError("The declared local seven-photo diagnostic scope changed")
    for name, expected in real["source_sha256"].items():
        if sha(ROOT / name) != expected:
            raise ValueError("Assessment source changed after its diagnostic")
    if sha(ROOT / "receipt_training/manifest.jsonl") != real["manifest_sha256"] or sha(ROOT / "receipt_training/annotations/private/supplement-manifest.jsonl") != real["supplement_manifest_sha256"]:
        raise ValueError("The original receipt inventory changed")
    inputs = {}
    for record in real["records"]:
        if sha(ROOT / record["path"]) != record["sha256"]:
            raise ValueError("The original receipt pixels changed")
        inputs[record["path"]] = record["sha256"]
    logs = {name: (QA / filename).read_text(encoding="utf-8") for name, filename in {
        "unit": "capture-guidance-unit-final.log", "browser": "capture-guidance-e2e-final.log",
        "build": "capture-guidance-build-v2.log", "format": "capture-guidance-format-final.log",
        "targeted": "capture-guidance-e2e-targeted-v2.log",
    }.items()}
    if not re.search(r"318 passed", logs["unit"]) or not re.search(r"119 passed", logs["browser"]) or not re.search(r"1 skipped", logs["browser"]):
        raise ValueError("The full expected regression run has not passed")
    if "6 passed" not in logs["targeted"] or "built in" not in logs["build"] or "All matched files use Prettier code style" not in logs["format"]:
        raise ValueError("Targeted, build or format checks have not passed")
    original_failure = (QA / "capture-guidance-e2e-targeted-v1.log").read_text(encoding="utf-8")
    if "Text may be blurred" not in original_failure or "2 failed" not in original_failure:
        raise ValueError("The initial sparse-text blur regression evidence is missing")
    sources = [path for folder in ["src", "server", "tests"] for path in (ROOT / folder).rglob("*") if path.is_file() and path.suffix in [".ts", ".tsx", ".mjs", ".py", ".css", ".json"]]
    sources += [ROOT / name for name in ["package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts", "receipt_training/scripts/benchmark_capture_quality.mjs"]]
    sources.append(Path(__file__))
    evidence = [private, QA / "capture-guidance-metrics-v1.json", QA / "capture-guidance-e2e-targeted-v1.log", QA / "capture-guidance-e2e-targeted-v2.log", QA / "capture-guidance-e2e-final.log", QA / "capture-guidance-unit-final.log", QA / "capture-guidance-build-v2.log", QA / "capture-guidance-format-final.log", QA / "capture-guidance/mobile-advice.png", QA / "capture-guidance/desktop-advice.png"]
    report = {
        "scope": "Local post-capture advisory quality checks. Not financial extraction, a quality accuracy benchmark, live-camera guidance or public-release certification.",
        "implemented": ["Low native-resolution, very dark, low visible detail and likely distributed blur notices", "Original unfiltered pixels sampled before OCR preparation; crop assessments use the original crop's native dimensions", "Three bounded native-resolution sample regions and a small exposure/detail overview", "Photo advice follows reordering/removal and is separate from receipt confirmation", "No good-photo grade or legibility guarantee when a notice is absent", "PDF pages excluded from photographic recapture advice", "Original previews, reading blobs and existing manual crop/review flow preserved"],
        "thresholds": {"native_short_side_pixels_below": 400, "mean_luminance_below": 75, "overall_luminance_deviation_below": 10, "eligible_region_minimum_gradient_energy": 0.5, "eligible_region_minimum_luminance_deviation": 7, "blur_laplacian_to_gradient_ratio_below": 0.3, "blurred_regions_required": 2},
        "threshold_scope": "Engineering heuristics tested on generated sharp/blurred/dark/blank/small images and seven unchanged representative photos; not statistically calibrated probabilities. Blank/low-contrast patches abstain from blur voting.",
        "initial_browser_failure": "Both desktop and phone tests missed sparse text blurred by five pixels because its gradient energy fell below the initial eligibility threshold. Native-pixel diagnostics exposed the missed case. Eligibility was corrected, then all targeted and complete regressions were rerun. Failed traces/logs remain local.",
        "tests": {"unit_passes": 318, "browser_passes": 119, "browser_skips": 1, "new_targeted_browser_passes_included_in_full_total": 6, "axe_accessibility_checks_on_advice": True, "phone_widths_checked": [320, 390, 430], "build_typecheck_passed": True, "format_passed": True},
        "real_photo_diagnostic": {"photos": 7, "flagged": sum(bool(row["quality"] and row["quality"]["flags"]) for row in real["records"]), "assessment_unavailable": sum(row["quality"] is None for row in real["records"]), "repeated_quality_only_ms": [row["repeated_quality_only_ms"] for row in real["records"]], "quality_ground_truth_available": False, "false_positive_or_negative_rate_claimed": False, "timing_scope": real["timing_scope"]},
        "provider_api_requests": 0, "external_receipt_uploads": 0,
        "remaining": ["Automatic edge detection and perspective/deskew/orientation handling", "Actual live-camera quality guidance", "Quality labels and calibration across broader devices and photographic conditions", "Area rescanning and explicit numeric context", "Other full-objective requirements in ADVANCED_OCR_REPORT.md"],
        "source_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(set(sources))},
        "evidence_sha256": {**inputs, **{path.relative_to(ROOT).as_posix(): sha(path) for path in evidence}},
    }
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "tests": report["tests"]}))


if __name__ == "__main__":
    main()
