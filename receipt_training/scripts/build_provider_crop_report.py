"""Summarize the exact redacted-crop comparison, preserving unavailable providers."""
import hashlib
import json
from pathlib import Path
import re
import sys

from score import description, match_items, minor

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
OUT = ROOT / "receipt_training/evaluation/advanced-provider-crop-comparison-v1.json"
EVIDENCE = set()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    path = path.resolve()
    path.relative_to(ROOT)
    if expected is not None and sha(path) != expected:
        raise ValueError("Frozen evidence changed: " + path.relative_to(ROOT).as_posix())
    EVIDENCE.add(path)
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def metrics(label, receipt, config):
    expected, actual = label["items"], receipt["items"]
    matches = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
    result = {"expected_purchases": len(expected), "proposed_purchases": len(actual), "matched_labelled_purchases": len(matches), "unmatched_proposals": len(actual) - len(matches),
              "exact_normalized_descriptions": sum(description(expected[i]["description"]["value"]) == description(actual[j]["description"]) for i, j in matches.items())}
    for before, after in [("line_total", "lineTotal"), ("unit_price", "unitPrice"), ("discount", "discount")]:
        known, correct = 0, 0
        for index, item in enumerate(expected):
            value = minor(item[before]["value"], "GBP", config)
            if value is None:
                continue
            known += 1
            target = actual[matches[index]] if index in matches else {}
            predicted = minor(target.get(after), "GBP", config)
            correct += predicted is not None and predicted == (abs(value) if before == "discount" else value)
        result[after] = {"correct": correct, "known": known}
    coupons = [index for index, item in enumerate(expected) if (minor(item["discount"]["value"], "GBP", config) or 0) != 0]
    result["nonzero_coupons"] = {"known": len(coupons), "correct": sum(index in matches and minor(actual[matches[index]].get("discount"), "GBP", config) == abs(minor(expected[index]["discount"]["value"], "GBP", config)) for index in coupons)}
    result["printed_total_correct"] = minor(receipt["printedTotal"], "GBP", config) == minor(label["grand_total"]["value"], "GBP", config)
    return result


