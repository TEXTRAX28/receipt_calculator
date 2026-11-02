"""Seal tested app integration, actual private draft, and honest failure history."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-browser-paddle-integration-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest is not None and (not expected or digest == expected), name
    HASHES[name] = digest
    if not expected and not any(part in path.parts for part in ("qa-artifacts", ".cache", "runs")):
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def tree(folder):
    for path in sorted((ROOT / folder).rglob("*")):
        if path.is_file() and "vite-cache" not in path.parts:
            record(path.relative_to(ROOT).as_posix())


def main():
    if "--check" in sys.argv:
        for name, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_calls": 0}))
        return
    assert not OUT.exists()
    logs = {key: record("qa-artifacts/" + name).read_text(encoding="utf-8") for key, name in {
        "unit": "browser-paddle-integration-unit-v2.log", "browser": "browser-paddle-integration-browser-full-v2.log",
        "format": "browser-paddle-integration-format-v1.log", "build": "browser-paddle-integration-build-v3.log"}.items()}
    assert "900 passed" in logs["unit"] and "195 passed" in logs["browser"] and "1 skipped" in logs["browser"]
    assert "All matched files" in logs["format"] and "built in" in logs["build"]
    private = load("qa-artifacts/browser-paddle-app-uk-v1/result.json")
    score = load("qa-artifacts/browser-paddle-app-uk-v1/scores.json")["score"]
    controller = load("qa-artifacts/browser-paddle-app-uk-v1-control/controller.json")
    memory = load("receipt_training/evaluation/runs/browser-paddle-app-uk-v1/owned-memory.json")
    assert private["noFinancialEdits"] and private["noChecksConfirmed"]
    assert private["external"] == private["writes"] == private["errors"] == []
    assert score["counts"]["item_price_correct"] == 18 and score["counts"]["complete_receipt_correct"] == 0
    assert score["scanner_discrepancy_minor"] == "1138"
    assert controller["exit_code"] == 0 and not controller.get("error")
    assert controller["minimum_available_ram"] >= controller["runtime_ram_floor"]
    for name, digest in controller["source_sha256"].items():
        snapshot = ("qa-artifacts/browser-paddle-app-uk-v1-control/" + Path(name).name
                    if name.startswith("receipt_training/scripts/") else "qa-artifacts/browser-paddle-app-uk-v1-control/source/" + name)
        record(snapshot, digest)
    for name, digest in private["input_sha256"].items():
        record(name, digest)
    adapter = load("qa-artifacts/browser-paddle-js-adapter-v1/result.json")
    assert len(adapter["comparisons"]) == 56 and all(c["identical"] for c in adapter["comparisons"])
    for name, digest in adapter["input_sha256"].items():
        record(name, digest)
    for folder in ("browser-paddle-app-failure-v1", "browser-paddle-app-test-selector-v2", "browser-paddle-existing-test-race-v1"):
        for entry in load("qa-artifacts/" + folder + "/evidence.json")["files"].values():
            record(entry["archive"], entry["sha256"])
    record("qa-artifacts/browser-paddle-integration-preliminary-v1.json")
    dev = load("qa-artifacts/browser-paddle-dev-smoke-v1/result.json")
    assert dev["actualModel"] and dev["external"] == dev["writes"] == dev["errors"] == []
    synthetic = []
    for path in sorted((ROOT / "qa-artifacts/e2e-runs").glob("*/enhanced-worker.json")):
        result = load(path.relative_to(ROOT).as_posix())
        assert result["noFinancialEdits"] and result["exactSplit"] == ["3.00", "3.00"]
        assert result["closed"] == 1 and result["external"] == result["writes"] == result["errors"] == []
        synthetic.append({"artifact": path.relative_to(ROOT).as_posix(), **result})
        tree(path.parent.relative_to(ROOT).as_posix())
    assert len(synthetic) >= 4
    for folder in ("browser-paddle-tiny-production-v1", "browser-paddle-tiny-production-v1-control", "browser-paddle-app-failure-v1", "browser-paddle-app-test-selector-v2", "browser-paddle-existing-test-race-v1", "browser-paddle-app-uk-v1", "browser-paddle-app-uk-v1-control", "browser-paddle-js-adapter-v1", "browser-paddle-dev-smoke-v1"):
        tree("qa-artifacts/" + folder)
    tree("receipt_training/evaluation/runs/browser-paddle-app-uk-v1")
    tree("receipt_training/evaluation/runs/browser-paddle-tiny-production-v1")
    # Bind current compiled artifacts and locally served assets before future builds.
    tree("dist")
    tree("public/ocr-enhanced")
    for path in sorted((ROOT / "src").rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())
    for name in (".gitignore", "README.md", "package.json", "package-lock.json", "playwright.config.ts", "vite.config.ts", "scripts/enhanced-ocr-assets.json", "scripts/prepare-enhanced-ocr.mjs", "tests/paddle-browser.test.ts", "tests/paddle-layout.test.ts", "tests/paddle-worker.test.ts", "tests/e2e/enhanced-reader.spec.ts", "tests/e2e/enhanced-reader-real.spec.ts", "tests/e2e/veryfi-reader.spec.ts", "tests/fixtures/paddle-synthetic.json", "tests/fixtures/paddle-synthetic.png", "receipt_training/scripts/guard_browser_paddle_probe.py", "receipt_training/scripts/probe_browser_paddle.mjs", "receipt_training/scripts/verify_browser_paddle_adapter.mjs", "receipt_training/scripts/score_enhanced_app.py", "receipt_training/scripts/build_browser_paddle_integration_report.py", "receipt_training/evaluation/BROWSER_PADDLE_INTEGRATION.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/advanced-browser-paddle-v1.json"):
        record(name)
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(), "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(), "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    packet = {"scope": "Optional enhanced on-device provider implemented and tested; basic and computer/cloud readers preserved. No default, complete-goal or public-deployment claim.",
              "checks": {"unit_passes": 900, "browser_passes": 195, "existing_browser_skips": 1, "separate_real_app_cases": 1, "separate_dev_smoke_cases": 1, "retained_geometry_panels_identical": 56},
              "private_actual_app": {"counts": score["counts"], "discrepancy_minor": score["scanner_discrepancy_minor"], "observed_scan_to_review_ms": private["elapsed_ms"], "financial_edits": 0, "checks_confirmed": 0},
              "resources": {"controller": controller, "owned_tree_observation": memory},
              "synthetic_ui_runs": synthetic,
              "privacy": {"private_external_uploads": 0, "paid_activation": False, "new_api_credentials": False, "model_weights_local": True, "setup_public_model_file_fetches": 4, "setup_public_bytes": 6299683, "live_env_files_read_by_report": False},
              "api_cost_usd": "0", "compute_cost_usd": None,
              "limits": ["Original fifty raw SDK benchmark retained; exact adapter equivalence proved, not fifty complete production UI reruns.", "Known-currency benchmark103/143 prices; automatic19/143, quantities11/120. Full financial truth incomplete; complete original-fifty accuracy unscorable.", "UK all eighteen annotated financial rows recovered, but two duplicate purchases remain and strict accuracy0/1.", "Phone emulation is Chromium, not physical handset/Safari evidence. Large optional reader/runtime download and memory remain material.", "CSP unchanged; browser-only DOM image conversion was replaced with worker-native matrix input. Failure/selector/race artifacts retained.", "More accurate computer-assisted hybrid remains available; public auth, durable quotas/retention/privacy and deployment notices are separate work. 8B gates unchanged and trial unstarted."],
              "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "unit_passes": 900, "browser_passes": 195, "private_uploads": 0}))


if __name__ == "__main__":
    main()
