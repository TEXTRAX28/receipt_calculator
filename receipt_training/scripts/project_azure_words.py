"""Offline word-only geometry adapter. No native receipt fields or API calls."""
import argparse
from collections import Counter
import hashlib
import importlib.util
import json
import math
from pathlib import Path
import re
import struct

from review_veryfi_screening import exact_json

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "qa-artifacts/provider-review/azure-screening-v1"
HELPER = ROOT / "server/local_ocr_models.py"
spec = importlib.util.spec_from_file_location("receipt_geometry_only", HELPER)
geometry = importlib.util.module_from_spec(spec)
spec.loader.exec_module(geometry)


def project(record, expected_width, expected_height):
    """Preserve every word, deriving row order/boxes with the existing helper."""
    if record.get("status") != "succeeded":
        raise ValueError("Complete successful analysis required")
    analysis = record.get("analyzeResult", {})
    if analysis.get("modelId") != "prebuilt-receipt" or analysis.get("apiVersion") != "2024-11-30":
        raise ValueError("Unexpected model/version")
    pages = analysis.get("pages")
    if not isinstance(pages, list) or len(pages) != 1:
        raise ValueError("One exact source crop required")
    page = pages[0]
    if (page.get("pageNumber") != 1 or page.get("unit") != "pixel" or
            page.get("width") != expected_width or page.get("height") != expected_height):
        raise ValueError("Page geometry differs from the exact input crop")
    if not (8 <= expected_width <= 4000 and 8 <= expected_height <= 4000 and expected_width * expected_height <= 4_000_000):
        raise ValueError("Page exceeds current local evidence bounds")
    source = page.get("words")
    if not isinstance(source, list) or not source or len(source) > 10000:
        raise ValueError("Bounded real word geometry required")
    words = []
    for token in source:
        polygon = token.get("polygon")
        if not isinstance(polygon, list) or len(polygon) != 8:
            raise ValueError("Four-corner word polygon required")
        coordinates = [float(value) for value in polygon]
        if not all(math.isfinite(value) for value in coordinates):
            raise ValueError("Non-finite source geometry")
        xs, ys = coordinates[::2], coordinates[1::2]
        # Reject out-of-source coordinates instead of clipping/manufacturing boxes.
        box = [min(xs) / expected_width, min(ys) / expected_height,
               max(xs) / expected_width, max(ys) / expected_height]
        words.append(geometry.word(token.get("content"), token.get("confidence"), box))
    lines = geometry.reading_lines(words)
    if len(lines) > 2000:
        raise ValueError("Too many derived rows")
    assert Counter(piece for token in words for piece in token["text"].split()) == Counter(piece for line in lines for piece in line["text"].split()), "Word text lost or duplicated"
    return {"engine": "azure-document-intelligence-prebuilt-receipt-word-layout",
        "panels": [{"photo": 1, "part": 1, "width": expected_width,
                    "height": expected_height, "words": words, "lines": lines}]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run", required=True)
    args = parser.parse_args()
    assert re.fullmatch(r"[\w-]+", args.run), "Choose a new bounded run name"
    out = FOLDER / args.run
    assert not out.exists(), "Preserve saved evidence"
    evidence = {}

    def read(path, expected=None):
        raw = path.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or expected == digest, str(path)
        evidence[path.relative_to(ROOT).as_posix()] = digest
        return raw

    plan = json.loads(read(FOLDER / "run/plan.json"))
    assert len(plan["cases"]) == 6
    results = []
    for case in plan["cases"]:
        image = read(ROOT / case["image"], case["image_sha256"])
        assert image[:8] == bytes.fromhex("89504e470d0a1a0a") and image[12:16] == b"IHDR"
        width, height = struct.unpack(">II", image[16:24])
        meta = json.loads(read(FOLDER / "run" / case["id"] / "metadata.json"))
        assert meta["extraction_received"] and meta["image_sha256"] == case["image_sha256"]
        raw = read(FOLDER / "run" / case["id"] / "response.json", meta["response_sha256"])
        recognition = project(exact_json(raw), width, height)
        results.append({"case":case["id"],"receipt_id":case["receipt_id"],
            "image_sha256":case["image_sha256"],"provider_response_sha256":meta["response_sha256"],
            "recognition":recognition})
    out.mkdir()
    (out / "source").mkdir()
    for path in (Path(__file__), HELPER, Path(__file__).with_name("review_veryfi_screening.py")):
        (out / "source" / path.name).write_bytes(read(path))
    payload = "".join(json.dumps(row,ensure_ascii=False)+"\n" for row in results).encode("utf-8")
    (out / "recognition.jsonl").write_bytes(payload)
    meta = {"scope":"Six saved approved Azure responses. Word polygons/content/confidence only; original native amounts, descriptions, country/currency and field confidence never enter reconstruction. The unchanged existing geometry helper joins row baselines. No reference values, model calls or uploads.",
        "source_sha256":{path:evidence[path] for path in (Path(__file__).relative_to(ROOT).as_posix(),HELPER.relative_to(ROOT).as_posix(),"receipt_training/scripts/review_veryfi_screening.py")},
        "recognition_sha256":hashlib.sha256(payload).hexdigest(),"cases":len(results),
        "application_engine_registered":False,"geometry_scope":"Axis-aligned boxes enclosing actual source word polygons, normalized in the exact crop. Derived row confidence is the minimum real word confidence, not a new model score. No deskew or confidence calibration claim.",
        "new_model_requests":0,"external_requests":0,"evidence_sha256":evidence}
    (out / "metadata.json").write_text(json.dumps(meta,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({"cases":len(results),"word_counts":[len(row["recognition"]["panels"][0]["words"]) for row in results],"row_counts":[len(row["recognition"]["panels"][0]["lines"]) for row in results],"external_requests":0}))


if __name__ == "__main__": main()
