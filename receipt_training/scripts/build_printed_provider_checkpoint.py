"""Offline, immutable audit of the raw-print pilot and approved Veryfi response."""
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path
import re
import sys

from score import description, match_items, minor

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-printed-provider-checkpoint-v1.json"
QA = ROOT / "qa-artifacts"
EVIDENCE = {}


def remember(path, expected=None):
    path = path.resolve()
    name = path.relative_to(ROOT).as_posix()
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if expected is not None and actual != expected:
        raise ValueError("Evidence changed: " + name)
    EVIDENCE[name] = actual
    return path


def load(path, expected=None):
    return json.loads(remember(path, expected).read_text(encoding="utf-8"))


def exact_object(raw):
    def pairs(entries):
        value = {}
        for key, item in entries:
            if key in value:
                raise ValueError("Duplicate JSON member")
            value[key] = item
        return value
    return json.loads(raw, object_pairs_hook=pairs, parse_float=Decimal)


def field_score(label, prediction, config):
    receipt, calculation = prediction["receipt"], prediction["calculation"]
    expected, actual = label["items"], receipt["items"]
    pairs = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
    currency = label["currency"]["value"]
    fields, nonzero = {}, {"known": 0, "correct": 0}
    for key, native in (("quantity", "quantity"), ("unit_price", "unitPrice"),
                        ("line_total", "lineTotal"), ("discount", "discount"),
                        ("tax_code", "taxCode")):
        correct, known = 0, 0
        for i, row in enumerate(expected):
            truth = row[key]["value"]
            if truth is None:
                continue
            value = actual[pairs[i]].get(native) if i in pairs else None
            if key == "tax_code":
                equal = value == truth
            elif key == "quantity":
                try:
                    equal = value is not None and Decimal(value) == Decimal(truth)
                except (InvalidOperation, TypeError):
                    equal = False
            else:
                target = minor(truth, currency, config)
                if target is None:
                    continue
                amount = minor(value, currency, config)
                equal = amount is not None and amount == (abs(target) if key == "discount" else target)
                if key == "discount" and target:
                    nonzero["known"] += 1
                    nonzero["correct"] += int(equal)
            known += 1
            correct += int(equal)
        fields[native] = {"correct": correct, "known": known}
    document = {}
    for key, native in (("subtotal", "subtotal"), ("tax", "printedTax"), ("grand_total", "printedTotal")):
        target = minor(label[key]["value"], currency, config)
        amount = minor(receipt.get(native), currency, config)
        document[native] = None if target is None else amount is not None and amount == target
    return {
        "expected_purchases": len(expected), "proposed_rows": len(actual),
        "matched_purchase_names": len(pairs),
        "unmatched_proposed_rows": len(actual) - len(pairs),
        "exact_normalized_descriptions": sum(description(expected[i]["description"]["value"]) == description(actual[j]["description"]) for i, j in pairs.items()),
        "field_equality": fields, "nonzero_coupons_on_matched_purchase": nonzero,
        "document_equality": document,
        "calculated_total_minor": calculation["total"],
        "printed_total_minor": calculation["printed"],
        "discrepancy_minor": calculation["discrepancy"],
        "blocking_issues": len(calculation["issues"]),
        "accepted_payable_result": False,
        "complete_receipt_accuracy": None,
    }


def postprocessed(folder, subfolder="postprocess"):
    meta = load(folder / subfolder / "metadata.json")
    for name, digest in meta["source_sha256"].items():
        remember(folder / subfolder / "source" / name, digest)
    return load(folder / subfolder / "result.json", meta["result_sha256"]), meta


