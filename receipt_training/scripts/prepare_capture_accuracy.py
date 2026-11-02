"""Freeze source-reviewed frames/references before any new capture-study OCR."""
import hashlib
import json
from pathlib import Path
import re
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
HASHES = {}


def read(name):
    raw = (ROOT / name).read_bytes()
    HASHES[name] = hashlib.sha256(raw).hexdigest()
    return raw


def rows(name):
    return [json.loads(line) for line in read(name).decode("utf-8").splitlines()]


def frame(points):
    return {"turns": 0, "corners": [{"x": x, "y": y} for x, y in points]}


def main():
    name = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", name)
    out = ROOT / "qa-artifacts" / name
    out.mkdir()
    records = rows("receipt_training/manifest.jsonl")
    supplements = rows("receipt_training/annotations/private/supplement-manifest.jsonl")
    selected = {
        "cord-v2-train-000": [frame([(21, 0), (77, 0), (85, 100), (23, 100)])],
        "cord-v2-train-005": [frame([(14, 0), (86, 0.5), (87, 86), (13, 85)])],
        "cord-v2-train-001": None,
        "supplement-user-uk-20261026-group": [
            frame([(20, 0), (76, 0), (79, 100), (19.5, 100)]),
            frame([(20, 0), (76, 0), (75, 100), (18.5, 100)]),
        ],
    }
    cases = []
    for identity, frames in selected.items():
        record = next(r for r in records + supplements if r["receipt_id"] == identity)
        assert record["split"] == "development" and record["external_processing_allowed"] is False
        files = record.get("source_files", [{"file_path": record.get("file_path"), "sha256": record["sha256"]}])
        assert frames is None or len(frames) == len(files)
        for source in files:
            assert hashlib.sha256(read("receipt_training/" + source["file_path"])).hexdigest() == source["sha256"]
        coverage = None
        if identity.startswith("cord-") and frames:
            raw = json.loads(read("receipt_training/annotations/raw/" + identity + ".json"))
            w, h = raw["meta"]["image_size"]["width"], raw["meta"]["image_size"]["height"]
            polygon = [(p["x"] / 100, p["y"] / 100) for p in frames[0]["corners"]]
            outside, count = [], 0
            for li, line in enumerate(raw["valid_line"]):
                for wi, word in enumerate(line["words"]):
                    q = word["quad"]
                    xs, ys = [q["x" + str(i)] for i in range(1, 5)], [q["y" + str(i)] for i in range(1, 5)]
                    x0, x1 = max(0, min(xs)), min(w - 1, max(xs))
                    y0, y1 = max(0, min(ys)), min(h - 1, max(ys))
                    if x1 <= x0 or y1 <= y0:
                        continue
                    count += 1
                    for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]:
                        px, py = x / (w - 1), y / (h - 1)
                        if any((polygon[(i + 1) % 4][0] - a[0]) * (py - a[1]) -
                               (polygon[(i + 1) % 4][1] - a[1]) * (px - a[0]) < -1e-9 for i, a in enumerate(polygon)):
                            outside.append([li, wi])
                            break
            coverage = {"source_visible_word_boxes": count, "boxes_not_enclosed": outside}
            assert not outside, (identity, coverage)
        cases.append({"record": record, "geometry": frames, "source_word_containment": coverage,
                      "manual_frame_note": "No reliable complete frame selected; keep original" if frames is None else
                      "Assistant-selected visible paper/section envelope before new OCR, with margin; not true physical proportions, automatic pose detection or independent human truth."})
    for name in ("receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl", "receipt_training/annotations/private/supplement-financial-v2-labels.jsonl", "receipt_training/evaluation/config.json", "receipt_training/scripts/prepare_capture_accuracy.py"):
        read(name)
    plan = {"scope": "Four familiar development transactions / five original photographs: faint tilted CORD, coupon/card CORD, near-full-frame control and two overlapping supplied UK Costco sections. Actual current original/crop/straighten options; no new model or cloud. Frames selected from source appearance, not OCR output or balancing. References unchanged.",
            "created_at": datetime.now(timezone.utc).isoformat(), "recorded_before_new_ocr": True,
            "variants": ["original", "auto-crop", "manual-straighten"], "cases": cases, "input_sha256": HASHES,
            "automatic_retries": 0, "external_receipt_uploads": 0, "model_api_calls": 0,
            "interpretation": "Compare end-to-end preparation options; crop also changes contrast/resolution/panel planning, while straighten adds resampling/white margin. No geometry-only causal attribution, blind holdout or whole-corpus claim.",
            "abstention": "No suggested/selected correction reuses the saved original reading without a duplicate OCR call; label this reuse explicitly."}
    with (out / "plan.json").open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({"transactions": len(cases), "source_photos": sum(len(c["record"].get("source_files", [None])) for c in cases),
                      "source_word_coverage": [c["source_word_containment"] for c in cases if c["source_word_containment"]], "ocr_jobs": 0}))


if __name__ == "__main__":
    main()
