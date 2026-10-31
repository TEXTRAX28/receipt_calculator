"""Verify a sealed local VLM text pilot, preserving values and absent geometry."""
import argparse
import hashlib
import json
from pathlib import Path
import re

from vision_cli_text import parse_cli_transcript

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(value):
    path = (ROOT / value).resolve()
    path.relative_to(ROOT)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pilot", required=True)
    parser.add_argument("--prefix", required=True)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    if not all(re.fullmatch(r"[\w-]+", value) for value in [args.prefix, args.run]):
        raise ValueError("Use simple run names")
    plan_path = local(args.pilot)
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    qa = plan_path.parent
    manifest = local(plan["model_manifest"])
    if sha(manifest) != plan["model_manifest_sha256"]:
        raise ValueError("Sealed model profile changed")
    out = ROOT / "receipt_training/evaluation/runs" / args.run
    if out.exists():
        raise ValueError("Preserve an existing run; choose a new name")
    records, evidence, all_meta = [], [], []
    for case in plan["cases"]:
        if not re.fullmatch(r"[\w-]+", case["id"]) or not re.fullmatch(r"[\w-]+", case["source_panel_run"]):
            raise ValueError("Invalid case/source panel run")
        panel_dir = ROOT / "receipt_training/evaluation/runs" / case["source_panel_run"]
        panel_manifest = panel_dir / "predictions.jsonl"
        if sha(panel_manifest) != case["source_panel_manifest_sha256"]:
            raise ValueError("Frozen panel manifest changed")
        original = next(r for r in map(json.loads, panel_manifest.read_text(encoding="utf-8").splitlines()) if r["receipt_id"] == case["id"])
        if original["image_sha256"] != case["image_sha256"] or len(original["panels"]) != len(case["panels"]):
            raise ValueError("Original source image mapping changed")
        panels, failures, elapsed = [], [], 0
        for expected_position, (panel, original_panel) in enumerate(zip(case["panels"], original["panels"])):
            if panel["position"] != expected_position or any(panel[k] != original_panel[k] for k in original_panel):
                raise ValueError("Predeclared panel position/attribution changed")
            request_path = local(panel["request"])
            if sha(request_path) != panel["request_sha256"]:
                raise ValueError("Sealed native request changed")
            request = json.loads(request_path.read_text(encoding="utf-8"))
            if request["output_mode"] != "text" or request["source_image_sha256"] != case["image_sha256"] or request["source_panel_position"] != expected_position:
                raise ValueError("Request output mode/source reference changed")
            image = local(request["images"][0])
            if len(request["images"]) != 1 or sha(image) != panel["sha256"] or sha(panel_dir / panel["file_path"]) != panel["sha256"]:
                raise ValueError("Source image pixels changed")
            raw = qa / f"{args.prefix}-{case['id']}-panel-{expected_position + 1}"
            meta = json.loads((raw / "metadata.json").read_text(encoding="utf-8"))
            if not meta.get("completed_at") or meta["request_sha256"] != panel["request_sha256"] or meta["manifest_sha256"] != plan["model_manifest_sha256"]:
                raise ValueError("Native run is incomplete or used another request/model")
            for filename, key in [("stdout.txt", "stdout_sha256"), ("stderr.txt", "stderr_sha256"), ("harness.py", "harness_sha256"), ("vision_cli_text.py", "text_helper_sha256")]:
                if sha(raw / filename) != meta[key]:
                    raise ValueError("Native raw stream or harness changed")
            if sha(Path(__file__).with_name("vision_cli_text.py")) != meta["text_helper_sha256"]:
                raise ValueError("Use the tested text-decoder version to reproduce this import")
            if meta["images"] != [{"path": str(image.relative_to(ROOT)), "sha256": panel["sha256"]}]:
                raise ValueError("Native process saw another image")
            elapsed += meta["elapsed_ms"]
            all_meta.append(meta)
            if meta["exit_code"] or meta.get("error") or not meta.get("parsed_text"):
                failures.append(expected_position)
                continue
            if sha(raw / "transcript.txt") != meta["transcript_sha256"]:
                raise ValueError("Native response transcript changed")
            decoded = parse_cli_transcript((raw / "transcript.txt").read_text(encoding="utf-8"), request["prompt"]).strip()
            if decoded != (raw / "model-output.txt").read_text(encoding="utf-8"):
                raise ValueError("Saved parsed text differs from the native transcript")
            panels.append({"photo_index": panel["photo_index"], "panel_index": panel["panel_index"], "width": panel["width"], "height": panel["height"],
                           "lines": [{"text": line} for line in decoded.splitlines()], "words": [], "geometry_available": False, "confidence_available": False})
            evidence.append({"receipt_id": case["id"], "panel": expected_position, "request_sha256": sha(request_path), "raw_metadata_sha256": sha(raw / "metadata.json"),
                             "transcript_sha256": meta["transcript_sha256"], "harness_sha256": meta["harness_sha256"], "text_helper_sha256": meta["text_helper_sha256"], "elapsed_ms": meta["elapsed_ms"], "peak_cli_process_working_set_bytes": meta["peak_process_working_set_bytes"]})
        row = {"receipt_id": case["id"], "image_sha256": case["image_sha256"], "inference_ms": elapsed, "panels": panels}
        if failures:
            row["error"] = f"Native element recognition failed for {len(failures)} source panel(s); incomplete receipts count as failures"
        records.append(row)
    if not records or len({r["receipt_id"] for r in records}) != len(records):
        raise ValueError("Empty or duplicate pilot cases")
    for key in ["model", "revision", "cli_sha256", "runtime_executable", "text_helper_sha256"]:
        if len({m[key] for m in all_meta}) != 1:
            raise ValueError("Pilot mixes models/runtimes/text decoders")
    out.mkdir(parents=True)
    (out / "ocr.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
    (out / "importer.py").write_bytes(Path(__file__).read_bytes())
    (out / "pilot.json").write_bytes(plan_path.read_bytes())
    metadata = {"adapter": all_meta[0]["model"] + "-OCR-component-" + all_meta[0]["runtime"], "completed_at": max(m["completed_at"] for m in all_meta), "ocr_sha256": sha(out / "ocr.jsonl"),
                "predeclared_pilot_sha256": sha(plan_path), "importer_sha256": sha(out / "importer.py"), "model_manifest_sha256": plan["model_manifest_sha256"], "selected_ids": [r["receipt_id"] for r in records],
                "label_files_read_for_inference": False, "input_ocr_text": False, "word_geometry_available": False, "word_confidence_available": False,
                "api_requests": 0, "api_cost_usd": "0", "compute_cost_usd": None, "panels": evidence,
                "timing_scope": "Sum of fresh CLI/model loading, image encoding and generation for each source panel; browser parser/reconciliation time added later. Initial shader cache can be warm. Not full PaddleOCR-VL layout pipeline or persistent-server throughput."}
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(json.dumps({"verified_cases": len(records), "verified_panels": len(evidence), "case_failures": sum("error" in r for r in records), "run": args.run}))


if __name__ == "__main__":
    main()
