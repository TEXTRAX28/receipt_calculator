"""Seal an offline six-crop Azure receipt comparison; this never authorizes it."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
FOLDER = ROOT / "qa-artifacts/provider-review/azure-screening-v1"
OUT = ROOT / "receipt_training/evaluation/azure-screening-plan-v1.json"
EVIDENCE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    value = sha(path)
    assert expected is None or expected == value, "Prepared input changed: " + str(path)
    EVIDENCE[path.relative_to(ROOT).as_posix()] = value
    return value


def main():
    if "--check" in sys.argv:
        plan = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in plan["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "prepared_cases": 6, "external_requests": 0}))
        return
    assert not OUT.exists() and not FOLDER.exists(), "Use --check; preserve the scope"
    manifest_path, review_path = SOURCE / "manifest.json", SOURCE / "source-review.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    review = json.loads(review_path.read_text(encoding="utf-8"))
    remember(manifest_path, review["manifest_sha256"])
    remember(review_path)
    remember(SOURCE / "screening-labels-v1.jsonl", review["screening_labels_sha256"])
    assert len(manifest["cases"]) == len(review["reviewed_cases"]) == 6
    cases = []
    for index, (row, inspected) in enumerate(zip(manifest["cases"], review["reviewed_cases"], strict=True), 1):
        assert row["case"] == inspected["case"] == f"case-0{index}"
        assert inspected["assistant_viewed_original_and_exact_crop"]
        assert inspected["crop_sha256"] == row["crop_sha256"]
        image = SOURCE / row["crop_file"]
        remember(image, row["crop_sha256"])
        remember(ROOT / row["original_source"], row["original_sha256"])
        raw = image.read_bytes()
        assert raw[:8] == bytes.fromhex("89504e470d0a1a0a") and raw[12:16] == b"IHDR"
        width, height = int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")
        assert len(raw) < 4_000_000 and min(width, height) >= 50 and max(width, height) <= 10000
        assert width * height <= 16_000_000
        cases.append({"id": row["case"], "receipt_id": row["receipt_id"],
            "image": image.relative_to(ROOT).as_posix(), "image_sha256": row["crop_sha256"],
            "image_bytes": len(raw), "width": width, "height": height,
            "original_split": row["original_split"], "challenge": row["challenge"]})
    protocol = {}
    for name in ("azure_receipt_probe.mjs", "azure_receipt_batch.mjs", "benchmark_azure_screening.mjs"):
        path = ROOT / "receipt_training/scripts" / name
        protocol[path.relative_to(ROOT).as_posix()] = remember(path)
    for name in ("test_azure_receipt_probe.mjs", "prepare_azure_screening.py"):
        remember(ROOT / "receipt_training/scripts" / name)
    log = ROOT / "qa-artifacts/azure-probe-validation-v1/protocol-final.log"
    remember(log)
    assert "pass 16" in log.read_text(encoding="utf-8") and "fail 0" in log.read_text(encoding="utf-8")
    remember(ROOT / "qa-artifacts/azure-probe-validation-v1/fixture-before.mjs")
    app_changes = subprocess.check_output(["git", "diff", "--name-only", "HEAD", "--", "src", "server", "tests", "vite.config.ts", "package.json", "package-lock.json"], cwd=ROOT, text=True)
    assert not app_changes
    validation_path = ROOT / "receipt_training/evaluation/advanced-compact-validation-v1.json"
    validation = json.loads(validation_path.read_text(encoding="utf-8"))
    remember(validation_path)
    for name, expected in validation["source_sha256"].items():
        if name.startswith("dist/"):
            remember(ROOT / name, expected)
    FOLDER.mkdir()
    value = {
        "provider": "Azure Document Intelligence", "api_version": "2024-11-30", "model": "prebuilt-receipt",
        "sealed_at": datetime.now(timezone.utc).isoformat(),
        "state": "Offline protocol tested. Azure F0 configuration, six unused-page confirmation and separate Azure upload approval are missing. No Azure requests have been made.",
        "cases": cases, "protocol_sha256": protocol,
        "review_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in (manifest_path, review_path)},
        "max_processing_requests": 6, "max_poll_requests": 180, "max_deletion_requests": 6,
        "attempts_per_case": 1, "automatic_retries": 0, "billing_activation_allowed": False,
        "request_scope": "One exact previously inspected redacted PNG per case, JSON base64Source only, prebuilt-receipt 2024-11-30. No labels, earlier OCR, merchant/currency hints, source URLs, paid features, model training or storage uploads. No original uncropped image or other provider request. Six Azure analyses need separate approval; consumed Veryfi/Gemini scopes do not apply.",
        "polling_scope": "Azure analysis is asynchronous: at most thirty status GETs per new operation, two-second spacing, one extraction POST per case. Polling checks an existing job and never repeats its extraction. Redirects, wrong origins/models/versions and repeated result IDs are rejected. One-case deadline is 180 seconds plus separately bounded cleanup. Stop the batch at the first extraction or cleanup failure.",
        "cleanup_scope": "At most one DELETE for the validated unique operation returned by each new 202 response; no document listing, older-record deletion or cleanup retry. Only 204 is reported success. Missing/invalid operation IDs cannot be deleted safely; failure/timeout can leave provider data under its retention policy.",
        "quota_and_cost": "F0 lists up to 500 free pages/month. Each PNG is one page and under the 4 MB F0 limit. User must confirm F0 and at least six unused pages for the chosen resource. No S0 activation or billing-management calls. The harness cannot verify the account invoice, remaining quota or resource region independently.",
        "privacy": "Microsoft documents processing/encrypted temporary storage in the resource region and deletion of inputs/results 24 hours after analysis completion, with earlier Delete Analyze Result available. Resource region must be reported by the user and bound to the endpoint approval. No custom-model training call is made; a separate account-specific contractual training-use commitment has not been verified. Crops reduce identifiers but are not a guarantee of anonymization. Reported DELETE success is not an independent erasure audit.",
        "comparison_scope": "Same six physical-receipt crops used by the completed Veryfi/local screen. Previously inspected partial references: 26 purchase rows and 25 known prices; unreadable/unsupported quantities, tax basis and deduction classification remain unknown. Source-informed development screen, not original-50 replacement, untouched holdout or complete financial-accuracy certification. Compare native fields and literal text separately after any approved live run.",
        "offline_protocol_tests": 16, "app_sources_changed": False, "built_app_assets_unchanged": True,
        "external_requests": 0, "references_checked_on": "2026-11-01",
        "references": [
            "https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0",
            "https://raw.githubusercontent.com/Azure-Samples/document-intelligence-code-samples/main/schema/2024-11-30-ga/receipt.md",
            "https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0+(2024-11-30)",
            "https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/delete-analyze-result?view=rest-aiservices-v4.0+(2024-11-30)",
            "https://azure.microsoft.com/en-us/pricing/details/document-intelligence/",
            "https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security",
        ], "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    (FOLDER / "plan.json").write_bytes(OUT.read_bytes())
    print(json.dumps({"prepared_cases": 6, "offline_tests": 16, "evidence_files": len(EVIDENCE), "external_requests": 0, "azure_approval": False}))


if __name__ == "__main__":
    main()
