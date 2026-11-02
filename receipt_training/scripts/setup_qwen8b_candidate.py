"""Explicit bounded 8B research installer; no receipts, keys or global setup.

Default: report readiness only. --download requires disk and RAM gates, uses
exclusive temporary files, verifies exact public bytes, and makes no retries.
The existing smaller-model installer's four-billion-byte cap stays unchanged.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import tempfile
import time
import urllib.request
import zipfile

from qwen8b_resources import MANIFEST, DISK_RESERVE, inspect
from setup_vision_candidate import CACHE, ROOT, valid

MODEL = "Qwen/Qwen3-VL-8B-Instruct-GGUF"
REVISION = "f982a07559d4a2f6c8744d840bf6fccab30eea96"
EXPECTED = {
    "Qwen3VL-8B-Instruct-Q4_K_M.gguf": (5027784800, "67d1659bfe71b89d50b45a4ad1a9e5b997e5bb16ce5da66a6a6167abd569e9e2"),
    "mmproj-Qwen3VL-8B-Instruct-Q8_0.gguf": (752289728, "c6ba85508d82f42590e6eb77d5340369ab6fecf107a7561d809523d8aa5f3bfd"),
}
RUNTIME = {
    "path": "llama-b11960-bin-win-vulkan-x64.zip", "bytes": 37345851,
    "sha256": "bac6914b5e83523eb008c6789eaa12669f93fbc196c3b9e8237b6672323b33e9",
    "url": "https://github.com/ggml-org/llama.cpp/releases/download/b11960/llama-b11960-bin-win-vulkan-x64.zip",
}


def manifest():
    value = json.loads(MANIFEST.read_bytes())
    if value["model"] != MODEL or value["revision"] != REVISION or not value.get("research_only"):
        raise ValueError("Only the frozen 8B research model is supported")
    files = value["files"]
    if len(files) != 3 or sum(f["bytes"] for f in files) > 6_000_000_000:
        raise ValueError("Unexpected public-asset budget")
    for entry in files[:2]:
        if EXPECTED.get(entry["path"]) != (entry["bytes"], entry["sha256"]):
            raise ValueError("The pinned model assets changed")
        if entry["url"] != f"https://huggingface.co/{MODEL}/resolve/{REVISION}/{entry['path']}":
            raise ValueError("The immutable public model URL changed")
    if tuple(e["path"] for e in files[:2]) != tuple(EXPECTED):
        raise ValueError("Model assets are missing, duplicated or out of order")
    if files[-1] != RUNTIME or value["runtime_build"] != "b11960":
        raise ValueError("Use the existing verified runtime")
    return value


def verify_runtime(value):
    entry = value["files"][-1]
    archive = CACHE / entry["path"]
    if not valid(archive, entry):
        raise ValueError("The pinned existing runtime archive is not available")
    runtime = (CACHE / ("runtime-" + value["runtime_build"])).resolve()
    runtime.relative_to(CACHE.resolve())
    with zipfile.ZipFile(archive) as source:
        files = source.infolist()
        if len(files) > 500 or sum(f.file_size for f in files) > 512 * 1024**2:
            raise ValueError("Runtime verification budget exceeded")
        for item in files:
            target = (runtime / item.filename).resolve()
            target.relative_to(runtime)
            if item.is_dir():
                continue
            with source.open(item) as stream:
                expected = hashlib.file_digest(stream, "sha256").hexdigest()
            if not valid(target, {"bytes": item.file_size, "sha256": expected}):
                raise ValueError("The existing unpacked runtime failed verification")
    if not (runtime / "llama-mtmd-cli.exe").is_file():
        raise ValueError("The multimodal executable is not present")


def require_headroom(result):
    if not result["download_headroom_ok"] or not result["inference_start_headroom_ok"]:
        raise ValueError("Disk and RAM startup guards must both pass; nothing was downloaded")


def stream_asset(entry, target, *, opener=urllib.request.urlopen,
                 free_bytes=lambda: shutil.disk_usage(ROOT).free, reserve=DISK_RESERVE,
                 deadline=1800, clock=time.monotonic):
    """One bounded attempt. Existing files are never replaced; partials are owned."""
    target = target.resolve()
    target.relative_to(CACHE.resolve())
    if target.exists():
        raise ValueError("Do not replace an existing cache file")
    if free_bytes() < entry["bytes"] + reserve:
        raise ValueError("Insufficient disk reserve before download")
    target.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    count, digest, started = 0, hashlib.sha256(), clock()
    try:
        with tempfile.NamedTemporaryFile(dir=target.parent, prefix="qwen8b-", suffix=".part", delete=False) as output:
            temporary = Path(output.name).resolve()
            temporary.relative_to(CACHE.resolve())
            request = urllib.request.Request(entry["url"], headers={"User-Agent": "receipt-local-benchmark"})
            with opener(request, timeout=30) as response:
                if not response.geturl().startswith("https://"):
                    raise ValueError("A public artifact redirected away from HTTPS")
                while chunk := response.read(min(1024**2, entry["bytes"] - count + 1)):
                    count += len(chunk)
                    if count > entry["bytes"] or clock() - started > deadline:
                        raise ValueError("Public artifact size or time budget exceeded")
                    if free_bytes() < len(chunk) + reserve:
                        raise ValueError("Disk reserve fell during download")
                    digest.update(chunk)
                    output.write(chunk)
            output.flush()
            os.fsync(output.fileno())
        if count != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
            raise ValueError("Public artifact failed its pinned size/checksum")
        # Windows rename refuses an existing target; it cannot clobber a cache file.
        if os.name != "nt":
            raise ValueError("This bounded installer is for Windows")
        os.rename(temporary, target)
        temporary = None
    finally:
        if temporary is not None:
            temporary.relative_to(CACHE.resolve())
            temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--download", action="store_true")
    mode.add_argument("--check", action="store_true")
    args = parser.parse_args()
    value = manifest()
    readiness = inspect()
    if not args.download and not args.check:
        print(json.dumps({"mode": "readiness-only", "resources": readiness, "downloads": 0, "receipt_reads": 0}))
        return
    if args.download:
        require_headroom(readiness)
    verify_runtime(value)
    downloaded = 0
    for entry in value["files"][:2]:
        target = (CACHE / entry["path"]).resolve()
        target.relative_to(CACHE.resolve())
        if not valid(target, entry):
            if args.check:
                raise ValueError("An 8B model asset is missing or changed")
            require_headroom(inspect())
            stream_asset(entry, target)
            downloaded += 1
        if not valid(target, entry):
            raise ValueError("Installed model verification failed")
    print(json.dumps({"verified_model_assets": 2, "verified_runtime": value["runtime_build"], "downloads": downloaded,
                      "receipt_reads": 0, "inference_calls": 0, "external_receipt_uploads": 0}))


if __name__ == "__main__":
    main()
