"""Freeze three paired development requests; no inference, labels or cloud calls."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "qa-artifacts/qwen8b-comparison-v1"
HASHES = {}


def read(name):
    path = ROOT / name
    raw = path.read_bytes()
    HASHES[name] = hashlib.sha256(raw).hexdigest()
    return raw


def write(name, value):
    raw = (json.dumps(value, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    path = OUT / name
    with path.open("xb") as output:
        output.write(raw)
    return {"path": path.relative_to(ROOT).as_posix(), "sha256": hashlib.sha256(raw).hexdigest()}


def main():
    plan = json.loads(read("qa-artifacts/row-first-original50-v1/plan.json"))
    ids = ["cord-v2-train-013", "cord-v2-train-005", "cord-v2-train-023"]
    manifests = {
        "4b": "receipt_training/evaluation/vision-candidate-manifest.json",
        "8b": "receipt_training/evaluation/qwen8b-candidate-manifest.json",
    }
    for path in manifests.values():
        read(path)
    OUT.mkdir(exist_ok=False)
    cases, calls = [], []
    for index, identity in enumerate(ids):
        old = next(case for case in plan["cases"] if case["id"] == identity)
        assert old["record"]["split"] == "development"
        source = next(item for item in plan["requests"] if item["id"] == identity)
        request = json.loads(read(source["request"]))
        assert HASHES[source["request"]] == source["sha256"]
        assert request["images"] == old["images"]
        for path, panel in zip(old["images"], old["panels"], strict=True):
            assert hashlib.sha256(read(path)).hexdigest() == panel["sha256"]
        assert request["context"] == 8192 and request["max_tokens"] == 4000 and request["image_tokens"] == 1536
        request.update(gpu_layers=20, projector_gpu=False)
        order = ["4b", "8b"] if index % 2 == 0 else ["8b", "4b"]
        pair = {}
        for model in order:
            candidate = {**request, "model_manifest": manifests[model]}
            record = write(f"{index + 1}-{model}-request.json", candidate)
            pair[model] = record
            calls.append({"id": identity, "model": model, "request": record["path"], "request_sha256": record["sha256"], "native_run": f"qwen8b-comparison-v1-{index + 1}-{model}"})
        cases.append({"id": identity, "split": "development", "requests": pair, "source_image_sha256": old["record"]["sha256"], "images": old["images"]})
    for path in ["receipt_training/scripts/prepare_qwen8b_comparison.py", "receipt_training/scripts/benchmark_vision_cli.py", "receipt_training/scripts/vision_cli_text.py", "receipt_training/scripts/qwen8b_resources.py"]:
        (OUT / Path(path).name).write_bytes(read(path))
    result = {
        "scope": "Three previously inspected development diagnostics: service/tax, coupon/card tender, zero-tax unknown-basis control. Same original prepared pixels and full-receipt row-first prompt/schema; no holdout or complete-corpus accuracy claim.",
        "cases": cases,
        "calls": calls,
        "native_request_limit": 6,
        "deadline_seconds_per_call": 180,
        "automatic_retries": 0,
        "context": 8192,
        "output_tokens": 4000,
        "image_tokens": 1536,
        "gpu_layers": 20,
        "projector_gpu": False,
        "hardware_profile": "Both candidates use the same fixed partial GPU offload and CPU projector; these timings cannot substitute for the prior auto-offload 4B cohort.",
        "resource_gate": "Recheck qwen8b_resources.py before installation and each native call. Existing installer rejects assets above four billion bytes; this preparation does not change that cap or install models. A bounded installer and runtime low-memory abort must be verified before execution.",
        "promotion_gate": "Research only. Compare literal names, quantities, unit/line prices, totals, tax basis and financial roles against the same references. Inspect extra payment/summary lines. No app provider change based on three development cases; require broader same-reference testing, operational fit and human verification gates.",
        "label_files_read": False,
        "input_ocr_text": False,
        "native_calls_executed": 0,
        "external_receipt_uploads": 0,
        "input_sha256": HASHES,
    }
    write("plan.json", result)
    print(json.dumps({"prepared_pairs": len(cases), "prepared_requests": len(calls), "native_calls": 0, "external_uploads": 0}))


if __name__ == "__main__":
    main()
