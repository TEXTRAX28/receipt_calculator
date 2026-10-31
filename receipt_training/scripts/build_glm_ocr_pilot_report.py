"""Verify and summarize the sealed GLM model-only pilots; no network or inference."""
from functools import lru_cache
import hashlib
import json
from pathlib import Path
import runpy
import sys
import re

from score import aggregate

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts/advanced-ocr"
RUNS = ROOT / "receipt_training/evaluation/runs"
OUTPUT = ROOT / "receipt_training/evaluation/advanced-glm-ocr-pilot.json"
CONTROL = "costco-tw-photo-20130612"
EVIDENCE = set()


@lru_cache(maxsize=None)
def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    path = path.resolve()
    path.relative_to(ROOT)
    if expected is not None and sha(path) != expected:
        raise ValueError("Evidence changed: " + path.relative_to(ROOT).as_posix())
    EVIDENCE.add(path)
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def native(folder, request_path, request_hash):
    meta = load(folder / "metadata.json")
    request = load(remember(request_path, request_hash))
    remember(folder / "request.json", request_hash)
    if meta["request_sha256"] != request_hash or not meta.get("completed_at"):
        raise ValueError("Native run lacks the sealed completed request")
    if any(meta[k] for k in ["external_api_requests", "external_receipt_uploads", "label_files_read", "input_ocr_text"]):
        raise ValueError("Model pilot scope changed")
    for filename, key in [("stdout.txt", "stdout_sha256"), ("stderr.txt", "stderr_sha256"), ("harness.py", "harness_sha256"),
                          ("vision_cli_text.py", "text_helper_sha256"), ("transcript.txt", "transcript_sha256")]:
        remember(folder / filename, meta[key])
    manifest_path = ROOT / request["model_manifest"]
    remember(manifest_path, meta["manifest_sha256"])
    remember(folder / "model-manifest.json", meta["manifest_sha256"])
    manifest = load(manifest_path)
    cache = ROOT / "receipt_training/.cache/vision-experiment"
    remember(cache / ("runtime-" + manifest["runtime_build"]) / meta["runtime_executable"], meta["cli_sha256"])
    for asset in manifest["files"]:
        path = remember(cache / asset["path"], asset["sha256"])
        if path.stat().st_size != asset["bytes"]:
            raise ValueError("Model/runtime asset size changed")
    if len(meta["images"]) != len(request["images"]):
        raise ValueError("Native image count changed")
    for name, image in zip(request["images"], meta["images"]):
        path = remember(ROOT / name, image["sha256"])
        if path != (ROOT / image["path"]).resolve():
            raise ValueError("Native input path changed")
    # Execute only our checksum-verified, archived pure decoder functions.
    decoder = runpy.run_path(str(folder / "vision_cli_text.py"))["parse_cli_transcript"]
    decoded = None
    try:
        text = decoder((folder / "transcript.txt").read_text(encoding="utf-8"), request["prompt"])
        if meta["output_mode"] == "text":
            decoded = text.strip()
        elif meta.get("json_adapter_sha256"):
            helper = remember(folder / "vision_cli_json.py", meta["json_adapter_sha256"])
            decoded = runpy.run_path(str(helper))["decode_structured_reply"](text)
        else:
            decoded = json.loads(text)
    except (ValueError, UnicodeError):
        pass
    parsed = meta.get("parsed_json", meta.get("parsed_text", False))
    if bool(decoded is not None) != bool(parsed):
        raise ValueError("Archived decoder does not reproduce the saved outcome")
    if parsed:
        output = remember(folder / ("model-output.txt" if meta["output_mode"] == "text" else "model-output.json"))
        saved = output.read_text(encoding="utf-8")
        if decoded != (saved if meta["output_mode"] == "text" else json.loads(saved)):
            raise ValueError("Saved model output differs from its raw transcript")
    return meta


