"""Verify a sealed local-CLI pilot and import unchanged outputs for browser scoring.

Does not read labels or repair a model's financial values. Strict receipt/schema
and money validation happen later in evaluate.mjs --structured-run.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pilot", required=True, help="Project-relative sealed pilot JSON")
    parser.add_argument("--prefix", required=True, help="Raw per-case directory prefix")
    parser.add_argument("--run", required=True, help="New canonical structured run name")
    args = parser.parse_args()
    if not all(re.fullmatch(r"[\w-]+", s) for s in [args.prefix, args.run]):
        raise ValueError("Use simple run names")
    pilot_path = (ROOT / args.pilot).resolve()
    pilot_path.relative_to(ROOT)
    pilot = json.loads(pilot_path.read_text(encoding="utf-8"))
    qa = pilot_path.parent
    out = ROOT / "receipt_training/evaluation/runs" / args.run
    if out.exists():
        raise ValueError("Preserve existing outputs and choose a new run name")
    records, evidence, metadata = [], [], []
    for item in pilot["pilot"]:
        if not re.fullmatch(r"[\w-]+", item["id"]):
            raise ValueError("Invalid source ID")
        raw = qa / f"{args.prefix}-{item['id']}"
        meta = json.loads((raw / "metadata.json").read_text(encoding="utf-8"))
        request_path = (ROOT / item["request"]).resolve()
        request_path.relative_to(ROOT)
        if not meta.get("completed_at") or meta["request_sha256"] != item["request_sha256"] or sha(request_path) != item["request_sha256"]:
            raise ValueError("Inference request changed after predeclaration")
        for filename, key in [("stdout.txt", "stdout_sha256"), ("stderr.txt", "stderr_sha256"), ("harness.py", "harness_sha256")]:
            if sha(raw / filename) != meta[key]:
                raise ValueError("Saved raw output or harness changed")
        if meta.get("text_helper_sha256") and sha(raw / "vision_cli_text.py") != meta["text_helper_sha256"]:
            raise ValueError("Saved native-text helper changed")
        request = json.loads(request_path.read_text(encoding="utf-8"))
        if not re.fullmatch(r"[\w-]+", request["source_panel_run"]):
            raise ValueError("Invalid source panel run")
        panel_dir = ROOT / "receipt_training/evaluation/runs" / request["source_panel_run"]
        panel_file = panel_dir / "predictions.jsonl"
        if sha(panel_file) != request["source_panel_manifest_sha256"]:
            raise ValueError("Frozen source panel manifest changed")
        source = next(r for r in map(json.loads, panel_file.read_text(encoding="utf-8").splitlines()) if r["receipt_id"] == item["id"])
        if len(request["images"]) != len(source["panels"]) or request["source_image_sha256"] != source["image_sha256"]:
            raise ValueError("Vision inputs differ from the frozen source")
        for image, panel in zip(request["images"], source["panels"]):
            path = (ROOT / image).resolve()
            path.relative_to(ROOT)
            if sha(path) != panel["sha256"]:
                raise ValueError("Frozen image panel bytes changed")
        row = {"receipt_id": item["id"], "image_sha256": source["image_sha256"], "source_photos": sorted({p["photo_index"] + 1 for p in source["panels"]}), "reading_panels": len(source["panels"]), "inference_ms": meta["elapsed_ms"]}
        if meta.get("parsed_json") and meta["exit_code"] == 0 and not meta.get("error"):
            text = re.sub(r"\x1b\[[0-9;]*m", "", (raw / "stdout.txt").read_text(encoding="utf-8", errors="replace"))
            decoded, _ = json.JSONDecoder().raw_decode(text[text.index("{"):])
            if decoded != json.loads((raw / "model-output.json").read_text(encoding="utf-8")):
                raise ValueError("Parsed model output differs from the verified raw stream")
            row["receipt"] = decoded
        else:
            row["error"] = "Vision CLI failed to return complete JSON within its bounds"
        records.append(row)
        evidence.append({"receipt_id": item["id"], "raw_metadata_sha256": sha(raw / "metadata.json"), "request_sha256": sha(request_path), "stdout_sha256": meta["stdout_sha256"], "harness_sha256": meta["harness_sha256"], "peak_process_working_set_bytes": meta["peak_process_working_set_bytes"], "elapsed_ms": meta["elapsed_ms"]})
        metadata.append(meta)
    if not records or len({r["receipt_id"] for r in records}) != len(records):
        raise ValueError("Empty or duplicate pilot selection")
    for key in ["model", "revision", "manifest_sha256", "cli_sha256"]:
        if len({m[key] for m in metadata}) != 1:
            raise ValueError("Pilot mixes different models or runtimes")
    out.mkdir(parents=True)
    (out / "structured.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in records), encoding="utf-8")
    result = {"adapter": metadata[0]["model"] + "-" + metadata[0]["runtime"], "completed_at": max(m["completed_at"] for m in metadata), "structured_sha256": sha(out / "structured.jsonl"), "model_manifest_sha256": metadata[0]["manifest_sha256"], "predeclared_pilot_sha256": sha(pilot_path), "selected_ids": [r["receipt_id"] for r in records], "label_files_read_for_inference": False, "ocr_text_supplied": False, "api_requests": 0, "api_cost_usd": "0", "runs": evidence, "timing_scope": metadata[0]["timing_scope"]}
    (out / "metadata.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"verified_vision_cases": len(records), "run": args.run}))


if __name__ == "__main__":
    main()
