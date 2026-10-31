"""Summarize the two consumed human authorizations; never makes a network call."""
from pathlib import Path
import hashlib
import json
import sys

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "receipt_training/evaluation/advanced-approved-gemini.json"


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    if "--check" in sys.argv:
        report = json.loads(OUTPUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            if digest(ROOT / name) != expected:
                raise ValueError("Approved request evidence changed")
        print(json.dumps({"authorized_attempts_verified": 2, "additional_uploads_authorized": 0}))
        return
    attempts, evidence, request_hashes = [], [], set()
    for number in [1, 2]:
        folder = ROOT / f"qa-artifacts/advanced-ocr/gemini-approved-uk-v{number}"
        path = folder / "metadata.json"
        value = json.loads(path.read_text(encoding="utf-8"))
        if value["model"] != "gemini-3.1-flash-lite" or value["api_requests"] != 1 or value["billing_activated"] or value["retries"]:
            raise ValueError("Request exceeded the separately approved scope")
        if value["http_status"] != 503 or value["extraction_completed"] or (folder / "model-output.json").exists():
            raise ValueError("This report describes the observed two unavailable-provider outcomes only")
        for name, expected in value["input_sha256"].items():
            crop = ROOT / "qa-artifacts/advanced-ocr/cloud-review" / name
            if digest(crop) != expected:
                raise ValueError("Approved crop changed")
            evidence.append(crop)
        for name, expected in value["source_sha256"].items():
            if digest(folder / "source" / name) != expected:
                raise ValueError("Frozen request implementation changed")
        if digest(folder / "runner.mjs") != value["runner_sha256"]:
            raise ValueError("Frozen request runner changed")
        request_hashes.add(value["request_sha256"])
        attempts.append({"attempt": number, "human_reply": value["approval_user_reply"], "http_status": value["http_status"],
                         "elapsed_ms": value["elapsed_ms"], "completed_at": value["completed_at"], "extraction_completed": False,
                         "api_requests": 1, "automatic_retries": 0, "store": value["store"]})
        evidence.extend([path, folder / "authorization.json", folder / "runner.mjs"])
    if len(request_hashes) != 1:
        raise ValueError("The additional attempt was not the identical approved request")
    health_path = ROOT / "qa-artifacts/advanced-ocr/gemini-model-access.json"
    controls_path = ROOT / "qa-artifacts/advanced-ocr/gemini-synthetic-transports-v1/metadata.json"
    health = json.loads(health_path.read_text(encoding="utf-8"))
    controls = json.loads(controls_path.read_text(encoding="utf-8"))
    if health["http_status"] != 200 or controls["private_receipt_requests"] or len(controls["requests"]) != 2:
        raise ValueError("Non-private availability diagnostic scope changed")
    if any(run["requests"] != 1 or run["http_status"] != 503 or run["success"] for run in controls["requests"]):
        raise ValueError("This checkpoint describes two unavailable synthetic generation controls")
    evidence += [health_path, controls_path, ROOT / "qa-artifacts/advanced-ocr/gemini-synthetic-transports-v1/generateContent-response.json",
                 ROOT / "receipt_training/scripts/probe_gemini_transports.mjs"]
    for name in ["one-attempt-consumed.json", "one-additional-attempt-consumed.json"]:
        evidence.append(ROOT / "qa-artifacts/advanced-ocr/cloud-review" / name)
    evidence += [Path(__file__).resolve(), ROOT / "receipt_training/scripts/benchmark_approved_gemini.mjs"]
    report = {"scope": "Two separately authorized one-attempt requests for exactly the same two identifier-removed UK receipt crops",
              "model": "gemini-3.1-flash-lite", "attempts": attempts, "total_receipt_api_requests": 2,
              "identical_request_sha256": next(iter(request_hashes)), "successful_extractions": 0,
              "accuracy_metrics": None, "accuracy_conclusion": "No receipt draft was returned; these failures do not measure the model's receipt-reading accuracy",
              "billing_activated": False, "paid_fallback_used": False, "actual_account_billing_verified": False,
              "cost_scope": "Existing user-declared free quota only; no billing activation. No account invoice or charged cost was inspected.",
              "input_scope": "Visible item/discount/total crop plus VAT-table crop; merchant/date/currency can be absent after removing identifiers",
              "privacy_scope": "Crop hashes inspected before upload. store:false requests were used; this does not promise zero provider retention.",
              "additional_uploads_authorized": 0, "original_corpus_external_processing_permission_changed": False,
              "non_private_diagnostics": {"model_metadata_get_requests": 1, "model_metadata_http_status": 200,
                                          "synthetic_generation_requests": 2,
                                          "synthetic_outcomes": [{key: run.get(key) for key in ["transport", "http_status", "elapsed_ms", "success"]} for run in controls["requests"]]},
              "official_model_reference": "https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite",
              "official_interactions_reference": "https://ai.google.dev/gemini-api/docs/interactions-overview",
              "evidence_sha256": {path.relative_to(ROOT).as_posix(): digest(path) for path in sorted(set(evidence))}}
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "authorized_attempts": 2, "successful_extractions": 0}))


if __name__ == "__main__":
    main()
