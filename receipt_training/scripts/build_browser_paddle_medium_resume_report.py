"""Seal a refreshed frozen study and its refused start, without model inference."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

import build_browser_paddle_medium_readiness_report as evidence

ROOT = evidence.ROOT
OUT = ROOT / "receipt_training/evaluation/advanced-browser-paddle-medium-resume-v2.json"
PARENT = "a4071332ccd6897644d084fc70efffda0d038a6f"


def main():
    if "--check" in sys.argv:
        evidence.OUT = OUT
        evidence.main()
        return
    assert not OUT.exists()
    record, load, tree = evidence.record, evidence.load, evidence.tree
    old = load("qa-artifacts/browser-paddle-medium-paired-plan-v1/study-plan.json")
    base = "qa-artifacts/browser-paddle-medium-paired-plan-v2"
    plan = load(base + "/study-plan.json")
    assert plan["parent_commit"] == PARENT and plan["recorded_before_new_ocr"]
    for key in ("models", "cases", "limits", "parameters", "scope", "scoring", "timing"):
        assert old[key] == plan[key], key
    for name, digest in plan["input_sha256"].items():
        assert evidence.sha(ROOT / name) == digest, "Frozen input changed: " + name
        record(name, digest)
    for name, digest in plan["source_sha256"].items():
        record(base + "/source/" + name, digest)
    tree(base)
    control_base = "qa-artifacts/browser-paddle-paired-tiny-v2-control"
    control = load(control_base + "/controller.json")
    assert not control["spawned"] and control["error"] == "insufficient-available-ram-before-start"
    assert control["startup_available_ram"] < control["startup_required_ram"] == plan["limits"]["startup_ram_bytes"]
    assert control["runtime_ram_floor"] == plan["limits"]["runtime_ram_floor_bytes"]
    assert control["private_receipt_uploads"] == control["model_downloads"] == 0
    for name, digest in control["source_sha256"].items():
        assert plan["source_sha256"][name] == digest
        record(control_base + "/" + Path(name).name, digest)
    tree(control_base)
    checks_base = "qa-artifacts/browser-paddle-medium-resume-v2"
    checks = load(checks_base + "/validation.json")
    assert len(checks["commands"]) == 6 and all(c["exit_code"] == 0 for c in checks["commands"])
    for command in checks["commands"]:
        record(command["log"], command["sha256"])
    assert "Ran 3 tests" in record(checks_base + "/validation-0.log").read_text()
    preflight = load(checks_base + "/preflight.json")
    assert preflight["all_frozen_inputs_match"] and preflight["models_images_parameters_limits_and_scoring_unchanged"]
    tree(checks_base)
    for name in ("receipt_training/scripts/build_browser_paddle_medium_resume_report.py",
                 "receipt_training/scripts/build_browser_paddle_medium_readiness_report.py",
                 "receipt_training/scripts/test_browser_paddle_study_plan.py",
                 "receipt_training/evaluation/BROWSER_PADDLE_MEDIUM_READINESS.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "receipt_training/evaluation/advanced-browser-paddle-medium-readiness-v1.json",
                 "qa-artifacts/financial-fragments-postcommit-v1.json"):
        record(name)
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    assert git("rev-parse", "HEAD").decode().strip() == PARENT
    assert git("branch", "--show-current").decode().strip() == "feature/advanced-ocr-vision-ai"
    unchanged = git("ls-files", "src", "server", "tests", "scripts", "package.json", "package-lock.json",
                    "vite.config.ts", "playwright.config.ts", "tsconfig.json", "index.html").decode().splitlines()
    for name in unchanged:
        assert hashlib.sha256(git("show", PARENT + ":" + name)).hexdigest() == evidence.sha(ROOT / name), name
        record(name)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    result = {"status": "refreshed-plan-not-run-resource-guard", "plan": plan, "actual_start": control,
              "protocol_tests": 3, "validation": checks, "preflight": preflight,
              "new_model_calls": 0, "model_downloads": 0, "private_receipt_uploads": 0,
              "api_cost_usd": "0", "provider_promoted": False,
              "scope": "Versioned plan and stale-input rejection, preserving all model/image/parameter/reference/guard choices. No new OCR, accuracy, latency, or model-only memory result. Both image arms, paired replay and financial scoring remain unexecuted.",
              "unchanged_application_files": unchanged, "git": {"parent_commit": PARENT, **protected, "merge_push_deploy": False},
              "evidence_sha256": evidence.HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(evidence.HASHES), "unchanged_application_files": len(unchanged), "new_model_calls": 0}))


if __name__ == "__main__":
    main()
