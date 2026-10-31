"""Freeze six-case local evidence and prepared, unconsumed cloud scope."""
from collections import defaultdict
import json
from pathlib import Path
import sys

import build_printed_provider_checkpoint as audit

ROOT, QA = audit.ROOT, audit.QA
FOLDER = QA / "provider-review/veryfi-screening-crops-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-provider-screening-preparation-v1.json"
load, remember = audit.load, audit.remember


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            remember(ROOT / name, digest)
        print(json.dumps({"verified_files": len(audit.EVIDENCE), "scope": "six-case native controls and pending cloud preparation"}))
        return
    if OUT.exists():
        raise ValueError("Keep the checkpoint; use --check")
    if (FOLDER / "consumed.json").exists() or (FOLDER / "run").exists():
        raise ValueError("The cloud state changed; this pending-only checkpoint is no longer appropriate")
    cloud_path = ROOT / "receipt_training/evaluation/veryfi-screening-plan-v1.json"
    cloud = load(cloud_path)
    for name, digest in cloud["evidence_sha256"].items():
        remember(ROOT / name, digest)
    native_folder = FOLDER / "native-protocol-v1"
    plan = load(native_folder / "plan.json")
    remember(cloud_path, plan["cloud_plan_sha256_unchanged"])
    execution = load(native_folder / "execution.json")
    for result in execution["results"]:
        if result["exit_code"] or result["timeout"]:
            raise ValueError("Native execution did not finish")
        for suffix, key in (("stdout", "stdout_sha256"), ("stderr", "stderr_sha256")):
            remember(native_folder / (result["tag"] + "-" + suffix + ".txt"), result[key])
        load(native_folder / (result["tag"] + "-metadata.json"))
    remember(native_folder / "local-consumed.json")
    paddle = ROOT / "receipt_training/evaluation/runs" / plan["paddle_run"]
    paddle_meta = load(paddle / "metadata.json")
    remember(paddle / "ocr.jsonl", paddle_meta["ocr_sha256"])
    panels = ROOT / "receipt_training/evaluation/runs" / plan["panel_run"]
    load(panels / "metadata.json")
    remember(panels / "predictions.jsonl", plan["panel_manifest_sha256"])
    for case in plan["cases"]:
        remember(panels / "panels" / (case["case"] + ".png"), case["crop_sha256"])
        audit.native(QA / "advanced-ocr" / case["qwen_run"], case["request_sha256"],
                     plan["source_sha256"]["receipt_training/scripts/benchmark_vision_cli.py"])
    failed = load(FOLDER / "local-comparison-v1/metadata.json")
    for name, digest in failed["source_sha256"].items():
        remember(FOLDER / "local-comparison-v1/source" / name, digest)
    for module in failed["loaded_modules"].values():
        remember(FOLDER / "local-comparison-v1" / module["path"], module["sha256"])
    for case in failed["cases"]:
        remember(FOLDER / "local-comparison-v1" / case["case"] / "result.json", case["result_sha256"])
        for response in case["http_requests"]:
            name = "response-recognize.json" if response["path"].endswith("recognize") else "response-vision.json"
            remember(FOLDER / "local-comparison-v1" / case["case"] / name, response["response_sha256"])
    offline = native_folder / "offline-v1"
    meta = load(offline / "metadata.json")
    for name, digest in meta["source_sha256"].items():
        remember(offline / "source" / Path(name).name, digest)
    remember(offline / "processor.mjs", meta["processor_sha256"])
    predictions_path = offline / "predictions.jsonl"
    remember(predictions_path, meta["predictions_sha256"])
    predictions = list(map(json.loads, predictions_path.read_text(encoding="utf-8").splitlines()))
    labels = {row["receipt_id"]: row for row in map(json.loads, (FOLDER / "screening-labels-v1.jsonl").read_text(encoding="utf-8").splitlines())}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    summary = defaultdict(lambda: defaultdict(int))
    cases = []
    for prediction in predictions:
        score = audit.field_score(labels[prediction["receipt_id"]], prediction, config)
        tag = prediction["method"] + "/" + prediction["mode"]
        aggregate = summary[tag]
        for key in ("expected_purchases", "proposed_rows", "matched_purchase_names", "unmatched_proposed_rows", "exact_normalized_descriptions"):
            aggregate[key] += score[key]
        for field, result in score["field_equality"].items():
            for key, value in result.items():
                aggregate[field + "_" + key] += value
        aggregate["correct_printed_totals"] += score["document_equality"]["printedTotal"] is True
        aggregate["research_acceptances"] += int(score["accepted_payable_result"])
        cases.append({"case": prediction["case"], "receipt_id": prediction["receipt_id"],
                      "method": prediction["method"], "mode": prediction["mode"], **score})
    for name in (Path(__file__), ROOT / "receipt_training/scripts/build_printed_provider_checkpoint.py",
                 ROOT / "receipt_training/scripts/score.py", ROOT / "receipt_training/scripts/process_screening_native.mjs"):
        remember(name)
    for name in ("veryfi-screening-local-live-v1.log", "veryfi-screening-native-live-v1.log"):
        remember(QA / name)
    report = {
        "scope": "Six source-informed physical-receipt cases and 26 priced reference rows. Independent native PNG model reads, frozen-code offline parsing, and an unconsumed six-case cloud plan. Not a new holdout, provider promotion or public-release acceptance.",
        "cloud_at_checkpoint": {"prepared_cases": 6, "processing_requests": 0, "approval_received": False,
                                "free_quota_for_six_confirmed": False, "billing_activated": False,
                                "state": "Separate scoped approval question pending; existing one-case approval was already consumed"},
        "local_protocol_correction": {"first_http_attempts": 6, "image_validation_rejections": 2, "rate_limited": 4,
                                      "successful_ocr_extractions": 0, "app_security_checks_changed": False,
                                      "correction": "Preserved failed HTTP/browser setup and sealed separate direct-native PNG controls. Same six cloud input hashes/options/authorization scope; no private provider retry."},
        "native_execution": {"paddle_receipts": 6, "qwen_receipts": 6, "execution": execution["results"],
                             "paddle_inference_component": {"model_initialization_ms": paddle_meta["model_initialization_ms"],
                                                            "peak_working_set_bytes": paddle_meta.get("peak_working_set_bytes"),
                                                            "timing_scope": paddle_meta["timing_scope"]},
                             "external_receipt_uploads": 0, "automatic_retries": 0},
        "offline_replay": {"drafts": len(predictions), "loaded_frozen_modules": len(meta["loaded_frozen_module_sha256"]),
                           "context_scope": meta["context_scope"], "model_requests": 0},
        "aggregate": {key: dict(value) for key, value in summary.items()}, "per_case": cases,
        "observations": [
            "Qwen matches all 26 priced-row descriptions and 22/25 known line prices. The independent hybrid retains those counts on this screen; it does not improve line-price equality or attach any of the three Bristol coupons.",
            "Paddle matches 20/26 reference descriptions. Known-currency context raises its exact line-price count from 13/25 to 19/25, with no new model calls. That is simulated post-extraction context, not currency inference or recovered canonical VLM money.",
            "All three paths fail to produce a source-verified payable receipt here. Artificial research coverage checks remain; invalid zero placeholders/discrepancies do not count as successful bills.",
            "The Tesco first reduced price, all unprinted purchased quantities/unit prices and ambiguous Taiwan redemption ownership remain unscored. Unmatched rows can include coupons/deductions or hallucinations; the unmatched count is not a purchase-precision score.",
            "Unknown tax inclusion becomes a provisional inclusive Boolean in the current AI adapter with a warning, which can omit added tax. The six-case before evidence is preserved for a separate review-gate fix, without guessing the tax basis from arithmetic.",
        ],
        "limits": ["Original fifty-receipt labels/splits/permissions and frozen earlier measurements are unchanged; the 11-row new Tesco/Taiwan reference is separate.",
                   "No Veryfi accuracy on these six cases exists yet. The successful earlier one-receipt result cannot substitute for this missing screen.",
                   "Paddle warm per-receipt inference, Qwen fresh native model loading and earlier provider network-plus-cleanup timing are different scopes; no p95 or provider speed ranking is claimed.",
                   "Model and artifact setup are not an integrated live-browser or physical-phone verification. Digital/long-camera/refund cases and the full production goal remain open."],
        "evidence_sha256": audit.EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        json.dump(report, handle, ensure_ascii=False, indent=2)
        handle.write("\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "verified_files": len(audit.EVIDENCE),
                      "native_receipt_reads": 12, "offline_variants": len(predictions), "cloud_requests": 0}))


if __name__ == "__main__":
    main()
