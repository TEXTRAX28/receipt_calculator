"""Versioned fee/rounding/basis metrics; historical score.py stays unchanged."""
from collections import Counter
from copy import deepcopy

from score import aggregate, metric, minor, score_one

# Explicit semantic mapping from upstream annotation names to app charge kinds.
FEE_KINDS = {"service_price": "fee", "service": "fee", "fee": "fee", "tip": "tip", "deposit": "deposit"}


def score_with_adjustments(record, label, prediction, config):
    result = deepcopy(score_one(record, label, prediction, config))
    counts, errors = result["counts"], result["errors"]
    currency = label["currency"]["value"]
    receipt = prediction.get("receipt", {})
    adjustments = receipt.get("adjustments", [])
    expected, fee_truth_complete = [], True
    for fee in label["fees"]:
        amount = minor(fee["amount"]["value"], currency, config)
        kind = FEE_KINDS.get(fee["kind"])
        if amount is None or kind is None:
            fee_truth_complete = False
            continue
        expected.append((kind, amount))
    actual = [(row.get("kind"), minor(row.get("amount"), currency, config)) for row in adjustments
              if row.get("kind") in ("fee", "tip", "deposit")]
    available = Counter(actual)
    matched = 0
    for pair in expected:
        if available[pair]:
            matched += 1
            available[pair] -= 1
    counts["receipt_fee_known"], counts["receipt_fee_correct"] = len(expected), matched
    fee_structure_known = bool(label.get("coverage", {}).get("financial_fields_complete") and fee_truth_complete)
    counts["fee_structure_known"] = int(fee_structure_known)
    counts["fee_structure_correct"] = int(fee_structure_known and Counter(actual) == Counter(expected))
    if matched != len(expected):
        errors.append({"field": "receipt_fee", "expected_kind_amount_minor": expected,
                       "actual_kind_amount_minor": actual})

    rounding = minor(label["rounding"]["value"], currency, config)
    proposed = [minor(row.get("amount"), currency, config) for row in adjustments if row.get("kind") == "rounding"]
    counts["rounding_known"] = int(rounding is not None)
    counts["rounding_correct"] = int(rounding is not None and bool(proposed)
                                     and all(value is not None for value in proposed) and sum(proposed) == rounding)
    if rounding is not None and not counts["rounding_correct"]:
        errors.append({"field": "rounding", "expected_minor": rounding, "actual_minor": proposed})

    basis = label.get("prices_include_tax")
    counts["price_basis_known"] = int(type(basis) is bool)
    counts["price_basis_correct"] = int(type(basis) is bool and receipt.get("pricesIncludeTax") is basis
                                        and receipt.get("taxMode") in ("none", "codes", "printed"))
    if type(basis) is bool and not counts["price_basis_correct"]:
        errors.append({"field": "price_basis", "expected": basis, "actual": receipt.get("pricesIncludeTax")})

    # A complete label must cover charges and rounding, or explicitly verify its
    # absence. A balanced total cannot rescue an incorrectly classified charge.
    if counts["complete_receipt_known"]:
        absence = label.get("coverage", {}).get("rounding_absence_verified") is True
        if not fee_truth_complete or (rounding is None and not absence):
            counts["complete_receipt_known"] = 0
            counts["complete_receipt_correct"] = 0
            counts["complete_receipt_unscorable"] = counts.get("complete_receipt_unscorable", 0) + 1
        elif (Counter(actual) != Counter(expected) or
              (rounding is not None and not counts["rounding_correct"]) or
              (rounding is None and bool(proposed)) or
              not counts["price_basis_correct"]):
            counts["complete_receipt_correct"] = 0
    if any(error["field"] in ("receipt_fee", "rounding", "price_basis") for error in errors):
        counts["requires_review"] = 1
    return result


def aggregate_adjustments(rows):
    value = aggregate(rows)
    counts = value["counts"]
    for name in ("receipt_fee", "fee_structure", "rounding", "price_basis"):
        value[name] = metric(counts.get(name + "_correct", 0), counts.get(name + "_known", 0))
    return value
