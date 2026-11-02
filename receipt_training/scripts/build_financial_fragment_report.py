"""Seal the bounded summary-fragment replay and actual application checks."""
from collections import Counter
from datetime import datetime, timedelta
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-financial-summary-fragments-v1.json"
PARENT = "69eaa3dfbfbc78a5075d6a32f54d7526a12076ed"
HASHES = {}
FINAL = "financial-fragments-targeted-v5"
FULL = "financial-fragments-full-v1"


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
    if not {"qa-artifacts", "runs"}.intersection(path.parts):
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def tree(name):
    for path in sorted((ROOT / name).rglob("*")):
        if path.is_file() and "__pycache__" not in path.parts:
            record(path.relative_to(ROOT).as_posix())


def old_version(name, expected):
    """Different versions get distinct archive paths, never one mutable alias."""
    path = ROOT / name
    if path.is_file() and sha(path) == expected:
        archive(path, expected)
    record("qa-artifacts/evidence-blobs/" + expected, expected)


def main():
    if "--check" in sys.argv:
        for name, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_calls": 0}))
        return
    assert not OUT.exists(), "Preserve the sealed report"
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    assert git("rev-parse", "HEAD").decode().strip() == PARENT
    assert git("branch", "--show-current").decode().strip() == "feature/advanced-ocr-vision-ai"
    plan = load("qa-artifacts/grouped-amounts-v3/plan.json")
    assert plan["parent_commit"] == PARENT and plan["recorded_before_change"]
    assert len(plan["source_sha256"]) == 65
    for name, digest in plan["reference_sha256"].items():
        assert sha(ROOT / name) == digest, "Frozen reference changed: " + name
        record(name, digest)
    for name, digest in plan["source_sha256"].items():
        assert hashlib.sha256(git("show", PARENT + ":" + name)).hexdigest() == digest
        record("qa-artifacts/grouped-amounts-v3/before/" + name, digest)

    trials = {}
    for version in range(3, 7):
        base = f"qa-artifacts/grouped-amounts-v{version}"
        score, meta = load(base + "/scores.json"), load(base + "/replay/metadata.json")
        assert not score["regressions"]
        assert meta["prediction_views"] == 400 and meta["new_model_requests"] == meta["external_requests"] == 0
        assert not meta["references_changed"] and meta["recovery_checks_unconfirmed"]
        for mapping in (score["evidence_sha256"], meta["input_sha256"]):
            for name, digest in mapping.items():
                record(name, digest)
        for variant, mapping in meta["source_sha256"].items():
            for name, digest in mapping.items():
                record(meta["frozen_source_paths"][variant] + "/" + name, digest)
                if version == 6 and variant == "after":
                    assert sha(ROOT / name) == digest, "Final replay source changed: " + name
        tree(base)
        trials[str(version)] = {"counts": score["counts"], "improvements": score["improvements"], "regressions": score["regressions"]}
    final = trials["6"]
    assert final["improvements"] == [{"receipt_id": "cord-v2-train-000", "reader": "hybrid", "mode": "known-currency", "field": "price_basis_correct", "delta": 1}]
    assert final["counts"]["hybrid/known-currency/before"]["price_basis_correct"] == 4
    assert final["counts"]["hybrid/known-currency/after"]["price_basis_correct"] == 5
    assert final["counts"]["hybrid/automatic/before"] == final["counts"]["hybrid/automatic/after"]
    expected_counts = dict(final["counts"]["hybrid/known-currency/before"], price_basis_correct=5)
    assert final["counts"]["hybrid/known-currency/after"] == expected_counts
    for mode in ("automatic", "known-currency"):
        assert final["counts"][f"primary/{mode}/before"] == final["counts"][f"primary/{mode}/after"]
    predictions = [json.loads(line) for line in record("qa-artifacts/grouped-amounts-v6/replay/predictions.jsonl").read_text(encoding="utf-8").splitlines()]
    cohort = [r for r in predictions if r["variant"] == "after" and r["reader"] == "hybrid" and r["mode"] == "known-currency"]
    assert Counter(r["split"] for r in cohort) == {"development": 38, "evaluation": 12}
    cases = {r["variant"]: r for r in predictions if r["receipt_id"] == "cord-v2-train-000" and r["reader"] == "hybrid" and r["mode"] == "known-currency"}
    clean_items = lambda r: [{k:v for k,v in i.items() if k != "id"} for i in r["receipt"]["items"]]
    assert clean_items(cases["before"]) == clean_items(cases["after"])
    for case in cases.values():
        assert case["receipt"]["printedTotal"] == "1591600"
        assert case["calculation"]["discrepancy"] == "0" and len(case["calculation"]["issues"]) == 74
        assert all(check["confirmedValue"] == "" for check in case["receipt"]["reviewChecks"])
    assert cases["before"]["taxBasisRecovery"] is None
    assert cases["after"]["taxBasisRecovery"]["sourceIndices"] == [24, 25, 26, 27, 28, 29]
    assert cases["after"]["receipt"]["pricesIncludeTax"] is False

    build = load("qa-artifacts/financial-fragments-build-v4/proof.json")
    assert build["exit_code"] == 0 and build["source_unchanged"]
    for name, digest in {**build["source_sha256"], **build["build_sha256"]}.items():
        assert sha(ROOT / name) == digest, "Final build changed: " + name
        record(name, digest)
    for version in (3, 4):
        tree(f"qa-artifacts/financial-fragments-build-v{version}")
        record(f"qa-artifacts/financial-fragments-build-v{version}.py")
    old = load("qa-artifacts/financial-fragments-build-v3/proof.json")
    for name, digest in {**old["source_sha256"], **old["build_sha256"]}.items():
        old_version(name, digest)
    for name, digest in load("qa-artifacts/financial-fragments-targeted-v1/build-sha256.json").items():
        old_version(name, digest)

    controllers, memories, windows = {}, {}, {}
    for tag in [f"financial-fragments-targeted-v{i}" for i in range(1, 6)] + [FULL]:
        base = "qa-artifacts/" + tag
        control = controllers[tag] = load(base + "/controller.json")
        tree(base)
        for name, digest in control["source_sha256"].items():
            record(base + "/source/" + name, digest)
        assert not control["private_camera_access"] and control["private_receipt_uploads"] == 0
        if control["spawned"]:
            start = datetime.fromisoformat(control["started_at"])
            windows[tag] = (start, start + timedelta(milliseconds=control["elapsed_ms"] + 2000))
            folder = "receipt_training/evaluation/runs/" + tag
            memory = load(folder + "/owned-memory.json")
            memories[tag] = {k:v for k,v in memory.items() if k != "processes"}
            tree(folder)
    for tag, passed, failed in [("financial-fragments-targeted-v1", 6, 4), ("financial-fragments-targeted-v3", 8, 2)]:
        log = record("qa-artifacts/" + tag + "/stdout.log").read_text(encoding="utf-8")
        assert f"{passed} passed" in log and f"{failed} failed" in log and controllers[tag]["exit_code"] == 1
    assert not load("qa-artifacts/financial-fragments-targeted-v2/invalidated.json")["validates_current_application"]
    stopped = controllers["financial-fragments-targeted-v4"]
    assert not stopped["spawned"] and stopped["error"] == "insufficient-available-ram-before-start"
    for tag, passes in [(FINAL, 10), (FULL, 223)]:
        control = controllers[tag]
        assert control["exit_code"] == control["observer_exit_code"] == 0
        assert not control.get("error") and not control.get("observer_error")
        assert control["minimum_available_ram"] >= control["runtime_ram_floor"]
        log = record("qa-artifacts/" + tag + "/stdout.log").read_text(encoding="utf-8")
        assert re.search(rf"\b{passes} passed\b", log)
        assert tag != FULL or "1 skipped" in log
        for name, digest in control["source_sha256"].items():
            assert sha(ROOT / name) == digest, "Measured source changed: " + name

    artifacts = {tag: [] for tag in windows}
    protocol_results = {FINAL: [], FULL: []}
    for path in (ROOT / "qa-artifacts/e2e-runs").glob("*/test.json"):
        metadata = json.loads(path.read_text(encoding="utf-8"))
        if not metadata.get("created_at"):
            continue
        created = datetime.fromisoformat(metadata["created_at"].replace("Z", "+00:00"))
        tags = [tag for tag, (start, end) in windows.items() if start <= created <= end]
        if not tags:
            continue
        assert len(tags) == 1
        tag = tags[0]
        folder = path.parent.relative_to(ROOT).as_posix()
        artifacts[tag].append(folder)
        tree(folder)
        if tag in protocol_results:
            for evidence in path.parent.glob("financial-*-evidence.json"):
                data = load(evidence.relative_to(ROOT).as_posix())
                assert data["realModelCalls"] == 0 and data["displayedShares"] == ["£10.50", "£10.50"]
                assert data["posts"] == ["/api/receipts/recognize", "/api/receipts/vision"]
                assert data["state"]["step"] == "summary" and data["state"]["receipt"]["printedTotal"] == "21.00"
                protocol_results[tag].append(evidence.relative_to(ROOT).as_posix())
    assert all(len(paths) == 10 for paths in protocol_results.values())

    unit = load("qa-artifacts/grouped-amounts-v3/fragment-full-unit-v3.json")
    assert unit["exit_code"] == 0 and unit["source_unchanged"] and not unit.get("error")
    assert unit["source_sha256"] == build["source_sha256"]
    unit_log = record("qa-artifacts/grouped-amounts-v3/fragment-full-unit-v3.log").read_text(encoding="utf-8")
    assert "940 passed" in unit_log and "57 passed" in unit_log
    validation = load("qa-artifacts/financial-fragments-validation-v1.json")
    assert len(validation["commands"]) == 3 and all(c["exit_code"] == 0 for c in validation["commands"])
    for command in validation["commands"]:
        record(command["log"], command["sha256"])
    for name in ("receipt_training/scripts/build_financial_fragment_report.py",
                 "receipt_training/evaluation/FINANCIAL_SUMMARY_FRAGMENTS.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "qa-artifacts/financial-fragments-runner-v1.py",
                 "qa-artifacts/financial-fragments-validation-v1.py",
                 "qa-artifacts/live-camera-postcommit-v1.json",
                 "graphify-out/graph.json", "graphify-out/GRAPH_REPORT.md"):
        record(name)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    result = {"status": "implemented-local-replay-and-browser-tested", "scope": plan["scope"],
              "trials": trials, "final_replay": "grouped-amounts-v6", "new_model_calls_for_replay": 0,
              "unit_passes": 940, "targeted_browser_passes": 10, "full_browser_passes": 223, "browser_skips": 1,
              "browser_scope": "Financial scenarios mock both providers. Other full-suite tests include real cached synthetic device OCR. Camera hardware is simulated; neither phone hardware nor independent human review is verified.",
              "controllers": controllers, "memory": memories,
              "memory_scope": "Sampled owned development process trees, not phone or model-only memory. Observer errors and caps remain explicit; incomplete samples are lower bounds.",
              "artifact_directories": artifacts, "financial_protocol_artifacts": protocol_results,
              "unit_execution": {k:v for k,v in unit.items() if k != "source_sha256"}, "validation": validation,
              "private_receipt_uploads": 0, "model_downloads": 0, "paid_activation": False, "provider_promoted": False,
              "open": ["All fifty drafts require review; complete financial reference coverage remains insufficient",
                       "Eight final totals and ten known line prices remain wrong with supplied currency",
                       "Stronger model trials need existing disk/RAM guards met; private cloud uploads need their own approval",
                       "Physical phones/Safari and public-service security/operations remain unverified",
                       "Thirteen older missing evidence declarations are not repaired by this checkpoint"],
              "git": {"parent_commit": PARENT, **protected, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "improvements": final["improvements"], "unit_passes": 940, "browser_passes": 223}))


if __name__ == "__main__":
    main()
