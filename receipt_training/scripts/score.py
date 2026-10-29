"""Score frozen OCR outputs against explicit upstream/manual evidence, never itself."""
import argparse
from collections import Counter, defaultdict
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
import hashlib
import json
from pathlib import Path
import re
import statistics
import unicodedata

ROOT = Path(__file__).resolve().parents[1]
CATEGORIES = ["costco/physical", "costco/digital", "non_costco/physical", "non_costco/digital"]


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def minor(value, currency, config):
    if value is None or not isinstance(value, str) or not re.fullmatch(r"-?\d+(?:\.\d+)?", value):
        return None
    digits = config["money"]["fraction_digits"].get(currency)
    if digits is None:
        return None
    number = Decimal(value) * (Decimal(10) ** digits)
    if number != number.to_integral_value():
        return None  # Never round an extracted amount to make it match.
    return int(number)


def description(value):
    value = unicodedata.normalize("NFKC", value or "").casefold()
    value = re.sub(r"^\s*\d+(?:[.,]\d+)?\s*[x×]?\s+", "", value)
    return "".join(character for character in value if character.isalnum())


def match_items(expected, actual, threshold):
    """Maximise cardinality, then description similarity; never inspect prices.

    Rectangular Hungarian assignment includes one unmatched dummy per label.
    A cardinality bonus larger than every similarity score combined makes the
    primary metric independent of the secondary tie-break.
    """
    if not expected or not actual:
        return {}
    bonus = (min(len(expected), len(actual)) + 1) * 1000
    costs = []
    for item in expected:
        key = description(item["description"]["value"])
        row = []
        for predicted in actual:
            other = description(predicted.get("description"))
            similarity = SequenceMatcher(None, key, other).ratio() if key and other else 0
            row.append(-bonus - round(similarity * 1000) if similarity >= threshold else 10**12)
        costs.append(row + [0] * len(expected))
    height, width = len(costs), len(costs[0])
    u, v = [0] * (height + 1), [0] * (width + 1)
    assigned, via = [0] * (width + 1), [0] * (width + 1)
    for index in range(1, height + 1):
        assigned[0], column = index, 0
        distance, used = [10**15] * (width + 1), [False] * (width + 1)
        while True:
            used[column] = True
            row, delta, next_column = assigned[column], 10**15, 0
            for candidate in range(1, width + 1):
                if used[candidate]:
                    continue
                reduced = costs[row - 1][candidate - 1] - u[row] - v[candidate]
                if reduced < distance[candidate]:
                    distance[candidate], via[candidate] = reduced, column
                if distance[candidate] < delta:
                    delta, next_column = distance[candidate], candidate
            for candidate in range(width + 1):
                if used[candidate]:
                    u[assigned[candidate]] += delta
                    v[candidate] -= delta
                else:
                    distance[candidate] -= delta
            column = next_column
            if assigned[column] == 0:
                break
        while column:
            previous = via[column]
            assigned[column] = assigned[previous]
            column = previous
    return {assigned[column] - 1: column - 1 for column in range(1, len(actual) + 1)
            if assigned[column] and costs[assigned[column] - 1][column - 1] < 0}


def metric(correct, count):
    return {"correct": correct, "count": count, "rate": round(correct / count, 4) if count else None}


