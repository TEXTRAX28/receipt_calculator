"""Seal new genuine-PDF diagnostic failures; do not promote a reader or edit truth."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
RUN = QA / "public-digital-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-public-digital-pdf-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env")
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (QA / "evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if not expected and "qa-artifacts" not in path.parts and ".cache" not in path.parts:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            read(ROOT / name, digest)
        print(json.dumps({"verified_files": len(HASHES), "receipt_uploads": 0}))
        return
    assert not OUT.exists(), "Preserve this report"
    acquisition = load(RUN / "acquisition.json")
    for source in acquisition["sources"]:
        read(ROOT / source["path"], source["sha256"])
        assert source["http_status"] == 200
    extraction = load(RUN / "page-extraction.json")
    assert len(extraction["documents"]) == 2
    for item in extraction["documents"]:
        read(ROOT / item["path"], item["sha256"])
        assert item["content_streams_preserved"] and item["text_preserved"] and not item["source_content_edited"]
        assert item["external_processing_allowed"] is False
    renders = load(RUN / "render-verification.json")
    assert len(renders["pages"]) == 3 and all(page["pixel_identical"] for page in renders["pages"])
    plan = load(RUN / "browser/plan.json")
    meta = load(RUN / "browser/metadata.json")
    assert meta["source_unchanged"] and meta["cloud_requests"] == meta["native_model_calls"] == meta["automatic_retries"] == 0
    assert plan["documents"] == extraction["documents"] and len(meta["cases"]) == 2
    for name, digest in plan["source_sha256"].items():
        read(RUN / "browser/source" / name, digest)
        read(ROOT / name, digest)
    truth = load(RUN / "source-truth.json")
    diagnostics = []
    for source in truth["documents"]:
        record = load(RUN / "browser" / (source["id"] + ".json"))
        assert record["error"] is None and record["requests"] == {"posts": [], "external": []}
        assert record["confirm_enabled"] is False and not record["has_horizontal_overflow"]
        receipt = record["state"]["receipt"]
        assert receipt["rawText"] == "" and any(check["scope"] == "receipt" and check["field"] == "items" and check["reason"] == "document" and check["confirmedValue"] == "" for check in receipt["reviewChecks"])
        expected = len(source["quantities"])
        assert len(receipt["items"]) == expected
        quantity = sum(item["quantity"] == target for item, target in zip(receipt["items"], source["quantities"], strict=True))
        units = sum(item["unitPrice"] == target for item, target in zip(receipt["items"], source["net_unit_prices"], strict=True))
        diagnostics.append({"id": source["id"], "pages": record["pages"], "purchases_detected": expected, "expected_purchases": expected, "quantity_correct": quantity, "quantity_known": expected, "populated_net_unit_price_correct": units, "unit_price_known": expected, "selected_currency": receipt["currency"], "currency_correct": receipt["currency"] == source["currency"], "selected_final_total": receipt["printedTotal"], "expected_final_total": source["printed_final_total"], "final_total_correct": receipt["printedTotal"] == source["printed_final_total"], "merchant_correct": receipt["merchant"] in source["merchant_aliases"], "elapsed_ms": record["elapsed_ms"], "confirmation_blocked": True, "horizontal_overflow": False})
    assert sum(item["quantity_correct"] for item in diagnostics) == sum(item["populated_net_unit_price_correct"] for item in diagnostics) == 0
    assert sum(item["currency_correct"] for item in diagnostics) == sum(item["merchant_correct"] for item in diagnostics) == 1
    assert not any(item["final_total_correct"] for item in diagnostics)
    for path in sorted(RUN.rglob("*")):
        if path.is_file() and "vite-cache" not in path.parts:
            read(path)
    for name in ("receipt_training/scripts/benchmark_public_pdf.mjs", "receipt_training/scripts/build_public_pdf_baseline.py", "receipt_training/evaluation/PUBLIC_DIGITAL_PDF_BASELINE.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md"):
        read(ROOT / name)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    original = r"C:\Users\natan\VSC Code\costco_calc"
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original_head = git("-C", original, "rev-parse", "HEAD").decode().strip()
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd" and original_head == "29a187af7347be94c0728f4785be674500833748"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    report = {"scope": "Two genuine council-published paid invoices through the unchanged actual local embedded-PDF-text UI. New supplementary failure baseline; no model/app fix, original-fifty benchmark or universal accuracy claim.", "source_url": acquisition["sources"][1]["url"], "selected_original_pages": [6, 16, 17], "documents": diagnostics, "source_preservation": {"whole_pages": True, "content_and_text_preserved": True, "pixel_identical_renders": 3, "amount_or_geometry_edits": False, "redistribution_rights_verified": False}, "request_scope": {"public_document_downloads": 2, "receipt_uploads": 0, "ocr_vlm_inference_calls": 0, "automatic_retries": 0, "paid_activation": False}, "interpretation_failures": ["Amazon: non-transaction EUR footer overrides transaction GBP, VAT-summary total overrides final payable, quantities/units/names remain incomplete despite preserved repeated row count.", "Gopak: VAT percentage is mistaken for a line price; final total and tax are missing. Already-deducted discount and inconsistent displayed unit/line arithmetic need explicit treatment rather than fabricated precision."], "limits": ["Publisher provenance is not independent verification of the underlying purchases. These source-informed documents are not a blind holdout; written source reference was saved after viewing initial draft failures.", "Two local 390px observations are not a p95, a model-speed comparison or physical-phone evidence. Source text can differ from visible pages; mandatory source review is preserved.", "Original-fifty membership/references remain unchanged. Current app software tests belong to ae7f2e0; no new full suite or heavy OCR/VLM cohort was run here.", "Raw public PDFs, renders and drafts remain local/ignored; redistribution rights are unverified. The second downloaded packet was not selected or scored.", "Heavy model memory/resource constraints, private Gemini approval, genuine scan/refund cases, broader truth, real handset and public readiness remain open. Full goal stays active."], "git": {"app_commit": plan["parent_commit"], "parent_commit": git("rev-parse", "HEAD").decode().strip(), "stable": stable, "original_head": original_head, "original_diff_sha256": original_diff, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "genuine_documents": 2, "page_renders_preserved": 3, "correct_automatic_final_totals": 0, "quantity_correct": "0/6", "receipt_uploads": 0, "app_changed": False}))


if __name__ == "__main__":
    main()
