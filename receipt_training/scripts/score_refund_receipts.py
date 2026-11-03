"""Score the preread public refund targets without changing source values."""
import hashlib
import json
from pathlib import Path
import re
import sys

from score import description, match_items, minor

ROOT = Path(__file__).resolve().parents[2]
REFERENCE = ROOT / "qa-artifacts/public-refund-costco-v1/reference-v1.json"
REFERENCE_SHA = "f14e93503e37eb086f99957d2cb96b270e3c48ca2a9068e969b1f84d318e1cc4"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def score(reference, observation, prediction, config):
    receipt = prediction["receipt"]
    expected = [{"description": {"value": item["description"]}} for item in reference["items"]]
    actual = receipt["items"]
    matches = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
    counts = {"target_items": len(expected), "matched_target_items": len(matches),
              "known_target_line_prices": len(expected), "correct_target_line_prices": 0,
              "exact_target_descriptions": 0, "proposed_items": len(actual)}
    for index, target in enumerate(reference["items"]):
        item = actual[matches[index]] if index in matches else {}
        counts["correct_target_line_prices"] += int(minor(item.get("lineTotal"), reference["currency"], config) == minor(target["line_total"], reference["currency"], config))
        counts["exact_target_descriptions"] += int(description(item.get("description")) == description(target["description"]))
    for field, key in [("subtotal", "subtotal"), ("tax", "printedTax"), ("grand_total", "printedTotal")]:
        counts[field + "_correct"] = int(minor(receipt.get(key), reference["currency"], config) == minor(reference[field], reference["currency"], config))
    counts["discount_adjustments"] = sum(entry["kind"] == "discount" for entry in receipt["adjustments"])
    return {"provider": observation["provider"], "input_kind": observation["input_kind"], "mode": prediction["mode"],
            "counts": counts, "pending_checks": len(receipt["reviewChecks"]), "currency_identified": not receipt.get("currencyUnresolved", False),
            "calculated_total_minor": prediction["calculation"]["total"], "discrepancy_minor": prediction["calculation"]["discrepancy"],
            "validation_issues": len(prediction["calculation"]["issues"]), "complete_receipt_scorable": False}


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"public-refund-costco-read-v[3-9]\d*", tag)
    assert sys.argv[2:] in ([], ["--check"])
    check = sys.argv[2:] == ["--check"]
    out = ROOT / "qa-artifacts" / tag
    output = out / "scores.json"
    assert output.exists() if check else not output.exists()
    assert sha(REFERENCE) == REFERENCE_SHA
    reference = json.loads(REFERENCE.read_text(encoding="utf-8"))
    assert reference["recorded_before_scanner_output"]
    config_path = ROOT / "receipt_training/evaluation/config.json"
    config = json.loads(config_path.read_text(encoding="utf-8"))
    evidence = {str(REFERENCE.relative_to(ROOT)).replace("\\", "/"): REFERENCE_SHA,
                str(config_path.relative_to(ROOT)).replace("\\", "/"): sha(config_path)}
    records, equality = [], []
    metadata = {}
    for variant, run in [("before", "public-refund-costco-read-v1"), ("after", tag)]:
        folder = ROOT / "qa-artifacts" / run
        metadata[variant] = json.loads((folder / "metadata.json").read_text(encoding="utf-8"))
        assert metadata[variant]["provider_api_requests"] == 0
        assert metadata[variant]["requests"] == {"writes": [], "external": []}
        assert metadata[variant]["expected_values_loaded"] is False
        controller = json.loads((ROOT / "qa-artifacts" / (run + "-control") / "controller.json").read_text(encoding="utf-8"))
        assert controller["exit_code"] == 0 and "error" not in controller
        if variant == "before":
            assert reference["recorded_at"] < controller["started_at"]
        for provider in ["basic", "enhanced"]:
            for target in reference["cases"]:
                kind = "refund" if target["kind"] == "refund" else "purchase"
                path = folder / (provider + "-" + kind + ".json")
                evidence[path.relative_to(ROOT).as_posix()] = sha(path)
                observation = json.loads(path.read_text(encoding="utf-8"))
                assert not observation.get("error")
                assert observation["image_sha256"] == reference["source_sha256"][target["image_path"]]
                if variant == "after":
                    old = json.loads((ROOT / "qa-artifacts/public-refund-costco-read-v1" / path.name).read_text(encoding="utf-8"))
                    same_frames = [row["sha256"] for row in old["frames"]] == [row["sha256"] for row in observation["frames"]]
                    same_text = old["output"]["text"] == observation["output"]["text"]
                    equality.append({"provider": provider, "input_kind": kind, "same_frames": same_frames, "same_ocr_text": same_text})
                    assert same_frames and same_text, "A changed reading requires a separate parser ablation"
                for prediction in observation["predictions"]:
                    record = score(target, observation, prediction, config)
                    records.append({"variant": variant, **record})
                    if kind == "refund" and variant == "after":
                        assert record["counts"]["proposed_items"] == record["counts"]["correct_target_line_prices"] == 1
                        assert record["counts"]["discount_adjustments"] == 0
                        item = prediction["receipt"]["items"][0]
                        assert item["quantity"] == item["unitPrice"] == ""
                        assert any(check.get("itemId") == item["id"] and check["field"] == "lineTotal" and check["reason"] == "classification" and check["confirmedValue"] == "" for check in prediction["receipt"]["reviewChecks"])
    assert metadata["before"]["asset_sha256"] == metadata["after"]["asset_sha256"]
    changed_libs = [path for path, value in metadata["before"]["source_sha256"].items() if path.startswith("src/lib/") and metadata["after"]["source_sha256"][path] != value]
    assert set(changed_libs) in ({"src/lib/parser.ts"}, {"src/lib/parser.ts", "src/lib/review-checks.ts"}), changed_libs
    result = {"scope": "Two related public development documents, sixteen processing views over eight successful provider outputs. No complete-receipt or full-purchase-control accuracy claim. v2 worker failures remain separately retained.",
              "records": records, "paired_readings": equality, "changed_application_libraries": changed_libs,
              "new_provider_api_requests": 0, "reference_unchanged": True, "evidence_sha256": evidence}
    if check:
        assert result == json.loads(output.read_text(encoding="utf-8"))
    else:
        with output.open("x", encoding="utf-8") as file:
            json.dump(result, file, indent=2)
            file.write("\n")
    print(json.dumps({"scored_views": len(records), "same_readings": equality, "changed_libraries": changed_libs}))


if __name__ == "__main__":
    main()
