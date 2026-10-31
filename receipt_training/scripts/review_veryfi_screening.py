"""Offline exact field audit of the approved six-case Veryfi screen.

Handles confidence-wrapped document fields without treating scores, nulls or
unknown reference values as financial evidence. No API/key/inference access.
"""
import argparse
import base64
from decimal import Decimal, InvalidOperation
import hashlib
import json
from pathlib import Path

from score import description, match_items, minor

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
EVIDENCE = {}


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def remember(path, expected=None):
    name = path.resolve().relative_to(ROOT).as_posix()
    raw = path.read_bytes()
    digest = sha(raw)
    if expected is not None and expected != digest:
        raise ValueError("Evidence changed: " + name)
    EVIDENCE[name] = digest
    return raw


def exact_json(raw):
    if len(raw) > 2_000_000:
        raise ValueError("Response bound exceeded")

    def number(token):
        value = Decimal(token)
        if len(token) > 64 or abs(value.as_tuple().exponent) > 300:
            raise ValueError("Unbounded numeric token")
        return value

    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result:
                raise ValueError("Duplicate JSON member")
            result[key] = value
        return result

    def constant(_):
        raise ValueError("Non-finite JSON value")

    value = json.loads(raw.decode("utf-8", errors="strict"), parse_int=number,
                       parse_float=number, object_pairs_hook=pairs, parse_constant=constant)
    if not isinstance(value, dict):
        raise ValueError("Expected response object")
    return value


def project(record):
    issues = []

    def value(obj, key, path):
        result = obj.get(key)
        if isinstance(result, dict):
            if "value" not in result:
                issues.append(path + "." + key + ": missing wrapped value")
                return None
            result = result["value"]
        return result

    def numeric(obj, key, path):
        result = value(obj, key, path)
        if result is None:
            return None
        if not isinstance(result, Decimal) or result.adjusted() > 18 or abs(result.as_tuple().exponent) > 12:
            issues.append(path + "." + key + ": invalid financial number")
            return None
        return format(result, "f")

    def text(obj, key, path):
        result = value(obj, key, path)
        if result is None:
            return None
        if not isinstance(result, str) or len(result) > 4000:
            issues.append(path + "." + key + ": invalid text")
            return None
        return result

    rows = record.get("line_items")
    if not isinstance(rows, list) or len(rows) > 2000:
        raise ValueError("Missing/bounded line items required")
    projected = []
    for index, row in enumerate(rows):
        path = f"line_items[{index}]"
        if not isinstance(row, dict):
            issues.append(path + ": expected object")
            row = {}
        projected.append({"row_index": index,
                          **{key: text(row, key, path) for key in ("description", "full_description", "sku", "tax_code", "text")},
                          **{key: numeric(row, key, path) for key in ("quantity", "price", "total", "gross_total", "net_total", "discount", "discount_price", "tax", "tax_rate")}})
    ocr = record.get("ocr_text")
    if not isinstance(ocr, str) or len(ocr) > 60000:
        raise ValueError("Missing/bounded literal OCR text required")
    return {"line_items": projected,
            "document": {key: numeric(record, key, "document") for key in ("subtotal", "total", "tax", "discount", "tip")},
            "returned_currency_not_used_for_scoring": text(record, "currency_code", "document"),
            "document_geometry_fields": [key for key in ("subtotal", "total", "tax", "discount") if isinstance(record.get(key), dict) and "bounding_box" in record[key]],
            "literal_ocr_text_sha256": sha(ocr.encode("utf-8")), "native_field_issues": issues}


