"""Summarize the sealed Qwen3.5 diagnostic without repair, uploads or inference."""
import json
from pathlib import Path
import sys

from build_glm_ocr_pilot_report import CONTROL, EVIDENCE, QA, ROOT, RUNS, aggregate, load, native, remember, scored, sha, verify_reimport

OUTPUT = ROOT / "receipt_training/evaluation/advanced-qwen35-pilot.json"


def main():
    if "--check" in sys.argv:
        report = json.loads(OUTPUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "financial_cases": 6, "selected": False}))
        return
    base_path = QA / "qwen-numeric-rounding-v2.json"
    base = load(base_path)
    plan = load(QA / "qwen35-structured-pilot-v1.json")
    profile_path = QA / "qwen35-structured-synthetic-request-v5.json"
    profile = load(remember(profile_path, plan["synthetic_profile_sha256"]))
    remember(QA / "qwen35-structured-pilot-v1-requests/builder.py", plan["builder_sha256"])
    if plan["base_plan_sha256"] != sha(base_path) or plan["label_files_read"] or plan["input_ocr_text"] or plan["prompt_policy"] != "base prompt plus explicit schema":
        raise ValueError("Sealed pilot scope changed")
    if [case["id"] for case in plan["pilot"]] != [case["id"] for case in base["pilot"]]:
        raise ValueError("Case selection/order differs from the previous pilot")
    suffix = '\nYour response MUST match this complete JSON Schema; include every required field, including empty arrays and unknown metadata. The schema is format guidance, never receipt evidence.\n' + json.dumps(profile["schema"], ensure_ascii=False, separators=(',', ':'))
    if not profile["prompt"].endswith(suffix):
        raise ValueError("Synthetic-tested explicit contract changed")
    native_metadata = []
    for case, old_case in zip(plan["pilot"], base["pilot"]):
        old = load(remember(ROOT / old_case["request"], old_case["request_sha256"]))
        request_path = ROOT / case["request"]
        request = load(remember(request_path, case["request_sha256"]))
        if request["images"] != old["images"] or request["source_image_sha256"] != old["source_image_sha256"] or request["schema"] != old["schema"] or request["prompt"] != old["prompt"] + suffix:
            raise ValueError("Model-specific profile changed the original evidence/semantics")
        for key in ["context", "max_tokens", "image_tokens", "constrain_schema", "normalize_numeric_json", "chat_template_kwargs", "model_manifest"]:
            if request[key] != profile[key]:
                raise ValueError("Pilot mixed model profiles")
        panel_path = RUNS / request["source_panel_run"] / "predictions.jsonl"
        remember(panel_path, request["source_panel_manifest_sha256"])
        source = next(row for row in map(json.loads, panel_path.read_text(encoding="utf-8").splitlines()) if row["receipt_id"] == case["id"])
        if source["image_sha256"] != request["source_image_sha256"] or [sha(ROOT / image) for image in request["images"]] != [panel["sha256"] for panel in source["panels"]]:
            raise ValueError("Original image/panel pixels changed")
        meta = native(QA / ("qwen35-structured-v1-" + case["id"]), request_path, case["request_sha256"])
        if meta["prompt_escape_sequences_processed"] or meta["decoder_schema_enforced"] or meta["settings"]["chat_template_kwargs"] != {"enable_thinking": False}:
            raise ValueError("The non-thinking literal-prompt profile changed")
        native_metadata.append(meta)
    if len({meta["harness_sha256"] for meta in native_metadata}) != 1:
        raise ValueError("Pilot changed its harness during inference")
    original, source_hashes = scored("qwen35-structured-pilot-v1-original-replay", "paddle-vl16-text-pilot-v1-original", ROOT / "receipt_training/manifest.jsonl", ROOT / "receipt_training/annotations/labels.jsonl", "structured.jsonl")
    supplement, other_hashes = scored("qwen35-structured-pilot-v1-supplement", "paddle-vl16-text-pilot-v1-supplement", ROOT / "receipt_training/annotations/private/supplement-manifest.jsonl", ROOT / "receipt_training/annotations/private/supplement-labels.jsonl", "structured.jsonl")
    old_meta = load(RUNS / "qwen-vl4b-pilot-v2-original/metadata.json")
    if source_hashes != other_hashes or source_hashes != old_meta["source_sha256"]:
        raise ValueError("Parser/validation source differs from the previous candidate")
    financial = [row for row in original + supplement if row["receipt_id"] != CONTROL]
    if len(financial) != 6 or len({row["receipt_id"] for row in financial}) != 6:
        raise ValueError("Financial/control scope changed")
    controls = [row for row in original if row["receipt_id"] == CONTROL]
    synthetic = []
    for attempt in range(1, 6):
        folder = QA / f"qwen35-structured-synthetic-v{attempt}"
        meta = load(folder / "metadata.json")
        native(folder, folder / "request.json", meta["request_sha256"])
        synthetic.append({"attempt": attempt, "elapsed_ms": meta["elapsed_ms"], "parsed_json": meta["parsed_json"], "error": meta.get("error")})
    schema_check = load(QA / "qwen35-synthetic-schema-check.json")
    remember(ROOT / schema_check["schema_source"], schema_check["schema_sha256"])
    remember(QA / "qwen35-synthetic-schema-check.mjs")
    for name in ["run_qwen35_structured_pilot_v1.py", "qwen35-structured-pilot-v1-status.json", "qwen35-structured-pilot-v1.log", "qwen35-setup.log", "qwen35-research.json"]:
        remember(QA / name)
    remember(QA / "qwen35-structured-pilot-v1-original-evaluate.log")
    remember(QA / "qwen35-structured-pilot-v1-original-replay-evaluate.log")
    remember(Path(__file__))
    remember(Path(__file__).with_name("build_glm_ocr_pilot_report.py"))
    remember(Path(__file__).with_name("score.py"))
    previous = load(ROOT / "receipt_training/evaluation/advanced-vision-pilot-v2.json")
    glm = load(ROOT / "receipt_training/evaluation/advanced-glm-ocr-pilot.json")
    replay_verified = verify_reimport("qwen35-structured-pilot-v1-verified-import", "qwen35-structured-pilot-v1-frozen-helper-reimport", "structured.jsonl")
    metrics = aggregate(financial)
    report = {"scope": "Seven previously inspected diagnostic cases: six financial receipts and one predeclared nonfinancial control, with identical source pixels/order, annotations and frozen application source. Not a blind holdout or original-50 benchmark.",
              "model_manifest": "receipt_training/evaluation/qwen35-candidate-manifest.json",
              "weights": "Unsloth Qwen3.5-4B Q4_K_M conversion and F16 projector; not an official Qwen GGUF release. Model card declares Apache-2.0.",
              "source_snapshots_equal_to_qwen_v2": True,
              "protocol": "Documented enable_thinking:false; original per-case semantic prompt plus its explicit JSON schema. Forced native grammar disabled after a sampler initialization failure. Literal prompt escape handling disabled. Bounded exact typed-format adapter; no financial repair or metadata removal.",
              "selected_cases": len(plan["pilot"]), "native_processes": len(native_metadata),
              "native_exit_zero": sum(meta["exit_code"] == 0 for meta in native_metadata),
              "json_format_successes": sum(meta.get("parsed_json", False) for meta in native_metadata),
              "strict_application_schema_passes": sum(row["counts"].get("processing_errors", 0) == 0 for row in original + supplement),
              "financial_metrics": metrics, "control": aggregate(controls),
              "previous_qwen_financial_metrics": previous["financial_metrics"],
              "glm_financial_metrics": {mode: value["financial_metrics"] for mode, value in glm["profiles"].items()},
              "synthetic_compatibility_attempts": synthetic, "synthetic_strict_validation": schema_check["records"],
              "compatibility_findings": ["First unconstrained attempt omitted the receipt-level contract", "Forced native grammar failed inside sampler initialization, without an answer", "Explicit-schema prompt was altered by default native escape handling; that transcript remained rejected", "Literal-prompt attempt passed strict schema and copied both test rows and total", "Exact original-pilot schema control copied $schema into its answer and was rejected; that metadata was not silently removed"],
              "evaluation_launch_failure": "Two browser scoring processes collided on their fixed local port. The original scoring launch was preserved, then replayed sequentially under a new name from the same existing native outputs. No model inference was repeated.",
              "native_elapsed_ms": [meta["elapsed_ms"] for meta in native_metadata],
              "peak_cli_working_set_bytes": max(meta["peak_process_working_set_bytes"] for meta in native_metadata),
              "timing_scope": "Fresh CLI/model loading, image encoding and generation; scored timings also add frozen browser validation/RPC. Initial preparation, setup and download excluded; caches may be warm. Process working set excludes GPU and whole-system memory.",
              "api_requests": 0, "external_receipt_uploads": 0, "api_cost_usd": "0", "hardware_compute_cost_usd": None,
              "byte_identical_frozen_decoder_reimport_verified": replay_verified,
              "selected_for_application": False,
              "decision": "This diagnostic alone cannot establish an application replacement. Contract failures remain failures and complete financial verification remains required. Any improved profile needs a separately declared trial before a full original-cohort comparison.",
              "limitations": ["Only one financial case has explicitly complete truth; five are unscorable for strict complete accuracy", "Partial labels and CORD modifier omissions constrain precision", "Model-generated confidence was not used as proof", "No values, discounts, totals or financial uncertainty were repaired after inference"],
              "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(EVIDENCE)}}
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "verified_files": len(EVIDENCE), "counts": metrics["counts"]}))


if __name__ == "__main__":
    main()
