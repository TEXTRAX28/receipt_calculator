"""Freeze tiny-reader evidence on existing genuine-photo preparation variants."""
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
SOURCE = "qa-artifacts/genuine-capture-read-v1"


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"browser-paddle-preparation-plan-v[1-9]\d*", tag)
    out = ROOT / "qa-artifacts" / tag
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

    def load(name, expected=None):
        return json.loads(checked(name, expected).read_text(encoding="utf-8"))

    old = load(SOURCE + "/metadata.json")
    capture_plan = load(SOURCE + "/input-plan.json", old["input_plan_sha256"])
    assert old["source_unchanged"] and old["actual_ocr_sections"] == 17
    assert old["requests"] == {"external": [], "writes": []}
    for name, expected in capture_plan["input_sha256"].items():
        checked(name, expected)
    # Reuse actual browser-prepared pixels only while preparation helpers match.
    for name in ("images.ts", "image-geometry.ts", "image-geometry.worker.ts",
                 "edge-preview.ts", "receipt-edges.ts", "capture-review.ts"):
        source = "src/lib/" + name
        checked(source, old["source_sha256"][source])

    model_path = "qa-artifacts/browser-paddle-tiny-plan-v1/plan.json"
    model = load(model_path)
    assert [m["name"] for m in model["models"]] == ["PP-OCRv6_tiny_det", "PP-OCRv6_tiny_rec"]
    for asset in model["models"]:
        assert checked(asset["path"], asset["sha256"]).stat().st_size == asset["bytes"]
    sdk_root = "receipt_training/.cache/browser-paddle-sdk-v1/"
    for name, expected in model["input_sha256"].items():
        if name.startswith(sdk_root):
            checked(name, expected)
    for path in sorted((ROOT / sdk_root / "node_modules/onnxruntime-web/dist").iterdir()):
        if path.suffix in {".mjs", ".wasm"}:
            checked(path.relative_to(ROOT).as_posix())

    cases, reused = [], []
    for entry in capture_plan["cases"]:
        record = entry["record"]
        assert not record["external_processing_allowed"]
        for variant in capture_plan["variants"]:
            name = f'{SOURCE}/{record["receipt_id"]}-{variant}.json'
            prepared = load(name)
            assert not prepared.get("error") and prepared["image_sha256"] == record["sha256"]
            if prepared.get("reused_original"):
                assert prepared["abstained"] and not prepared.get("frames")
                reused.append({"receipt_id": record["receipt_id"], "variant": variant})
                continue
            for frame in prepared["frames"]:
                assert frame["path"].startswith(SOURCE + "/")
                assert checked(frame["path"], frame["sha256"]).stat().st_size == frame["bytes"]
                assert frame["width"] * frame["height"] <= 4_000_000
            cases.append({"receipt_id": record["receipt_id"] + "--" + variant,
                          "original_receipt_id": record["receipt_id"], "variant": variant,
                          "image_sha256": record["sha256"], "frames": prepared["frames"],
                          "prepared_path": name})
    assert len(cases) == 10 and len(reused) == 2
    assert sum(len(c["frames"]) for c in cases) == 17

    names = subprocess.check_output(["git", "ls-files", "src/lib"], cwd=ROOT, text=True).splitlines()
    names += ["src/App.tsx", "package-lock.json", "scripts/enhanced-ocr-assets.json"]
    names += ["receipt_training/scripts/" + name for name in (
        "guard_browser_paddle_probe.py", "probe_browser_paddle.mjs", "observe_process_memory.py",
        "vision_trial_guard.py", "qwen8b_resources.py", "prepare_browser_paddle_capture_variants.py",
        "replay_browser_paddle_capture_variants.mjs", "score_capture_accuracy.py", "score_adjustments.py", "score.py")]
    sources = {}
    for name in names:
        path = checked(name)
        target = out / "source" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(path.read_bytes())
        sources[name] = inputs[name]
    plan = {"study_id": tag.replace("-plan-", "-"), "created_at": datetime.now(timezone.utc).isoformat(),
            "parent_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
            "recorded_before_new_ocr": True, "capture_source": SOURCE,
            "models": [{"size": "tiny", "plan_path": model_path, "plan_sha256": inputs[model_path], "assets": model["models"]}],
            "cases": cases, "reused_original": reused, "source_sha256": sources, "input_sha256": inputs,
            "limits": {"synthetic_calls_per_model": 1, "maximum_receipt_image_calls_per_model": 17,
                       "attempts_per_image": 1, "startup_ram_bytes": 2684354560,
                       "runtime_ram_floor_bytes": 1073741824, "whole_run_deadline_seconds": 300,
                       "external_receipt_uploads": 0, "model_downloads": 0},
            "parameters": {"sdk": "0.4.2", "ort": "1.31.1", "backend": "wasm", "threads": 1,
                           "det_batch": 1, "rec_batch": 1, "det_limit_side": 960, "det_limit_type": "max"},
            "scope": "Existing preregistered original, automatic crop and manual straighten copies of four familiar development transactions. Three CORD cases and the UK supplement retain separate denominators. Prepared pixels, selected regions, references and preparation code unchanged; one near-full-frame control abstains and reuses its original reading twice. No extra tuning, labels or earlier OCR enter prediction. Not a new holdout or original-fifty benchmark.",
            "scoring": "Current frozen app paddlePanel, assembly, parser and mandatory corrected-photo review. Existing v5/UK-v2 labels and scorer, automatic and supplied currency separate. No edits/checks cleared. All variants retained, no provider/preparation promotion based on a single example.",
            "timing": "Warm SDK prediction/decode and separate initialization, excluding reused preparation and offline parsing. One run, no robust p95 or physical phone measurement. Existing tiny/browser guard unchanged; medium and 8B guards untouched."}
    with (out / "study-plan.json").open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(plan, indent=2) + "\n")
    print(json.dumps({"plan": str(out.relative_to(ROOT)), "fresh_variants": len(cases),
                      "maximum_receipt_image_calls": 17, "new_ocr_calls": 0}))


if __name__ == "__main__":
    main()
