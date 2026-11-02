"""Prepare a separate documented spotting projector and one synthetic compatibility call.

No receipt upload, global installation, original-weight mutation or inference.
The verified upstream GGUF reader locates the existing scalar; only its four
bytes are changed in a new copy. Original model/cache evidence stays intact.
"""
import hashlib
import json
from pathlib import Path
import shutil
import struct
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/paddle-spotting-compat-v1"
CACHE = ROOT / "receipt_training/.cache/vision-experiment"
TOOLS = ROOT / "receipt_training/.cache/paddle-spotting-tools"
MANIFEST = ROOT / "receipt_training/evaluation/paddle-spotting-candidate-manifest.json"
HASHES = {}


def digest(path):
    with path.open("rb") as file:
        value = hashlib.file_digest(file, "sha256").hexdigest()
    HASHES[path.relative_to(ROOT).as_posix()] = value
    return value


def save(path, data):
    with path.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def main():
    if "--check" in sys.argv:
        manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
        for entry in manifest["files"]:
            path = CACHE / entry["path"]
            assert path.stat().st_size == entry["bytes"] and digest(path) == entry["sha256"]
        original = CACHE / "PaddleOCR-VL-1.6-GGUF-mmproj.gguf"
        assert digest(original) == manifest["files"][1]["derivation"]["source_sha256"]
        print(json.dumps({"verified_assets": 3, "original_projector_unchanged": True,
                          "new_model_requests": 0, "external_receipt_uploads": 0}))
        return
    assert not (RUN / "plan.json").exists()
    RUN.mkdir(parents=True, exist_ok=True)
    wheel = TOOLS / "gguf-0.19.0-py3-none-any.whl"
    assert digest(wheel) == "70bcd10edfe697fb2dad6e40af2234b9d8ece9a41a99761405121ebda1c3c1cd"
    with zipfile.ZipFile(wheel) as archive:
        for entry in archive.infolist():
            if not entry.is_dir():
                path = (TOOLS / entry.filename).resolve()
                path.relative_to(TOOLS.resolve())
                assert digest(path) == hashlib.sha256(archive.read(entry)).hexdigest()
    sys.path.insert(0, str(TOOLS))
    from gguf import GGUFReader
    from PIL import Image, ImageDraw, ImageFont, __version__ as pillow_version
    import numpy

    baseline_path = ROOT / "receipt_training/evaluation/paddle-vl16-candidate-manifest.json"
    baseline = json.loads(baseline_path.read_text(encoding="utf-8"))
    digest(baseline_path)
    for entry in baseline["files"]:
        path = CACHE / entry["path"]
        assert path.stat().st_size == entry["bytes"] and digest(path) == entry["sha256"]
    source = CACHE / baseline["files"][1]["path"]
    target = CACHE / "PaddleOCR-VL-1.6-GGUF-mmproj-spotting-1605632.gguf"
    partial = target.with_suffix(".part")
    assert not target.exists() and not partial.exists()
    assert shutil.disk_usage(ROOT).free - source.stat().st_size > 10 * 1024**3
    reader = GGUFReader(str(source), "r")
    field = reader.fields["clip.vision.image_max_pixels"]
    assert [int(value) for value in field.types] == [4]
    value = field.parts[field.data[0]]
    assert str(value.dtype) == "uint32" and int(value[0]) == 1003520
    offset = int(value.ctypes.data - reader.data.ctypes.data)
    with source.open("rb") as original, partial.open("xb") as output:
        shutil.copyfileobj(original, output, 1024 * 1024)
    with partial.open("r+b") as output:
        output.seek(offset)
        assert output.read(4) == struct.pack("<I", 1003520)
        output.seek(offset)
        output.write(struct.pack("<I", 1605632))
    differences = []
    with source.open("rb") as original, partial.open("rb") as changed:
        position = 0
        while left := original.read(1024 * 1024):
            right = changed.read(len(left))
            assert len(left) == len(right)
            if left != right:
                differences.extend(position + i for i, pair in enumerate(zip(left, right)) if pair[0] != pair[1])
            position += len(left)
        assert not changed.read(1)
    assert differences and all(offset <= value < offset + 4 for value in differences)
    partial.replace(target)
    assert int(GGUFReader(str(target), "r").fields["clip.vision.image_max_pixels"].parts[3][0]) == 1605632
    assert digest(source) == baseline["files"][1]["sha256"]
    derived = {"path": target.name, "bytes": target.stat().st_size, "sha256": digest(target),
               "derivation": {"source_sha256": baseline["files"][1]["sha256"],
                              "metadata_key": "clip.vision.image_max_pixels", "from": 1003520, "to": 1605632,
                              "scalar_byte_offset": offset, "changed_byte_offsets": differences,
                              "tensor_bytes_unchanged": True,
                              "official_usage": "https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF#usage-tips"}}
    manifest = {**baseline, "default_prompt": "Spotting:",
                "component_scope": "Documented VLM text spotting only; not the complete PaddleX layout pipeline",
                "files": [baseline["files"][0], derived, baseline["files"][2]]}
    if MANIFEST.exists():
        assert json.loads(MANIFEST.read_text(encoding="utf-8")) == manifest
    else:
        save(MANIFEST, manifest)
    digest(MANIFEST)
    rows = ["TEST SHOP", "Currency GBP", "Milk 1 x 2.00 2.00", "Bread 1 x 1.50 1.50", "Subtotal 3.50", "Tax 0.00", "Total GBP 3.50"]
    image = Image.new("RGB", (800, 1000), "white")
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 30)
    expected_boxes = []
    for index, text in enumerate(rows):
        position = (50, 80 + index * 110)
        draw.text(position, text, fill="black", font=font)
        expected_boxes.append(draw.textbbox(position, text, font=font))
    image_path = RUN / "synthetic-receipt.png"
    assert not image_path.exists()
    image.save(image_path)
    digest(image_path)
    request = {"images": [image_path.relative_to(ROOT).as_posix()], "prompt": "Spotting:",
               "output_mode": "text", "model_manifest": MANIFEST.relative_to(ROOT).as_posix(),
               "context": 6144, "max_tokens": 2400, "image_tokens": 2048,
               "gpu_layers": 99, "projector_gpu": True}
    save(RUN / "request.json", request)
    digest(RUN / "request.json")
    for name in ("benchmark_vision_cli.py", "vision_cli_text.py", "prepare_paddle_spotting.py"):
        path = ROOT / "receipt_training/scripts" / name
        digest(path)
        with (RUN / name).open("xb") as output:
            output.write(path.read_bytes())
    save(RUN / "plan.json", {"scope": "One synthetic spotting compatibility call, then inspect literal text/coordinates before any original-receipt pilot. No app integration or accuracy claim.",
                             "rows": rows, "expected_boxes_pixels": expected_boxes,
                             "image_size": [800, 1000], "derived_projector": derived,
                             "new_native_request_limit": 1, "deadline_seconds": 180,
                             "automatic_retries": 0, "label_files_read": False, "input_ocr_text": False,
                             "external_receipt_uploads": 0, "new_model_asset_downloads": 0,
                             "versions": {"numpy": numpy.__version__, "pillow": pillow_version},
                             "input_sha256": HASHES})
    print(json.dumps({"requests_prepared": 1, "derivation_verified": True, "original_weights_unchanged": True, "tensor_bytes_unchanged": True, "external_receipt_uploads": 0}))


if __name__ == "__main__":
    main()
