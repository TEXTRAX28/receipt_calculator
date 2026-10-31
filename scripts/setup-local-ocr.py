"""Download only pinned public model assets, verifying hashes before use.

No receipts, provider credentials or user uploads are read. --check is offline.
Install the matching Python dependency lock separately before enabling a model.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def valid(path, entry):
    if not path.is_file() or path.stat().st_size != entry["bytes"]:
        return False
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest() == entry["sha256"]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--engine", choices=["paddle-v6", "doctr"], default="paddle-v6")
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    model = json.loads((ROOT / "server/local-model-manifest.json").read_text(encoding="utf-8"))[args.engine]
    cache = ROOT / "receipt_training/.cache"
    cache.mkdir(parents=True, exist_ok=True)
    missing = []
    for entry in model["files"]:
        target = (cache / entry["path"]).resolve()
        target.relative_to(cache.resolve())
        if valid(target, entry):
            continue
        if args.check:
            missing.append(entry["path"])
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, prefix="model-", delete=False) as output:
                temporary = Path(output.name).resolve()
                temporary.relative_to(cache.resolve())
                with urllib.request.urlopen(entry["url"], timeout=60) as response:
                    size = 0
                    while chunk := response.read(1024 * 1024):
                        size += len(chunk)
                        if size > entry["bytes"]:
                            raise ValueError("Model download exceeds its pinned size")
                        output.write(chunk)
            if not valid(temporary, entry):
                raise ValueError("Downloaded model does not match the pinned checksum")
            os.replace(temporary, target)
        finally:
            if temporary is not None and temporary.exists():
                temporary.relative_to(cache.resolve())
                temporary.unlink()
    if missing:
        raise SystemExit("Model files are missing or changed. Run setup-local-ocr.py without --check to install the pinned assets.")
    print(json.dumps({"engine": args.engine, "verified_model_files": len(model["files"]), "receipt_uploads": 0}))


if __name__ == "__main__":
    main()
