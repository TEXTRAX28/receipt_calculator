"""Freeze the consumed six-case Veryfi screen and paired offline controls.

Reads only saved bytes. Never imports a provider transport or loads credentials.
"""
from collections import defaultdict
import json
from pathlib import Path
import sys

import build_printed_provider_checkpoint as audit
from review_veryfi_screening import exact_json, project, compare, sha

ROOT = audit.ROOT
FOLDER = ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-veryfi-screening-result-v1.json"
load, remember = audit.load, audit.remember


def chain(path):
    result = load(path)
    for name, digest in result["evidence_sha256"].items():
        remember(ROOT / name, digest)
    return result


def predictions(folder, runner):
    meta = load(folder / "metadata.json")
    if meta["model_requests"] or meta["external_requests"]:
        raise ValueError("Expected offline replay, without additional extraction")
    for name, digest in meta["source_sha256"].items():
        remember(folder / "source" / Path(name).name, digest)
    for name, digest in meta["loaded_frozen_module_sha256"].items():
        if digest != meta["source_sha256"][name]:
            raise ValueError("Loaded module differs from frozen snapshot")
    key = "runner_sha256" if runner == "runner.mjs" else "processor_sha256"
    remember(folder / runner, meta[key])
    path = remember(folder / "predictions.jsonl", meta["predictions_sha256"])
    rows = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]
    if len(rows) != meta["variants"]:
        raise ValueError("Replay variant count changed")
    return rows, meta


def geometry(record):
    """Observed provider field boxes; never fabricate OCR word/line geometry."""
    rows = record.get("line_items_with_scores")
    if not isinstance(rows, list) or len(rows) != len(record["line_items"]):
        raise ValueError("Scored/native row counts differ")
    counts = defaultdict(int)
    for native, scored in zip(record["line_items"], rows):
        for name in ("description", "quantity", "price", "total", "discount"):
            entry = scored.get(name)
            if not isinstance(entry, dict) or entry.get("value") != native.get(name):
                raise ValueError("Scored fields differ from literal native rows")
            box = entry.get("bounding_box")
            if not isinstance(box, list):
                continue
            counts[name + "_with_box"] += 1
            valid = (len(box) == 5 and box[0] == 0 and
                     all(0 <= n <= 1 for n in box[1:]) and box[1] <= box[3] and box[2] <= box[4])
            counts[name + "_valid_normalized_page0_box"] += int(valid)
    return dict(counts)


