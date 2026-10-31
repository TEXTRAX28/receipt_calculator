"""Publish aggregate local PDF evidence without receipt content or network calls."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys
from build_long_vision_report import verify_runs

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts/advanced-ocr"
OUTPUT = ROOT / "receipt_training/evaluation/advanced-pdf-integration.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def main():
    original_evidence = verify_runs()
    score_path = ROOT / "receipt_training/evaluation/runs/independent-compare-v3-development/original-score.json"
    score = load(score_path)
    for name, key in [("manifest.jsonl", "manifest_sha256"), ("annotations/labels.jsonl", "labels_sha256")]:
        if digest(ROOT / "receipt_training" / name) != score[key]:
            raise ValueError("The original scoring cohort or annotations changed")
    if "--check" in sys.argv:
        value = load(OUTPUT)
        hashes = value["source_sha256"] | value["evidence_sha256"]
        changed = [name for name, expected in hashes.items() if not (ROOT / name).is_file() or digest(ROOT / name) != expected]
        if changed:
            raise SystemExit("Changed PDF checkpoint files: " + ", ".join(changed))
        print(json.dumps({"verified_checkpoint_files": len(hashes), "original_corpus_modified": False}))
        return
    truth_path = ROOT / "tests/fixtures/pdfs/synthetic-truth.json"
    truth = load(truth_path)
    for name, expected in truth["pdf_sha256"].items():
        if digest(truth_path.parent / name) != expected:
            raise ValueError("A synthetic PDF fixture changed")
    version = load(ROOT / "node_modules/pdfjs-dist/package.json")["version"]
    if version != "6.4.299" or load(ROOT / "package.json")["dependencies"]["pdfjs-dist"] != version:
        raise ValueError("Pinned PDF worker-error protocol requires revalidation")
    flows = []
    evidence = [truth_path, QA / "pdf-dependency-audit.json", score_path, *original_evidence]
    for project in ["desktop", "mobile"]:
        path = QA / f"pdf-flow-{project}.json"
        flow = load(path)
        if not flow["synthetic"] or flow["financialEdits"] or flow["purchases"] != 3 or flow["distinctRepeatedMilks"] != 2 or flow["totalMinor"] != "650" or flow["sharesMinor"] != ["217", "217", "216"]:
            raise ValueError("The complete direct-text split did not match the synthetic source")
        if flow["requests"] != {"posts": [], "external": []} or flow["workersRemaining"]:
            raise ValueError("The direct-text path uploaded data or retained a worker")
        flows.append({"project": project, "upload_to_review_ms": flow["elapsedMs"], "purchases": 3, "total_minor": "650", "shares_minor": flow["sharesMinor"], "financial_edits": 0, "ocr_or_cloud_requests": 0, "pdf_workers_remaining": 0})
        evidence.append(path)
    real_path = QA / "pdf-real-scan-desktop.json"
    real = load(real_path)
    if not real["actualInstalledModel"] or real["mocked"] or real["financialEdits"] or not real["moneyMatches"] or not real["finalSplitVerified"] or real["httpStatus"] != 200 or real["requests"] != {"posts": ["/api/receipts/recognize"], "external": []}:
        raise ValueError("The actual scanned-PDF computer-reader split is incomplete")
    audit = load(QA / "pdf-dependency-audit.json")["metadata"]["vulnerabilities"]
    if audit["total"]:
        raise ValueError("The retained runtime dependency audit reports vulnerabilities")
    logs = {kind: (QA / f"pdf-{kind}-final.log").read_text(encoding="utf-8") for kind in ["unit", "browser", "build", "format"]}
    if re.search(r"\b(?:FAIL|failed)\b", logs["unit"] + logs["browser"]) or "built in" not in logs["build"] or "All matched files use Prettier" not in logs["format"]:
        raise ValueError("The final PDF regression evidence is incomplete")
    value = {
        "scope": "Local PDF integration checkpoint; synthetic fixtures only, not a genuine retailer PDF or original-corpus accuracy benchmark",
        "source_commit_before_checkpoint": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "pdfjs_version": version,
        "limits": {"file_bytes": 12 * 1024 * 1024, "receipt_images_or_pages": 12, "receipt_reading_sections": 24, "receipt_source_and_pdf_preview_bytes": 48 * 1024 * 1024, "import_deadline_ms": 60000, "render_pixels_per_page": 12000000, "render_pixels_per_document": 48000000, "canvas_side_pixels": 12000, "page_side_pdf_units": 20000, "operators_per_page": 100000, "text_characters_per_document": 60000, "text_items_per_page": 10000},
        "direct_text_workflows": flows,
        "long_page_test": {"synthetic_purchases": 60, "total_minor": "6000", "actual_pdfjs_extraction_tested": True, "full_page_source_highlight_tested": True, "ocr_or_cloud_requests": 0},
        "actual_scanned_pdf_workflow": {"synthetic_receipts": 1, "engine": real["recognized"]["recognition"]["engine"], "upload_to_review_ms": real["elapsedMs"], "purchases": len(real["items"]), "total_minor": "650", "shares_minor": ["325", "325"], "financial_edits": 0, "final_split_verified": True, "computer_ocr_http_requests": 1, "external_requests": 0},
        "tests": {"unit_passes": int(re.search(r"Tests\s+(\d+) passed", logs["unit"]).group(1)), "standard_browser_passes": int(re.search(r"(\d+) passed \(", logs["browser"]).group(1)), "standard_browser_skips": int(re.search(r"(\d+) skipped", logs["browser"]).group(1)), "extra_actual_model_workflows": 1, "typecheck_build_format_passed": True, "runtime_dependency_audit_vulnerabilities": audit["total"]},
        "safety": {"original_pdf_persisted": False, "browser_worker_owned_and_terminated": True, "document_actions_and_link_navigation_used": False, "worker_stream_errors_rejected_independently": True, "mandatory_complete_purchase_list_check_for_embedded_text": True, "source_geometry_mapped_to_full_page": True, "all_pdf_pages_retained_or_import_rejected": True, "all_visible_pdf_content_guaranteed": False},
        "retained_failures": ["Interactive password callback initially left import waiting; use the library's explicit password rejection", "Unavailable font metrics initially produced NaN source rectangles; finite fallback/validation added", "Pinned PDF.js resolved an empty operator list on a worker image-size error; independent stream-error observation now rejects the entire import", "First development PDF import triggered a late dependency-optimization reload; explicit prebundling preserves selected files", "Two existing upload-limit checks needed the new images/PDF-pages wording"],
        "limitations": ["No genuine retailer digital/PDF accuracy denominator", "Synthetic direct-text and native OCR tests are not a representative latency distribution or p95", "Selectable text can be hidden/stale or omit raster purchases; list verification remains required", "Pages with unsupported writing/forms/crops require image recognition", "General cross-photo overlap, stronger-model comparisons and complete original truth remain open", "Whole-app peak memory, physical phones/Safari and OS/public-backend isolation remain unverified", "Full twelve-phase objective remains active"],
        "official_api_reference": "https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html",
    }
    source = [p for directory in ["src", "server", "scripts", "tests"] for p in (ROOT / directory).rglob("*") if p.is_file() and p.suffix in [".ts", ".tsx", ".mjs", ".py", ".css", ".json", ".pdf"]]
    source += [ROOT / name for name in ["package.json", "package-lock.json", "README.md", "docs/IMPLEMENTATION_AND_SECURITY.md", "vite.config.ts", "playwright.config.ts", ".gitignore", ".gitattributes", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md", "receipt_training/scripts/build_pdf_integration_report.py", "receipt_training/scripts/build_long_vision_report.py"]]
    evidence += [real_path] + [QA / f"pdf-{kind}-final.log" for kind in logs]
    evidence += [QA / name for name in ["pdf-real-model-v1.log", "pdf-real-model-v2.log", "pdf-browser-work-v1.log", "pdf-browser-work-v2.log", "pdf-browser-work-v3.log", "pdf-browser-work-v4.log", "pdf-browser-initial-full.log"]]
    evidence += [ROOT / name for name in ["qa-artifacts/pdf-upload-mobile.png", "qa-artifacts/pdf-review-mobile.png", "qa-artifacts/pdf-source-mobile.png", "qa-artifacts/pdf-long-source-mobile.png", "node_modules/pdfjs-dist/build/pdf.worker.min.mjs", "node_modules/pdfjs-dist/build/pdf.mjs"]]
    for directory in ["pdf-first-v1", "pdf-second-v2", "pdf-third-v3", "pdf-copy-regression-v1", "pdf-real-results"]:
        evidence += list((QA / directory).rglob("trace.zip")) + list((QA / directory).glob("*-trace.zip"))
    value["source_sha256"] = {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(set(source))}
    value["evidence_sha256"] = {p.relative_to(ROOT).as_posix(): digest(p) for p in sorted(set(evidence))}
    OUTPUT.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "tests": value["tests"], "actual_scanned_pdf_ms": real["elapsedMs"]}))


if __name__ == "__main__":
    main()
