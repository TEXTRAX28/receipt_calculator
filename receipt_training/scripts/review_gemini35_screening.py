"""Offline native-field comparison of the six approved Gemini 3.5 Flash-Lite crops.

Uses the unchanged Azure/Veryfi matcher and reference. Never calls a provider,
loads credentials, repairs money, assigns coupons or drops failed cases.
"""
from collections import Counter
import base64
from datetime import datetime
import json
from pathlib import Path
import re
import sys

from review_veryfi_screening import compare, exact_json, sha

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "qa-artifacts/provider-review/gemini35-screen-v1"
PLAN_SHA = "4520ce9af8f63e9edcddd51f51967b4e51bf750f2dccabf3cc8fe41b8dc16f0b"
OUTPUT = ROOT / "receipt_training/evaluation/advanced-gemini35-screening-result-v1.json"
LABELS = "qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl"
CONFIG = "receipt_training/evaluation/config.json"
EVIDENCE = {}


def remember(path, expected=None):
    path = path.resolve()
    name = path.relative_to(ROOT).as_posix()
    if any(part.startswith(".env") for part in path.parts):
        raise ValueError("Credentials are never evidence")
    raw = path.read_bytes()
    digest = sha(raw)
    if expected is not None and digest != expected:
        archived = ROOT / "qa-artifacts/evidence-blobs" / expected
        if not re.fullmatch(r"[a-f0-9]{64}", expected) or not archived.is_file():
            raise ValueError("Evidence changed: " + name)
        raw = archived.read_bytes()
        digest = sha(raw)
        if digest != expected:
            raise ValueError("Archived evidence changed: " + name)
    EVIDENCE[name] = digest
    return raw


def load(path, expected=None):
    return json.loads(remember(path, expected))


def response_receipt(record):
    if record.get("status") != "completed":
        raise ValueError("Completed response required")
    if isinstance(record.get("steps"), list):
        parts = [part for step in record["steps"] if step.get("type") == "model_output"
                 for part in step.get("content", [])]
        text = "".join(part["text"] for part in parts if part.get("type") == "text")
    elif isinstance(record.get("output_text"), str):
        text = record["output_text"]
    else:
        text = "".join(part["text"] for part in record.get("outputs", []) if part.get("type") == "text")
    return exact_json(text.encode("utf-8"))


def project(record):
    def text(obj, key):
        value = obj.get(key)
        if not isinstance(value, str) or len(value) > 4000:
            raise ValueError("A bounded literal string is required: " + key)
        return value or None

    def number(obj, key):
        value = text(obj, key)
        if value is not None and not re.fullmatch(r"-?[0-9]{1,12}(?:[.][0-9]{1,6})?", value):
            raise ValueError("A literal decimal string is required: " + key)
        return value

    rows = record.get("items")
    if not isinstance(rows, list) or len(rows) > 300:
        raise ValueError("Bounded item array required")
    items = [{"row_index": i, "description": text(row, "description"),
              "quantity": number(row, "quantity"), "price": number(row, "unitPrice"),
              "total": number(row, "lineTotal"), "discount": number(row, "discount"),
              "tax_code": text(row, "taxCode")} for i, row in enumerate(rows)]
    return {"line_items": items,
            "document": {"subtotal": number(record, "subtotal"),
                         "total": number(record, "printedTotal"), "tax": number(record, "printedTax")},
            "returned_currency_not_used_for_scoring": text(record, "currency"),
            "native_adjustments_not_attached": record.get("adjustments", []),
            "prices_include_tax_returned": record.get("pricesIncludeTax")}


def empty_view():
    return {"line_items": [], "document": {"subtotal": None, "total": None, "tax": None},
            "returned_currency_not_used_for_scoring": None}


