"""Freeze explicit-currency evidence, including the rejected model-prompt trial."""
import json
from pathlib import Path
import re
import subprocess
import sys

import build_headerless_coupon_report as evidence
from score import match_items, minor

ROOT, DATA, QA = evidence.ROOT, evidence.DATA, evidence.QA
OUT = DATA / "evaluation/advanced-reading-currency.json"
load, remember, sha = evidence.load, evidence.remember, evidence.sha


def log(path, required):
    text = re.sub(r"\x1b\[[0-9;]*m", "", remember(QA / path).read_text(encoding="utf-8"))
    if required not in text:
        raise ValueError("Missing successful final validation: " + path)


def native(name):
    folder = QA / name
    meta = load(folder / "metadata.json")
    if (not meta.get("source_unchanged") or meta.get("error") or meta["blocked_requests"]
            or meta["external_requests"] or len(meta["cases"]) != 2):
        raise ValueError("Incomplete paired local observation")
    if meta["cases"][0]["panels"] != meta["cases"][1]["panels"]:
        raise ValueError("Different pixels in the currency counterfactual")
    for name, digest in meta["source_sha256"].items():
        remember(folder / "source" / name, digest)
    drafts, responses = [], []
    for tag, case in zip(("automatic", "selected-idr"), meta["cases"]):
        if case["http_status"] != 200 or case["model_http_requests"] != 1:
            raise ValueError("A native case failed or made unexpected requests")
        responses.append(load(folder / (tag + "-response.json"), case["response_sha256"]))
        drafts.append(load(folder / (tag + "-app-draft.json"), case["app_draft_sha256"]))
        remember(folder / (tag + "-review.png"))
    for panel in meta["cases"][0]["panels"]:
        remember(folder / panel["file"], panel["sha256"])
    return meta, drafts, responses


def score_native(label, draft, config):
    receipt, calculation = draft["receipt"], draft["calculation"]
    expected, actual = label["items"], receipt["items"]
    matches = match_items(expected, actual, config["item_matching"]["minimum_similarity"])
    item = actual[matches[0]] if 0 in matches else {}
    amounts = {}
    for truth, key in (("line_total", "lineTotal"), ("unit_price", "unitPrice")):
        value = minor(item.get(key), "IDR", config)
        target = minor(expected[0][truth]["value"], "IDR", config)
        amounts[key] = None if target is None else value is not None and value == target
    for truth, key in (("subtotal", "subtotal"), ("tax", "printedTax"), ("grand_total", "printedTotal")):
        value = minor(receipt.get(key), "IDR", config)
        target = minor(label[truth]["value"], "IDR", config)
        amounts[key] = None if target is None else value is not None and value == target
    return {"proposed_priced_rows": len(actual), "matched_source_rows": len(matches),
            "known_amount_equality": amounts,
            "canonical_quantity": item.get("quantity"), "currency_unresolved": receipt["currencyUnresolved"],
            "blocking_issues": len(calculation["issues"]),
            "calculated_total_minor": calculation["total"], "discrepancy_minor": calculation["discrepancy"],
            "accepted_payable_result": not calculation["issues"] and calculation["discrepancy"] == "0"}


