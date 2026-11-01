"""Compare frozen crop proposals with existing upstream CORD word geometry.

This never supplies labels to detection or claims financial OCR correctness.
"""
import hashlib
import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "qa-artifacts/receipt-edge-geometry-audit-v1.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def audit(study):
    path = ROOT / "qa-artifacts" / study / "results.json"
    result = json.loads(path.read_text(encoding="utf-8"))
    evidence = {path.relative_to(ROOT).as_posix(): sha(path)}
    records = []
    for row in result["results"]:
        if not row["suggestion"] or not row["id"].startswith("cord-v2-"):
            continue
        source = ROOT / "receipt_training/annotations/raw" / (row["id"] + ".json")
        raw = json.loads(source.read_text(encoding="utf-8"))
        evidence[source.relative_to(ROOT).as_posix()] = sha(source)
        w, h = row["source_width"], row["source_height"]
        if raw["meta"]["image_size"] != {"width": w, "height": h}:
            raise ValueError("Source annotation geometry does not match decoded image")
        b = row["suggestion"]["bounds"]
        rounded = lambda value: math.floor(value + 0.5)  # JS Math.round for positive pixels.
        x, y = rounded(w * b["left"] / 100), rounded(h * b["top"] / 100)
        rect = [x, y, x + rounded(w * (100 - b["left"] - b["right"]) / 100),
                y + rounded(h * (100 - b["top"] - b["bottom"]) / 100)]
        count, outside, original_outside = 0, [], 0
        for line_index, line in enumerate(raw["valid_line"]):
            for word_index, word in enumerate(line["words"]):
                quad = word["quad"]
                xs = [quad["x" + str(i)] for i in range(1, 5)]
                ys = [quad["y" + str(i)] for i in range(1, 5)]
                box = [max(0, min(xs)), max(0, min(ys)), min(w, max(xs)), min(h, max(ys))]
                if box[2] <= box[0] or box[3] <= box[1]:
                    original_outside += 1
                    continue
                count += 1
                if box[0] < rect[0] or box[1] < rect[1] or box[2] > rect[2] or box[3] > rect[3]:
                    outside.append({"line_index": line_index, "word_index": word_index,
                                    "source_visible_box": box})
        records.append({"id": row["id"], "crop_source_rect": rect, "upstream_visible_words": count,
                        "upstream_words_not_fully_enclosed": outside,
                        "upstream_words_outside_original_image": original_outside})
    return {"study": study, "proposed_crops_with_upstream_geometry": len(records),
            "upstream_visible_words": sum(row["upstream_visible_words"] for row in records),
            "words_not_fully_enclosed": sum(len(row["upstream_words_not_fully_enclosed"]) for row in records),
            "cases": records, "source_sha256": evidence}


if __name__ == "__main__":
    result = {"scope": "Existing upstream word rectangles clipped to the original visible image. This checks containment, not paper-boundary accuracy, OCR correctness, newly independent truth or every possible text region.",
              "versions": [audit("receipt-edge-study-v" + str(version)) for version in (1, 2, 3)],
              "new_model_requests": 0, "new_external_requests": 0,
              "audit_source_sha256": sha(Path(__file__))}
    payload = json.dumps(result, ensure_ascii=False, indent=2) + "\n"
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
    print(json.dumps([{key: row[key] for key in ("study", "proposed_crops_with_upstream_geometry", "upstream_visible_words", "words_not_fully_enclosed")} for row in result["versions"]]))
