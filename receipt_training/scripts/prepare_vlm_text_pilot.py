"""Seal an element-recognizer pilot using the previous pilot's exact image panels.

Reads no labels and supplies no OCR text. Each native process gets one panel,
with its original photo/part mapping retained for subsequent text-only assembly.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[2]


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def local(path):
    value = (ROOT / path).resolve()
    value.relative_to(ROOT)
    return value


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base-pilot", required=True)
    parser.add_argument("--model-manifest", required=True)
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    if not re.fullmatch(r"[\w-]+", args.version):
        raise ValueError("Use a simple new version name")
    source = local(args.base_pilot)
    base = json.loads(source.read_text(encoding="utf-8"))
    manifest_path = local(args.model_manifest)
    manifest_path.relative_to((ROOT / "receipt_training/evaluation").resolve())
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    cases, pending = [], []
    directory = ROOT / "qa-artifacts/advanced-ocr" / (args.version + "-requests")
    plan_path = directory.parent / (args.version + ".json")
    if directory.exists() or plan_path.exists():
        raise ValueError("Preserve an existing protocol; use a new version")
    for case in base["pilot"]:
        if not re.fullmatch(r"[\w-]+", case["id"]):
            raise ValueError("Invalid case ID")
        previous_path = local(case["request"])
        if sha(previous_path) != case["request_sha256"]:
            raise ValueError("Base request changed")
        previous = json.loads(previous_path.read_text(encoding="utf-8"))
        if not re.fullmatch(r"[\w-]+", previous["source_panel_run"]):
            raise ValueError("Invalid frozen panel run")
        panel_dir = ROOT / "receipt_training/evaluation/runs" / previous["source_panel_run"]
        predictions = panel_dir / "predictions.jsonl"
        if sha(predictions) != previous["source_panel_manifest_sha256"]:
            raise ValueError("Frozen panel manifest changed")
        original = next(r for r in map(json.loads, predictions.read_text(encoding="utf-8").splitlines()) if r["receipt_id"] == case["id"])
        if len(original["panels"]) != len(previous["images"]) or original["image_sha256"] != previous["source_image_sha256"]:
            raise ValueError("Frozen source image mapping changed")
        panels = []
        for index, (image, panel) in enumerate(zip(previous["images"], original["panels"])):
            if sha(local(image)) != panel["sha256"]:
                raise ValueError("Input image panel changed")
            request = {"images": [image], "model_manifest": args.model_manifest, "output_mode": "text", "prompt": manifest["default_prompt"],
                       "context": previous["context"], "max_tokens": previous["max_tokens"], "image_tokens": previous["image_tokens"], "gpu_layers": "auto", "verbose": False, "require_clean_schema": True,
                       "source_panel_run": previous["source_panel_run"], "source_panel_manifest_sha256": sha(predictions), "source_image_sha256": original["image_sha256"], "source_panel_position": index}
            output = directory / f"{case['id']}-panel-{index + 1}.json"
            data = (json.dumps(request, indent=2) + "\n").encode("utf-8")
            pending.append((output, data))
            panels.append({**panel, "position": index, "request": output.relative_to(ROOT).as_posix(), "request_sha256": hashlib.sha256(data).hexdigest()})
        cases.append({"id": case["id"], "source": case["source"], "image_sha256": original["image_sha256"], "source_panel_run": previous["source_panel_run"], "source_panel_manifest_sha256": sha(predictions), "panels": panels})
    if not cases or len({c["id"] for c in cases}) != len(cases):
        raise ValueError("Empty or duplicate cases")
    directory.mkdir()
    for path, data in pending:
        with path.open("xb") as output:
            output.write(data)
    plan = {"version": args.version, "sealed_at": datetime.now(timezone.utc).isoformat(), "source_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "base_plan_sha256": sha(source), "model_manifest": args.model_manifest, "model_manifest_sha256": sha(manifest_path), "builder_sha256": sha(Path(__file__)),
            "scope": "VLM element recognition on unchanged complete source panels, not the full PaddleOCR-VL layout-analysis pipeline. Text-only evidence has no word boxes or OCR confidence. One fresh native process per panel.",
            "label_files_read": False, "input_ocr_text": False, "cases": cases}
    with plan_path.open("x", encoding="utf-8") as output:
        json.dump(plan, output, indent=2)
    print(json.dumps({"cases": len(cases), "panels": len(pending), "sealed_plan": plan_path.relative_to(ROOT).as_posix()}))


if __name__ == "__main__":
    main()