def regression(split):
    before_name = "refunds-v4-after-" + split if split != "supplement" else "refunds-v4-supplement-after"
    after_name = "reading-currency-v2-default-" + split
    (before, a), (after, b) = [evidence.replay(name) for name in (before_name, after_name)]
    if a.keys() != b.keys() or before["paired_inputs"] != after["paired_inputs"]:
        raise ValueError("The default regression did not use identical evidence")
    for key in ("package_lock_sha256", "evaluation_runner_sha256", "manifest_sha256", "config_sha256", "frozen_vision_sha256", "frozen_plan_sha256"):
        if before[key] != after[key]:
            raise ValueError("Default comparison configuration changed")
    changed = sum(evidence.canonical(a[key]) != evidence.canonical(b[key]) for key in a)
    if changed:
        raise ValueError("An original default receipt result changed")
    return {"runs": [before_name, after_name], "receipts": len(a), "changed_semantic_results": changed,
            "identical_paired_inputs": True, "loaded_frozen_modules": len(after["loaded_frozen_source_sha256"]),
            "inference_latency_excluded": True}


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            remember(ROOT / name, digest)
        print(json.dumps({"verified_files": len(evidence.EVIDENCE), "scope": "explicit currency and rejected model hint"}))
        return
    if OUT.exists():
        raise ValueError("Preserve the checkpoint; use --check")
    subprocess.run(["git", "diff", "--quiet", "8f133ba", "--", "server/receipt-api.mjs",
                    "server/local-vision.mjs", "server/extraction-instructions.mjs", "src/lib/extraction-schema.mjs"],
                   cwd=ROOT, check=True)
    # Labels are consulted only now, after every actual native call completed.
    labels_path = remember(DATA / "annotations/labels.jsonl")
    label = next(row for row in map(json.loads, labels_path.read_text(encoding="utf-8").splitlines())
                 if row["receipt_id"] == "cord-v2-train-004")
    config = load(DATA / "evaluation/config.json")
    remember(DATA / "evaluation/vision-candidate-manifest.json")
    remember(DATA / "annotations/raw/cord-v2-train-004.json")
    manifest_path = remember(DATA / "manifest.jsonl")
    record = next(row for row in map(json.loads, manifest_path.read_text(encoding="utf-8").splitlines())
                  if row["receipt_id"] == label["receipt_id"])
    remember(DATA / record["file_path"], record["sha256"])
    vision_meta, vision_drafts, vision_raw = native("reading-currency-live-v1")
    pilot_meta, _, _ = native("reading-currency-paddle-live-v1")
    primary_meta, primary_drafts, _ = native("reading-currency-paddle-live-v2")
    if any(meta["cases"][0]["panels"] != primary_meta["cases"][0]["panels"] for meta in (vision_meta, pilot_meta)):
        raise ValueError("The native readers did not receive identical prepared pixels")
    if primary_meta.get("currency_context_sent_to_model") is not False or any(
            meta["image_sha256"] != record["sha256"] for meta in (vision_meta, pilot_meta, primary_meta)):
        raise ValueError("The final control unexpectedly changed native extraction inputs")
    if primary_meta["cases"][0]["request_sha256"] != primary_meta["cases"][1]["request_sha256"]:
        raise ValueError("The primary model saw more than the same receipt panels")
    log("reading-currency-unit-final-v4.log", "357 passed")
    log("reading-currency-build-final-v2.log", "built in")
    log("reading-currency-format-final-v2.log", "All matched files")
    log("reading-currency-e2e-final-v3.log", "139 passed")
    log("reading-currency-e2e-final-v3.log", "1 skipped")
    for name in ("reading-currency-control-mobile-320.png", "reading-currency-control-mobile-390.png"):
        source = QA / name
        target = QA / "reading-currency-checkpoint-final" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and sha(target) != sha(source):
            raise ValueError("Preserve the original rendered evidence")
        if not target.exists():
            target.write_bytes(source.read_bytes())
        remember(target, sha(source))
    protection = load(QA / "reading-currency-protection-audit.json")
    if protection["stable"] != "ee725ba45e799bee8501d3de034e0302c0127afd" or protection["original_diff_sha256"] != "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b":
        raise ValueError("Protected Git state changed")
    remember(Path(__file__))
    remember(Path(__file__).with_name("build_headerless_coupon_report.py"))
    remember(Path(__file__).with_name("build_provider_crop_report.py"))
    remember(Path(__file__).with_name("score.py"))
    # Final production sources are separate from the failed experimental prompt.
    for name in ("src/App.tsx", "src/lib/reading-context.mjs", "src/lib/parser.ts", "src/lib/gemini.ts",
                 "src/lib/local-vision.ts", "src/lib/compared-reader.ts", "src/lib/join-vision-batches.ts",
                 "src/lib/verify-readings.ts", "src/lib/pdf-text.ts", "server/receipt-api.mjs", "server/local-vision.mjs",
                 "tests/reading-context.test.ts", "tests/e2e/local-vision.spec.ts"):
        path = ROOT / name
        target = QA / "reading-currency-checkpoint-final/source" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and sha(target) != sha(path):
            raise ValueError("Final source snapshot already exists with other bytes")
        if not target.exists():
            target.write_bytes(path.read_bytes())
        remember(target, sha(path))
    comparisons = {split: regression(split) for split in ("development", "evaluation", "supplement")}
    if [comparisons[split]["receipts"] for split in comparisons] != [38, 12, 1]:
        raise ValueError("Unexpected default regression coverage")
    report = {"scope": "Optional user currency for primary text parsing and review. Not a new default extraction model, automatic currency inference or public-release acceptance.",
              "implemented": "A bounded currency choice before reading is used by primary OCR, PDF text and independent comparison. It supplies missing review currency, preserves conflicting printed/model currency as unresolved and retains mandatory source checks. Canonical AI amounts are never reinterpreted. The final app sends no currency context to model prompts; previous request shapes, decoder, inference settings and backend source are preserved.",
              "source_review": "Actual source image inspected: one BASO BIHUN row, quantity 1, unit/line 43.636, TOTAL 43.636, TAX 10.00% 4.364, GRAND TOTAL 48.000, TUNAI 50.000 and KEMBALI 2.000. Dots group rupiah thousands. Existing upstream annotation and known IDR dataset/user context are disclosed. Header is publisher-blurred; no independent human verification or new holdout is claimed.",
              "final_primary_native": {"cases": [score_native(label, row, config) for row in primary_drafts],
                                       "same_request_and_pixels": True, "elapsed_ms": [case["elapsed_ms"] for case in primary_meta["cases"]],
                                       "finding": "Explicit IDR converts unreadable raw line/total tokens to the correct 43636 and 48000. Quantity/unit price and separately added tax remain missing, so the bill stays blocked. No complete-receipt success is claimed."},
              "rejected_vision_prompt_experiment": {"enabled_in_final_app": False,
                  "cases": [score_native(label, row, config) for row in vision_drafts],
                  "same_prepared_pixels": True, "elapsed_ms": [case["elapsed_ms"] for case in vision_meta["cases"]],
                  "finding": "A trusted enum-only currency prompt hint selected IDR but did not normalize printed monetary tokens. It changed two erroneous payment/deposit proposals into four erroneous tip proposals, including tax, grand total, cash and change. Both drafts remain financially blocked. The prompt/API/client transport change was withdrawn; failed source snapshots and raw outputs are retained.",
                  "unhinted_proposed_adjustment_kinds": [row["kind"] for row in vision_raw[0]["receipt"]["adjustments"]],
                  "hinted_proposed_adjustment_kinds": [row["kind"] for row in vision_raw[1]["receipt"]["adjustments"]]},
              "timing_limits": "One source-informed development transaction, ordered unhinted then selected. Timings include UI preparation, native loading/inference, observation and localhost transport. Warm OS/model caches and order differ; the shorter selected run is not evidence that choosing currency improves speed. No p95, isolated-engine, phone-hardware or full-corpus accuracy claim. Exact Chrome build was not captured in these native pilot metadata files.",
              "native_local_http_requests": 6, "external_requests": 0, "paid_service_activation": False,
              "default_regressions": comparisons,
              "validation": {"unit_passed": 357, "browser_passed": 139, "browser_existing_skip": 1,
                             "build_typecheck_format_graph": "passed", "phone_viewports_inspected": [320, 390]},
              "remaining": "Stronger independent extraction and raw-number normalization need measured profiles. Missing quantities/tax, payment-vs-charge classification, complete truth, broader quality/recovery and public deployment requirements remain open. The separately approved Veryfi test still requires the user's unused Free quota confirmation; none of these local calls consumes that approval.",
              "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(evidence.EVIDENCE)}}
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "native_http_requests": 6,
                      "default_cases_unchanged": 51, "failed_prompt_withdrawn": True}))


if __name__ == "__main__":
    main()
