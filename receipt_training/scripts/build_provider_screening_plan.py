"""Seal the six-case comparison scope. Entirely offline; never authorizes uploads."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
OUT = ROOT / "receipt_training/evaluation/veryfi-screening-plan-v1.json"
EVIDENCE = {}


def remember(path, expected=None):
    path = path.resolve()
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected is not None and digest != expected:
        raise ValueError("Prepared evidence changed: " + path.name)
    EVIDENCE[path.relative_to(ROOT).as_posix()] = digest
    return digest


def main():
    if "--check" in sys.argv:
        plan = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in plan["evidence_sha256"].items():
            remember(ROOT / name, digest)
        print(json.dumps({"verified_files": len(EVIDENCE), "prepared_cases": len(plan["cases"]), "external_requests": 0}))
        return
    if OUT.exists():
        raise ValueError("Preserve this plan; use --check")
    manifest = json.loads((FOLDER / "manifest.json").read_text(encoding="utf-8"))
    review = json.loads((FOLDER / "source-review.json").read_text(encoding="utf-8"))
    manifest_sha = remember(FOLDER / "manifest.json", review["manifest_sha256"])
    review_sha = remember(FOLDER / "source-review.json")
    remember(FOLDER / "screening-labels-v1.jsonl", review["screening_labels_sha256"])
    remember(FOLDER / "labels-base.jsonl", review["base_labels_sha256"])
    if len(manifest["cases"]) != 6 or len(review["reviewed_cases"]) != 6 or review["priced_rows"] != 26:
        raise ValueError("Unexpected reviewed screening cohort")
    currencies = ["GBP", "TWD", "GBP", "IDR", "IDR", "IDR"]
    cases = []
    for row, inspected, currency in zip(manifest["cases"], review["reviewed_cases"], currencies, strict=True):
        if row["case"] != inspected["case"] or row["crop_sha256"] != inspected["crop_sha256"] or not inspected["assistant_viewed_original_and_exact_crop"]:
            raise ValueError("A case lacks exact source inspection")
        remember(ROOT / row["original_source"], row["original_sha256"])
        remember(FOLDER / row["crop_file"], row["crop_sha256"])
        remember(FOLDER / row["archive_file"], row["archive_sha256"])
        cases.append({"case": row["case"], "receipt_id": row["receipt_id"], "original_split": row["original_split"],
                      "challenge": row["challenge"], "crop_sha256": row["crop_sha256"],
                      "archive_sha256": row["archive_sha256"], "archive_bytes": row["archive_bytes"],
                      "offline_context_currency": currency})
    protocol = {}
    for name in ("benchmark_veryfi_screening.mjs", "veryfi_screening_batch.mjs", "veryfi_screening_transport.mjs"):
        protocol[name] = remember(ROOT / "receipt_training/scripts" / name)
    local_runner_sha = remember(ROOT / "receipt_training/scripts/benchmark_screening_local.mjs")
    for name in ("prepare_provider_screening.py", "record_provider_screening_review.py", "test_veryfi_screening.mjs", "test_veryfi_screening_transport.mjs", "test_veryfi_probe.mjs"):
        remember(ROOT / "receipt_training/scripts" / name)
    for name in ("builder.py", "review-builder.py"):
        remember(FOLDER / name)
    remember(Path(__file__))
    log = ROOT / "qa-artifacts/veryfi-screening-preparation-unit-final-v1.log"
    remember(log)
    if "pass 15" not in log.read_text(encoding="utf-8"):
        raise ValueError("The fifteen synthetic batch/transport checks did not pass")
    plan = {
        "provider": "Veryfi", "api_version": "v8", "state": "Prepared locally; separate six-case upload approval and confirmation of at least six unused Free credits are missing",
        "manifest_sha256": manifest_sha, "source_review_sha256": review_sha,
        "protocol_sha256": protocol, "local_runner_sha256": local_runner_sha,
        "cases": cases, "max_processing_requests": 6, "max_deletion_requests": 6,
        "attempts_per_case": 1, "automatic_retries": 0, "billing_activation_allowed": False,
        "request_scope": "Each exact pre-inspected PNG is in its own ZIP with only a generic receipt.png member. One extraction POST per case, at most six total. No original uncropped image, labels, merchant/country/currency hints, earlier OCR, URLs, callbacks or external-storage credentials enter a request.",
        "extraction_options": {"compute": False, "bounding_boxes": True, "confidence_details": True},
        "option_scope": "Use the documented native fields, boxes and confidence details; disable enrichment that computes values missing from the source. Those options differ from the earlier one-receipt default API probe and are fixed before this screen. Confidence is evidence to inspect, not proof of correctness.",
        "cleanup_scope": "At most one DELETE per fresh 201 record, only for a matching random external_id, exact valid ID and no duplicate indication. Never list or delete older documents. 202 is pending, not completed deletion. Timeout/failure/unknown response is not retried and can leave data retained.",
        "privacy": {"documented_default_location": "AWS US Oregon; EU available on request", "training_opt_out_configured": False,
                    "provider_policy": "Submitted data can be used for proprietary model improvement; default account retention until deletion/configuration. Cleanup does not establish zero retention or exclude training.",
                    "auto_delete_scope": "A retention FAQ mentions auto_delete, but this parameter was absent from the checked v8 process request reference. This screen does not rely on an unverified request option or claim training exclusion.",
                    "remaining_source_limits": "Source-specific inspection notes disclose retained reverse-side bleed-through and an already blurred band. Images are cropped to reduce identifiable data; no general anonymization guarantee is made."},
        "cost_scope": "No paid activation. User must confirm at least six unused Free document credits before execution; prior confirmation for a single consumed request is insufficient. No billing or quota-management call is made; actual invoice cannot be verified by this runner.",
        "local_comparator": "One actual current Paddle + independent Qwen browser extraction per case on those same PNG bytes, maximum twelve local model HTTP requests. No external origin, extra local POST, changed pixels or extra model hint is allowed. Offline automatic/context variants can reuse the saved independent responses without inference.",
        "truth_scope": "26 priced rows across six source-informed cases, including a separate new 11-row assistant-inspected Tesco/Taiwan reference. One faint Tesco price, unprinted quantities/unit prices, deduction ownership and absent tax inclusion remain unknown. Original labels, splits, permissions and the previous UK benchmark remain unchanged. Not independent human verification or a new blind holdout.",
        "selection_gate": "This is a small physical-receipt screen, not a provider promotion or public-release decision. Missing digital/long-camera/refund cases and complete financial truth remain open.",
        "offline_tests_passed": 15, "external_requests": 0,
        "references_checked_on": "2026-10-31",
        "references": ["https://docs.veryfi.com/api/receipts-invoices/process-a-document/", "https://docs.veryfi.com/api/getting-started/authentication/bearer-keys/", "https://docs.veryfi.com/api/receipts-invoices/delete-a-document/", "https://faq.veryfi.com/en/articles/5796847-where-does-veryfi-store-the-data", "https://faq.veryfi.com/en/articles/6716494-document-retention-management", "https://www.veryfi.com/privacy/"],
        "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(plan, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"prepared_cases": 6, "priced_reference_rows": 26, "verified_files": len(EVIDENCE), "external_requests": 0, "approval_received": False}))


if __name__ == "__main__":
    main()