def score_one(record, label, prediction, config):
    verification = label["verification"]
    source_checked = verification.get("checked_against_source") and verification["status"] == "manual_visual_partial"
    if verification["model_generated"] and verification["status"] != "human_verified" and not source_checked:
        raise ValueError("Unchecked model labels cannot be used as evaluation truth")
    currency = label["currency"]["value"]
    actual = prediction.get("receipt", {})
    predicted_items = actual.get("items", [])
    eligible = label.get("coverage", {}).get("item_metrics_eligible", bool(label["items"]))
    expected = label["items"] if eligible else []
    matches = match_items(expected, predicted_items, config["item_matching"]["minimum_similarity"])
    counts = Counter()
    counts.update({"samples": 1, "item_label_samples": int(eligible), "expected_items": len(expected),
                   "predicted_items": len(predicted_items) if eligible else 0, "matched_items": len(matches)})
    errors = []
    for index, item in enumerate(expected):
        target = predicted_items[matches[index]] if index in matches else {}
        for expected_key, actual_key, metric_name in [("line_total", "lineTotal", "item_price"), ("discount", "discount", "item_discount"), ("unit_price", "unitPrice", "unit_price")]:
            value = minor(item[expected_key]["value"], currency, config)
            if value is None:
                continue
            counts[metric_name + "_known"] += 1
            if index in matches:
                counts[metric_name + "_matched_known"] += 1
            # A discount is a deduction magnitude in the app schema; preserve signed raw truth.
            predicted_value = minor(target.get(actual_key), currency, config)
            correct = predicted_value is not None and (abs(value) == predicted_value if metric_name == "item_discount" else value == predicted_value)
            counts[metric_name + "_correct"] += int(correct)
            if not correct:
                errors.append({"field": metric_name, "item_id": item["id"], "expected": item[expected_key]["value"], "actual": target.get(actual_key), "detected": index in matches})
        quantity = item["quantity"]["value"]
        if quantity is not None:
            counts["quantity_known"] += 1
            try:
                correct = Decimal(quantity) == Decimal(target.get("quantity", ""))
            except (InvalidOperation, TypeError):
                correct = False
            counts["quantity_correct"] += int(correct)
        if index not in matches:
            errors.append({"field": "missing_item", "item_id": item["id"], "expected": item["description"]["value"]})
    receipt_discounts = [d for d in label["discounts"] if d["item_id"] is None and d["amount"]["value"] is not None]
    if receipt_discounts:
        amounts = [minor(d["amount"]["value"], currency, config) for d in receipt_discounts]
        if all(amount is not None for amount in amounts):
            counts["receipt_discount_known"] += 1
            predicted = [minor(a.get("amount"), currency, config) for a in actual.get("adjustments", []) if a.get("kind") == "discount"]
            correct = bool(predicted) and all(a is not None for a in predicted) and sum(abs(a) for a in amounts) == sum(predicted)
            counts["receipt_discount_correct"] += int(correct)
    if currency is not None:
        counts["currency_known"] += 1
        unresolved = any(any(phrase in warning.lower() for phrase in ["currency was not identified", "currency was unclear", "dollar symbols can mean several"]) for warning in actual.get("warnings", []))
        counts["currency_unresolved"] += int(unresolved or not actual)
        counts["selected_currency_correct"] += int(actual.get("currency") == currency)
        counts["currency_correct"] += int(actual.get("currency") == currency and not unresolved)
        counts["currency_dataset_context"] += int(label["currency"].get("evidence") == "dataset_context")
    total = minor(label["grand_total"]["value"], currency, config)
    if total is not None:
        counts["total_known"] += 1
        correct = minor(actual.get("printedTotal"), currency, config) == total
        counts["total_correct"] += int(correct)
        if not correct:
            errors.append({"field": "grand_total", "expected": label["grand_total"]["value"], "actual": actual.get("printedTotal")})
    calculation = prediction.get("calculation", {})
    if calculation.get("discrepancy") is None:
        counts["reconciliation_unavailable"] += 1
    else:
        counts["reconciliation_checked"] += 1
        counts["reconciliation_failed"] += int(int(calculation["discrepancy"]) != 0)
        counts["reconciliation_with_validation_issues"] += int(bool(calculation.get("issues")))
        counts["untrusted_zero_discrepancy"] += int(int(calculation["discrepancy"]) == 0 and bool(calculation.get("issues")))
    counts["processing_errors"] += int("error" in prediction)
    counts["requires_review"] += int(bool(prediction.get("error") or actual.get("warnings") or calculation.get("issues") or errors))
    return {"receipt_id": record["receipt_id"], "category": record["category"], "country": record["country"],
            "currency": currency, "split": record["split"], "counts": dict(counts),
            "elapsed_ms": prediction["elapsed_ms"], "errors": errors,
            "scanner_issue_count": len(calculation.get("issues", [])),
            "scanner_discrepancy_minor": calculation.get("discrepancy")}


