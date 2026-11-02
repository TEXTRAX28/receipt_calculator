"""Prepare/run a bounded original-image spotting pilot; never send OCR or labels."""
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys

from paddle_spotting import parse_spotting

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/paddle-spotting-pilot-v1"
HASHES = {}


def sha(path):
    value = hashlib.sha256(path.read_bytes()).hexdigest()
    HASHES[path.relative_to(ROOT).as_posix()] = value
    return value


def load(path, expected=None):
    value = sha(path)
    assert expected is None or expected == value, str(path)
    return json.loads(path.read_text(encoding="utf-8"))


def save(path, data):
    with path.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(data, file, ensure_ascii=False, indent=2)
        file.write("\n")


def prepare():
    assert not RUN.exists(), "Preserve the sealed plan and native attempts"
    compatibility = load(ROOT / "qa-artifacts/paddle-spotting-compat-v2/geometry-check.json")
    assert compatibility["exact_text_lines"] == 7 and compatibility["minimum_box_iou"] > .5
    prior = load(ROOT / "qa-artifacts/advanced-ocr/paddle-vl16-text-pilot-v1.json")
    cases = []
    for old in prior["cases"]:
        panels = []
        for position, panel in enumerate(old["panels"]):
            request = load(ROOT / panel["request"], panel["request_sha256"])
            assert len(request["images"]) == 1
            path = ROOT / request["images"][0]
            assert sha(path) == panel["sha256"]
            panels.append({"image": request["images"][0], "photo_index": panel["photo_index"],
                           "panel_index": panel["panel_index"], "width": panel["width"], "height": panel["height"],
                           "sha256": panel["sha256"], "old_text_run": f"paddle-vl16-pilot-v1-{old['id']}-panel-{position + 1}"})
        cases.append({"id": old["id"], "source": old["source"], "image_sha256": old["image_sha256"],
                      "source_panel_run": old["source_panel_run"], "panels": panels, "cohort": "previous-seven"})
    original = load(ROOT / "qa-artifacts/row-first-original50-v1/plan.json")
    for identity in ("cord-v2-train-005", "cord-v2-train-013", "cord-v2-train-023"):
        old = next(case for case in original["cases"] if case["id"] == identity)
        panels = []
        for path, panel in zip(old["images"], old["panels"], strict=True):
            assert sha(ROOT / path) == panel["sha256"]
            panels.append({"image": path, "photo_index": panel["photo"] - 1, "panel_index": panel["part"] - 1,
                           "width": panel["width"], "height": panel["height"], "sha256": panel["sha256"], "old_text_run": None})
        cases.append({"id": identity, "source": "original", "image_sha256": old["original_image_sha256"] if "original_image_sha256" in old else old["record"]["sha256"],
                      "panels": panels, "cohort": "financial-development"})
    assert len(cases) == 10 and sum(len(case["panels"]) for case in cases) == 12
    RUN.mkdir()
    (RUN / "results").mkdir()
    model = "receipt_training/evaluation/paddle-spotting-candidate-manifest.json"
    load(ROOT / model)
    count = 0
    for case in cases:
        for panel in case["panels"]:
            count += 1
            request = {"images": [panel["image"]], "model_manifest": model,
                       "output_mode": "text", "prompt": "Spotting:", "context": 8192,
                       "max_tokens": 5000, "image_tokens": 2048, "gpu_layers": 99,
                       "projector_gpu": True, "special_tokens": True}
            path = RUN / f"request-{count}.json"
            save(path, request)
            panel.update({"request": path.relative_to(ROOT).as_posix(), "request_sha256": sha(path),
                          "native_run": f"paddle-spotting-pilot-v1-{count}", "position": count})
    source = RUN / "source"
    (source / "src/lib").mkdir(parents=True)
    source_hashes = {}
    for path in (ROOT / "src/lib").iterdir():
        if path.suffix in (".ts", ".mjs"):
            relative = path.relative_to(ROOT)
            source_hashes[relative.as_posix()] = sha(path)
            with (source / relative).open("xb") as output:
                output.write(path.read_bytes())
    for name in ("paddle_spotting_trial.py", "paddle_spotting.py", "benchmark_vision_cli.py", "vision_cli_text.py"):
        path = ROOT / "receipt_training/scripts" / name
        sha(path)
        with (source / name).open("xb") as output:
            output.write(path.read_bytes())
    save(RUN / "plan.json", {"scope": "Ten previously inspected development/control cases: previous seven-case pilot's exact nine panels plus three source-informed financial cases' exact current panels. Component spotting, not a full PaddleX pipeline or blind holdout.",
                             "sealed_at": datetime.now(timezone.utc).isoformat(), "cases": cases,
                             "new_native_request_limit": count, "deadline_seconds": 180,
                             "automatic_retries": 0, "external_receipt_uploads": 0,
                             "input_ocr_text": False, "label_files_read": False,
                             "geometry_confidence_available": False,
                             "source_sha256": source_hashes, "input_sha256": HASHES,
                             "promotion_gate": "No app integration without known field/row evidence, valid source geometry and preserved manual review. No invented confidence; a copied or balanced total is insufficient."})
    print(json.dumps({"cases": len(cases), "panels": count, "external_receipt_uploads": 0}))


def run():
    plan = load(RUN / "plan.json")
    for path, expected in plan["input_sha256"].items():
        assert sha(ROOT / path) == expected, path
    assert not (RUN / "execution.json").exists(), "Observe an existing execution; never restart it implicitly"
    execution = {"started_at": datetime.now(timezone.utc).isoformat(), "pid": os.getpid(),
                 "status": "running", "calls": [], "automatic_retries": 0, "external_receipt_uploads": 0}
    for case in plan["cases"]:
        for panel in case["panels"]:
            folder = ROOT / "qa-artifacts/advanced-ocr" / panel["native_run"]
            assert not folder.exists(), "A native attempt already exists; inspect it, do not rerun"
            process = subprocess.run([sys.executable, "-X", "utf8", "receipt_training/scripts/benchmark_vision_cli.py",
                                      "--request", panel["request"], "--run", panel["native_run"], "--deadline", "180"],
                                     cwd=ROOT, stdin=subprocess.DEVNULL, capture_output=True)
            (RUN / f"native-{panel['position']}.log").write_bytes(process.stdout + process.stderr)
            result = {"id": case["id"], "panel": panel["position"], "exit_code": process.returncode,
                      "native_run": panel["native_run"], "spotting_valid": False}
            if process.returncode == 0:
                try:
                    rows = parse_spotting((folder / "model-output.txt").read_text(encoding="utf-8"))
                    save(RUN / "results" / f"{panel['position']}-spotting.json", {"rows": rows, "text": "\n".join(row["text"] for row in rows), "confidence_available": False})
                    result.update({"spotting_valid": True, "rows": len(rows)})
                except ValueError as error:
                    result["decoder_error"] = str(error)
            execution["calls"].append(result)
            (RUN / "execution.json").write_text(json.dumps(execution, indent=2) + "\n", encoding="utf-8")
            print(json.dumps(result), flush=True)
    execution.update({"status": "completed", "completed_at": datetime.now(timezone.utc).isoformat()})
    (RUN / "execution.json").write_text(json.dumps(execution, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    {"prepare": prepare, "run": run}[sys.argv[1]]()