def main():
    if "--check" in sys.argv:
        result = chain(OUT)
        print(json.dumps({"verified_files": len(audit.EVIDENCE),
                          "processing_requests_at_checkpoint": result["live_execution"]["processing_requests"],
                          "new_external_requests": 0}))
        return
    if OUT.exists():
        raise ValueError("Preserve the checkpoint; use --check")
    chain(ROOT / "receipt_training/evaluation/advanced-provider-screening-preparation-v1.json")
    # That preparation report is historical. Current approval/consumption is
    # established by the saved live audit, never by changing the old plan.
    native_review = chain(FOLDER / "offline-native-review-v1/comparison.json")
    native_views = load(FOLDER / "offline-native-review-v1/native-fields.json")
    plan = load(FOLDER / "run/plan.json")
    summary = load(FOLDER / "run/summary.json")
    reference = remember(FOLDER / "screening-labels-v1.jsonl")
    labels = {r["receipt_id"]: r for r in map(json.loads, reference.read_text(encoding="utf-8").splitlines())}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    rows, text_meta = predictions(FOLDER / "ocr-text-app-v1", "runner.mjs")
    local, local_meta = predictions(FOLDER / "native-protocol-v1/offline-v1", "processor.mjs")
    # Tax-review adapter fix occurred after local inference/replay. Its replay
    # proves the additional required check changed no extracted money/fields.
    chain(ROOT / "receipt_training/evaluation/advanced-unknown-tax-review-v1.json")
    aggregate, per_case = defaultdict(lambda: defaultdict(int)), []
    native_aggregate = defaultdict(int)
    native_by_case = {r["case"]: r for r in native_review["cases"]}
    inputs = {}
    for case in plan["cases"]:
        name, receipt_id = case["case"], case["receipt_id"]
        metadata = load(FOLDER / "run" / name / "metadata.json")
        if [r for r in summary if r["case"] == name] != [{"case": name, **metadata}]:
            raise ValueError("Batch summary differs from the individual saved response metadata")
        record = exact_json(remember(FOLDER / "run" / name / "response.json").read_bytes())
        view = project(record)
        result = compare(labels[receipt_id], view, config)
        if view != native_views[name] or result != native_by_case[name]["metrics"]:
            raise ValueError("Saved native field review is not reproducible")
        native_aggregate["expected_priced_rows"] += result["expected_priced_rows"]
        native_aggregate["native_rows"] += result["native_rows"]
        native_aggregate["matched_reference_names"] += result["matched_reference_names"]
        native_aggregate["exact_normalized_descriptions"] += result["exact_normalized_descriptions"]
        for field, count in result["native_field_equality"].items():
            for key, value in count.items():
                native_aggregate[field + "_" + key] += value
        native_aggregate["correct_copied_final_totals"] += result["document_equality"]["total"] is True
        inputs[name] = {"response_sha256": sha((FOLDER / "run" / name / "response.json").read_bytes()),
                        "literal_ocr_text_sha256": view["literal_ocr_text_sha256"],
                        "currency_returned_by_provider": view["returned_currency_not_used_for_scoring"]}
        per_case.append({"case": name, "receipt_id": receipt_id, "native": result,
                         "native_scored_field_geometry": geometry(record)})
    seen = set()
    for prediction in local + rows:
        tag = prediction["method"] + "/" + prediction["mode"]
        key = (prediction["case"], tag)
        if key in seen:
            raise ValueError("Duplicate replay variant")
        seen.add(key)
        if prediction["trusted"] is not False:
            raise ValueError("Screening output cannot be source-verified financial truth")
        if prediction["method"] == "veryfi-ocr-text":
            for field, value in inputs[prediction["case"]].items():
                check = "provider_response_sha256" if field == "response_sha256" else field
                if field != "currency_returned_by_provider" and prediction[check] != value:
                    raise ValueError("Literal OCR replay provenance differs")
        score = audit.field_score(labels[prediction["receipt_id"]], prediction, config)
        total = aggregate[tag]
        for name in ("expected_purchases", "proposed_rows", "matched_purchase_names", "unmatched_proposed_rows", "exact_normalized_descriptions"):
            total[name] += score[name]
        for field, count in score["field_equality"].items():
            for name, value in count.items():
                total[field + "_" + name] += value
        for name, value in score["nonzero_coupons_on_matched_purchase"].items():
            total["nonzero_coupon_" + name] += value
        total["correct_copied_final_totals"] += score["document_equality"]["printedTotal"] is True
        total["research_acceptances"] += int(score["accepted_payable_result"])
        row = next(r for r in per_case if r["case"] == prediction["case"])
        row.setdefault("replays", {})[tag] = score
    if len(seen) != 48 or len(summary) != 6:
        raise ValueError("Expected 36 paired local plus twelve literal-OCR replays")
    for name in (Path(__file__), ROOT / "receipt_training/scripts/review_veryfi_screening.py",
                 ROOT / "receipt_training/scripts/test_review_veryfi_screening.py",
                 ROOT / "receipt_training/scripts/process_veryfi_screening_text.mjs",
                 ROOT / "qa-artifacts/veryfi-six-audit-unit-v1.log"):
        remember(name)
    result = {
        "scope": "Consumed six-case source-informed screen; 26 priced reference descriptions, 25 known line prices. Exact same prepared lossless PNGs for all three actual extractors. No new holdout, provider promotion or complete-financial-truth claim.",
        "live_execution": {"processing_requests": sum(r["processing_requests"] for r in summary),
                           "successful_extractions": sum(r["extraction_received"] for r in summary),
                           "deletion_requests": sum(r["deletion_requests"] for r in summary),
                           "provider_reported_deletion_successes": sum(r["deletion_status"] == "provider-reported-success" for r in summary),
                           "automatic_retries": sum(r["automatic_retries"] for r in summary),
                           "billing_activated": False, "free_quota_confirmed_by_user": True,
                           "actual_billing_verified": False,
                           "authorization_state": "Consumed; no further upload, retry or Gemini call authorized",
                           "elapsed_ms_including_network_and_cleanup": [r["elapsed_ms"] for r in summary],
                           "request_options": plan["extraction_options"],
                           "cleanup_limit": native_review["cleanup"]},
        "native_aggregate": dict(native_aggregate),
        "replay_aggregate": {key: dict(value) for key, value in aggregate.items()},
        "per_case": per_case, "provider_observations": inputs,
        "offline_replay": {"veryfi_text_variants": len(rows), "local_control_variants": len(local),
                           "new_model_requests": 0, "new_external_requests": 0,
                           "veryfi_loaded_frozen_modules": len(text_meta["loaded_frozen_module_sha256"]),
                           "local_loaded_frozen_modules": len(local_meta["loaded_frozen_module_sha256"]),
                           "context_scope": text_meta["context_scope"],
                           "source_geometry_limit": text_meta["source_mapping_limit"],
                           "local_adapter_checkpoint": "Local predictions precede b9627f2. The separate unknown-tax replay adds review checks with identical extracted values; it is preserved in the evidence chain."},
        "tests": {"new_synthetic_offline_audit_tests": 8, "previous_sealed_transport_and_batch_tests": 15,
                  "application_source_changed_by_this_screen": False},
        "observations": [
            "Native rows match 22/26 reference descriptions and 18/25 known line prices. Literal OCR plus the existing parser matches 22/26 descriptions and 16/25 prices automatically, or 22/25 prices with a predeclared currency applied after extraction.",
            "Local Qwen and independent hybrid each match 26/26 descriptions and 22/25 line prices. Equal aggregate price counts hide different failures: Veryfi text loses three known Tesco prices through parsing; Qwen has three invalid canonical dot-grouped restaurant prices.",
            "Native Taiwan currency is HKD although the source prints New Taiwan Dollar. It is not used as context or scoring currency. Native faint restaurant tax is 4.36 versus printed 4.364 (4364 IDR); no reference-based repair is applied.",
            "Bristol native rows misassociate prices and attach none of three known coupons. Literal OCR plus the parser recovers all nine purchase prices but only two coupon associations. Real repeated cashews are preserved; unmatched rows are not automatically false positives.",
            "The prepared Bristol crop cuts through the bottom total label; OCR returns OTAL(INCL VAT). This is an input limitation as well as a failed final-total recovery, not isolated evidence about an uncropped document.",
            "Scored native fields expose real normalized page boxes and confidence values, but native grouping errors remain. Literal combined OCR text does not itself provide full per-word geometry; no synthetic boxes/scores are supplied to the independent verifier.",
            "All paths remain research drafts. Copied final-total equality is distinct from calculated, source-verified financial reconciliation; no accepted payable receipt or complete-receipt accuracy is established.",
        ],
        "decision": {"default_reader_changed": False, "provider_integrated_in_public_app": False,
                     "why": "The wider screen does not show a reliable advantage over the current local vision reader. Preserve the optional research result and fix measured grouping/currency/tax failures before considering a deployment.",
                     "next_comparison": "Reprocess saved independent outputs locally to investigate complementary recovery without new cloud uploads. Preserve unreadable amounts, ambiguous negative deductions and unresolved tax basis."},
        "limits": [
            "Six source-informed crops are assistant-reviewed development evidence, not independent human truth or a fresh holdout. Original fifty labels, split membership and permission flags are unchanged.",
            "Unknown quantities/unit prices, the first Tesco reduced price and Taiwan deduction ownership remain unknown. Merchant/date absent from crops are not scored. Purchase precision, full adjustments and complete financial truth are unscorable.",
            "No private receipt or credential is stored in the tracked report. Private responses/crops and their hashes remain in ignored local artifacts; local reproducibility requires those exact bytes.",
            "Network-plus-cleanup timing is not comparable to warm local inference or fresh CLI model loading. No p95, provider speed ratio or billed cost is inferred from six calls.",
            "The original stable checkout and local default are preserved. Physical-phone capture, genuine digital receipts, deployment authentication/retention and the full production objective remain open.",
        ],
        "evidence_sha256": audit.EVIDENCE,
    }
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "verified_files": len(audit.EVIDENCE),
                      "veryfi_uploads_at_checkpoint": result["live_execution"]["processing_requests"],
                      "native_correct_line_prices": result["native_aggregate"]["total_correct"],
                      "replay_variants": len(seen), "new_external_requests": 0}))


if __name__ == "__main__":
    main()
