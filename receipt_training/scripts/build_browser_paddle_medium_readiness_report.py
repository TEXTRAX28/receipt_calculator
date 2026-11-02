"""Seal preparation and an actual refused start without inventing model results."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-browser-paddle-medium-readiness-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest and (expected is None or expected == digest), name
    assert name not in HASHES or HASHES[name] == digest, name
    HASHES[name] = digest
    if not any(p in path.parts for p in ("qa-artifacts", ".cache", "runs")):
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def tree(name):
    for path in sorted((ROOT / name).rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_calls": 0}))
        return
    assert not OUT.exists()
    plan_base = "qa-artifacts/browser-paddle-medium-paired-plan-v1"
    plan = load(plan_base + "/study-plan.json")
    assert plan["recorded_before_new_ocr"] and len(plan["cases"]) == 7
    assert sum(len(c["frames"]) for c in plan["cases"]) == 8
    assert sum(c["group"] == "genuine-whole" for c in plan["cases"]) == 4
    for name, digest in plan["input_sha256"].items():
        record(name, digest)
    for name, digest in plan["source_sha256"].items():
        assert sha(ROOT / name) == digest, "Prepared source changed: " + name
        record(plan_base + "/source/" + name, digest)
    control = load("qa-artifacts/browser-paddle-paired-tiny-v1-control/controller.json")
    assert control["medium_study"] and control["capture_study"]
    assert not control["spawned"] and control["error"] == "insufficient-available-ram-before-start"
    assert control["startup_available_ram"] < control["startup_required_ram"] == plan["limits"]["startup_ram_bytes"]
    assert control["runtime_ram_floor"] == plan["limits"]["runtime_ram_floor_bytes"]
    assert control["model_downloads"] == control["private_receipt_uploads"] == 0
    for name, digest in control["source_sha256"].items():
        assert plan["source_sha256"][name] == digest
        record("qa-artifacts/browser-paddle-paired-tiny-v1-control/" + Path(name).name, digest)
    proof = load("qa-artifacts/browser-paddle-medium-preparation-check-v1.json")
    assert proof["tiny_unchanged_panels"] == 5 and proof["actual_saved_medium_synthetic_lines"] == 6
    assert proof["new_model_calls"] == proof["private_receipt_uploads"] == 0
    prior = load("qa-artifacts/browser-paddle-tiny-capture-adapted-v1/adapted.json")
    current = load("qa-artifacts/browser-paddle-medium-adapter-check-v1/adapted.json")
    assert prior["cases"] == current["cases"]
    medium = load("qa-artifacts/browser-paddle-medium-synthetic-adapter-check-v1/adapted.json")
    assert medium["cases"][0]["recognition"]["engine"] == "paddle-ppocrv6-medium-browser-wasm"
    assert [line["text"] for line in medium["cases"][0]["recognition"]["panels"][0]["lines"]] == [
        "BROWSER TEST MARKET", "Currency GBP", "Soup 2x 1.25 2.50", "Rice 1x 3.50 3.50", "TOTAL GBP 6.00", "PRICES INCLUDE TAX"]
    for data in (current, medium):
        for name, expected in data["input_sha256"].items():
            record(name, expected)
    synthetic = load("qa-artifacts/browser-paddle-medium-v1/result.json")
    assert not synthetic.get("error") and not synthetic["requests"]["external"] and not synthetic["requests"]["writes"]
    assert medium["cases"][0]["image_sha256"] == synthetic["synthetic_sha256"]
    prior_memory = load("receipt_training/evaluation/runs/browser-paddle-medium-v1/owned-memory.json")
    assert prior_memory["peak_sampled_process_tree_working_set_bytes"] + control["runtime_ram_floor"] == control["startup_required_ram"]
    for name in (plan_base, "qa-artifacts/browser-paddle-paired-tiny-v1-control", "qa-artifacts/browser-paddle-medium-adapter-check-v1",
                 "qa-artifacts/browser-paddle-medium-synthetic-adapter-input-v1", "qa-artifacts/browser-paddle-medium-synthetic-adapter-check-v1"):
        tree(name)
    for name in ("receipt_training/scripts/build_browser_paddle_medium_readiness_report.py",
                 "receipt_training/evaluation/BROWSER_PADDLE_MEDIUM_READINESS.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "qa-artifacts/browser-paddle-medium-preparation-validation-v1.json"):
        record(name)
    checks = load("qa-artifacts/browser-paddle-medium-preparation-validation-v1.json")
    assert all(c["exit_code"] == 0 for c in checks["commands"])
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    parent = git("rev-parse", "HEAD").decode().strip()
    assert parent == plan["parent_commit"] == "8b0a9ed19d258d955503559e3339fd560bdb382d"
    unchanged = git("ls-files", "src", "server", "tests", "package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts").decode().splitlines()
    for name in unchanged:
        assert hashlib.sha256(git("show", parent + ":" + name)).hexdigest() == sha(ROOT / name), name
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    result = {"status": "prepared-not-run-resource-guard", "plan": plan,
              "actual_guarded_start": control, "actual_offline_checks": proof,
              "unexecuted_paths": ["new tiny study inference", "new medium receipt inference", "paired parser replay", "paired financial scorer"],
              "new_model_calls": 0, "private_receipt_uploads": 0, "model_downloads": 0,
              "api_cost_usd": "0", "paid_activation": False, "provider_promoted": False,
              "scope": "Prepared fixed comparison and actual refused preflight. No new receipt accuracy, latency, model-only memory or phone result. Cached medium synthetic output verifies adapter support only. Original fifty and app behavior unchanged.",
              "unchanged_application_files": unchanged, "git": {"parent_commit": parent, **protected, "merge_push_deploy": False},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "unchanged_application_files": len(unchanged), "new_model_calls": 0, "status": result["status"]}))


if __name__ == "__main__":
    main()