def native(folder, request_sha, harness_sha):
    meta = load(folder / "metadata.json")
    if (meta["exit_code"] or not meta["parsed_json"] or meta.get("error")
            or meta["external_api_requests"] or meta["external_receipt_uploads"]
            or meta["label_files_read"] or meta["input_ocr_text"]):
        raise ValueError("Incomplete or out-of-scope native run")
    for name, digest in (("request.json", request_sha), ("harness.py", harness_sha),
                         ("stdout.txt", meta["stdout_sha256"]), ("stderr.txt", meta["stderr_sha256"]),
                         ("model-manifest.json", meta["manifest_sha256"])):
        remember(folder / name, digest)
    if meta["request_sha256"] != request_sha or meta["harness_sha256"] != harness_sha:
        raise ValueError("Native metadata does not match the sealed request")
    for item in meta["images"]:
        remember(ROOT / item["path"], item["sha256"])
    response = exact_object(re.sub(r"\x1b\[[0-9;]*m", "", (folder / "stdout.txt").read_text(encoding="utf-8")).strip())
    parsed = exact_object(remember(folder / "model-output.json").read_text(encoding="utf-8"))
    if response != parsed:
        raise ValueError("Parsed native output differs from complete stdout JSON")
    return meta


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            remember(ROOT / name, digest)
        print(json.dumps({"verified_files": len(EVIDENCE), "scope": "raw-print pilot and one-use Veryfi checkpoint"}))
        return
    if OUT.exists():
        raise ValueError("Preserve this checkpoint; use --check")
    config = load(ROOT / "receipt_training/evaluation/config.json")
    labels = {}
    for name in ("receipt_training/annotations/labels.jsonl", "receipt_training/annotations/private/supplement-labels.jsonl"):
        for line in remember(ROOT / name).read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            labels[row["receipt_id"]] = row
    plan = load(QA / "advanced-ocr/qwen-raw-printed-v1.json")
    remember(QA / "advanced-ocr/qwen-raw-printed-v1-requests/profile.mjs", plan["profile_sha256"])
    remember(QA / "advanced-ocr/qwen-raw-printed-v1-requests/builder.mjs", plan["builder_sha256"])
    cases = []
    for case in plan["pilot"]:
        methods, metas = {}, {}
        for mode in ("control", "raw"):
            folder = QA / ("advanced-ocr/qwen-raw-printed-v1-" + mode + "-" + case["id"])
            digest = case["fresh_control_request_sha256"] if mode == "control" else case["request_sha256"]
            meta = native(folder, digest, plan["harness_sha256"])
            data, post = postprocessed(folder)
            remember(folder / "metadata.json", post["native_metadata_sha256"])
            remember(folder / "model-output.json", post["native_model_output_sha256"])
            methods[mode] = {**field_score(labels[case["id"]], data, config),
                             "normalization_issues": len(data["normalization_issues"]),
                             "elapsed_ms": meta["elapsed_ms"],
                             "peak_process_working_set_bytes": meta["peak_process_working_set_bytes"]}
            metas[mode] = meta
        for key in ("images", "model", "revision", "runtime", "cli_sha256", "manifest_sha256", "harness_sha256", "decoder_schema_enforced", "json_adapter_sha256", "deadline_seconds", "require_clean_schema"):
            if metas["control"][key] != metas["raw"][key]:
                raise ValueError("Unpaired native setting: " + key)
        # The archived canonical request omits two booleans; the sealed harness
        # defaults them to True/False. The raw request spells those defaults out.
        effective = {}
        for mode, meta in metas.items():
            settings = dict(meta["settings"])
            for key, default in (("constrain_schema", True), ("normalize_numeric_json", False)):
                if settings[key] is None:
                    settings[key] = default
            effective[mode] = settings
        if effective["control"] != effective["raw"]:
            raise ValueError("Unpaired effective native settings")
        cases.append({"receipt_id": case["id"], "methods": methods,
                      "identical_pixels_and_effective_runtime_settings": True,
                      "literal_settings": {mode: meta["settings"] for mode, meta in metas.items()},
                      "omitted_control_booleans_use_verified_harness_defaults": True})
    synthetic = QA / "advanced-ocr/qwen-raw-printed-v1-synthetic"
    native(synthetic, plan["synthetic_request_sha256"], plan["harness_sha256"])
    synthetic_result, _ = postprocessed(synthetic, "postprocess-v2")
    veryfi = QA / "provider-review/veryfi-uk-v1"
    comparison = load(veryfi / "offline-field-review-v1/comparison.json")
    for name, digest in comparison["evidence_sha256"].items():
        remember(ROOT / name, digest)
    load(veryfi / "offline-field-review-v1/native-fields.json")
    response = exact_object(remember(veryfi / "run/response.json").read_text(encoding="utf-8"))
    provider_meta = load(veryfi / "run/metadata.json")
    remember(veryfi / "receipt.zip", provider_meta["archive_sha256"])
    permit = load(veryfi / "run/authorization.json")
    consumed = load(veryfi / "consumed.json")
    if (not permit["free_quota_confirmed"] or not permit["approved_by_user"]
            or consumed["external_id"] != provider_meta["external_id"]
            or provider_meta["processing_requests"] != 1 or provider_meta["deletion_requests"] != 1
            or provider_meta["deletion_status"] != "provider-reported-success"):
        raise ValueError("Veryfi request scope or cleanup differs from this checkpoint")
    text_result, text_meta = postprocessed(veryfi, "ocr-text-review-v1")
    remember(veryfi / "run/response.json", text_meta["provider_response_sha256"])
    text_score = field_score(labels["supplement-user-uk-20261026-group"], text_result, config)
    # These four row classifications were checked against the two actual source crops.
    coupon_rows = [(4, "689652", "-2.00"), (7, "690532", "-1.60"),
                   (12, "690341", "-1.80"), (21, "688580", "-1.50")]
    for index, sku, amount in coupon_rows:
        row = response["line_items"][index]
        if row["sku"] != sku or Decimal(str(row["total"])) != Decimal(amount):
            raise ValueError("Reviewed separate coupon row changed")
    gemini = load(ROOT / "receipt_training/evaluation/advanced-approved-gemini.json")
    for name, digest in gemini["evidence_sha256"].items():
        remember(ROOT / name, digest)
    local = load(ROOT / "receipt_training/evaluation/advanced-headerless-coupon-recovery.json")
    # Keep the older local checkpoint's evidence and current result distinct.
    for name, digest in local["evidence_sha256"].items():
        remember(ROOT / name, digest)
    for name in ("raw-printed-veryfi-unit-v1.log", "veryfi-live-transport-unit-v1.log", "veryfi-live-review-unit-v1.log", "raw-printed-veryfi-typecheck-v1.log"):
        remember(QA / name)
    if not re.search(r"Tests\s+364 passed", (QA / "raw-printed-veryfi-unit-v1.log").read_text(encoding="utf-8")):
        raise ValueError("The recorded application tests did not pass")
    if "pass 9" not in (QA / "veryfi-live-transport-unit-v1.log").read_text(encoding="utf-8"):
        raise ValueError("The recorded transport tests did not pass")
    if "Ran 10 tests" not in (QA / "veryfi-live-review-unit-v1.log").read_text(encoding="utf-8"):
        raise ValueError("The recorded offline review tests did not pass")
    for name in (Path(__file__), ROOT / "tests/raw-printed-profile.test.ts", ROOT / "receipt_training/scripts/process_printed_pilot.mjs", ROOT / "receipt_training/scripts/process_veryfi_text.mjs"):
        remember(name)
    report = {
        "scope": "Three source-informed development transactions for the raw-print pilot, and one approved redacted UK transaction for Veryfi. No blind holdout, production migration or general accuracy claim.",
        "raw_printed_pilot": {
            "decision": "Not selected for application integration or a wider v1 cohort; retained as a failed research profile.",
            "actual_native_calls": 7, "paired_cases": cases,
            "synthetic": {"two_prices_and_total_correct": synthetic_result["calculation"]["total"] == "350", "unsupported_inferred_printed_item_count": 2, "accepted": False},
            "source_review": [
                "train-004: grouping normalization recovers 43636 and 4364, but final total is wrongly copied from subtotal; GRAND TOTAL, cash and change also become tips, although cash/change are separately listed as payments.",
                "train-003: all three line prices and document amounts are copied, but the raw profile has unknown tax inclusion and the app's current default omits added tax from calculation. The control balances using a Tax fee, not a correct tax classification. Neither is accepted.",
                "UK: raw line totals include A/Z suffixes, so all 22 raw line totals are rejected. Coupons remain purchase rows; Savings, coupon count 4 and future Executive Reward are wrongly made discounts. PricesIncludeTax is incorrectly true.",
                "Both CORD cases infer a printed item count absent from the source. train-003 also supplies unit prices that are not separately printed; its unknown unit-price labels are excluded from accuracy counts.",
                "The v1 prompt has no explicit overlapping-photo deduplication clause. No prompt or sealed request was changed after observing pilot outcomes.",
            ],
            "timing_limit": "Fresh model load/encoding/generation, not whole-app latency. Sequential controls first, cache/order and host-load effects; typechecking overlapped part of UK control. No speed gain or p95 claim.",
        },
        "veryfi": {
            "request": {key: provider_meta.get(key) for key in ("processing_requests", "processing_http_status", "deletion_requests", "deletion_http_status", "deletion_status", "elapsed_ms", "billing_activated", "actual_billing_verified")},
            "native_structured_fields": comparison["metrics"],
            "source_review": {
                "standalone_coupon_amounts_correct": 4,
                "coupon_row_indices": [item[0] for item in coupon_rows],
                "coupons_attached_to_purchase": 0,
                "structured_tax_codes_present": 0,
                "tax_codes_survive_in_ocr_text": True,
                "first_rows": "Tuna description uses SPAM's SKU and 14.99 price; eggs uses tuna's SKU and 9.99 price; a nameless row retains eggs' SKU and 9.99. SPAM description is returned last without price. Matching all 18 names is not correct purchase grouping.",
            },
            "literal_ocr_text_plus_existing_parser": text_score,
            "ocr_path": "No edits, currency hints, native money fields, new inference, coupon repair or balancing. Literal returned ocr_text passed to the unchanged current parser and exact calculator; all 18 purchase quantities/prices/discounts/codes and three document amounts match the pre-existing source-checked label.",
            "decision": "Promising OCR text on this single redacted development receipt; native structured fields are not suitable to accept directly. No provider selected, app integration or additional upload authorized.",
            "privacy_cost": "User confirmed unused Free quota. One POST and one scoped cleanup DELETE, no retries/billing activation. Actual billing not inspected. Provider-reported deletion does not establish zero retention or training exclusion.",
            "timing_limit": comparison["timing_scope"],
        },
        "same_crop_comparators": {
            "local_paddle_qwen_after_prior_fix": local["redacted_diagnostic"]["after"],
            "local_comparator_scope": "Same two exact crop bytes, previously measured inference and later deterministic verifier replay; not fresh paired latency or the different full-photo raw-profile experiment.",
            "gemini": {"attempts": gemini["attempts"], "successful_extractions": 0, "accuracy": None, "reason": "Both separately approved attempts returned HTTP 503; no reading exists to rank against Veryfi."},
        },
        "verification": {"application_unit_tests": 364, "transport_tests": 9, "offline_review_tests": 10, "typecheck_passed": True, "application_sources_changed": False, "browser_tests_rerun_this_checkpoint": False},
        "limits": ["CORD labels are upstream semantic references, not full new human financial truth. UK labels were source checked by the assistant, not independently verified.", "All research drafts remain untrusted with an explicit source-coverage check; a balanced total is not an automatic acceptance.", "Original 50, stable branch and original dirty checkout are unchanged. Earlier 13 missing historical QA bytes remain disclosed in the separate integrity checkpoint.", "Full twelve-phase production goal remains open. Representative provider comparison, capture improvements and public deployment controls are outstanding."],
        "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "verified_files": len(EVIDENCE), "veryfi_ocr_rows": text_score["proposed_rows"], "raw_profile_promoted": False}))


if __name__ == "__main__":
    main()
