"""Offline cached docTR on the exact preregistered prepared-photo variants.

Uses the existing native benchmark with no socket connections even at model
initialization. Guards only its owned process; no retries or new model files.
"""
from datetime import datetime, timezone
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

from qwen8b_resources import available_memory
from vision_trial_guard import stop_owned_process, RUNTIME_RAM_FLOOR
from observe_process_memory import Memory

ROOT = Path(__file__).resolve().parents[2]
HASHES = {}


def read(name, expected=None):
    raw = (ROOT / name).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, name
    HASHES[name] = digest
    return raw


def load(name):
    return json.loads(read(name))


def main():
    source_tag, tag = sys.argv[1:3]
    assert all(re.fullmatch(r"[\w-]+", t) for t in (source_tag, tag))
    out = ROOT / "qa-artifacts" / tag
    out.mkdir()
    source = "qa-artifacts/" + source_tag
    meta = load(source + "/metadata.json")
    assert meta["source_unchanged"] and not any(c["error"] for c in meta["cases"])
    plan = load(source + "/input-plan.json")
    records = []
    native = ROOT / "receipt_training/evaluation/runs" / (tag + "-native")
    export = ROOT / "receipt_training/evaluation/runs" / (tag + "-panels")
    export.mkdir()
    (export / "frames").mkdir()
    for case in meta["cases"]:
        result = load(f"{source}/{case['receipt_id']}-{case['variant']}.json")
        if result.get("reused_original"):
            continue
        panels = []
        for frame in result["frames"]:
            raw = read(frame["path"], frame["sha256"])
            name = Path(frame["path"]).name
            with (export / "frames" / name).open("xb") as file:
                file.write(raw)
            panels.append({"file_path": "frames/" + name, "sha256": frame["sha256"], "photo_index": frame["photo"] - 1, "panel_index": frame["part"] - 1})
        records.append({"receipt_id": result["receipt_id"] + "--" + result["variant"], "image_sha256": result["image_sha256"], "panels": panels})
    lines = "".join(json.dumps(r) + "\n" for r in records).encode()
    (export / "predictions.jsonl").write_bytes(lines)
    (export / "metadata.json").write_text(json.dumps({"completed_at": datetime.now(timezone.utc).isoformat(), "predictions_sha256": hashlib.sha256(lines).hexdigest()}), encoding="utf-8")
    old = load("receipt_training/evaluation/runs/doctr-full-development/metadata.json")
    for model in old["model_files"]:
        path = "receipt_training/.cache/doctr-models/models/" + model["path"]
        assert (ROOT / path).stat().st_size == model["bytes"]
        read(path, model["sha256"])
    previous_peak = load("receipt_training/evaluation/advanced-model-comparison.json")["engines"]["doctr"]["peak_working_set_bytes"]
    required = previous_peak + RUNTIME_RAM_FLOOR
    initial = available_memory()[1]
    result = {"started_at": datetime.now(timezone.utc).isoformat(), "source_run": source_tag,
              "native_run": native.relative_to(ROOT).as_posix(), "panel_run": export.relative_to(ROOT).as_posix(),
              "selected_receipt_variants": len(records), "selected_panels": sum(len(r["panels"]) for r in records),
              "startup_available_ram": initial, "startup_required_ram": required, "runtime_floor": RUNTIME_RAM_FLOOR,
              "startup_rule": "Prior observed docTR peak working set plus one GiB reserve; experimental guard, not vendor minimum or guaranteed peak fit.",
              "model_downloads": 0, "external_receipt_uploads": 0, "automatic_retries": 0,
              "input_sha256": HASHES, "spawned": False}
    if initial < required:
        result["error"] = "insufficient-available-ram-before-start"
    else:
        python = ROOT / "receipt_training/.cache/doctr-env/Scripts/python.exe"
        read(python.relative_to(ROOT).as_posix())
        for name in ["receipt_training/scripts/benchmark_local.py", "server/local_ocr_models.py", "receipt_training/scripts/benchmark_capture_doctr.py", "receipt_training/scripts/vision_trial_guard.py"]:
            read(name)
        code = ("import socket,sys; exec(\"def denied(*a,**k): raise RuntimeError('Network disabled throughout capture benchmark')\"); "
                "socket.socket.connect=denied; socket.socket.connect_ex=denied; "
                f"sys.path.insert(0,{str(ROOT / 'receipt_training/scripts')!r}); "
                "import benchmark_local; benchmark_local.main()")
        command = [str(python), "-X", "utf8", "-c", code, "--engine", "doctr", "--panels", export.name, "--run", native.name]
        environment = {k:v for k,v in os.environ.items() if k.lower() in {"systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile", "appdata", "localappdata", "programdata", "programfiles", "programfiles(x86)"}}
        environment.update(HF_HUB_OFFLINE="1", DOCTR_CACHE_DIR=str(ROOT / "receipt_training/.cache/doctr-models"))
        query = ctypes.WinDLL("psapi").GetProcessMemoryInfo
        query.argtypes = [wintypes.HANDLE, ctypes.POINTER(Memory), wintypes.DWORD]
        query.restype = wintypes.BOOL
        with (out / "stdout.log").open("xb") as stdout, (out / "stderr.log").open("xb") as stderr:
            process = subprocess.Popen(command, cwd=ROOT, env=environment, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr, creationflags=subprocess.CREATE_NO_WINDOW)
            result.update(spawned=True, pid=process.pid, samples=0, minimum_available_ram=initial, peak_owned_process_working_set=0)
            started = time.monotonic()
            try:
                while process.poll() is None:
                    try:
                        available = available_memory()[1]
                    except OSError:
                        result["error"] = "memory-observation-unavailable"
                        break
                    result["samples"] += 1
                    result["minimum_available_ram"] = min(result["minimum_available_ram"], available)
                    usage = Memory(); usage.cb = ctypes.sizeof(Memory)
                    if query(int(process._handle), ctypes.byref(usage), ctypes.sizeof(usage)):
                        result["peak_owned_process_working_set"] = max(result["peak_owned_process_working_set"], usage.PeakWorkingSetSize)
                    if available < RUNTIME_RAM_FLOOR or time.monotonic() - started > 600:
                        result["error"] = "low-system-memory" if available < RUNTIME_RAM_FLOOR else "whole-run-deadline"
                        break
                    if (out / "stdout.log").stat().st_size + (out / "stderr.log").stat().st_size > 2 * 1024**2:
                        result["error"] = "output-bound"
                        break
                    time.sleep(0.25)
            finally:
                stop_owned_process(process)
            result.update(exit_code=process.returncode, elapsed_ms=round((time.monotonic() - started) * 1000))
    result["completed_at"] = datetime.now(timezone.utc).isoformat()
    with (out / "controller.json").open("x", encoding="utf-8") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k:v for k,v in result.items() if k != "input_sha256"}))
    if result.get("error") or result.get("exit_code", 0):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