def aggregate(rows):
    counts = Counter()
    for row in rows:
        counts.update(row["counts"])
    timings = sorted(row["elapsed_ms"] for row in rows)
    result = {"counts": dict(counts), "item_precision": metric(counts["matched_items"], counts["predicted_items"]),
              "item_recall": metric(counts["matched_items"], counts["expected_items"])}
    for name in ["item_price", "unit_price", "item_discount", "receipt_discount", "quantity", "currency", "total"]:
        result[name] = metric(counts[name + "_correct"], counts[name + "_known"])
    result["matched_item_price"] = metric(counts["item_price_correct"], counts["item_price_matched_known"])
    result["latency_ms"] = {"samples": len(timings), "median": statistics.median(timings) if timings else None,
                            "p95_nearest_rank": timings[max(0, (95 * len(timings) + 99) // 100 - 1)] if timings else None,
                            "total": sum(timings)}
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("runs", nargs="+", help="Local run folder names")
    args = parser.parse_args()
    config = json.loads((ROOT / "evaluation/config.json").read_text(encoding="utf-8"))
    records = {r["receipt_id"]: r for r in read_jsonl(ROOT / "manifest.jsonl")}
    labels = {l["receipt_id"]: l for l in read_jsonl(ROOT / "annotations/labels.jsonl")}
    rows, metadata, seen = [], [], set()
    for name in args.runs:
        if not re.fullmatch(r"[\w-]+", name):
            raise ValueError("Invalid run name")
        folder = ROOT / "evaluation/runs" / name
        meta = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        if metadata and meta["source_sha256"] != metadata[0]["source_sha256"]:
            raise ValueError("Runs use different scanner snapshots; report them separately")
        if not (meta.get("source_unchanged") or meta.get("source_served_from_frozen_snapshot")):
            raise ValueError("Run lacks a stable source snapshot")
        for filename, expected_hash in meta["source_sha256"].items():
            if hashlib.sha256((folder / "source" / filename).read_bytes()).hexdigest() != expected_hash:
                raise ValueError("Saved scanner source changed after inference")
        if meta["config_sha256"] != hashlib.sha256((ROOT / "evaluation/config.json").read_bytes()).hexdigest():
            raise ValueError("Scoring configuration changed after inference")
        if meta["predictions_sha256"] != hashlib.sha256((folder / "predictions.jsonl").read_bytes()).hexdigest():
            raise ValueError("Predictions changed after inference")
        metadata.append(meta)
        for prediction in read_jsonl(folder / "predictions.jsonl"):
            receipt_id = prediction["receipt_id"]
            if receipt_id in seen:
                raise ValueError("Duplicate receipt across runs")
            seen.add(receipt_id)
            record = records[receipt_id]
            if prediction["image_sha256"] != record["sha256"] or meta["split"] != record["split"]:
                raise ValueError("Receipt bytes or split differs from the run")
            rows.append(score_one(record, labels[receipt_id], prediction, config))
    report = {"baseline": "existing Tesseract browser pipeline, unchanged", "run_names": args.runs,
              "label_basis": "CORD upstream semantic annotations; assistant visual transcriptions checked against source images are separate exploratory development references, with no independent human verification",
              "api_requests": sum(m["api_requests"] for m in metadata), "api_cost_usd": "0", "compute_cost": None,
              "by_split_category": {}, "by_country_currency": {}, "receipts": rows}
    for split in ["development", "evaluation"]:
        report["by_split_category"][split] = {category: aggregate([r for r in rows if r["split"] == split and r["category"] == category]) for category in CATEGORIES}
    for country, currency in sorted({(r["country"], r["currency"]) for r in rows}):
        report["by_country_currency"][f"{country}/{currency}"] = aggregate([r for r in rows if (r["country"], r["currency"]) == (country, currency)])
    path = ROOT / "evaluation/results.json"
    path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    for split, categories in report["by_split_category"].items():
        for category, data in categories.items():
            print(split, category, "n=", data["counts"].get("samples", 0), "item recall=", data["item_recall"], "total=", data["total"])


if __name__ == "__main__":
    main()
