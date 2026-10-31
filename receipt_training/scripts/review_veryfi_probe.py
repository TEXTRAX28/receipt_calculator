"""Offline field audit of the sealed one-use probe. Never calls a provider.

This is not an app adapter. Native fields retain their separate meanings; no
coupon attachment, tax inference, deduplication, defaults or balancing occurs.
"""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path

from score import description, match_items, minor

ROOT = Path(__file__).resolve().parents[2]
PREPARED = ROOT / "qa-artifacts/provider-review/veryfi-uk-v1"
DOC = "https://docs.veryfi.com/api/receipts-invoices/process-a-document/"
NUMBERS = ("quantity", "price", "total", "subtotal", "gross_total", "net_total",
           "discount", "discount_price", "discount_rate", "tax", "tax_rate")
TEXT = ("description", "full_description", "sku", "tax_code")


def exact_json(raw):
    if len(raw) > 2 * 1024 * 1024:
        raise ValueError("Response exceeds the sealed transport bound")

    def number(token):
        value = Decimal(token)
        if len(token) > 64 or abs(value.as_tuple().exponent) > 12 or value.adjusted() > 18:
            raise ValueError("Numeric value outside the offline audit bound")
        return value

    def pairs(entries):
        result = {}
        for key, value in entries:
            if key in result:
                raise ValueError("Duplicate JSON member")
            result[key] = value
        return result

    def constant(_):
        raise ValueError("Non-finite JSON number")

    value = json.loads(raw.decode("utf-8", errors="strict"), parse_int=number,
                       parse_float=number, parse_constant=constant,
                       object_pairs_hook=pairs)
    if not isinstance(value, dict):
        raise ValueError("Expected a response object")
    return value


def project(record):
    """Ground-truth-free, literal native-field view, safe for exact comparisons."""
    rows = record.get("line_items")
    if not isinstance(rows, list) or len(rows) > 2000:
        raise ValueError("Missing or excessive native line_items")
    issues = []

    def numeric(obj, key, path):
        value = obj.get(key)
        if value is None:
            return None
        if not isinstance(value, Decimal):
            issues.append(f"{path}.{key}: expected a JSON number or null")
            return None
        return format(value, "f")

    def text(obj, key, path):
        value = obj.get(key)
        if value is None:
            return None
        if not isinstance(value, str) or len(value) > 4000:
            issues.append(f"{path}.{key}: expected bounded text or null")
            return None
        return value

    projected = []
    for index, row in enumerate(rows):
        path = f"line_items[{index}]"
        if not isinstance(row, dict):
            # Keep the slot: a malformed row must not disappear from the audit.
            issues.append(f"{path}: expected an object")
            row = {}
        projected.append({"row_index": index,
                          **{key: text(row, key, path) for key in TEXT},
                          **{key: numeric(row, key, path) for key in NUMBERS}})
    taxes = record.get("tax_lines")
    if taxes is not None and (not isinstance(taxes, list) or len(taxes) > 100):
        raise ValueError("Invalid native tax_lines")
    tax_rows = []
    for index, row in enumerate(taxes or []):
        path = f"tax_lines[{index}]"
        if not isinstance(row, dict):
            issues.append(f"{path}: expected an object")
            row = {}
        tax_rows.append({"row_index": index,
                         **{key: text(row, key, path) for key in ("name", "code")},
                         **{key: numeric(row, key, path) for key in ("rate", "base", "total", "total_inclusive")}})
    return {"model": text(record, "model", "document"),
            "returned_currency_not_scored": text(record, "currency_code", "document"),
            "line_items": projected, "tax_lines": tax_rows,
            "document": {key: numeric(record, key, "document") for key in ("subtotal", "total", "tax", "discount", "tip")},
            "native_field_issues": issues}