def aggregate(results):
    count = Counter()
    for row in results:
        count.update({key: row[key] for key in ("expected_priced_rows", "native_rows", "matched_reference_names", "exact_normalized_descriptions")})
        for field, values in row["native_field_equality"].items():
            count.update({field + "_" + key: value for key, value in values.items()})
        for field, value in row["document_equality"].items():
            if value is not None:
                count[field + "_document_known"] += 1
                count[field + "_document_correct"] += int(value)
    return dict(count)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUTPUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "new_external_requests": 0}))
        return
    if OUTPUT.exists():
        raise ValueError("Preserve the recorded report")
    plan = load(FOLDER / "plan.json", PLAN_SHA)
    prepared = load(FOLDER / "prepared.json")
    auth = load(FOLDER / "authorization.json")
    meta = load(FOLDER / "run/metadata.json")
    scope = load(FOLDER / "run/scope.json")
    assert auth["approved_by_user"] and auth["free_quota_confirmed_by_user"]
    assert auth["plan_sha256"] == prepared["proof"]["plan_sha256"] == PLAN_SHA
    assert meta["proof"] == scope["proof"] == prepared["proof"]
    assert auth["limits"] == scope["limits"] == plan["limits"]
    assert auth["model"] == meta["model"] == plan["model"] == "gemini-3.5-flash-lite"
    assert not meta["billing_activated"] and not meta["store"] and meta["retries"] == 0
    assert len(meta["cases"]) == len(plan["cases"]) == 6
    for name, expected in meta["proof"]["source_sha256"].items():
        remember(FOLDER / "source-before-run" / name, expected)

    prior = load(ROOT / "receipt_training/evaluation/advanced-azure-screening-result-v2.json")
    labels = {row["receipt_id"]: row for row in map(json.loads, remember(ROOT / LABELS, prior["evidence_sha256"][LABELS]).decode("utf-8").splitlines())}
    config = load(ROOT / CONFIG, prior["evidence_sha256"][CONFIG])
    # Prove this is the identical matcher used for the two native-provider arms.
    for name in ("score.py", "review_veryfi_screening.py"):
        frozen = ROOT / "qa-artifacts/provider-review/azure-screening-v1/offline-review-v3" / name
        expected = prior["evidence_sha256"][frozen.relative_to(ROOT).as_posix()]
        remember(frozen, expected)
        remember(Path(__file__).with_name(name), expected)

    cases, results, successes, times = [], [], [], []
    attempted, quota_stop, currency_correct = 0, False, 0
    previous_start = None
    for entry, result in zip(plan["cases"], meta["cases"], strict=True):
        case = entry["case"]
        assert result["case"] == case and result["receipt_id"] == entry["receipt_id"]
        assert result["image_sha256"] == auth["images"][case] == entry["sha256"]
        remember(ROOT / entry["image"], entry["sha256"])
        remember(ROOT / entry["source_png"], entry["source_png_sha256"])
        view, usage = empty_view(), None
        prefix = FOLDER / "run" / case
        if result["status"] == "not-attempted-after-auth-or-quota-failure":
            assert quota_stop and not Path(str(prefix) + "-attempt.json").exists()
        else:
            assert not quota_stop
            assert load(Path(str(prefix) + "-result.json")) == result
            attempt = load(Path(str(prefix) + "-attempt.json"))
            assert attempt["started_at"] == result["started_at"]
            request_bytes = remember(Path(str(prefix) + "-request.json"))
            assert request_bytes.endswith(b"\n") and sha(request_bytes[:-1]) == attempt["request_sha256"]
            request = json.loads(request_bytes)
            assert request["model"] == plan["model"] and request["store"] is False
            assert not request.get("tools") and not request.get("previous_interaction_id")
            images = [part for part in request["input"] if part["type"] == "image"]
            assert len(images) == 1 and images[0]["mime_type"] == "image/jpeg"
            assert sha(base64.b64decode(images[0]["data"], validate=True)) == entry["sha256"]
            start = datetime.fromisoformat(result["started_at"].replace("Z", "+00:00"))
            assert previous_start is None or (start - previous_start).total_seconds() >= 31
            previous_start = start
            attempted += 1
            times.append(result["elapsed_ms"])
            quota_stop = result.get("http_status") in (401, 403, 429)
            if result.get("response_sha256"):
                raw = exact_json(remember(Path(str(prefix) + "-response.json"), result["response_sha256"]))
                usage = raw.get("usage")
            if result["status"] == "strict-schema-passed":
                assert result["http_status"] == 200 and result.get("response_sha256")
                receipt = load(Path(str(prefix) + "-receipt.json"))
                assert receipt == response_receipt(raw), "Stored draft must be the literal model output"
                view = project(receipt)
            else:
                assert result["status"] == "failed-no-retry"
                assert not Path(str(prefix) + "-receipt.json").exists()
        label = labels[entry["receipt_id"]]
        score = compare(label, view, config)
        results.append(score)
        if result["status"] == "strict-schema-passed":
            successes.append(score)
        currency_correct += view["returned_currency_not_used_for_scoring"] == label["currency"]["value"]
        cases.append({"case": case, "receipt_id": entry["receipt_id"], "status": result["status"],
                      "http_status": result.get("http_status"), "elapsed_ms": result.get("elapsed_ms"),
                      "error": result.get("error"), "metrics": score,
                      "returned_currency": view["returned_currency_not_used_for_scoring"],
                      "reference_currency": label["currency"]["value"], "provider_reported_usage": usage})
    assert attempted == meta["private_generation_requests"] <= 6
    assert len(list((FOLDER / "run").glob("*-attempt.json"))) == attempted
    remember(Path(__file__))
    remember(Path(__file__).with_name("test_review_gemini35_screening.py"))
    test_log = remember(ROOT / "qa-artifacts/gemini35-offline-validation-v1/tests.log").decode("utf-8")
    assert "Ran 5 tests" in test_log and "\nOK" in test_log and "FAILED" not in test_log
    report = {"scope": "Six previously reviewed development crops. Gemini JPEG quality 98 versus Azure/Veryfi PNG; same framing and reference, not pixel-identical provider inputs or blind complete-receipt truth.",
              "live_execution": {"requests": attempted, "successful_extractions": len(successes), "planned_cases": 6,
                                 "retries": 0, "billing_activation": False, "free_quota_confirmed_by_user": True,
                                 "actual_billing_verified": False, "authorization_consumed": True},
              "prior_native_aggregate": prior["native_aggregate"],
              "gemini_all_planned_case_field_coverage": aggregate(results),
              "gemini_successful_cases_only_accuracy": aggregate(successes) if successes else None,
              "accuracy_conclusion": "No receipt draft returned; receipt-reading accuracy remains unmeasured." if not successes else "Conditional field accuracy on returned drafts only; all-case coverage also reports failures.",
              "gemini_currency_correct": {"correct": currency_correct, "known": 6},
              "request_latency_ms": {"samples": times, "mean": sum(times) / len(times) if times else None,
                                     "scope": "Network and parsing; failures included. Six cases do not establish a production p95 or a like-for-like local-inference speed ranking."},
              "per_case": cases, "new_external_requests_by_analysis": 0,
              "offline_projection_tests_passed": 5,
              "decision": {"change_default_reader": False, "complete_receipt_accuracy": None,
                           "accepted_payable_results": 0},
              "limits": ["All planned cases remain in the denominator; failed/unattempted cases have no extracted fields. Separate successful-only counts are conditional.",
                         "Native amount equality uses the reference currency; incorrect model currency is scored separately and never silently fixed.",
                         "Missing amounts stay missing; no arithmetic repair, inferred coupon attachment or deduplication. Unknown reference fields are excluded.",
                         "A schema-valid draft or copied total does not prove a correct payable receipt. Merchant/date may be removed from crops; no whole-document or new holdout claim.",
                         "store:false does not guarantee zero provider retention. No billing console or invoice was inspected."],
              "evidence_sha256": EVIDENCE}
    with OUTPUT.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(json.dumps(report, ensure_ascii=False, indent=2, default=str) + "\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "requests": attempted,
                      "successful_extractions": len(successes), "aggregate": aggregate(results), "new_external_requests": 0}))


if __name__ == "__main__":
    main()
