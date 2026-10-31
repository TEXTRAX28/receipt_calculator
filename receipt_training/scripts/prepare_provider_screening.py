"""Prepare local-only, lossless receipt crops for a six-case provider screen.

This command cannot upload anything or authorize external processing. Original
corpus bytes/permissions remain unchanged. Inspect every crop before sealing a
separate scoped plan; the previous one-receipt approval is already consumed.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import zipfile

from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
CASES = [
    ("user-costco-bristol-001", (100, 770, 900, 2000), "Costco UK: coupons, repeated purchases, fold and pen stroke"),
    ("costco-tw-20170303", (225, 333, 1342, 977), "Costco Taiwan: Chinese invoice, one fee and a separate negative deduction"),
    ("tesco-gb-1994", (38, 164, 459, 1020), "Tesco UK: faded scan, repeated products and reduced-price rows"),
    ("cord-v2-train-003", (150, 746, 975, 1200), "Restaurant: comma grouping, discount, service and tax"),
    ("cord-v2-train-004", (85, 786, 802, 1160), "Restaurant: faint print, dot grouping, cash and change"),
    ("cord-v2-test-002", (80, 635, 802, 1008), "Restaurant: shadow, separately priced add-on and printed purchase count"),
]


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", default="veryfi-screening-crops-v2")
    args = parser.parse_args()
    if not args.run or any(c not in "abcdefghijklmnopqrstuvwxyz0123456789-_" for c in args.run):
        raise ValueError("Choose a bounded new local run name")
    folder = ROOT / "qa-artifacts/provider-review" / args.run
    rows = {d["receipt_id"]: d for d in map(json.loads, (DATA / "manifest.jsonl").read_text(encoding="utf-8").splitlines())}
    prepared = []
    # Resolve/check every source and output bound before creating any output.
    for index, (receipt_id, box, challenge) in enumerate(CASES, 1):
        row = rows[receipt_id]
        source = DATA / row["file_path"]
        raw = source.read_bytes()
        if sha(raw) != row["sha256"]:
            raise ValueError("Original source changed: " + receipt_id)
        with Image.open(io.BytesIO(raw)) as image:
            if image.getexif().get(274) not in (None, 1):
                raise ValueError("Orient explicitly before choosing crop coordinates")
            if not (0 <= box[0] < box[2] <= image.width and 0 <= box[1] < box[3] <= image.height):
                raise ValueError("Crop outside original pixels")
            crop = image.convert("RGB").crop(box)
            crop.info.clear()
            data = io.BytesIO()
            # No resizing, contrast changes, synthesis or copied metadata.
            crop.save(data, format="PNG", optimize=False)
        pixel_bytes = data.getvalue()
        archive = io.BytesIO()
        with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_STORED) as bundle:
            entry = zipfile.ZipInfo("receipt.png", date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_STORED
            bundle.writestr(entry, pixel_bytes)
        archive_bytes = archive.getvalue()
        if len(archive_bytes) > 2_000_000:
            raise ValueError("Lossless archive exceeds existing probe bound: " + receipt_id)
        prepared.append((f"case-{index:02d}", pixel_bytes, archive_bytes, {
            "case": f"case-{index:02d}", "receipt_id": receipt_id,
            "original_source": source.relative_to(ROOT).as_posix(),
            "original_sha256": row["sha256"], "original_split": row["split"],
            "original_privacy_status_unchanged": row["privacy_status"],
            "challenge": challenge, "crop_xyxy": list(box),
            "width": crop.width, "height": crop.height,
            "crop_file": f"case-{index:02d}/receipt.png", "crop_sha256": sha(pixel_bytes),
            "archive_file": f"case-{index:02d}/receipt.zip", "archive_sha256": sha(archive_bytes),
            "archive_bytes": len(archive_bytes), "archive_entries": ["receipt.png"],
            "metadata_copied": False, "external_processing_authorized": False,
        }))
    folder.mkdir(exist_ok=False)
    for name, pixels, archive, _ in prepared:
        (folder / name).mkdir()
        (folder / name / "receipt.png").write_bytes(pixels)
        (folder / name / "receipt.zip").write_bytes(archive)
    manifest = {
        "prepared_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Six source-informed local-only screening crops, not a new blind holdout. Separate crop inspection, sealed protocol, user approval and unused Free quota are still required before any provider upload.",
        "external_requests": 0, "original_permission_flags_changed": False,
        "method": "Integer pixel crop from decoded source RGB, lossless PNG with no copied metadata; no resize, enhancement or generated pixels. Exact same PNG bytes must be used by compared local/cloud methods.",
        "case_count": len(prepared), "cases": [entry[3] for entry in prepared],
        "builder_sha256": sha(Path(__file__).read_bytes()),
    }
    (folder / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (folder / "builder.py").write_bytes(Path(__file__).read_bytes())
    print(json.dumps({"folder": folder.relative_to(ROOT).as_posix(), "local_crops": len(prepared), "archive_sizes": [len(entry[2]) for entry in prepared], "external_requests": 0, "approval_recorded": False}))


if __name__ == "__main__":
    main()
