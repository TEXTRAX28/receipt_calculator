"""Read-only headroom check for the pinned, research-only 8B comparison.

This does not download models, start inference, read receipts, or close apps.
The RAM threshold is a conservative trial guard, not a model vendor minimum.
"""
import argparse
import ctypes
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import shutil

from setup_vision_candidate import CACHE, ROOT, valid

MANIFEST = ROOT / "receipt_training/evaluation/qwen8b-candidate-manifest.json"
DISK_RESERVE = 10 * 1024**3
RAM_START_RESERVE = 4 * 1024**3


def available_memory():
    class Status(ctypes.Structure):
        _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
            (name, ctypes.c_ulonglong)
            for name in ("total_physical", "available_physical", "total_page", "available_page", "total_virtual", "available_virtual", "extended_virtual")
        ]

    status = Status()
    status.length = ctypes.sizeof(status)
    function = ctypes.WinDLL("kernel32", use_last_error=True).GlobalMemoryStatusEx
    function.argtypes = [ctypes.POINTER(Status)]
    function.restype = ctypes.c_int
    if not function(ctypes.byref(status)):
        raise ctypes.WinError(ctypes.get_last_error())
    return status.total_physical, status.available_physical


def assess(free_disk, free_ram, missing_bytes):
    return {
        "download_headroom_ok": free_disk >= missing_bytes + DISK_RESERVE,
        "inference_start_headroom_ok": free_ram >= RAM_START_RESERVE,
        "additional_disk_bytes_needed": max(0, missing_bytes + DISK_RESERVE - free_disk),
        "additional_available_ram_bytes_needed": max(0, RAM_START_RESERVE - free_ram),
    }


def inspect():
    raw = MANIFEST.read_bytes()
    manifest = json.loads(raw)
    entries = manifest["files"]
    if manifest["model"] != "Qwen/Qwen3-VL-8B-Instruct-GGUF" or sum(item["bytes"] for item in entries) > 6_000_000_000:
        raise ValueError("Unexpected research model or download budget")
    missing = []
    for item in entries:
        path = (CACHE / item["path"]).resolve()
        path.relative_to(CACHE.resolve())
        if not valid(path, item):
            missing.append({"path": item["path"], "bytes": item["bytes"]})
    disk = shutil.disk_usage(ROOT).free
    total_ram, free_ram = available_memory()
    missing_bytes = sum(item["bytes"] for item in missing)
    return {
        "observed_at": datetime.now(timezone.utc).isoformat(),
        "manifest_sha256": hashlib.sha256(raw).hexdigest(),
        "total_asset_bytes": sum(item["bytes"] for item in entries),
        "missing_assets": missing,
        "missing_asset_bytes": missing_bytes,
        "free_disk_bytes": disk,
        "total_physical_ram_bytes": total_ram,
        "available_physical_ram_bytes": free_ram,
        "disk_reserve_bytes": DISK_RESERVE,
        "ram_start_reserve_bytes": RAM_START_RESERVE,
        **assess(disk, free_ram, missing_bytes),
        "disk_guard_origin": "Existing setup_vision_candidate.py ten-GiB reserve",
        "ram_guard_origin": "Conservative research startup guard; not a published model requirement or proof inference will fit",
        "existing_installer_asset_cap_bytes": 4_000_000_000,
        "existing_installer_accepts_this_manifest": False,
        "model_downloads": 0,
        "native_inference_calls": 0,
        "external_receipt_uploads": 0,
        "receipt_files_read": False,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", help="New JSON path inside qa-artifacts; never overwrite a prior observation")
    args = parser.parse_args()
    result = inspect()
    if args.output:
        path = (ROOT / args.output).resolve()
        path.relative_to((ROOT / "qa-artifacts").resolve())
        if path.suffix != ".json":
            raise ValueError("Use a JSON research artifact")
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("x", encoding="utf-8", newline="\n") as output:
            output.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))


if __name__ == "__main__":
    main()
