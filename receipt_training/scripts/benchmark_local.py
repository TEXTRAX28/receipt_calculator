"""Benchmark local models on frozen browser-prepared panels; never reads labels.

Usage: python benchmark_local.py --engine paddle-v6 --panels advanced-panels-development --run paddle-v6-development
Model installation/download is separate from inference. After model creation,
Python network connections are blocked so a receipt cannot become an API input.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import platform
import re
import socket
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parent
sys.path.insert(0, str(PROJECT / "server"))
from local_ocr_models import create_adapter


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=["paddle-v6", "doctr"], required=True)
    parser.add_argument("--panels", required=True)
    parser.add_argument("--run", required=True)
    parser.add_argument("--limit", type=int, default=1000)
    parser.add_argument("--ids", help="Comma-separated receipt IDs for a predeclared pilot")
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    if not all(re.fullmatch(r"[\w-]+", value) for value in [args.panels, args.run]):
        raise ValueError("Simple local run names required")
    source = ROOT / "evaluation/runs" / args.panels
    out = ROOT / "evaluation/runs" / args.run
    if out.exists():
        raise ValueError("Run already exists; preserve it and choose another name")
    metadata_path = source / "metadata.json"
    source_meta = json.loads(metadata_path.read_text(encoding="utf-8"))
    if not source_meta.get("completed_at"):
        raise ValueError("Panel export is incomplete")
    predictions_path = source / "predictions.jsonl"
    if sha(predictions_path) != source_meta["predictions_sha256"]:
        raise ValueError("Panel manifest changed")
    records = [json.loads(line) for line in predictions_path.read_text(encoding="utf-8").splitlines()]
    if args.ids:
        ids = set(args.ids.split(","))
        records = [r for r in records if r["receipt_id"] in ids]
        if {r["receipt_id"] for r in records} != ids:
            raise ValueError("Unknown pilot receipt")
    records = records[:args.limit]
    if not records or not 1 <= args.threads <= 16:
        raise ValueError("Invalid benchmark selection or thread count")
    os.environ.setdefault("PADDLE_PDX_CACHE_HOME", str(ROOT / ".cache/paddlex"))
    os.environ.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")
    os.environ.setdefault("DOCTR_CACHE_DIR", str(ROOT / ".cache/doctr-models"))
    out.mkdir(parents=True)
    metadata = {"engine": args.engine, "panel_run": args.panels, "panel_metadata_sha256": sha(metadata_path),
                "panel_manifest_sha256": sha(predictions_path), "selected_ids": [r["receipt_id"] for r in records],
                "started_at": datetime.now(timezone.utc).isoformat(), "python": sys.version,
                "platform": platform.platform(), "threads": args.threads, "api_requests": 0,
                "api_cost_usd": "0", "compute_cost_usd": None, "device": "cpu",
                "adapter_sha256": sha(PROJECT / "server/local_ocr_models.py"),
                "runner_sha256": sha(Path(__file__)), "packages": {},
                "timing_scope": "Per receipt model inference on frozen prepared panels. Model startup/download, image preparation, parsing and browser startup are separate; not directly comparable to baseline end-to-end latency."}
    for package in ["paddleocr", "paddlex", "onnxruntime", "python-doctr", "torch", "torchvision", "Pillow", "numpy"]:
        try:
            metadata["packages"][package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError:
            pass
    started = time.perf_counter()
    adapter = create_adapter(args.engine, args.threads)
    metadata["model_initialization_ms"] = round((time.perf_counter() - started) * 1000)
    metadata["adapter"] = adapter.name
    model_root = ROOT / (".cache/paddlex/official_models" if args.engine == "paddle-v6" else ".cache/doctr-models/models")
    metadata["model_files"] = [{"path": p.relative_to(model_root).as_posix(), "bytes": p.stat().st_size, "sha256": sha(p)}
                               for p in sorted(model_root.rglob("*"))
                               if p.is_file() and p.suffix in [".onnx", ".pt", ".yml", ".yaml"]]

    def deny_network(*_args, **_kwargs):
        raise RuntimeError("Network disabled during private local inference")
    socket.socket.connect = deny_network
    socket.socket.connect_ex = deny_network
    metadata["inference_network_policy"] = "Python socket connections denied after model initialization"
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    predictions = []
    for record in records:
        started = time.perf_counter()
        result = {"receipt_id": record["receipt_id"], "image_sha256": record["image_sha256"], "panels": []}
        try:
            if record.get("error"):
                raise ValueError("Source image preparation failed")
            for panel in record["panels"]:
                path = (source / panel["file_path"]).resolve()
                path.relative_to(source.resolve())
                if sha(path) != panel["sha256"]:
                    raise ValueError("Prepared image bytes changed")
                result["panels"].append({"photo_index": panel["photo_index"], "panel_index": panel["panel_index"],
                                         "sha256": panel["sha256"], **adapter.recognize(path)})
        except Exception as error:
            result["error"] = f"{type(error).__name__}: {error}"[:1000]
        result["inference_ms"] = round((time.perf_counter() - started) * 1000)
        predictions.append(result)
        (out / "ocr.jsonl").write_text("".join(json.dumps(p, ensure_ascii=False) + "\n" for p in predictions), encoding="utf-8")
        print(json.dumps({"completed": len(predictions), "total": len(records), "id": record["receipt_id"],
                          "inference_ms": result["inference_ms"], "error": bool(result.get("error")),
                          "tokens": sum(len(p["words"]) for p in result["panels"])}), flush=True)
    metadata["completed_at"] = datetime.now(timezone.utc).isoformat()
    metadata["ocr_sha256"] = sha(out / "ocr.jsonl")
    metadata["errors"] = sum("error" in p for p in predictions)
    try:
        import psutil
        memory = psutil.Process().memory_info()
        metadata["peak_working_set_bytes"] = getattr(memory, "peak_wset", None)
        metadata["final_rss_bytes"] = memory.rss
    except ImportError:
        metadata["peak_working_set_bytes"] = None
    (out / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
