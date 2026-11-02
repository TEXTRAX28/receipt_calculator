"""Seal same-image spotting/control text for current-parser offline scoring."""
import hashlib
import json
from pathlib import Path
import runpy
import sys

from paddle_spotting import parse_spotting
from paddle_spotting_layout import join_spotted_columns

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/paddle-spotting-pilot-v1"
OUT = RUN / "postprocess-v1"
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def literal(folder, image_sha, request_sha=None):
    meta = load(folder / "metadata.json")
    assert meta["exit_code"] == 0 and not meta.get("error") and meta["parsed_text"]
    assert len(meta["images"]) == 1 and meta["images"][0]["sha256"] == image_sha
    if request_sha:
        assert meta["request_sha256"] == request_sha
    for name, key in (("stdout.txt", "stdout_sha256"), ("stderr.txt", "stderr_sha256"), ("harness.py", "harness_sha256"), ("vision_cli_text.py", "text_helper_sha256"), ("transcript.txt", "transcript_sha256")):
        read(folder / name, meta[key])
    decoder = runpy.run_path(str(folder / "vision_cli_text.py"))["parse_cli_transcript"]
    request = load(folder / "request.json", meta["request_sha256"])
    text = decoder((folder / "transcript.txt").read_text(encoding="utf-8"), request["prompt"]).strip()
    assert text == read(folder / "model-output.txt").decode("utf-8").replace("\r\n", "\n")
    return text


def main():
    assert not OUT.exists(), "Preserve scored inputs"
    plan, execution = load(RUN / "plan.json"), load(RUN / "execution.json")
    assert execution["status"] == "completed" and len(execution["calls"]) == 12
    for path, digest in plan["input_sha256"].items():
        read(ROOT / path, digest)
    records = {}
    for name in ("receipt_training/manifest.jsonl", "receipt_training/annotations/private/supplement-manifest.jsonl"):
        records.update({row["receipt_id"]: row for row in map(json.loads, read(ROOT / name).decode("utf-8").splitlines())})
    views = []
    for case in plan["cases"]:
        record = records[case["id"]]
        assert record["sha256"] == case["image_sha256"]
        collected = {"spotting-order": [], "spotting-geometry": [], "retained-ocr-control": []}
        failures = []
        for panel in case["panels"]:
            text = literal(ROOT / "qa-artifacts/advanced-ocr" / panel["native_run"], panel["sha256"], panel["request_sha256"])
            try:
                rows = parse_spotting(text)
                for variant, lines in (("spotting-order", [row["text"] for row in rows]),
                                       ("spotting-geometry", [row["text"] for row in join_spotted_columns(rows)])):
                    collected[variant].append({"photo_index": panel["photo_index"], "panel_index": panel["panel_index"], "text": "\n".join(lines)})
            except ValueError as error:
                failures.append({"panel": panel["position"], "error": str(error)})
            if panel["old_text_run"]:
                old = literal(ROOT / "qa-artifacts/advanced-ocr" / panel["old_text_run"], panel["sha256"])
                collected["retained-ocr-control"].append({"photo_index": panel["photo_index"], "panel_index": panel["panel_index"], "text": old})
        for variant, panels in collected.items():
            if variant == "retained-ocr-control" and not panels:
                continue
            views.append({"receipt_id": case["id"], "record": record, "cohort": case["cohort"],
                          "control": case["source"] == "nonfinancial-control", "variant": variant,
                          "panels": panels, "failures": failures if variant.startswith("spotting") else [],
                          "scope": "Confidence is unavailable. Geometry is model-predicted. Current parser will receive literal text only, not truth or derived amounts."})
    OUT.mkdir()
    (OUT / "inputs.json").write_text(json.dumps(views, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read(OUT / "inputs.json")
    for path in (Path(__file__), Path(__file__).with_name("paddle_spotting.py"), Path(__file__).with_name("paddle_spotting_layout.py"), ROOT / "server/local_ocr_models.py"):
        read(path)
        (OUT / path.name).write_bytes(path.read_bytes())
    (OUT / "metadata.json").write_text(json.dumps({"views": len(views), "geometry_profile": "Existing OCR 0.45 × minimum median-height baseline rule, excluding unavailable confidence aggregation; selected before score inspection.",
                                                  "input_sha256": HASHES, "source_sha256": plan["source_sha256"],
                                                  "new_model_requests": 0, "external_requests": 0}, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"views": len(views), "new_model_requests": 0, "external_requests": 0}))


if __name__ == "__main__":
    main()