def main():
    if "--check" in sys.argv:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "scope": "one redacted development transaction"}))
        return
    prepared = QA / "provider-review/veryfi-uk-v1"
    manifest = load(prepared / "manifest.json")
    expected_images = [entry["sha256"] for entry in manifest["inputs"]]
    for entry in manifest["inputs"]:
        remember(ROOT / entry["source"], entry["sha256"])
    labels_path = remember(ROOT / "receipt_training/annotations/private/supplement-labels.jsonl")
    labels = next(json.loads(line) for line in labels_path.read_text(encoding="utf-8").splitlines() if json.loads(line)["receipt_id"] == "supplement-user-uk-20261026-group")
    config = load(ROOT / "receipt_training/evaluation/config.json")
    native = QA / "advanced-ocr/qwen-redacted-uk-v1"
    meta = load(native / "metadata.json")
    request = load(native / "request.json")
    if not meta.get("parsed_json") or meta["exit_code"] or [image["sha256"] for image in meta["images"]] != expected_images or meta["external_receipt_uploads"]:
        raise ValueError("The native comparison did not use the exact crop pixels")
    remember(native / "request.json", meta["request_sha256"])
    remember(native / "model-manifest.json", meta["manifest_sha256"])
    remember(ROOT / request["model_manifest"], meta["manifest_sha256"])
    for file, key in [("stdout.txt", "stdout_sha256"), ("stderr.txt", "stderr_sha256"), ("harness.py", "harness_sha256"), ("vision_cli_text.py", "text_helper_sha256")]:
        remember(native / file, meta[key])
    text = re.sub(r"\x1b\[[0-9;]*m", "", (native / "stdout.txt").read_text(encoding="utf-8"))
    decoded, _ = json.JSONDecoder().raw_decode(text[text.index("{"):])
    receipt = load(native / "model-output.json")
    if receipt != decoded:
        raise ValueError("Native parsed output differs from its raw stream")
    folder = QA / "provider-review/local-redacted-comparison-v1"
    hybrid_meta = load(folder / "metadata.json")
    result = load(remember(folder / "result.json", hybrid_meta["result_sha256"]))
    remember(QA / "provider-review/run_local_redacted_comparison_v1.mjs", hybrid_meta["runner_sha256"])
    for name, expected in hybrid_meta["source_sha256"].items():
        remember(folder / "source" / name, expected)
    if hybrid_meta["external_receipt_uploads"] or hybrid_meta["blocked_external_origins"] or len(hybrid_meta["http"]) != 2:
        raise ValueError("Actual local comparison scope changed")
    for index, packet in enumerate(hybrid_meta["http"]):
        if [image["sha256"] for image in packet["images"]] != expected_images:
            raise ValueError("One local reader received different image bytes")
        remember(folder / f"response-{index + 1}.json")
    if not result["result"]["comparisonComplete"]:
        raise ValueError("The actual independent comparison did not complete")
    remember(Path(__file__))
    remember(Path(__file__).with_name("score.py"))
    remember(QA / "provider-review/local-redacted-visible-field-check-v1.md")
    value = {"scope": "One previously inspected source-informed redacted development transaction, with the same two crop JPEGs used by every local reader and prepared for Veryfi. Not a blind holdout, full-corpus metric or provider-selection result.",
             "label_basis": "Pre-existing source-checked complete visible financial annotation of the parent transaction; no new independent human verification. All 18 purchase rows, four individual coupons, VAT legend and monetary totals remain visible. Hidden merchant/date/currency evidence is excluded from these metrics.",
             "numeric_comparison_currency": "Known GBP context of the parent transaction for exact minor-unit comparison only; no currency extraction success is claimed.",
             "methods": {"qwen3_vl_vision_only": metrics(labels, receipt, config), "paddle_plus_independent_qwen": metrics(labels, result["result"]["receipt"], config)},
             "local_native_elapsed_ms": meta["elapsed_ms"], "actual_local_comparison_elapsed_ms": result["elapsed_ms"],
             "timing_scope": "Native timing includes fresh CLI/model loading and excludes crop creation/download. Actual combined timing includes serial primary OCR plus native vision and browser verification, bypassing unrelated photo re-encoding. Laptop/caches, one transaction, no p95 or physical-phone claim.",
             "local_hybrid_gate": {"printed_total_minor": result["calculated"]["printed_minor"], "calculated_total_minor": result["calculated"]["total_minor"], "discrepancy_minor": result["calculated"]["discrepancy_minor"], "blocking_issues": len(result["calculated"]["issues"]), "pending_review_checks": len(result["result"]["receipt"].get("reviewChecks", []))},
             "veryfi_state_at_checkpoint": "One comparison requested by the user; free quota/configuration still pending; zero live Veryfi requests and no accuracy result",
             "veryfi_metrics": None, "external_receipt_uploads": 0, "provider_api_requests": 0, "actual_local_http_requests": len(hybrid_meta["http"]),
             "finding": "Both local paths matched all 18 real purchases and copied their line prices, but proposed five extra purchases and failed all four nonzero coupons. Correct copied final totals did not produce a valid payable bill. The actual review gate blocked the combined draft.",
             "next_local_investigation": "Coupon recovery is guarded by a literal merchant-name check although the primary parser already identifies this headerless Costco layout. Verify recovery predicates and preserve genuine repeated purchases before changing the guard.",
             "verified_source_locations": ["src/lib/verify-readings.ts:L155", "src/lib/parser.ts:L33", "src/lib/compared-reader.ts:L13", "src/lib/panel-transport.ts:L10"],
             "private_row_review": "qa-artifacts/provider-review/local-redacted-visible-field-check-v1.md",
             "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(EVIDENCE)}}
    OUT.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "methods": value["methods"], "veryfi_result": None}))


if __name__ == "__main__":
    main()
