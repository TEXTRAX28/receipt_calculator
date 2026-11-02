"""Package already-cached official ONNX files for the isolated browser SDK.

No new model download, receipt read, dependency change in the app or inference.
"""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tarfile

ROOT = Path(__file__).resolve().parents[2]


def digest(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def main():
    tag = sys.argv[1]
    assert tag.replace("-", "").isalnum()
    out = ROOT / "qa-artifacts" / tag
    out.mkdir()
    sdk = ROOT / "receipt_training/.cache/browser-paddle-sdk-v1"
    model_root = ROOT / "receipt_training/.cache/paddlex/official_models"
    metadata = ROOT / "receipt_training/evaluation/runs/paddle-v6-full-development/metadata.json"
    if not metadata.exists():
        raise ValueError("Use the preserved installed-Paddle metadata, not guessed checksums")
    expected = json.loads(metadata.read_text(encoding="utf-8"))["model_files"]
    hashes = {metadata.relative_to(ROOT).as_posix(): digest(metadata)}
    models = []
    for suffix in ["det", "rec"]:
        name = "PP-OCRv6_medium_" + suffix
        directory = model_root / (name + "_onnx")
        sources = []
        for filename in ["inference.onnx", "inference.yml"]:
            path = directory / filename
            path.resolve().relative_to(model_root.resolve())
            identity = path.relative_to(model_root).as_posix()
            entry = next(e for e in expected if e["path"] == identity)
            assert path.stat().st_size == entry["bytes"] and digest(path) == entry["sha256"]
            hashes[path.relative_to(ROOT).as_posix()] = entry["sha256"]
            sources.append(path)
        size = sum(p.stat().st_size for p in sources)
        assert size < 100 * 1024**2 and shutil.disk_usage(out).free - size > 6 * 1024**3
        target = out / (name + ".tar")
        with target.open("xb") as file, tarfile.open(fileobj=file, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for source in sources:
                info = tarfile.TarInfo(source.name)
                info.size, info.mode, info.mtime = source.stat().st_size, 0o444, 0
                with source.open("rb") as stream:
                    archive.addfile(info, stream)
        with tarfile.open(target, "r:") as archive:
            assert archive.getnames() == ["inference.onnx", "inference.yml"]
            for source in sources:
                with archive.extractfile(source.name) as stream:
                    assert hashlib.file_digest(stream, "sha256").hexdigest() == hashes[source.relative_to(ROOT).as_posix()]
        models.append({"name": name, "path": target.relative_to(ROOT).as_posix(), "bytes": target.stat().st_size, "sha256": digest(target)})
    for name in ["package.json", "package-lock.json", "node_modules/@paddleocr/paddleocr-js/dist/index.mjs", "node_modules/@paddleocr/paddleocr-js/dist/assets/worker-entry-C9UNuyOJ.js"]:
        path = sdk / name
        hashes[path.relative_to(ROOT).as_posix()] = digest(path)
    self = Path(__file__)
    hashes[self.relative_to(ROOT).as_posix()] = digest(self)
    result = {"scope": "Official browser SDK custom-asset compatibility using byte-identical cached medium models. Medium is not a built-in browser preset; compatibility, accuracy, memory and handset suitability are unproven.",
              "models": models, "sdk": "@paddleocr/paddleocr-js@0.4.2", "runtime": "onnxruntime-web@1.31.1", "backend": "wasm", "threads": 1,
              "model_downloads": 0, "receipt_reads": 0, "external_receipt_uploads": 0, "input_sha256": hashes,
              "first_input": "Synthetic 700x600 white receipt; Soup 2x1.25=2.50, Rice 1x3.50=3.50, total GBP6.00. No private image before compatibility succeeds."}
    (out / "plan.json").open("x", encoding="utf-8").write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"models_repacked": 2, "new_model_downloads": 0, "repacked_bytes": sum(m["bytes"] for m in models)}))


if __name__ == "__main__":
    main()
