"""Convert actual SDK polygons to the existing local reader geometry contract.

An SDK detection is one text-line fragment, not a fabricated collection of words.
Only geometry is grouped; no labels, currency context or financial repair is used.
"""
import hashlib
import json
import math
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "server"))
from local_ocr_models import reading_lines, word


def main():
    tag, output_tag = sys.argv[1:3]
    assert all(re.fullmatch(r"[\w-]+", name) for name in (tag, output_tag))
    output = ROOT / "qa-artifacts" / output_tag
    output.mkdir()
    hashes = {}

    def read(name, expected=None):
        raw = (ROOT / name).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert expected is None or digest == expected, name
        hashes[name] = digest
        return raw

    def load(name, expected=None):
        return json.loads(read(name, expected))

    source = "qa-artifacts/" + tag
    metadata = load(source + "/capture-results.json")
    assert not metadata["errors"]
    assert not metadata["requests"]["external"] and not metadata["requests"]["writes"]
    assert metadata["engine"] == "paddle-ppocrv6-tiny-browser-wasm"
    for name, digest in metadata["input_sha256"].items():
        read(name, digest)
    cases = []
    for case in metadata["cases"]:
        assert not case["error"] and len(case["panels"]) == len(case["frames"])
        panels, elapsed = [], 0
        for panel, frame in zip(case["panels"], case["frames"], strict=True):
            assert panel["frame"] == frame
            saved = load(source + "/" + panel["result"], panel["result_sha256"])
            assert not saved.get("error") and saved["frame"] == frame
            assert len(saved["reading"]) == 1
            observed = saved["reading"][0]
            width, height = frame["width"], frame["height"]
            assert observed["image"] == {"width": width, "height": height}
            assert all(type(n) is int and 8 <= n <= 4000 for n in (width, height))
            assert width * height <= 4_000_000
            assert len(observed["items"]) <= 10000
            fragments = []
            for item in observed["items"]:
                polygon = item["poly"]
                assert len(polygon) == 4 and all(len(p) == 2 for p in polygon)
                assert all(type(n) in (int, float) and math.isfinite(n) for p in polygon for n in p)
                xs, ys = [p[0] for p in polygon], [p[1] for p in polygon]
                box = [max(0, min(xs) / width), max(0, min(ys) / height),
                       min(1, max(xs) / width), min(1, max(ys) / height)]
                assert type(item["score"]) in (int, float)
                fragments.append(word(item["text"], item["score"], box))
            lines = reading_lines(fragments)
            assert len(lines) <= 2000
            panels.append({"photo": frame["photo"], "part": frame["part"],
                           "width": width, "height": height, "words": fragments, "lines": lines})
            elapsed += saved["elapsed_ms"]
        cases.append({"receipt_id": case["receipt_id"], "image_sha256": case["image_sha256"],
                      "recognition": {"engine": metadata["engine"], "panels": panels},
                      "frames": case["frames"], "reading_ms": elapsed, "elapsed_ms": case["elapsed_ms"]})
    for name in ("receipt_training/scripts/adapt_browser_paddle.py", "server/local_ocr_models.py"):
        raw = read(name)
        (output / Path(name).name).write_bytes(raw)
    result = {"cases": cases, "input_sha256": hashes,
              "actual_ocr_sections": sum(len(c["frames"]) for c in cases),
              "scope": "Actual detected text-line fragments retain SDK scores and axis-aligned envelopes of their actual polygons. Native local reader reading_lines geometry grouping reused without financial changes. Not native medium Paddle; engine identity remains browser tiny WASM. No inferred character/word boxes, provider calls or new OCR in adaptation."}
    (output / "adapted.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"cases": len(cases), "panels": result["actual_ocr_sections"], "new_ocr_calls": 0}))


if __name__ == "__main__":
    main()
