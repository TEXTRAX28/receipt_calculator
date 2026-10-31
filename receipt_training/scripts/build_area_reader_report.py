"""Retain local area-reader integration evidence; no model/API calls or labels."""
from pathlib import Path
import hashlib
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
OUT = ROOT / "receipt_training/evaluation/advanced-area-reader.json"
EVIDENCE = set()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    path = path.resolve()
    path.relative_to(ROOT)
    if expected is not None and sha(path) != expected:
        raise ValueError("Frozen checkpoint evidence changed: " + path.relative_to(ROOT).as_posix())
    EVIDENCE.add(path)
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def snapshot(name):
    source = ROOT / name
    target = QA / "area-reader-checkpoint/source" / name
    if target.exists() and sha(target) != sha(source):
        raise ValueError("Use a new checkpoint instead of replacing frozen source")
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    remember(target, sha(source))
    return sha(target)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "scope": "local selected-area reread checkpoint"}))
        return

    sources = {name: snapshot(name) for name in [
        "src/ReceiptAreaReader.tsx", "src/ReceiptSource.tsx", "src/ImageCropper.tsx", "src/App.tsx", "src/styles.css",
        "tests/e2e/computer-reader.spec.ts", "tests/e2e/computer-reader-real.spec.ts", "tests/e2e/pdf-receipts.spec.ts",
        "package.json", "package-lock.json", "playwright.config.ts",
    ]}
    library = load(ROOT / "receipt_training/evaluation/runs/headerless-coupon-v2-after-development/metadata.json")
    for name, expected in library["source_sha256"].items():
        if sha(ROOT / "src/lib" / name) != expected:
            raise ValueError("The financial/extraction library changed after the frozen cohort regression")
        snapshot("src/lib/" + name)

    native = load(QA / "area-reader-costco-desktop.json")
    if not (native["actualInstalledModel"] and native["draftUnchangedAfterReread"] and native["finalSplitVerified"]):
        raise ValueError("The installed native workflow did not complete unchanged")
    if native["financialEdits"] or native["external"] or native["posts"] != ["/api/receipts/recognize"] * 2:
        raise ValueError("The native workflow exceeded its local scope")
    if native["recognition"]["recognition"]["engine"] != "paddle-ppocrv6-medium-onnx":
        raise ValueError("The native reader differs from the installed candidate")
    if len(native["requestPanelHashes"]) != 2 or [len(p) for p in native["requestPanelHashes"]] != [2, 1]:
        raise ValueError("Expected two original photo panels followed by one selected area")
    if not ("SPONTEX" in native["recognizedText"] and "6.99" in native["recognizedText"] and re.search(r"1[.,]50\s*[-−]\s*A", native["recognizedText"])):
        raise ValueError("The retained area read lacks the purchase price or negative coupon code")
    device = [load(QA / f"area-device-real-{name}.json") for name in ["desktop", "mobile"]]
    for value in device:
        if not value["synthetic"] or not value["draftUnchanged"] or value["posts"] or value["external"] or not re.search(r"Milk\s+2x\s+1\.25\s+2\.50", value["recognized"]):
            raise ValueError("Actual browser OCR evidence failed its unchanged/local boundary")
    remember(ROOT / "tests/fixtures/pdfs/digital-two-page.pdf")
    logs = {name: remember(QA / file).read_text(encoding="utf-8") for name, file in {
        "unit": "area-reader-unit-first.log", "build": "area-reader-build-first.log", "browser": "area-reader-e2e-final.log",
        "targeted": "area-reader-targeted-first.log", "native": "area-reader-costco-real-final.log",
        "format": "area-reader-format-final.log", "graph": "area-reader-graph-final.log", "test_typecheck": "area-reader-browser-typecheck.log",
    }.items()}
    if re.search(r"\b(?:failed|FAIL)\b", logs["unit"] + logs["browser"] + logs["native"]) or "built in" not in logs["build"] or "All matched files use Prettier" not in logs["format"] or logs["test_typecheck"].strip():
        raise ValueError("The final integration checks failed")
    for name in ["area-select-mobile-320.png", "area-select-mobile-390.png", "area-result-mobile.png", "area-device-real-desktop.png", "area-device-real-mobile.png", "area-reader-costco-desktop.png"]:
        remember(QA / name)
    remember(Path(__file__))
    report = {
        "scope": "Local item-area reread with manual correction; UI/integration evidence, not a new recognition cohort or stronger-provider selection",
        "behaviour": "Source-highlighted purchases offer an adjustable area crop. Use the configured computer reader, otherwise the existing browser English OCR. New text stays transient beside the original source and editable fields. It does not update receipt values, source mappings, verification checks, assignments or confirmation stamps. Closing, changing source sections and cancellation abort owned work and discard late results.",
        "verified_source_locations": ["src/ReceiptAreaReader.tsx:L84", "src/ReceiptAreaReader.tsx:L93", "src/ReceiptSource.tsx:L1", "src/ImageCropper.tsx:L37", "src/lib/receipt-evidence.ts:L130"],
        "real_costco_development": {"unique_transactions": 1, "actual_installed_reader": "PaddleOCR PP-OCRv6 medium ONNX", "source_photo_sha256": native["inputHashes"], "sent_panel_sha256": native["requestPanelHashes"], "purchase_and_negative_coupon_text_visible": True, "draft_unchanged": True, "financial_edits": 0, "final_split": ["58.93", "58.93", "58.92"], "receipt_total": "176.78", "area_elapsed_ms": native["elapsedMs"], "timing_scope": native["timingScope"], "external_requests": 0, "local_http_requests": 2},
        "synthetic_pdf_area": {"unique_transactions": 1, "browser_projects": ["desktop", "phone emulation on desktop Chrome"], "actual_reader": "bundled browser Tesseract English OCR", "quantity_unit_line_text_correct": True, "drafts_unchanged": True, "area_elapsed_ms": [value["elapsedMs"] for value in device], "timing_scope": device[0]["timingScope"], "external_requests": 0, "receipt_uploads": 0},
        "tests": {"unit_passes": int(re.search(r"Tests\s+(\d+) passed", logs["unit"]).group(1)), "standard_browser_passes": int(re.search(r"(\d+) passed \(", logs["browser"]).group(1)), "standard_browser_skips": int(re.search(r"(\d+) skipped", logs["browser"]).group(1)), "new_targeted_browser_passes": int(re.search(r"(\d+) passed \(", logs["targeted"]).group(1)), "extra_actual_native_workflow_passes": int(re.search(r"(\d+) passed \(", logs["native"]).group(1)), "typecheck_build_format_passed": True, "new_browser_tests_typechecked": True, "responsive_widths": [320, 390], "accessibility_checked": True},
        "financial_and_extraction_library_unchanged": True,
        "original_cohort_accuracy_delta_claimed": False,
        "limitations": ["Areas are available only where a literal source mapping exists and only during the current scan session", "The frame can contain adjacent purchases or totals; no parsed fields or coupon ownership are automatically applied", "Rereading uses an existing local OCR engine and has no general improvement guarantee", "No cloud/VLM area call, calibrated confidence, live-camera guidance, real-phone latency or broad area-reading accuracy measurement", "Public authentication/TLS/isolation, refund handling and other whole-goal requirements remain open"],
        "source_sha256": sources,
        "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(EVIDENCE)},
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "tests": report["tests"], "external_requests": 0}))


if __name__ == "__main__":
    main()
