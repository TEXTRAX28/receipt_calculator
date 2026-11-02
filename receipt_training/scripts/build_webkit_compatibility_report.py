"""Bind actual browser compatibility runs, including failed/interrupted attempts."""
from datetime import datetime, timezone
from pathlib import Path
import base64
import hashlib
import json
import re
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-webkit-compatibility-v1.json"
HASHES = {}


def record(path, expected=None):
    path = (ROOT / path).resolve()
    name = path.relative_to(ROOT).as_posix()
    assert not path.name.startswith(".env"), "Never read credentials"
    actual = sha(path) if path.is_file() else None
    if expected and actual != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        actual = sha(path)
    assert actual and (not expected or actual == expected), name
    assert name not in HASHES or HASHES[name] == actual, name
    HASHES[name] = actual
    return path


def load(path):
    return json.loads(record(path).read_text(encoding="utf-8-sig"))


def tree(path):
    for file in sorted((ROOT / path).rglob("*")):
        if file.is_file():
            record(file)


def frozen_sources(plan):
    # Versions use content-addressed paths, never incompatible hashes at one alias.
    for name, expected in plan["source_sha256"].items():
        source = ROOT / name
        assert not source.name.startswith(".env")
        if source.is_file() and sha(source) == expected:
            blob = archive(source, expected)
        else:
            blob = "qa-artifacts/evidence-blobs/" + expected
        record(blob, expected)


def tests(suites):
    for suite in suites:
        for spec in suite.get("specs", []):
            for test in spec["tests"]:
                yield spec, test
        yield from tests(suite.get("suites", []))


