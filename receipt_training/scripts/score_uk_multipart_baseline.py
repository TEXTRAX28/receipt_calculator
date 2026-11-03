"""Score the saved two-crop UK replay, separately from extraction and model inputs."""
import argparse
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re

from build_printed_provider_checkpoint import field_score
from score import match_items, minor

ROOT = Path(__file__).resolve().parents[2]
REPORT = ROOT / "receipt_training/evaluation/advanced-uk-multipart-offline-v1.json"
HASHES = {}
LABELS = "receipt_training/annotations/private/supplement-labels.jsonl"
CONFIG = "receipt_training/evaluation/config.json"
FROZEN = {
    LABELS: "d81abf83edfb6a1bdc167cca359dabf14c3b2f20a84b4dcce7e54dad7e69430c",
    CONFIG: "2a3d8c8cb39cb25473d483b49e936c182ce513188bedb93ddf5ccf1bd710370a",
    "receipt_training/scripts/score.py": "fe05ead24bb1664304c4ae2b13c90413340da4b6e7f98cd8d85f52b1b1a86d3a",
    "receipt_training/scripts/build_printed_provider_checkpoint.py": "8275b7c1c4b3d7022e29dd9997049af62c47f4dd189d5368c7beed84cb733342",
}


def read(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    data = path.read_bytes()
    digest = hashlib.sha256(data).hexdigest()
    if expected:
        assert digest == expected, name
    HASHES[name] = digest
    return data


def load(name, expected=None):
    return json.loads(read(name, expected))


def rate_equal(truth, actual):
    try:
        return Decimal(truth) == Decimal(actual)
    except (ArithmeticError, TypeError, ValueError):
        return False


def score_view(label, prediction, config):
    receipt = prediction["receipt"]
    result = field_score(label, prediction, config)
    pairs = match_items(label["items"], receipt["items"], config["item_matching"]["minimum_similarity"])
    unresolved = receipt["currencyUnresolved"]
    result.update({
        "method": prediction["method"], "context": prediction["context"],
        "currency": receipt["currency"], "currency_unresolved": unresolved,
        "calculated_total_available": not unresolved,
        "calculated_total_correct": None if unresolved else int(prediction["calculation"]["total"]) == minor(label["grand_total"]["value"], "GBP", config),
        "tax_basis_correct": receipt["pricesIncludeTax"] == label["prices_include_tax"],
        "tax_legend": {"known": len(label["tax_codes"]), "correct": sum(
            sum(actual["code"] == code["code"] and rate_equal(code["rate"], actual["rate"])
                for actual in receipt["taxCodes"]) == 1 for code in label["tax_codes"])},
        "pending_source_checks": prediction["pending_source_checks"],
        "can_finalize_without_review": prediction["can_finalize_without_review"],
        "unmatched_proposed": [{"row": i, "description": item["description"], "line_total": item["lineTotal"]}
                               for i, item in enumerate(receipt["items"]) if i not in pairs.values()],
        "adjustments": [{k: a[k] for k in ["label", "kind", "amount"]} for a in receipt["adjustments"]],
    })
    if unresolved:
        # The engine's blocked empty accumulator is not a claim that the receipt costs zero.
        result["calculated_total_minor"] = None
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", default="qa-artifacts/provider-review/uk-multipart-offline-v1")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    if args.check:
        report = json.loads(REPORT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            path = ROOT / name
            if path.is_file() and hashlib.sha256(path.read_bytes()).hexdigest() == expected:
                continue
            archived = ROOT / "qa-artifacts/evidence-blobs" / expected
            assert archived.is_file() and hashlib.sha256(archived.read_bytes()).hexdigest() == expected, name
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "external_requests": 0}))
        return
    assert re.fullmatch(r"qa-artifacts/provider-review/uk-multipart-offline-v\d+", args.run)
    for name, digest in FROZEN.items():
        read(name, digest)
    reference = next(json.loads(line) for line in read(LABELS).decode("utf-8").splitlines()
                     if json.loads(line)["receipt_id"] == "supplement-user-uk-20261026-group")
    assert reference["verification"]["checked_against_source"]
    assert not reference["verification"]["independent_human_verified"]
    config = load(CONFIG)
    meta = load(args.run + "/metadata.json")
    assert meta["external_requests"] == meta["new_model_calls"] == 0
    assert meta["source_unchanged"] and not meta["labels_read_by_replay"]
    plan = load(args.run + "/plan.json")
    for name, digest in meta["input_sha256"].items():
        read(name, digest)
    for name, digest in meta["loaded_frozen_source_sha256"].items():
        assert plan["source_sha256"][name] == digest
    for name in ["runner.mjs", "assembled-paddle.json", "comparison-automatic.json", "comparison-GBP.json"]:
        read(args.run + "/" + name)
    predictions = load(args.run + "/predictions.json", meta["predictions_sha256"])
    assert {(p["method"], p["context"]) for p in predictions} == {
        (m, c) for m in plan["methods"] for c in plan["contexts"]}
    assert len(predictions) == 8 and meta["transactions"] == 1
    views = [score_view(reference, prediction, config) for prediction in predictions]
    assert all(not view["can_finalize_without_review"] for view in views)
    for name in ["receipt_training/scripts/score_uk_multipart_baseline.py",
                 "receipt_training/evaluation/UK_MULTIPART_OFFLINE_COMPARISON.md",
                 "receipt_training/evaluation/GEMINI35_UK_MULTIPART_PLAN.md",
                 "receipt_training/scripts/test_gemini35_uk_multipart.mjs"]:
        read(name)
    gemini = "qa-artifacts/provider-review/gemini35-uk-multipart-v2"
    consent = load(gemini + "/approval-response.json")
    assert not consent["approved"] and consent["live_requests"] == 0
    assert not (ROOT / gemini / "run").exists()
    read(gemini + "/protocol-tests.tap")
    read("qa-artifacts/provider-review/gemini35-uk-multipart-v1/preparation-failure.json")
    result = {
        "scope": "Current frozen core postprocessing of historical readings of identical two UK crops; eight views of one familiar transaction.",
        "receipt_id": reference["receipt_id"], "reference_verification": reference["verification"],
        "views": views, "gemini35_two_crop_result": None,
        "gemini35_status": "Unapproved and unexecuted: user reported all free quota at limit. No automatic retry.",
        "limitations": ["Assistant source checked reference, not independently human verified or held out.",
                        "Purchase and VAT sections do not overlap; no overlap-deduplication claim.",
                        "Merchant/date outside crops; the clipped savings line retains a partially visible pound symbol.",
                        "GBP-supplied context is evaluated separately and was never a model input.",
                        "No new OCR/VLM inference, browser workflow, phone or latency test.",
                        "Monetary equality does not establish financial trust or complete-receipt accuracy.",
                        "Original-fifty dataset unchanged and not pooled with this diagnostic."],
        "new_model_calls": 0, "external_requests": 0,
        "evidence_sha256": HASHES,
    }
    with REPORT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2, ensure_ascii=True) + "\n")
    print(json.dumps([{"method": v["method"], "context": v["context"],
                       "names": v["exact_normalized_descriptions"],
                       "prices": v["field_equality"]["lineTotal"],
                       "coupons": v["nonzero_coupons_on_matched_purchase"],
                       "calculated_total_minor": v["calculated_total_minor"]} for v in views]))


if __name__ == "__main__":
    main()
