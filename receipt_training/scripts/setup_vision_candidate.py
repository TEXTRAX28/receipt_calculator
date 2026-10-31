"""Install the pinned public local-vision experiment without reading any receipt.

Windows Vulkan binaries are unpacked only under the ignored model cache.
--check verifies existing files offline. Nothing is installed globally.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[2]
CACHE = ROOT / "receipt_training/.cache/vision-experiment"


def valid(path, entry):
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        return False
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest() == entry["sha256"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    parser.add_argument("--manifest", default="receipt_training/evaluation/vision-candidate-manifest.json")
    args = parser.parse_args()
    manifest_path = (ROOT / args.manifest).resolve()
    manifest_path.relative_to((ROOT / "receipt_training/evaluation").resolve())
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    CACHE.mkdir(parents=True, exist_ok=True)
    files = manifest["files"]
    if sum(f["bytes"] for f in files) > 3_200_000_000:
        raise ValueError("Model assets exceed the planned download budget")
    paths = []
    for entry in files:
        target = (CACHE / entry["path"]).resolve()
        target.relative_to(CACHE.resolve())
        if not valid(target, entry):
            if args.check:
                raise SystemExit("A pinned vision asset is missing or changed; run setup without --check")
            if shutil.disk_usage(ROOT).free - entry["bytes"] < 10 * 1024**3:
                raise ValueError("Keep at least ten GiB free")
            target.parent.mkdir(parents=True, exist_ok=True)
            temporary = target.with_suffix(target.suffix + ".part")
            temporary.resolve().relative_to(CACHE.resolve())
            try:
                digest, count = hashlib.sha256(), 0
                request = urllib.request.Request(entry["url"], headers={"User-Agent": "receipt-local-benchmark"})
                with urllib.request.urlopen(request, timeout=60) as source, temporary.open("wb") as output:
                    while chunk := source.read(1024 * 1024):
                        count += len(chunk)
                        if count > entry["bytes"]:
                            raise ValueError("Public artifact exceeds its pinned size")
                        digest.update(chunk)
                        output.write(chunk)
                if count != entry["bytes"] or digest.hexdigest() != entry["sha256"]:
                    raise ValueError("Public artifact failed its official checksum")
                temporary.replace(target)
            finally:
                if temporary.exists():
                    temporary.unlink()
        paths.append(target)
    runtime = (CACHE / f"runtime-{manifest['runtime_build']}").resolve()
    runtime.relative_to(CACHE.resolve())
    if not args.check:
        with zipfile.ZipFile(paths[-1]) as archive:
            size = sum(f.file_size for f in archive.infolist())
            if size > 512 * 1024**2 or len(archive.infolist()) > 500:
                raise ValueError("Runtime archive exceeds extraction bounds")
            if shutil.disk_usage(ROOT).free - size < 10 * 1024**3:
                raise ValueError("Keep at least ten GiB free during runtime extraction")
            for entry in archive.infolist():
                target = (runtime / entry.filename).resolve()
                target.relative_to(runtime)
                if entry.is_dir():
                    target.mkdir(parents=True, exist_ok=True)
                else:
                    target.parent.mkdir(parents=True, exist_ok=True)
                    with archive.open(entry) as source, target.open("wb") as output:
                        shutil.copyfileobj(source, output)
    if not (runtime / "llama-mtmd-cli.exe").is_file():
        raise SystemExit("The verified runtime archive has not been unpacked; run setup without --check")
    verified_runtime_files = 0
    with zipfile.ZipFile(paths[-1]) as archive:
        if sum(f.file_size for f in archive.infolist()) > 512 * 1024**2 or len(archive.infolist()) > 500:
            raise ValueError("Runtime archive exceeds verification bounds")
        for entry in archive.infolist():
            target = (runtime / entry.filename).resolve()
            target.relative_to(runtime)
            if entry.is_dir():
                continue
            with archive.open(entry) as source:
                expected = hashlib.file_digest(source, "sha256").hexdigest()
            if not valid(target, {"bytes": entry.file_size, "sha256": expected}):
                raise ValueError("An unpacked runtime file differs from the verified archive")
            verified_runtime_files += 1
    print(json.dumps({"verified_assets": len(files), "verified_runtime_files": verified_runtime_files, "runtime": manifest["runtime_build"], "receipt_uploads": 0}))


if __name__ == "__main__":
    main()
