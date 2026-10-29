"""Verify evidence schema, bytes, permissions, split leakage, and nullable money."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path

from jsonschema import Draft202012Validator
from collect import ROOT, verify_image
from score import minor, read_jsonl


def main():
    manifest = read_jsonl(ROOT / "manifest.jsonl")
    labels = read_jsonl(ROOT / "annotations/labels.jsonl")
    schema = json.loads((ROOT / "annotations/schema.json").read_text(encoding="utf-8"))
    config = json.loads((ROOT / "evaluation/config.json").read_text(encoding="utf-8"))
    currency_evidence = json.loads((ROOT / "evaluation/currency-rules-evidence.json").read_text(encoding="utf-8"))
    assert config["money"]["fraction_digits"] == currency_evidence["fraction_digits"], "Currency precision differs from recorded SIX evidence"
    validator = Draft202012Validator(schema)
    assert len({r["receipt_id"] for r in manifest}) == len(manifest), "Duplicate IDs"
    assert {r["receipt_id"] for r in manifest} == {l["receipt_id"] for l in labels}, "Manifest/label mismatch"
    groups, hashes = defaultdict(set), defaultdict(set)
    for record in manifest:
        path = (ROOT / record["file_path"]).resolve()
        assert path.is_relative_to(ROOT), "Receipt path escapes dataset"
        data = path.read_bytes()
        assert hashlib.sha256(data).hexdigest() == record["sha256"], f"Checksum mismatch {record['receipt_id']}"
        image = verify_image(data)
        assert (image["width"], image["height"]) == (record["image"]["width"], record["image"]["height"])
        assert record["origin"] in ["physical", "digital", "unknown"]
        assert record["licence"] and record["permission_status"], "Missing rights evidence"
        assert record["external_processing_allowed"] is False, "Pilot must remain local"
        groups[record["group_id"]].add(record["split"])
        hashes[record["sha256"]].add(record["group_id"])
        if record.get("original_file_path"):
            assert hashlib.sha256((ROOT / record["original_file_path"]).read_bytes()).hexdigest() == record["original_sha256"] == record["sha256"], "Original changed"
        if record.get("source_split") == "test":
            assert record["split"] in ["evaluation", "excluded_cross_split_duplicate"], "Upstream test split reused for development"
    assert all(len(splits) == 1 for splits in groups.values()), "Transaction crosses splits"
    assert all(len(ids) == 1 for ids in hashes.values()), "Exact aliases have different transaction groups"
    money_null, money_known = 0, 0
    for label in labels:
        validator.validate(label)
        currency = label["currency"]["value"]
        monetary = [label[k] for k in ["subtotal", "tax", "rounding", "grand_total"]]
        monetary += [item[key] for item in label["items"] for key in ["line_total", "unit_price", "discount"]]
        monetary += [entry["amount"] for key in ["discounts", "fees", "payments"] for entry in label[key]]
        for value in monetary:
            if value["value"] is None:
                money_null += 1
                assert value["review_required"]
            else:
                money_known += 1
                assert minor(value["value"], currency, config) is not None, f"Invalid money {label['receipt_id']}: {value}"
        if label["verification"]["model_generated"]:
            verification = label["verification"]
            assert verification["status"] == "provisional_model" or verification.get("checked_against_source"), "Unchecked model labels must remain provisional"
    near = []
    for index, record in enumerate(manifest):
        for other in manifest[index + 1:]:
            distance = (int(record["image"]["dhash"], 16) ^ int(other["image"]["dhash"], 16)).bit_count()
            if distance <= 4 and record["group_id"] != other["group_id"]:
                near.append({"ids": [record["receipt_id"], other["receipt_id"]], "dhash_distance": distance})
    eligible = [r for r in manifest if r.get("included_in_pilot", True)]
    counts = dict(Counter(r["category"] for r in eligible))
    result = {"status": "passed", "records": len(manifest), "eligible_financial_receipts": len(eligible),
              "supporting_controls": len(manifest) - len(eligible), "category_counts": counts,
              "splits": dict(Counter(r["split"] for r in eligible)),
              "unique_transaction_groups": len(groups), "unique_image_hashes": len(hashes),
              "known_monetary_fields": money_known, "null_monetary_fields": money_null,
              "near_duplicate_candidates": near}
    (ROOT / "evaluation/validation.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
