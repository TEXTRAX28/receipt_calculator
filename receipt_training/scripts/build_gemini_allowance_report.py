"""Seal the no-cloud Gemini allowance implementation and focused browser result."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
BASE = "qa-artifacts/gemini-allowance-v1"
BUILD = "qa-artifacts/gemini-allowance-build-v1"
BROWSER = "qa-artifacts/gemini-allowance-browser-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-gemini-request-allowance-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    assert not path.name.startswith(".env") or path.name == ".env.example", name
    if expected and (not path.is_file() or sha(path) != expected):
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        assert path.is_file() and sha(path) == expected, name
    assert path.is_file(), name
    HASHES[name] = sha(path)
    return path


def load(name, expected=None):
    return json.loads(record(name, expected).read_text(encoding="utf-8"))


def walk(name):
    for path in sorted((ROOT / name).rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())


def main():
    if "--check" in sys.argv:
        packet = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in packet["evidence_sha256"].items():
            record(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_provider_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the sealed packet"
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    parent = git("rev-parse", "HEAD").decode().strip()
    plan = load(BASE + "/plan.json")
    assert parent == plan["parent_commit"] and parent.startswith("b3986ec")
    assert plan["recorded_before_change"] and plan["private_uploads"] == 0
    for name, digest in plan["source_sha256"].items():
        record(BASE + "/before/" + name, digest)
    finding = load(BASE + "/storage-finding.json")
    record(BASE + "/before/server/document-allowance.mjs", finding["before_sha256"])
    failed = load(BASE + "/focused-tests-v1.json", finding["failed_test_sha256"])
    assert failed["numPassedTests"] == 72 and failed["numFailedTests"] == 1
    unit = load(BASE + "/all-tests-v1.json")
    focused = load(BASE + "/focused-tests-v2.json")
    for result, count in [(unit, 1053), (focused, 124)]:
        assert result["success"] and result["numFailedTests"] == result["numPendingTests"] == 0
        assert result["numPassedTests"] == result["numTotalTests"] == count

    proof = load(BUILD + "/proof.json")
    assert proof["exit_code"] == 0 and proof["source_unchanged"]
    for name, digest in {**proof["source_sha256"], **proof["build_sha256"]}.items():
        assert sha(ROOT / name) == digest, name
        record(name, digest)
    record(BUILD + "/output.log", proof["log_sha256"])
    before_gemini = record(BASE + "/before/src/lib/gemini.ts").read_text(encoding="utf-8")
    current_gemini = record("src/lib/gemini.ts").read_text(encoding="utf-8")
    assert before_gemini.split("const configSchema")[0] == current_gemini.split("const configSchema")[0]
    def extraction(text):
        return text.split("export async function extractWithGemini(", 1)[1].split("/** Local-only adapter.", 1)[0]
    assert extraction(record(BASE + "/before/server/receipt-api.mjs").read_text(encoding="utf-8")) == extraction(record("server/receipt-api.mjs").read_text(encoding="utf-8"))

    browser_plan, controller = load(BROWSER + "/plan.json"), load(BROWSER + "/controller.json")
    assert controller["spawned"] and controller["exit_code"] == controller["observer_exit_code"] == 0
    assert "error" not in controller and controller["private_uploads"] == 0
    assert controller["initial_available_ram"] >= browser_plan["startup_floor_bytes"] == 2684354560
    assert controller["minimum_available_ram"] >= browser_plan["runtime_floor_bytes"] == 1073741824
    assert browser_plan["source_sha256"] == proof["source_sha256"]
    assert browser_plan["build_sha256"] == proof["build_sha256"]
    for name, digest in browser_plan["runner_sha256"].items():
        record(name, digest)
    browser = load(BROWSER + "/results.json")
    assert browser["stats"]["expected"] == browser_plan["expected_tests"] == 27
    assert all(browser["stats"][k] == 0 for k in ["unexpected", "flaky", "skipped"])
    tests = []
    def visit(suite):
        for spec in suite.get("specs", []):
            tests.extend(spec["tests"])
        for child in suite.get("suites", []):
            visit(child)
    for suite in browser["suites"]:
        visit(suite)
    assert len(tests) == 27
    screenshots = []
    for test in tests:
        assert len(test["results"]) == 1
        result = test["results"][0]
        assert result["status"] == "passed" and result["retry"] == 0
        for attachment in result.get("attachments", []):
            if attachment["name"] == "QA artifact directory":
                import base64
                folder = base64.b64decode(attachment["body"]).decode().replace("\\", "/")
                assert folder.startswith("qa-artifacts/e2e-runs/")
                walk(folder)
                screenshots.extend(p.relative_to(ROOT).as_posix() for p in (ROOT / folder).glob("*.png"))
    assert len(screenshots) >= 9
    memory = load("receipt_training/evaluation/runs/gemini-allowance-browser-v1/owned-memory.json")
    exited = load(BASE + "/process-exit-check.json")
    assert not exited["still_live_same_identity"] and not exited["inspection_errors"]
    assert "process observation limit reached" in memory["errors"]
    for name in ["qa-artifacts/azure-quantity-browser-v1/controller.json", "qa-artifacts/azure-quantity-browser-v2/controller.json"]:
        stopped = load(name)
        assert not stopped["spawned"] and stopped["error"] == "insufficient-available-ram-before-start"

    refresh = load(BASE + "/model-plan-refresh.json")
    assert refresh["models_images_parameters_limits_scoring_timing_unchanged"]
    assert refresh["changed_inputs"] == ["src/lib/gemini.ts"]
    for name, digest in refresh["evidence_sha256"].items():
        record(name, digest)
    new_plan = load(refresh["to"])
    for name, digest in new_plan["input_sha256"].items():
        record(name, digest)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    invariants = {
        "stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
        "original_head": git("rev-parse", "HEAD", cwd=original).decode().strip(),
        "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest(),
        "branch": git("branch", "--show-current").decode().strip(),
    }
    assert invariants == {"stable": "ee725ba45e799bee8501d3de034e0302c0127afd", "original_head": "29a187af7347be94c0728f4785be674500833748", "original_diff_sha256": "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b", "branch": "feature/advanced-ocr-vision-ai"}
    for folder in [BASE, BUILD, BROWSER]:
        walk(folder)
    for name in ["README.md", ".env.example", "docs/IMPLEMENTATION_AND_SECURITY.md",
                 "receipt_training/evaluation/GEMINI_REQUEST_ALLOWANCE.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "receipt_training/evaluation/ADVANCED_OCR_REPORT.md",
                 "receipt_training/evaluation/GEMINI35_UK_MULTIPART_PLAN.md",
                 "receipt_training/scripts/build_gemini_allowance_report.py"]:
        record(name)
    packet = {"parent_commit": parent, "scope": "Persistent Gemini application request allowance; synthetic provider tests only.",
              "unit_passes": 1053, "focused_passes": 124, "browser_passes": 27,
              "initial_failed_storage_test_retained": True, "initial_browser_refusals_retained": True,
              "same_financial_conversion_and_provider_payload": True, "new_accuracy_measurement": False,
              "browser_memory_evidence_incomplete": True, "browser_stats": browser["stats"],
              "controller": controller, "process_exit_check": exited, "protected_git": invariants,
              "new_live_provider_requests": 0, "private_uploads": 0, "live_settings_changed": False,
              "limits": ["Local shared-directory/grant cap, not account-wide billing or public authentication.",
                         "Physical phones and real provider extraction are outside these synthetic tests.",
                         "Frozen Gemini multipart v2 is stale, unapproved and unrun; fresh preparation/approval required.",
                         "Full goal remains active; no merge, push, deployment or paid activation."],
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "unit_passes": 1053, "browser_passes": 27, "live_requests": 0}))


if __name__ == "__main__":
    main()
