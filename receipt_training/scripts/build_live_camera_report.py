"""Bind real camera-workflow tests, synthetic scope and incomplete memory evidence."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-live-camera-v1.json"
PARENT = "111045f17d31fff49f69cfe6ea558d64997bc72c"
HASHES = {}
RUNS = ["live-camera-targeted-v1", "live-camera-targeted-v2", "live-camera-layout-v3",
        "live-camera-targeted-v4", "live-camera-full-v1"]


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    assert not path.name.startswith(".env"), name
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest and (expected is None or digest == expected), name
    assert name not in HASHES or HASHES[name] == digest, name
    HASHES[name] = digest
    if not any(p in path.parts for p in ("qa-artifacts", "runs")):
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
        print(json.dumps({"verified_files": len(HASHES), "new_ocr_calls": 0}))
        return
    assert not OUT.exists()
    controllers, memories = {}, {}
    for name in RUNS:
        base = "qa-artifacts/" + name
        data = controllers[name] = load(base + "/controller.json")
        assert data["spawned"] and not data["private_camera_access"] and data["private_receipt_uploads"] == 0
        for source, expected in data["source_sha256"].items():
            record(base + "/source/" + source, expected)
        tree(base)
        memory = "receipt_training/evaluation/runs/" + name
        if (ROOT / memory / "owned-memory.json").exists():
            memories[name] = load(memory + "/owned-memory.json")
            tree(memory)
    for name in RUNS[:2]:
        assert controllers[name]["exit_code"] == 1
        log = record("qa-artifacts/" + name + "/stdout.log").read_text(encoding="utf-8")
        assert "18 passed" in log and "2 failed" in log
    for name, passed, skipped in [(RUNS[2], 2, 0), (RUNS[3], 22, 0), (RUNS[4], 219, 1)]:
        control = controllers[name]
        assert control["exit_code"] == control["observer_exit_code"] == 0
        assert not control.get("error") and not control.get("observer_error")
        assert control["minimum_available_ram"] >= control["runtime_ram_floor"]
        log = record("qa-artifacts/" + name + "/stdout.log").read_text(encoding="utf-8")
        assert re.search(rf"\b{passed} passed\b", log)
        if skipped:
            assert "1 skipped" in log
    assert not memories[RUNS[2]]["errors"]
    assert memories[RUNS[3]]["errors"] == ["an observed child process could not be sampled"]
    assert memories[RUNS[4]]["errors"] == ["process observation limit reached"]
    ownership_base = "receipt_training/evaluation/runs/live-camera-observer-ownership-v1"
    ownership = load(ownership_base + "/result.json")
    for key in ("controlled_stale_link_excluded", "actual_owned_child_sampled",
                "unrelated_test_process_still_running_after_observation", "observer_finished_after_owned_tree_exit"):
        assert ownership[key] is True
    assert not ownership["observation"]["errors"] and ownership["network_requests"] == 0
    tree(ownership_base)

    # Every attempt has an exclusive folder; retain failed attempts as well.
    artifact_dirs = sorted({p.parent for p in (ROOT / "qa-artifacts/e2e-runs").glob("*/camera-*.png")})
    ocr_results = []
    for folder in artifact_dirs:
        tree(folder.relative_to(ROOT).as_posix())
        for path in folder.glob("camera-*.json"):
            data = json.loads(path.read_text(encoding="utf-8"))
            assert not data["external"] and not data["writes"] and not data["errors"]
            if path.name == "camera-real-ocr.json":
                receipt = data["receipt"]
                vector = [[item[k] for k in ("description", "quantity", "unitPrice", "lineTotal")] for item in receipt["items"]]
                assert vector == [["Soup", "2", "1.25", "2.50"], ["Rice", "1", "3.50", "3.50"]]
                assert receipt["currency"] == "GBP" and receipt["printedTotal"] == "6.00"
                assert data["financialEdits"] == 0 and data["state"]["step"] == "summary"
                assert [p["name"] for p in data["state"]["people"]] == ["Ari", "Bo"]
                assert data["state"]["wholeAssignment"]["mode"] == "equal"
                ocr_results.append(path.relative_to(ROOT).as_posix())
    assert len(ocr_results) == 8

    validation = load("qa-artifacts/live-camera-validation-v2.json")
    assert len(validation["commands"]) == 5 and all(c["exit_code"] == 0 for c in validation["commands"])
    for command in validation["commands"]:
        record(command["log"], command["sha256"])
    formatting = load("qa-artifacts/live-camera-validation-v2-0.log")
    assert formatting["exact_formatter_only_change"]
    final = controllers[RUNS[4]]["source_sha256"]
    assert formatting["measured_sha256"] == final["tests/e2e/camera.spec.ts"]
    assert sha(ROOT / "tests/e2e/camera.spec.ts") == formatting["formatted_sha256"]
    for name, expected in final.items():
        if name != "tests/e2e/camera.spec.ts":
            assert sha(ROOT / name) == expected, "Measured source changed: " + name
    for path in sorted((ROOT / "qa-artifacts").glob("live-camera-*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())
    unit = record("qa-artifacts/live-camera-unit-v1.log").read_text(encoding="utf-8")
    assert "912 passed" in unit and "57 passed" in unit
    build = record("qa-artifacts/live-camera-build-v4.log").read_text(encoding="utf-8")
    assert "tsc --noEmit" in build and "built in" in build
    tree("dist")
    for name in ("receipt_training/scripts/build_live_camera_report.py",
                 "receipt_training/scripts/observe_process_memory.py",
                 "receipt_training/scripts/test_process_memory_ownership.py",
                 "receipt_training/evaluation/LIVE_CAMERA_CAPTURE.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "receipt_training/evaluation/advanced-enhanced-area-v1.json",
                 "receipt_training/evaluation/advanced-browser-paddle-medium-readiness-v1.json",
                 "qa-artifacts/browser-paddle-medium-readiness-postcommit-v1.json",
                 "graphify-out/graph.json", "graphify-out/GRAPH_REPORT.md", ".graphifyignore"):
        record(name)

    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    assert git("rev-parse", "HEAD").decode().strip() == PARENT
    assert git("branch", "--show-current").decode().strip() == "feature/advanced-ocr-vision-ai"
    tracked = git("ls-files", "src", "server", "tests", "scripts", "package.json", "package-lock.json",
                  "vite.config.ts", "playwright.config.ts", "tsconfig.json", "index.html").decode().splitlines()
    changed = {"src/App.tsx", "src/lib/image-quality.ts", "src/styles.css", "scripts/update-graph.py"}
    unchanged = []
    for name in tracked:
        record(name)
        if name not in changed:
            assert hashlib.sha256(git("show", PARENT + ":" + name)).hexdigest() == sha(ROOT / name), name
            unchanged.append(name)
    record("src/ReceiptCamera.tsx")
    record("tests/e2e/camera.spec.ts")
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    result = {"status": "implemented-browser-tested-physical-camera-unverified",
              "unit_passes": 912, "browser_passes": 219, "browser_skips": 1, "dedicated_camera_passes": 22,
              "controllers": controllers, "memory": {n: {k:v for k,v in d.items() if k != "processes"} for n,d in memories.items()},
              "memory_scope": "Sampled owned development tree, not handset or model-only. Final camera/full observations are incomplete lower bounds; errors retained. Older observations lack the new creation-time ownership check.",
              "ownership_regression": ownership,
              "camera_synthetic_ocr_artifacts": ocr_results, "camera_synthetic_ocr_calls": 8,
              "scope": "Canvas streams substitute for camera hardware; actual JPEG, import, enhanced OCR and splitting. Automated review controls are not independent human verification. Other full-suite OCR tests are outside the eight camera calls. No original-fifty recognition rerun or new financial accuracy claim.",
              "test_formatting": formatting, "validation": validation,
              "private_camera_access": False, "private_receipt_uploads": 0, "model_downloads": 0,
              "api_cost_usd": "0", "paid_activation": False, "provider_promoted": False,
              "open": ["physical Android/iOS cameras and Safari", "real guidance calibration and phone resources",
                       "broader complete financial truth and recognition reliability", "public authentication, TLS, tenant quotas and durable cleanup",
                       "8B disk/RAM headroom and cached-medium RAM headroom; version a new study plan before inference"],
              "unchanged_application_files": unchanged,
              "git": {"parent_commit": PARENT, **protected, "merge_push_deploy": False},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "unit_passes": 912, "browser_passes": 219,
                      "unchanged_application_files": len(unchanged), "new_ocr_calls": 0}))


if __name__ == "__main__":
    main()