def browser_run(tag, complete):
    assert re.fullmatch(r"[a-z0-9-]+", tag)
    base = "qa-artifacts/" + tag
    plan = load(base + "/plan.json")
    frozen_sources(plan)
    controller_path = ROOT / base / "controller.json"
    controller = load(controller_path) if controller_path.exists() else None
    result_path = ROOT / base / "results.json"
    result = load(result_path) if result_path.exists() else None
    if complete:
        assert controller and controller.get("exit_code") == 0 and "error" not in controller
        assert controller["observer_exit_code"] == 0
        assert result and not result["errors"] and result["stats"]["unexpected"] == 0
        assert not result["stats"]["flaky"] and result["stats"]["expected"] > 0
        assert controller["minimum_available_ram"] >= controller["runtime_floor_bytes"]
        assert all(sha(ROOT / n) == h for n, h in plan["source_sha256"].items())
    cases = []
    if result:
        for spec, test in tests(result["suites"]):
            cases.append({"title": spec["title"], "file": spec["file"],
                          "project": test["projectName"], "status": test["status"],
                          "expectedStatus": test["expectedStatus"],
                          "annotations": test.get("annotations", []),
                          "attempts": [{"status": r["status"], "duration_ms": r["duration"]}
                                       for r in test.get("results", [])]})
            for attempt in test.get("results", []):
                for attachment in attempt.get("attachments", []):
                    if attachment.get("name") == "QA artifact directory":
                        folder = base64.b64decode(attachment["body"]).decode()
                        resolved = (ROOT / folder).resolve()
                        resolved.relative_to(ROOT / "qa-artifacts/e2e-runs")
                        tree(resolved)
    tree(base)
    memory = "receipt_training/evaluation/runs/" + tag + "/owned-memory.json"
    observation = load(memory) if (ROOT / memory).exists() else None
    if result:
        for project in result["config"]["projects"]:
            # A few old test producers still use project-qualified root aliases.
            for file in (ROOT / "qa-artifacts").glob("*" + project["name"] + "*"):
                if file.is_file():
                    record(archive(file, sha(file)))
            for file in (ROOT / "qa-artifacts/capture-guidance").glob("*" + project["name"] + "*"):
                if file.is_file():
                    record(archive(file, sha(file)))
    return {"tag": tag, "required_success": complete, "finished_report": bool(result), "controller": controller,
            "stats": result["stats"] if result else None, "cases": cases,
            "memory": observation,
            "scope": plan.get("scope"), "capability_scope": plan.get("capability_scope")}


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, expected)
        print(json.dumps({"verified_files": len(HASHES)}))
        return
    assert len(sys.argv) == 3 and not OUT.exists(), "Supply final WebKit and Chromium run tags; preserve old packets"
    webkit, chromium = sys.argv[1:]
    prior = [browser_run(path.name, False) for path in sorted((ROOT / "qa-artifacts").glob("webkit-screen-v*"))
             if path.is_dir() and path.name != webkit]
    current = [browser_run(webkit, True), browser_run(chromium, True)]
    log = record("qa-artifacts/webkit-fixes-v2/unit.log").read_text(encoding="utf-8-sig")
    assert re.search(r"Tests\s+944 passed", log)
    assert "built in" in record("qa-artifacts/webkit-fixes-v2/build.log").read_text(encoding="utf-8-sig")
    assert "All matched files" in record("qa-artifacts/webkit-fixes-v2/format-final.log").read_text(encoding="utf-8-sig")
    cleanup = load("qa-artifacts/webkit-fixes-v2/survivor-check.json")
    assert not cleanup["survivors"] and not cleanup["errors"] and cleanup["terminated_processes"] == 0
    browser_cleanup = load("qa-artifacts/webkit-fixes-v2/browser-process-exit-check.json")
    assert browser_cleanup["automatedChromeCount"] == 0 and browser_cleanup["playwrightWebkitCount"] == 0
    resources = load("qa-artifacts/webkit-fixes-v2/resources-after-browser-checks.json")
    tree("qa-artifacts/webkit-fixes-v1")
    tree("qa-artifacts/webkit-fixes-v2")
    capabilities = load("qa-artifacts/webkit-screen-v3/capabilities.json")
    assert capabilities["browserType"] == "webkit"
    assert all(capabilities["capabilities"][name] == "undefined" for name in
               ("mediaDevices", "mediaStream", "canvasCapture", "offscreenCanvas"))
    refresh = load("qa-artifacts/webkit-fixes-v2/medium-plan-refresh.json")
    assert refresh["all_frozen_inputs_match"] and refresh["models_images_parameters_limits_and_scoring_unchanged"]
    study_folder = "qa-artifacts/browser-paddle-medium-paired-plan-v4"
    study = load(study_folder + "/study-plan.json")
    for name, expected in study["input_sha256"].items():
        source = record(name, expected)
        if not any(part in source.parts for part in ("qa-artifacts", ".cache", "runs")):
            archive(source, expected)
    tree(study_folder)
    refused = []
    for version in (3, 4):
        refused_folder = f"qa-artifacts/browser-paddle-paired-tiny-v{version}-control"
        attempt = load(refused_folder + "/controller.json")
        assert not attempt["spawned"] and attempt["error"] == "insufficient-available-ram-before-start"
        refused.append(attempt)
        tree(refused_folder)
    for name in ("receipt_training/scripts/build_webkit_compatibility_report.py",
                 "receipt_training/evaluation/WEBKIT_COMPATIBILITY.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        file = record(name)
        archive(file, sha(file))
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    assert git("branch", "--show-current").decode().strip() == "feature/advanced-ocr-vision-ai"
    report = {"created_at": datetime.now(timezone.utc).isoformat(), "prior_attempts": prior,
              "completed_runs": current, "capabilities": capabilities, "unit_tests": 944,
              "owned_process_cleanup": cleanup,
              "browser_process_cleanup": browser_cleanup,
              "memory_measurement_limit": "Both final owned-process observers reached their 128-process cap; their sampled peaks are incomplete lower bounds, not complete peaks. The independent system-wide available-memory guard remained active.",
              "prepared_larger_model": {"study": study_folder, "prior_refused_starts": refused, "refresh": refresh, "post_test_resources": resources},
              "genuine_receipt_accuracy_claim": False, "new_original_receipt_inferences": 0,
              "private_receipt_uploads": 0, "provider_promoted": False,
              "scope": "Windows-hosted compatibility, source-dialog focus, early enhanced-reader and perspective-correction fallback, and existing synthetic OCR/PDF/splitting flows. Unsupported engine capabilities remain explicit skips; this does not establish physical Safari/camera support or new genuine receipt accuracy.",
              "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8") as file:
        json.dump(report, file, indent=2)
    print(json.dumps({"evidence_files": len(HASHES), "completed": [r["stats"] for r in current]}))


if __name__ == "__main__":
    main()
