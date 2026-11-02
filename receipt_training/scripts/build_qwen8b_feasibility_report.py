"""Seal public model pins, measured headroom and unexecuted paired requests."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
OUT = ROOT / "receipt_training/evaluation/advanced-qwen8b-feasibility-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env")
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (QA / "evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if not expected and "qa-artifacts" not in path.parts:
        archive(path, digest)
    return raw


def load(name):
    return json.loads(read(ROOT / name))


def main():
    if "--check" in sys.argv:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in value["evidence_sha256"].items():
            read(ROOT / name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_inference_calls": 0}))
        return
    assert not OUT.exists(), "Preserve the previous report"
    manifest = load("receipt_training/evaluation/qwen8b-candidate-manifest.json")
    public = load("qa-artifacts/qwen8b-feasibility-v1/public-model-metadata.json")
    selected = load("qa-artifacts/qwen8b-feasibility-v1/selected-files.json")
    assert manifest["revision"] == public["sha"] == selected["revision"]
    assert manifest["license"] == public["cardData"]["license"] == "apache-2.0"
    for asset, source in zip(manifest["files"][:2], selected["files"], strict=True):
        native = next(item for item in public["siblings"] if item["rfilename"] == asset["path"])
        assert source == native and asset["bytes"] == native["size"] and asset["sha256"] == native["lfs"]["sha256"]
        assert asset["url"] == f"https://huggingface.co/{manifest['model']}/resolve/{manifest['revision']}/{asset['path']}"
    resources = load("qa-artifacts/qwen8b-feasibility-v1/resources.json")
    assert resources["manifest_sha256"] == HASHES["receipt_training/evaluation/qwen8b-candidate-manifest.json"]
    assert resources["missing_asset_bytes"] == sum(asset["bytes"] for asset in manifest["files"][:2]) == 5780074528
    assert not resources["download_headroom_ok"] and not resources["inference_start_headroom_ok"]
    plan = load("qa-artifacts/qwen8b-comparison-v1/plan.json")
    assert len(plan["cases"]) == 3 and len(plan["calls"]) == plan["native_request_limit"] == 6
    assert plan["native_calls_executed"] == plan["external_receipt_uploads"] == 0
    assert not plan["label_files_read"] and not plan["input_ocr_text"]
    for name, digest in plan["input_sha256"].items():
        read(ROOT / name, digest)
    for case in plan["cases"]:
        assert case["split"] == "development"
        requests = []
        for model in ("4b", "8b"):
            item = case["requests"][model]
            request = json.loads(read(ROOT / item["path"], item["sha256"]))
            request.pop("model_manifest")
            requests.append(request)
        assert requests[0] == requests[1]
        assert requests[0]["gpu_layers"] == 20 and requests[0]["projector_gpu"] is False
    for folder in ("qwen8b-comparison-v1", "qwen8b-feasibility-v1"):
        for path in sorted((QA / folder).rglob("*")):
            if path.is_file():
                read(path)
    for name in ("receipt_training/scripts/qwen8b_resources.py", "receipt_training/scripts/prepare_qwen8b_comparison.py", "receipt_training/scripts/build_qwen8b_feasibility_report.py", "receipt_training/scripts/setup_vision_candidate.py", "receipt_training/evaluation/QWEN8B_FEASIBILITY.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md"):
        read(ROOT / name)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original = r"C:\Users\natan\VSC Code\costco_calc"
    original_head = git("-C", original, "rev-parse", "HEAD").decode().strip()
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    assert original_head == "29a187af7347be94c0728f4785be674500833748"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    value = {
        "scope": "Public 8B model feasibility and frozen paired development protocol. Preparation, not a native benchmark or app improvement.",
        "model": {"name": manifest["model"], "revision": manifest["revision"], "license": manifest["license"], "new_asset_bytes": resources["missing_asset_bytes"]},
        "resource_observation": resources,
        "prepared_pairs": 3,
        "prepared_requests": 6,
        "native_inference_calls": 0,
        "model_weight_downloads": 0,
        "private_uploads": 0,
        "public_metadata_fetches": 1,
        "web_research": "Official Qwen model card and llama.cpp multimodal documentation; no receipt content sent",
        "accuracy_latency_results": None,
        "app_provider_changed": False,
        "existing_installer_cap_changed": False,
        "disposition": "Await resource configuration. Current disk/RAM checks fail. Verify a bounded installation path and runtime low-memory abort before executing the fixed six-call comparison. No larger-model superiority claim.",
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "stable": stable, "original_head": original_head, "original_diff_sha256": original_diff, "merge_push_deploy": False},
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "prepared_requests": 6, "native_calls": 0, "private_uploads": 0, "resource_gates_passed": False}))


if __name__ == "__main__":
    main()