def compare(label, view, config):
    """Descriptions alone choose pairs; missing fields remain missing."""
    expected, rows = label["items"], view["line_items"]
    pairs = match_items(expected, rows, config["item_matching"]["minimum_similarity"])
    fields = (("unit_price", "price"), ("line_total", "total"),
              ("line_total", "gross_total"), ("quantity", "quantity"),
              ("discount", "discount"), ("tax_code", "tax_code"))
    scores = {}
    reviews = []

    def same(truth, value, key):
        if truth is None:
            return None
        if key == "tax_code":
            return value == truth
        if key == "quantity":
            return value is not None and Decimal(value) == Decimal(truth)
        target, actual = minor(truth, "GBP", config), minor(value, "GBP", config)
        if target is None:
            return None
        return actual is not None and (abs(target) == abs(actual) if key == "discount" else target == actual)

    for index, item in enumerate(expected):
        row = rows[pairs[index]] if index in pairs else {}
        checks = {}
        for key, native in fields:
            check = same(item.get(key, {}).get("value"), row.get(native), key)
            checks[native] = check
            counts = scores.setdefault(native, {"correct": 0, "known": 0})
            if check is not None:
                counts["known"] += 1
                counts["correct"] += int(check)
        reviews.append({"label_item_id": item["id"], "label_description": item["description"]["value"],
                        "native_row_index": row.get("row_index"), "equal_to_label": checks})
    coupon_indices = [i for i, item in enumerate(expected)
                      if minor(item["discount"]["value"], "GBP", config) not in (None, 0)]
    document = {}
    for key, native in (("grand_total", "total"), ("subtotal", "subtotal"), ("tax", "tax")):
        document[native] = same(label.get(key, {}).get("value"), view["document"].get(native), key)
    return {"expected_purchases": len(expected), "native_rows": len(rows),
            "matched_purchase_rows": len(pairs),
            "exact_normalized_descriptions": sum(description(expected[i]["description"]["value"]) == description(rows[j].get("description")) for i, j in pairs.items()),
            "native_field_equality": scores,
            "nonzero_coupons_on_matched_purchase_rows": {
                "known": len(coupon_indices),
                "correct": sum(reviews[i]["equal_to_label"]["discount"] is True for i in coupon_indices)},
            "document_field_equality": document,
            "unmatched_native_row_indices": [i for i in range(len(rows)) if i not in pairs.values()],
            "purchase_pair_review": reviews,
            "purchase_precision": None,
            "calculated_payable_total": None,
            "trusted_reconciliation": None,
            "reason_unavailable": "Native rows can include coupons, summaries or purchases. Unmatched rows require source classification. Native total/gross_total are tested separately against the printed pre-coupon, VAT-exclusive purchase price; no undocumented pre/post-tax or discount conversion is inferred. Separate negative rows are not attached as coupons. No application financial draft is produced."}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=PREPARED / "offline-field-review-v1")
    args = parser.parse_args()
    run = PREPARED / "run"
    metadata = json.loads((run / "metadata.json").read_text(encoding="utf-8"))
    if (metadata.get("provider") != "Veryfi" or metadata.get("processing_http_status") != 201
            or not metadata.get("extraction_received") or metadata.get("processing_requests") != 1
            or metadata.get("automatic_retries") != 0):
        raise ValueError("No successful sealed one-use extraction is available to audit")
    evidence = {}

    def remember(path, digest=None):
        name = path.resolve().relative_to(ROOT).as_posix()
        actual = sha(path)
        if digest is not None and actual != digest:
            raise ValueError("Frozen evidence changed: " + name)
        evidence[name] = actual

    remember(run / "metadata.json")
    remember(run / "response.json", metadata["response_sha256"])
    remember(run / "manifest.json", metadata["manifest_sha256"])
    plan_path = ROOT / "receipt_training/evaluation/veryfi-probe-plan-v1.json"
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    remember(plan_path)
    manifest = json.loads((run / "manifest.json").read_text(encoding="utf-8"))
    remember(run / "manifest.json", plan["manifest_sha256"])
    if metadata["archive_sha256"] != plan["archive_sha256"]:
        raise ValueError("Probe archive differs from the approved comparison")
    for item in manifest["inputs"]:
        remember(ROOT / item["source"], item["sha256"])
    for name, digest in plan["protocol_sha256"].items():
        if metadata["protocol_source_sha256"].get(name) != digest:
            raise ValueError("Probe ran a different transport")
        remember(run / "source" / name, digest)
    labels_path = ROOT / "receipt_training/annotations/private/supplement-labels.jsonl"
    config_path = ROOT / "receipt_training/evaluation/config.json"
    for path in (labels_path, config_path, Path(__file__), Path(__file__).with_name("score.py"),
                 Path(__file__).with_name("test_review_veryfi_probe.py")):
        remember(path)
    label = next(json.loads(line) for line in labels_path.read_text(encoding="utf-8").splitlines()
                 if json.loads(line)["receipt_id"] == "supplement-user-uk-20261026-group")
    if not label["verification"].get("checked_against_source"):
        raise ValueError("The comparison requires source-checked annotations")
    config = json.loads(config_path.read_text(encoding="utf-8"))
    view = project(exact_json((run / "response.json").read_bytes()))
    report = {"scope": "One source-informed redacted development transaction; not independent human truth, a holdout, public-release acceptance or provider selection.",
              "numeric_context": "Known parent-transaction GBP for scoring only. Hidden merchant/date/currency are excluded. No context or labels were sent to the provider.",
              "field_definitions": {"source": DOC, "checked_on": "2026-10-31",
                                    "price": "Unit price", "total": "Total price for the line item; scored literally without an assumed tax/discount basis",
                                    "gross_total": "Total before deductions, compared separately", "discount": "Amount deducted from total line price; magnitude equality on the matched purchase only",
                                    "discount_price": "Lower price after discount; retained separately, never treated as a deduction"},
              "metrics": compare(label, view, config), "processing_elapsed_ms": metadata["elapsed_ms"],
              "timing_scope": "One measured provider transaction including transport and attempted cleanup, not comparable to isolated neural inference or a p95 distribution",
              "cleanup_status": metadata["deletion_status"], "actual_billing_verified": metadata["actual_billing_verified"],
              "external_requests_by_this_offline_audit": 0, "evidence_sha256": evidence}
    # An existing review must remain available, including after a later audit fix.
    args.out.resolve().relative_to(PREPARED.resolve())
    args.out.mkdir(parents=False, exist_ok=False)
    for name, value in (("native-fields.json", view), ("comparison.json", report)):
        (args.out / name).write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps({"output": args.out.relative_to(ROOT).as_posix(),
                      "native_rows": report["metrics"]["native_rows"],
                      "matched_purchase_rows": report["metrics"]["matched_purchase_rows"],
                      "external_requests": 0}))


if __name__ == "__main__":
    main()
