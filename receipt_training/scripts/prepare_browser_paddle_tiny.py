"""Fetch only the four pinned public tiny-model files; no receipt/API/key input."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import tarfile
import time
import urllib.request

ROOT = Path(__file__).resolve().parents[2]
DISCOVERY = ROOT / "qa-artifacts/browser-paddle-tiny-discovery-v1/metadata-summary.json"


def sha(path):
    with path.open("rb") as file:
        return hashlib.file_digest(file, "sha256").hexdigest()


def main():
    tag = sys.argv[1]
    assert tag.replace("-", "").isalnum()
    out = ROOT / "qa-artifacts" / tag
    out.mkdir()
    entries = json.loads(DISCOVERY.read_text(encoding="utf-8"))
    assert len(entries) == 2 and all(e["license"] == "apache-2.0" for e in entries)
    total = sum(f["size"] for e in entries for f in e["files"] if f["rfilename"] in ["inference.onnx", "inference.yml"])
    assert total < 8 * 1024**2 and shutil.disk_usage(out).free - 2 * total > 6 * 1024**3
    models, inputs = [], {DISCOVERY.relative_to(ROOT).as_posix(): sha(DISCOVERY)}
    for entry, kind in zip(entries, ["det", "rec"], strict=True):
        expected = "PaddlePaddle/PP-OCRv6_tiny_" + kind + "_onnx"
        assert entry["repository"] == expected and len(entry["revision"]) == 40
        files = []
        for name in ["inference.onnx", "inference.yml"]:
            info = next(f for f in entry["files"] if f["rfilename"] == name)
            assert info["size"] < 5 * 1024**2
            url = f"https://huggingface.co/{expected}/resolve/{entry['revision']}/{name}"
            target = out / (kind + "-" + name)
            digest, count, start = hashlib.sha256(), 0, time.monotonic()
            request = urllib.request.Request(url, headers={"User-Agent": "receipt-browser-research"})
            with urllib.request.urlopen(request, timeout=30) as response, target.open("xb") as file:
                assert response.geturl().startswith("https://")
                while block := response.read(min(1024**2, info["size"] - count + 1)):
                    count += len(block)
                    assert count <= info["size"] and time.monotonic() - start < 120
                    digest.update(block); file.write(block)
            assert count == info["size"]
            if "lfs" in info:
                assert digest.hexdigest() == info["lfs"]["sha256"]
            else:
                assert hashlib.sha1(f"blob {count}\0".encode() + target.read_bytes()).hexdigest() == info["blobId"]
            inputs[target.relative_to(ROOT).as_posix()] = digest.hexdigest()
            files.append((name, target))
        model_name = "PP-OCRv6_tiny_" + kind
        # SDK validates the original config's model_name; no config/weight rewriting.
        target = out / (model_name + ".tar")
        with target.open("xb") as file, tarfile.open(fileobj=file, mode="w", format=tarfile.USTAR_FORMAT) as archive:
            for name, source in files:
                info = tarfile.TarInfo(name); info.size = source.stat().st_size; info.mode = 0o444; info.mtime = 0
                with source.open("rb") as stream: archive.addfile(info, stream)
        models.append({"name": model_name, "path": target.relative_to(ROOT).as_posix(), "bytes": target.stat().st_size, "sha256": sha(target), "repository": expected, "revision": entry["revision"]})
    inputs[Path(__file__).relative_to(ROOT).as_posix()] = sha(Path(__file__))
    plan = {"scope": "Official tiny browser preset at immutable public revisions. Four exact-size/checksummed anonymous public file GETs, no receipt content, billing or key. Not an 8B download or change to its guard.", "models": models,
            "model_downloads": 2, "public_model_file_gets": 4, "downloaded_bytes": total, "external_receipt_uploads": 0,
            "input_sha256": inputs, "sdk": "@paddleocr/paddleocr-js@0.4.2", "runtime": "onnxruntime-web@1.31.1", "backend": "wasm", "threads": 1,
            "first_input": "Same synthetic 700x600 white receipt, source truth frozen in medium compatibility probe; no private image before compatibility succeeds."}
    (out / "plan.json").open("x", encoding="utf-8").write(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({"public_model_files": 4, "downloaded_bytes": total, "tars_bytes": sum(m["bytes"] for m in models), "receipt_uploads": 0}))


if __name__ == "__main__":
    main()