def compare(label, view, config):
    expected, actual = label["items"], view["line_items"]
    currency = label["currency"]["value"]
    pairs = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
    counts, reviews = {}, []
    for i, item in enumerate(expected):
        row = actual[pairs[i]] if i in pairs else {}
        equalities = {}
        for key, native in (("quantity", "quantity"), ("unit_price", "price"), ("line_total", "total"),
                            ("discount", "discount"), ("tax_code", "tax_code")):
            truth, value = item[key]["value"], row.get(native)
            if truth is None:
                equalities[native] = None
                continue
            if key == "quantity":
                try:
                    same = value is not None and Decimal(truth) == Decimal(value)
                except (InvalidOperation, TypeError):
                    same = False
            elif key == "tax_code":
                same = value == truth
            else:
                target, amount = minor(truth, currency, config), minor(value, currency, config)
                if target is None:
                    equalities[native] = None
                    continue
                same = amount is not None and (amount == abs(target) if key == "discount" else amount == target)
            equalities[native] = same
            count = counts.setdefault(native, {"correct": 0, "known": 0})
            count["known"] += 1
            count["correct"] += int(same)
        reviews.append({"reference_item": item["id"], "native_row_index": row.get("row_index"), "field_equality": equalities})
    document = {}
    for key, native in (("subtotal", "subtotal"), ("tax", "tax"), ("grand_total", "total")):
        target = minor(label[key]["value"], currency, config)
        amount = minor(view["document"][native], currency, config)
        document[native] = None if target is None else amount is not None and amount == target
    return {"expected_priced_rows": len(expected), "native_rows": len(actual),
            "matched_reference_names": len(pairs),
            "exact_normalized_descriptions": sum(description(expected[i]["description"]["value"]) == description(actual[j].get("description")) for i, j in pairs.items()),
            "native_field_equality": counts, "document_equality": document,
            "unmatched_native_row_indices": [i for i in range(len(actual)) if i not in pairs.values()],
            "pair_review": reviews, "purchase_precision": None,
            "calculated_payable_total": None, "accepted_payable_result": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", default="offline-native-review-v1")
    args = parser.parse_args()
    if not args.out or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in args.out):
        raise ValueError("Choose a bounded new review name")
    run = FOLDER / "run"
    plan_bytes = remember(run / "plan.json")
    plan = json.loads(plan_bytes)
    auth = json.loads(remember(FOLDER / "authorization.json"))
    consumed = json.loads(remember(FOLDER / "consumed.json"))
    if (auth["plan_sha256"] != sha(plan_bytes) or consumed["authorization"] != auth
            or not auth["approved_by_user"] or not auth["free_quota_confirmed"]):
        raise ValueError("The six-case authorization/consumption does not match")
    remember(ROOT / "receipt_training/evaluation/veryfi-screening-plan-v1.json", sha(plan_bytes))
    remember(run / "manifest.json", plan["manifest_sha256"])
    remember(run / "source-review.json", plan["source_review_sha256"])
    for name, digest in plan["protocol_sha256"].items():
        remember(run / "source" / name, digest)
    summary = json.loads(remember(run / "summary.json"))
    if len(summary) != 6 or sum(row["processing_requests"] for row in summary) != 6:
        raise ValueError("Unexpected number of provider requests")
    labels_path = FOLDER / "screening-labels-v1.jsonl"
    labels = {row["receipt_id"]: row for row in map(json.loads, remember(labels_path).decode("utf-8").splitlines())}
    config = json.loads(remember(ROOT / "receipt_training/evaluation/config.json"))
    cases, views, results = [], {}, {}
    ids = set()
    for case in plan["cases"]:
        folder = run / case["case"]
        metadata = json.loads(remember(folder / "metadata.json"))
        record = exact_json(remember(folder / "response.json", metadata["response_sha256"]))
        ledger = json.loads(remember(folder / "consumed.json"))
        archive = remember(FOLDER / case["case"] / "receipt.zip", case["archive_sha256"])
        remember(FOLDER / case["case"] / "receipt.png", case["crop_sha256"])
        body = {"file_name": "receipt.zip", "file_data": base64.b64encode(archive).decode("ascii"),
                "external_id": metadata["external_id"], **plan["extraction_options"]}
        body_sha = sha(json.dumps(body, separators=(",", ":")).encode("utf-8"))
        if (metadata["request_sha256"] != body_sha or ledger["external_id"] != metadata["external_id"]
                or record["external_id"] != metadata["external_id"] or metadata["external_id"] in ids
                or metadata["processing_requests"] != 1 or metadata["automatic_retries"] != 0
                or metadata["processing_http_status"] != 201 or not metadata["extraction_received"]
                or metadata["request_options"] != plan["extraction_options"]):
            raise ValueError("Case transport or recorded body differs from approved scope")
        ids.add(metadata["external_id"])
        if (format(record["id"], "f") != metadata["test_document_id"]
                or record.get("duplicate_of") is not None or record.get("is_duplicate") not in (None, False)
                or metadata["deletion_requests"] != 1 or metadata["deletion_http_status"] not in (200, 204)
                or metadata["deletion_status"] != "provider-reported-success"):
            raise ValueError("Cleanup is not proven to match a new test record")
        view = project(record)
        label = labels[case["receipt_id"]]
        result = compare(label, view, config)
        views[case["case"]] = view
        results[case["case"]] = result
        cases.append({"case": case["case"], "receipt_id": case["receipt_id"],
                      "metrics": result, "elapsed_ms_including_cleanup": metadata["elapsed_ms"],
                      "cleanup_status": metadata["deletion_status"]})
    remember(Path(__file__))
    remember(Path(__file__).with_name("score.py"))
    report = {"scope": "Six source-informed cropped physical receipts. Native fields are scored literally; no tax/coupon-basis conversion, inferred missing field or total-based repair.",
              "confidence_scope": "Confidence-wrapped document values are explicitly unwrapped. A null value remains missing at any confidence. Scores are not correctness proof. Native line items remain as returned, including unmatched/negative rows.",
              "cases": cases, "processing_requests": 6, "deletion_requests": 6,
              "automatic_retries": 0, "billing_activated": False, "actual_billing_verified": False,
              "cleanup": "Provider reported successful deletion of each matching new test record; not a zero-retention or training-exclusion guarantee",
              "limits": "Reference source review is by the assistant, not independent human truth or a new holdout. Unknown prices/quantities/unit prices and Taiwan deduction ownership are not filled. Hidden merchant/date are excluded; native currency does not supply comparison context. Timings include network and cleanup, not pure inference or a provider speed ranking.",
              "external_requests_by_this_audit": 0, "evidence_sha256": EVIDENCE}
    out = FOLDER / args.out
    out.mkdir(exist_ok=False)
    for name, value in (("native-fields.json", views), ("comparison.json", report)):
        with (out / name).open("x", encoding="utf-8", newline="\n") as handle:
            handle.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output": out.relative_to(ROOT).as_posix(), "reviewed_cases": 6,
                      "matched_reference_names": sum(row["metrics"]["matched_reference_names"] for row in cases),
                      "correct_line_prices": sum(row["metrics"]["native_field_equality"].get("total", {}).get("correct", 0) for row in cases),
                      "external_requests": 0}))


if __name__ == "__main__":
    main()
