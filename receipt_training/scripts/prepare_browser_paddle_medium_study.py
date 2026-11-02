"""Freeze a bounded local tiny/medium comparison, without downloading or inference."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
TAG = sys.argv[1] if len(sys.argv) > 1 else "browser-paddle-medium-paired-plan-v1"
assert re.fullmatch(r"browser-paddle-medium-paired-plan-v[1-9]\d*", TAG)


def main():
    out = ROOT / "qa-artifacts" / TAG
    out.mkdir()
    inputs = {}

    def checked(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        digest = sha(path)
        assert expected is None or digest == expected, name
        inputs[name] = digest
        return path

    def load(name):
        return json.loads(checked(name).read_text(encoding="utf-8"))

    models = []
    for size in ("tiny", "medium"):
        path = f"qa-artifacts/browser-paddle-{size}-plan-v1/plan.json"
        plan = load(path)
        assert [m["name"] for m in plan["models"]] == [f"PP-OCRv6_{size}_det", f"PP-OCRv6_{size}_rec"]
        for model in plan["models"]:
            assert checked(model["path"], model["sha256"]).stat().st_size == model["bytes"]
        models.append({"size": size, "plan_path": path, "plan_sha256": inputs[path], "assets": plan["models"]})

    sdk_root = "receipt_training/.cache/browser-paddle-sdk-v1/"
    medium_plan = load(models[1]["plan_path"])
    for name, expected in medium_plan["input_sha256"].items():
        if name.startswith(sdk_root):
            checked(name, expected)
    for path in sorted((ROOT / sdk_root / "node_modules/onnxruntime-web/dist").iterdir()):
        if path.suffix in {".mjs", ".wasm"}:
            checked(path.relative_to(ROOT).as_posix())

    app_inputs = load("qa-artifacts/enhanced-area-app-uk-v1/area-readings.json")["modelInputs"]
    capture = load("qa-artifacts/browser-paddle-tiny-capture-v1/capture-input.json")
    original_plan = load("qa-artifacts/genuine-capture-read-v1/input-plan.json")
    records = {c["record"]["receipt_id"]: c["record"] for c in original_plan["cases"]}
    uk = "supplement-user-uk-20261026-group"
    assert [f["sha256"] for f in next(c for c in capture["cases"] if c["receipt_id"] == uk)["frames"]] == [m["sha256"] for m in app_inputs[:2]]
    cases = []
    for target, entry in zip(("vat-legend", "chicken-skewer", "baby-plum-tomatoes"), app_inputs[2:], strict=True):
        path = Path(entry["path"]).resolve().relative_to(ROOT).as_posix()
        frame = {"photo": 1, "part": 1, **entry["reply"]["result"][0]["image"],
                 "bytes": entry["bytes"], "sha256": entry["sha256"], "path": path}
        cases.append({"receipt_id": "uk-selected-" + target, "image_sha256": frame["sha256"],
                      "group": "selected-area", "target": target, "original_receipt_id": uk, "frames": [frame]})
    for entry in capture["cases"]:
        record = records[entry["receipt_id"]]
        assert record["sha256"] == entry["image_sha256"] and not record["external_processing_allowed"]
        cases.append({**entry, "group": "genuine-whole", "record": record})
    assert len(cases) == 7 and sum(len(c["frames"]) for c in cases) == 8
    for case in cases:
        for frame in case["frames"]:
            assert checked(frame["path"], frame["sha256"]).stat().st_size == frame["bytes"]
            assert frame["width"] * frame["height"] <= 4_000_000

    names = subprocess.check_output(["git", "ls-files", "src/lib"], cwd=ROOT, text=True).splitlines()
    names += ["server/local_ocr_models.py", "package-lock.json"]
    names += ["receipt_training/scripts/" + name for name in (
        "guard_browser_paddle_probe.py", "probe_browser_paddle.mjs", "adapt_browser_paddle.py",
        "observe_process_memory.py", "vision_trial_guard.py", "qwen8b_resources.py",
        "prepare_browser_paddle_medium_study.py", "replay_browser_paddle_medium_study.mjs",
        "score_browser_paddle_medium_study.py", "score.py", "score_adjustments.py")]
    sources = {}
    for name in names:
        path = checked(name)
        destination = out / "source" / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(path.read_bytes())
        sources[name] = inputs[name]
    for name in ("receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl",
                 "receipt_training/annotations/private/supplement-financial-v2-labels.jsonl",
                 "receipt_training/evaluation/config.json"):
        checked(name)
    plan = {"study_id": TAG.replace("-plan-", "-"), "created_at": datetime.now(timezone.utc).isoformat(),
            "recorded_before_new_ocr": True, "parent_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "models": models, "cases": cases, "source_sha256": sources, "input_sha256": inputs,
            "limits": {"synthetic_calls_per_model": 1, "maximum_receipt_image_calls_per_model": 8,
                       "attempts_per_image": 1, "startup_ram_bytes": 3885219840,
                       "runtime_ram_floor_bytes": 1073741824, "whole_run_deadline_seconds": 300,
                       "external_receipt_uploads": 0, "model_downloads": 0},
            "parameters": {"sdk": "0.4.2", "ort": "1.31.1", "backend": "wasm", "threads": 1,
                           "det_batch": 1, "rec_batch": 1, "det_limit_side": 960, "det_limit_type": "max"},
            "scope": "Sequential tiny then medium in the same official SDK worker runner. Three fixed crops selected for known tiny-reader errors, followed by the same four familiar development receipts (five whole-image panels). Crops are not independent receipts or a holdout. Original fifty untouched. No labels or earlier OCR supplied to either recognizer. Model caches reused without writing new weight archives. No new app default or provider integration.",
            "scoring": "Unchanged existing financial labels/config/scorer and frozen current parser; automatic and separately supplied currency remain separate. Selected crops scored only for two literal tax-code rows and two VAT-legend rates; names reported as exact strings. No crop tuning, glyph repair, financial edits or checks cleared.",
            "timing": "Warm prediction/decode after fixed synthetic gate, plus separately reported initialization and guarded process lifetime. One run per arm, not robust p95 or physical-phone measurements. Owned development process-tree peak is sampled, not model-only memory."}
    with (out / "study-plan.json").open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({"plan": str((out / 'study-plan.json').relative_to(ROOT)), "cases": len(cases), "whole_transactions": 4,
                      "maximum_receipt_images_per_model": 8, "new_inference_calls": 0, "model_downloads": 0}))


if __name__ == "__main__":
    main()