def scored(name, baseline, manifest_path, labels_path, candidate_file):
    folder = RUNS / name
    meta = load(folder / "metadata.json")
    baseline_meta = load(RUNS / baseline / "metadata.json")
    if not meta.get("source_served_from_frozen_snapshot") or meta["source_sha256"] != baseline_meta["source_sha256"]:
        raise ValueError("Candidate parser differs from its frozen comparator")
    for filename, expected in meta["source_sha256"].items():
        remember(folder / "source" / filename, expected)
        remember(RUNS / baseline / "source" / filename, expected)
    remember(folder / "predictions.jsonl", meta["predictions_sha256"])
    remember(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
    remember(ROOT / "receipt_training/evaluation/config.json", meta["config_sha256"])
    key = "candidate_ocr_sha256" if candidate_file == "ocr.jsonl" else "candidate_structured_sha256"
    remember(RUNS / meta["candidate_run"] / candidate_file, meta[key])
    load(RUNS / meta["candidate_run"] / "metadata.json")
    score = load(folder / "score.json")
    remember(manifest_path, score["manifest_sha256"])
    remember(labels_path, score["labels_sha256"])
    if score["overall"] != aggregate(score["receipts"]):
        raise ValueError("Saved score aggregate differs from the per-case evidence")
    return score["receipts"], meta["source_sha256"]


def verify_reimport(original_run, replay_run, filename):
    original = remember(RUNS / original_run / filename)
    replay = remember(RUNS / replay_run / filename, sha(original))
    meta = load(RUNS / replay_run / "metadata.json")
    remember(replay.parent / "importer.py", meta["importer_sha256"])
    remember(replay.parent / "pilot.json", meta["predeclared_pilot_sha256"])
    if meta["api_requests"]:
        raise ValueError("Reimport may not call a provider")
    return True


def main():
    if "--check" in sys.argv:
        report = json.loads(OUTPUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "financial_cases_per_mode": 6, "selected": False}))
        return
    base_path = QA / "qwen-numeric-rounding-v2.json"
    base = load(base_path)
    base_cases = {case["id"]: case for case in base["pilot"]}
    profiles = {}
    for mode in ["text", "structured"]:
        name = f"glm-ocr-{mode}-pilot-v1"
        plan = load(QA / (name + ".json"))
        if plan["base_plan_sha256"] != sha(base_path) or plan["label_files_read"] or plan["input_ocr_text"]:
            raise ValueError("Sealed selection/input scope changed")
        builder = (QA / (name + "-requests") / "builder.py") if mode == "structured" else Path(__file__).with_name("prepare_vlm_text_pilot.py")
        remember(builder, plan["builder_sha256"])
        if mode == "structured":
            remember(QA / "glm-ocr-structured-synthetic-request-v3.json", plan["synthetic_profile_sha256"])
        cases = plan["cases" if mode == "text" else "pilot"]
        if set(case["id"] for case in cases) != set(base_cases):
            raise ValueError("Pilot case selection differs from the comparator")
        native_meta = []
        for case in cases:
            old = load(remember(ROOT / base_cases[case["id"]]["request"], base_cases[case["id"]]["request_sha256"]))
            entries = case["panels"] if mode == "text" else [case]
            seen_images = []
            for index, entry in enumerate(entries):
                request_path = ROOT / entry["request"]
                request = load(remember(request_path, entry["request_sha256"]))
                if request["source_image_sha256"] != old["source_image_sha256"]:
                    raise ValueError("Original source image attribution changed")
                panel_manifest = RUNS / request["source_panel_run"] / "predictions.jsonl"
                remember(panel_manifest, request["source_panel_manifest_sha256"])
                source = next(row for row in map(json.loads, panel_manifest.read_text(encoding="utf-8").splitlines()) if row["receipt_id"] == case["id"])
                if request["source_image_sha256"] != source["image_sha256"]:
                    raise ValueError("Source panel manifest changed")
                suffix = f"-panel-{index + 1}" if mode == "text" else ""
                folder = QA / f"glm-ocr-{mode}-v1-{case['id']}{suffix}"
                meta = native(folder, request_path, entry["request_sha256"])
                native_meta.append(meta)
                seen_images.extend(request["images"])
            if seen_images != old["images"]:
                raise ValueError("Candidate did not see the identical original panel pixels/order")
            if [sha(ROOT / image) for image in seen_images] != [panel["sha256"] for panel in source["panels"]]:
                raise ValueError("Prepared source panel pixels changed")
        original, source_hashes = scored(name + "-original", "paddle-vl16-text-pilot-v1-original", ROOT / "receipt_training/manifest.jsonl", ROOT / "receipt_training/annotations/labels.jsonl", "ocr.jsonl" if mode == "text" else "structured.jsonl")
        supplement_suffix = "-supplement-financial" if mode == "text" else "-supplement"
        supplement, other_hashes = scored(name + supplement_suffix, "paddle-vl16-text-pilot-v1-supplement", ROOT / "receipt_training/annotations/private/supplement-manifest.jsonl", ROOT / "receipt_training/annotations/private/supplement-labels.jsonl", "ocr.jsonl" if mode == "text" else "structured.jsonl")
        qwen = load(RUNS / "qwen-vl4b-pilot-v2-original/metadata.json")
        if source_hashes != other_hashes or source_hashes != qwen["source_sha256"]:
            raise ValueError("Parser comparison is not between identical snapshots")
        financial = [row for row in original + supplement if row["receipt_id"] != CONTROL]
        if len(financial) != 6 or len({row["receipt_id"] for row in financial}) != 6:
            raise ValueError("Financial/control selection changed")
        controls = [row for row in original if row["receipt_id"] == CONTROL]
        profiles[mode] = {"financial_metrics": aggregate(financial), "control": aggregate(controls),
                          "selected_cases": len(cases), "native_processes": len(native_meta),
                          "native_exit_zero": sum(meta["exit_code"] == 0 for meta in native_meta),
                          "format_successes": sum(bool(meta.get("parsed_json", meta.get("parsed_text"))) for meta in native_meta),
                          "strict_application_schema_passes": sum(row["counts"].get("processing_errors", 0) == 0 for row in original + supplement) if mode == "structured" else None,
                          "native_elapsed_ms": [meta["elapsed_ms"] for meta in native_meta],
                          "peak_cli_working_set_bytes": max(meta["peak_process_working_set_bytes"] for meta in native_meta),
                          "source_snapshots_equal_to_qwen_v2": True}
    synthetic = []
    for name in ["glm-ocr-synthetic-smoke-v1", "glm-ocr-structured-synthetic-v1", "glm-ocr-structured-synthetic-v2", "glm-ocr-structured-synthetic-v3"]:
        folder = QA / name
        meta = load(folder / "metadata.json")
        verified = native(folder, folder / "request.json", meta["request_sha256"])
        synthetic.append({"run": name, "elapsed_ms": verified["elapsed_ms"], "exit_code": verified["exit_code"],
                          "parsed_json": verified.get("parsed_json"), "parsed_text": verified.get("parsed_text"), "error": verified.get("error")})
    # Preserve the failed evaluation selection too; it did not trigger new inference.
    for filename in ["metadata.json", "predictions.jsonl", "evaluate.mjs"]:
        remember(RUNS / "glm-ocr-text-pilot-v1-supplement" / filename)
    remember(QA / "glm-ocr-text-pilot-v1-supplement-score.log")
    remember(Path(__file__))
    remember(Path(__file__).with_name("score.py"))
    remember(ROOT / "receipt_training/evaluation/advanced-paddle-vl16-pilot.json")
    remember(ROOT / "receipt_training/evaluation/advanced-vision-pilot-v2.json")
    replay_verified = verify_reimport("glm-ocr-text-pilot-v1-verified-import", "glm-ocr-text-pilot-v1-frozen-helper-reimport", "ocr.jsonl")
    tests_path = remember(QA / "model-pilot-python-tests-v1.log")
    tests = tests_path.read_text(encoding="utf-8")
    if not re.search(r"Ran 46 tests", tests) or not re.search(r"\bOK\s*$", tests):
        raise ValueError("Checkpoint Python verification did not pass")
    for path in Path(__file__).parent.glob("test_*.py"):
        remember(path)
    report = {"scope": "Two model-only GLM-OCR modes on the previously inspected seven-case diagnostic pilot, six financial cases and one nonfinancial control. Not a blind holdout or original-50 benchmark.",
              "model_manifest": "receipt_training/evaluation/glm-ocr-candidate-manifest.json",
              "model_license": "MIT model-card declaration; the separately published SDK code is Apache-2.0",
              "full_official_sdk_layout_pipeline_tested": False, "selected_for_application": False,
              "decision": "Neither GLM mode beat the existing Qwen structured candidate financially. No app reader was replaced.",
              "profiles": profiles, "synthetic_compatibility_attempts": synthetic,
              "structured_contract": "No forced native decoder after a synthetic sampler initialization failure. One complete JSON object/fence; explicitly named numeric fields become exact decimal strings. Missing values, incorrect counts, wrong amounts and malformed answers are retained or rejected, never repaired.",
              "synthetic_limit": "The final structured control copied two rows and the final total, but invented printedItemCount=1 and retained unknown tax inclusion. A usable JSON response is not a correct receipt.",
              "evaluation_selection_failure": "An initial supplement replay included a predeclared nonfinancial control with no supplement label record. Scoring refused it. A financial-only replay used the same existing native evidence; no inference was rerun.",
              "api_requests": 0, "external_receipt_uploads": 0, "api_cost_usd": "0", "hardware_compute_cost_usd": None,
              "byte_identical_frozen_decoder_reimport_verified": replay_verified, "python_tests_passed": 46,
              "timing_scope": "Fresh local CLI/model loading, image encoding and generation, plus frozen browser parsing/RPC for scored timing. Preparation/download/setup excluded; OS/shader caches may be warm. CLI working set excludes GPU/whole-system memory. No production speed advantage claimed.",
              "limitations": ["Only one financial case has explicitly complete truth; five remain unscorable for strict complete accuracy", "Model-only text has no word geometry or confidence", "Partial labels and CORD modifier omissions constrain precision", "All six financial drafts require review in both modes", "No currency, financial values, discounts or totals were repaired after seeing results"],
              "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(EVIDENCE)}}
    OUTPUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUTPUT.relative_to(ROOT).as_posix(), "verified_files": len(EVIDENCE), "selected": False}))


if __name__ == "__main__":
    main()
