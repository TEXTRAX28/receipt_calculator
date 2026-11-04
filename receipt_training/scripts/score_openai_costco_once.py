"""Audit the consumed one-shot response locally; never loads keys or makes requests."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import argparse
import hashlib
import json
from pathlib import Path

from score import description, match_items, minor

ROOT = Path(__file__).resolve().parents[2]
OLD = Path(r"C:\Users\natan\.codex\worktrees\receipt-ocr-baseline\costco_calc")
JOB = ROOT / "qa-artifacts/provider-review/openai-costco-current-v3"
OUT = ROOT / "receipt_training/evaluation/advanced-openai-costco-once-v1.json"
REFERENCE = "qa-artifacts/rapidocr-costco-v4/references.jsonl"
REFERENCE_SHA = "888ae691ad428b9afb0d0bac2ba38c196886298f0ba0b6c655cf1bd18b594b28"
EVIDENCE = {}


def read(path, expected=None):
    path = path.resolve()
    assert not path.name.startswith(".env")
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if expected is not None:
        assert digest == expected, str(path)
    key = (path.relative_to(ROOT).as_posix() if path.is_relative_to(ROOT)
           else "OLD/" + path.relative_to(OLD).as_posix())
    EVIDENCE[key] = digest
    return data


def load(path, expected=None):
    return json.loads(read(path, expected))


def raw_score(reference, draft, config):
    expected, actual = reference["items"], draft["items"]
    pairs = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
    fields, coupons = {}, {"known": 0, "correct": 0}
    for source, target in [("quantity", "quantity"), ("unit_price", "unitPrice"),
                           ("line_total", "lineTotal"), ("discount", "discount"),
                           ("tax_code", "taxCode")]:
        known = correct = 0
        for i, item in enumerate(expected):
            truth = item[source]["value"]
            if truth is None:
                continue
            value = actual[pairs[i]].get(target) if i in pairs else None
            if source == "tax_code":
                equal = truth == value
            elif source == "quantity":
                try:
                    equal = Decimal(truth) == Decimal(value)
                except (InvalidOperation, TypeError):
                    equal = False
            else:
                a, b = minor(value, "GBP", config), minor(truth, "GBP", config)
                equal = a is not None and b is not None and a == (abs(b) if source == "discount" else b)
                if source == "discount" and b:
                    coupons["known"] += 1
                    coupons["correct"] += int(equal)
            known += 1
            correct += int(equal)
        fields[target] = {"correct": correct, "known": known}
    document = {}
    for key, target in [("subtotal", "subtotal"), ("tax", "printedTax"), ("grand_total", "printedTotal")]:
        truth = reference[key]["value"]
        document[target] = truth is not None and minor(draft[target], "GBP", config) == minor(truth, "GBP", config)
    return {
        "expected_purchases": len(expected), "proposed_rows": len(actual),
        "matched_purchases": len(pairs), "unmatched_proposed_rows": len(actual) - len(pairs),
        "exact_normalized_descriptions": sum(description(expected[i]["description"]["value"]) == description(actual[j]["description"]) for i, j in pairs.items()),
        "field_equality": fields, "nonzero_coupons_on_matched_purchase": coupons,
        "document_equality": document, "raw_tax_codes": draft["taxCodes"],
        "raw_currency": draft["currency"], "prices_include_tax": draft["pricesIncludeTax"],
        "complete_receipt_accuracy": None,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        report = json.loads(OUT.read_bytes())
        for name, digest in report["evidence_sha256"].items():
            path = OLD / name[4:] if name.startswith("OLD/") else ROOT / name
            if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
                path = ROOT / "qa-artifacts/evidence-blobs" / digest
            assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, name
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "new_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the existing report"
    reference = next(row for row in map(json.loads, read(ROOT / REFERENCE, REFERENCE_SHA).decode().splitlines())
                     if row["receipt_id"] == "user-costco-uk-20261026")
    assert reference["verification"]["checked_against_source"]
    assert not reference["verification"]["independent_human_verification"]
    config = load(ROOT / "receipt_training/evaluation/config.json", "2a3d8c8cb39cb25473d483b49e936c182ce513188bedb93ddf5ccf1bd710370a")
    plan = load(JOB / "plan.json", "214a9cf0d5b852e4efafa3af555d0e92d35b014a0d003dd9630326579e7c4252")
    read(JOB / "request.json", "68506e9a957785c6c13d8c722767f57cb665d9ad39afa64ef9321dc369ca0677")
    approval = load(JOB / "approval.json")
    attempt = load(JOB / "attempt.json")
    result = load(JOB / "result.json")
    draft = load(JOB / "draft.json")
    raw_response = load(JOB / "response.txt")
    load(JOB / "authorization-context.json")
    load(JOB / "canonical-validation.json")
    control = load(ROOT / "qa-artifacts/partial-free-order-fix-v1/openai-approved-costco-v3-live-v1-controller.json")
    assert approval["approved"] and approval["posts"] == attempt["posts_max"] == result["provider_posts"] == 1
    assert approval["retries"] == attempt["retries"] == result["retries"] == 0
    assert result["terminal"] == "completed" and result["accepted_draft"] and result["http_status"] == 200
    assert result["returned_model"] == "gpt-6-astra" and not result["billing_charge_verified"]
    assert control["exit_code"] == 0 and control["stop"] is None and control["source_unchanged"]
    assert control["source_sha256"] == plan["source_sha256"]
    for name, digest in plan["source_sha256"].items():
        read(ROOT / name, digest)
    # Frozen historical Gemini response: identical two source crops, no new inference.
    comparison = load(ROOT / "qa-artifacts/gemini-percent-rate-v1/plan-v2.json")
    gemini = load(Path(comparison["response_path"]), comparison["response_sha256"])
    parts = [part for step in gemini["steps"] if step["type"] == "model_output"
             for part in step.get("content", []) if part["type"] == "text"]
    gemini_draft = json.loads("".join(part["text"] for part in parts))
    for image in comparison["images"]:
        read(Path(image["absolute_path"]), image["sha256"])
    assert [image["sha256"] for image in comparison["images"]] == [
        "1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68",
        "adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b"]
    openai_score, gemini_score = [raw_score(reference, value, config) for value in (draft, gemini_draft)]
    # Arithmetic audit uses returned values only, with printed code-group rounding.
    group_net = {entry["code"]: Decimal(0) for entry in draft["taxCodes"]}
    for item in draft["items"]:
        assert Decimal(item["quantity"]) * Decimal(item["unitPrice"]) == Decimal(item["lineTotal"])
        group_net[item["taxCode"]] += Decimal(item["lineTotal"]) - Decimal(item["discount"])
    tax = sum((group_net[entry["code"]] * Decimal(entry["rate"]) / 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
              for entry in draft["taxCodes"])
    net = sum(group_net.values())
    assert net == Decimal(draft["subtotal"]) and tax == Decimal(draft["printedTax"])
    assert net + tax == Decimal(draft["printedTotal"])
    usage = result["usage"]
    standard = (Decimal(usage["input_tokens"]) * 10 + Decimal(usage["output_tokens"]) * 50) / 1_000_000
    cache_write = (Decimal(usage["input_tokens"]) * Decimal("12.5") + Decimal(usage["output_tokens"]) * 50) / 1_000_000
    read(Path(__file__))
    report = {
        "scope": "One familiar two-crop receipt; raw response audit, not an enabled app provider or representative model selection",
        "receipt_id": reference["receipt_id"], "reference_verification": reference["verification"],
        "openai": {"result": result, "score": openai_score,
                   "arithmetic": {"net_by_code": {k: str(v) for k, v in group_net.items()}, "net": str(net), "tax": str(tax), "gross": str(net + tax), "printed_code_group_rounding": True, "currency_assumed_for_arithmetic": False},
                   "usage_cost_estimate_usd": str(standard), "all_input_cache_write_sensitivity_usd": str(cache_write),
                   "billing_charge_verified": False, "price_source": "https://developers.openai.com/api/docs/models/gpt-6-astra", "price_checked_date": "2026-11-04",
                   "response_status": raw_response["status"], "service_tier": raw_response.get("service_tier"),
                   "controller_elapsed_ms": control["elapsed_ms"], "minimum_available_ram": control["minimum_available_ram"]},
        "historical_gemini_same_crops": {"model": "gemini-3.5-flash-lite", "score": gemini_score, "new_requests": 0},
        "limitations": ["Assistant source-reviewed partial reference, not independent human verification or held-out data.",
                        "Currency was not recovered by OpenAI: the VAT crop retains a clipped pound symbol on Savings; GBP remains a manual context decision.",
                        "Merchant and date outside the crops remain empty; no complete-receipt accuracy claim.",
                        "Historical provider-specific configurations and schemas differ; identical source images alone do not isolate model quality.",
                        "A raw arithmetic match is not proof of safe app integration, human review or public readiness.",
                        "No new browser workflow, full overlapping original-photo scan or physical phone test.",
                        "One latency is not a p95; cost is token-based estimation, not an inspected account charge.",
                        "OpenAI stays an operator-run last resort; approval is consumed and authorizes no further request."],
        "new_requests_by_scorer": 0, "live_approval_consumed": True,
        "full_goal_complete": False, "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, indent=2) + "\n")
    print(json.dumps({"openai": openai_score, "gemini": gemini_score, "estimated_usd": str(standard)}))


if __name__ == "__main__":
    main()
