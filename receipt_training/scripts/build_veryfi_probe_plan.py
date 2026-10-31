"""Seal/check the prepared, UNAUTHORIZED Veryfi experiment; never makes requests."""
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
PREPARED = ROOT / "qa-artifacts/provider-review/veryfi-uk-v1"
OUT = ROOT / "receipt_training/evaluation/veryfi-probe-plan-v1.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if "--check" in sys.argv:
        plan = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in plan["evidence_sha256"].items():
            if sha(ROOT / name) != expected:
                raise ValueError("Prepared probe evidence changed: " + name)
        print(json.dumps({"prepared_plan_verified": True, "verified_files": len(plan["evidence_sha256"])}))
        return
    if OUT.exists():
        raise ValueError("Preserve the sealed plan; use --check or a new experiment version")
    manifest_path = PREPARED / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    archive_path = PREPARED / "receipt.zip"
    archive = archive_path.read_bytes()
    if sha(archive_path) != manifest["archive_sha256"] or manifest["approval_received"] or len(manifest["inputs"]) != 2:
        raise ValueError("Unapproved two-crop preparation scope changed")
    expected = ["1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68", "adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b"]
    if [entry["sha256"] for entry in manifest["inputs"]] != expected:
        raise ValueError("Only the two visually inspected crops may be packaged")
    with zipfile.ZipFile(io.BytesIO(archive)) as zipped:
        if zipped.namelist() != ["01.jpg", "02.jpg"]:
            raise ValueError("Extra, reordered or non-generic archive entries")
        for entry in manifest["inputs"]:
            if hashlib.sha256(zipped.read(entry["entry"])).hexdigest() != entry["sha256"] or sha(ROOT / entry["source"]) != entry["sha256"]:
                raise ValueError("The original crop pixels changed")
    test_log = ROOT / "qa-artifacts/veryfi-probe-unit-final.log"
    log = test_log.read_text(encoding="utf-8")
    if not re.search(r"\bpass 9\b", log) or not re.search(r"\bfail 0\b", log):
        raise ValueError("All nine offline transport checks must pass")
    protocol = ["benchmark_veryfi_probe.mjs", "veryfi_probe_transport.mjs"]
    sources = [Path(__file__), *[Path(__file__).with_name(name) for name in protocol + ["prepare_veryfi_probe.py", "test_veryfi_probe.mjs"]]]
    evidence = [*sources, manifest_path, archive_path, PREPARED / "builder.py", test_log, *[ROOT / entry["source"] for entry in manifest["inputs"]]]
    if sha(PREPARED / "builder.py") != manifest["builder_sha256"]:
        raise ValueError("Frozen packaging builder changed")
    value = {"provider": "Veryfi", "api_version": "v8", "state_when_prepared": "Awaiting separate human approval and free-account configuration; no live provider request made",
             "manifest_sha256": sha(manifest_path), "archive_sha256": sha(archive_path), "archive_bytes": len(archive),
             "inputs": [{"entry": entry["entry"], "sha256": entry["sha256"]} for entry in manifest["inputs"]],
             "max_processing_requests": 1, "max_deletion_requests": 1, "automatic_retries": 0, "billing_activation_allowed": False,
             "body_scope": "Only the ZIP, a generic filename and a new random external_id; no source merchant/currency hints, labels, OCR text, URLs, callbacks or third-party storage requests",
             "cleanup_scope": manifest["cleanup_scope"],
             "privacy": {"default_data_location_documented": "AWS US Oregon; EU available on request", "default_retention": "Active-account storage unless deleted/configured otherwise", "training": "Current privacy policy permits proprietary model training/improvement; opt-out requires agreement/DPA/configuration where available", "zero_retention_claimed": False, "training_opt_out_configured": False},
             "pricing_scope": "Official pricing lists up to 100 documents/month free and a no-card trial. The user must confirm their actual account/free quota before this one test. No account billing was inspected, paid plan activated or zero-charge guarantee made.",
             "required_configuration": ["VERYFI_CLIENT_ID", "VERYFI_BEARER_KEY (prefer scoped create/delete routes and expiry)"],
             "offline_transport_tests_passed": 9, "live_receipt_accuracy_measured": False, "selected_for_application": False,
             "protocol_sha256": {name: sha(Path(__file__).with_name(name)) for name in protocol},
             "references": manifest["references"] + ["https://www.veryfi.com/privacy/", "https://faq.veryfi.com/en/articles/5796847-where-does-veryfi-store-the-data", "https://docs.veryfi.com/api/receipts-invoices/delete-a-document/"],
             "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in evidence}}
    OUT.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"sealed_plan": OUT.relative_to(ROOT).as_posix(), "offline_tests": 9, "live_provider_requests": 0}))


if __name__ == "__main__":
    main()
