"""Seal tested research controls; no inference, downloads or private uploads."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-qwen8b-trial-guards-v1.json"
HASHES = {}


def read(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or digest == expected, name
    HASHES[name] = digest
    if not expected and "qa-artifacts" not in path.parts:
        archive(path, digest)
    return raw


def load(name):
    return json.loads(read(name))


def main():
    if "--check" in sys.argv:
        for name, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            read(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "native_inference_calls": 0}))
        return
    assert not OUT.exists()
    qa = "qa-artifacts/qwen8b-guards-v1/"
    resources = load(qa + "readiness.json")["resources"]
    assert not resources["download_headroom_ok"] and not resources["inference_start_headroom_ok"]
    assert resources["missing_asset_bytes"] == 5780074528
    tests = read(qa + "tests-v2.log").decode("utf-8")
    assert "Ran 20 tests" in tests and tests.rstrip().endswith("OK")
    runtime = load(qa + "runtime-verification.json")
    assert runtime["existing_runtime_verified"] and runtime["downloads"] == runtime["native_inference_calls"] == 0
    preflight = load(qa + "native-preflight-v2-result.json")
    assert preflight["exit_code"] == 1 and preflight["native_inference_calls"] == preflight["prepared_pair_attempts_consumed"] == 0
    for name, digest in preflight["input_sha256"].items():
        read(name, digest)
    assert "Keep ten GiB disk free before a guarded native trial" in read(qa + "native-preflight-v2.log").decode("utf-8")
    plan = load("qa-artifacts/qwen8b-comparison-v1/plan.json")
    assert len(plan["calls"]) == plan["native_request_limit"] == 6
    for call in plan["calls"]:
        read(call["request"], call["request_sha256"])
        assert not (ROOT / "qa-artifacts/advanced-ocr" / call["native_run"]).exists()
    names = ["setup_qwen8b_candidate.py", "vision_trial_guard.py", "benchmark_vision_cli.py", "test_qwen8b_guards.py", "qwen8b_resources.py", "setup_vision_candidate.py", "build_qwen8b_guards_report.py"]
    for name in names:
        read("receipt_training/scripts/" + name)
    for name in ("QWEN8B_TRIAL_GUARDS.md", "QWEN8B_FEASIBILITY.md", "GOAL_ACCEPTANCE_AUDIT.md", "qwen8b-candidate-manifest.json", "vision-candidate-manifest.json", "advanced-qwen8b-feasibility-v1.json", "advanced-ocr-invoice-columns-v1.json"):
        read("receipt_training/evaluation/" + name)
    for path in sorted((ROOT / qa).rglob("*")):
        if path.is_file():
            read(path.relative_to(ROOT).as_posix())
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_branch": git("branch", "--show-current", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "receipt-dataset-evaluation", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    packet = {"scope": "Tested bounded installation and owned-process RAM controls for the pending 8B development comparison. No model weights, inference or accuracy result.",
              "resources": resources, "guard_tests_passed": 20, "download_tests": "Synthetic streams; zero network requests",
              "process_tests": "Harmless owned tree stopped; separate sentinel survived; root fallback tested",
              "existing_runtime_verified": True, "real_harness_preflight": preflight,
              "prepared_native_calls": 6, "prepared_native_calls_consumed": 0, "model_downloads": 0,
              "native_inference_calls": 0, "external_receipt_uploads": 0, "paid_activation": False,
              "frontend_runtime_changed": False, "app_tests_rerun": False, "python_compile_graph_check": "pass",
              "limitations": ["Resource snapshots fail; do not treat future intent to free resources as readiness.", "RAM guards are research thresholds, not vendor requirements or a guarantee of memory/VRAM fit.", "Sampled memory can miss allocation spikes. Tree-tool timeout fallback stops the owned root, not an OS-enforced descendant job.", "No live 8B download, inference, low-memory model abort, peak memory, latency or accuracy result exists.", "Full goal remains active. No private upload or provider promotion is authorized by resource preparation."],
              "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected, "merge_push_deploy": False},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "guard_tests": 20, "native_calls": 0, "model_downloads": 0}))


if __name__ == "__main__":
    main()
