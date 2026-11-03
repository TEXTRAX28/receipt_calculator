"""Bind the copied-price proposal's offline accuracy and verification evidence."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
BASE = "qa-artifacts/grouped-amounts-v12"
PACKET = ROOT / "receipt_training/evaluation/copied-price-recovery-v1.json"


def main():
    if sys.argv[1:] == ["--check"]:
        packet = json.loads(PACKET.read_bytes())
        for name, expected in packet["evidence_sha256"].items():
            path = ROOT / name
            if not path.is_file() or sha(path) != expected:
                path = ROOT / "qa-artifacts/evidence-blobs" / expected
            assert path.is_file() and sha(path) == expected, name
        print(json.dumps({"verified_files": len(packet["evidence_sha256"]), "new_inference": 0}))
        return
    assert not sys.argv[1:] and not PACKET.exists()
    hashes = {}

    def bind(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        if expected and (not path.is_file() or sha(path) != expected):
            path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
        assert expected is None or digest == expected, name
        key = path.relative_to(ROOT).as_posix()
        assert key not in hashes or hashes[key] == digest
        hashes[key] = digest
        return path

    def load(name):
        return json.loads(bind(name).read_bytes())

    def tree(folder):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file():
                bind(path.relative_to(ROOT).as_posix())

    plan = load(BASE + "/plan.json")
    for name, expected in plan["input_sha256"].items():
        bind(name, expected)
    scores = load(BASE + "/scores.json")
    metadata = load(BASE + "/replay/metadata.json")
    assert len(scores["scores"]) == 400
    assert metadata["new_model_requests"] == metadata["external_requests"] == 0
    for declaration in (scores["evidence_sha256"], metadata["input_sha256"]):
        for name, expected in declaration.items():
            bind(name, expected)
    assert scores["regressions"] == []
    assert scores["improvements"] == [{"receipt_id": "cord-v2-train-011", "reader": "hybrid", "mode": "known-currency", "field": "item_price_correct", "delta": 1}]
    counts = scores["counts"]
    for reader in ("primary", "hybrid"):
        for mode in ("automatic", "known-currency"):
            before, after = [counts[f"{reader}/{mode}/{arm}"] for arm in ("before", "after")]
            changed = {k for k in before.keys() | after.keys() if before.get(k, 0) != after.get(k, 0)}
            assert changed == ({"item_price_correct"} if reader == "hybrid" and mode == "known-currency" else set())
    views = [json.loads(line) for line in bind(BASE + "/replay/predictions.jsonl", metadata["predictions_sha256"]).read_text(encoding="utf-8").splitlines()]
    assert all(not check["confirmedValue"] for view in views for check in view["receipt"]["reviewChecks"])
    actual = next(v for v in views if v["receipt_id"] == "cord-v2-train-011" and v["reader"] == "hybrid" and v["mode"] == "known-currency" and v["variant"] == "after")
    assert actual["receipt"]["items"][2]["lineTotal"] == "27500"
    assert actual["receipt"]["items"][2]["unitPrice"] == "27.500"
    assert actual["calculation"]["issues"]
    before_tests = load(BASE + "/before-tests.json")
    focused = load(BASE + "/focused-tests.json")
    units = load(BASE + "/full-unit.json")
    assert before_tests["numFailedTests"] == 2
    assert focused["numPassedTests"] == 71 and focused["numFailedTests"] == 0
    assert units["numPassedTests"] == 1077 and units["numFailedTests"] == units["numPendingTests"] == 0
    build = load("qa-artifacts/copied-price-build-v1/proof.json")
    assert build["checks"] == [{"label": "typecheck", "exit_code": 0}, {"label": "build", "exit_code": 0}]
    assert build["source_unchanged"] and build["env_files_disabled"] and not build["new_api_requests"]
    for key in ("source_sha256", "build_sha256", "log_sha256"):
        for name, expected in build[key].items():
            bind(name, expected)
    browser = load("qa-artifacts/copied-price-browser-v1/controller.json")
    assert not browser["spawned"] and browser["error"] == "insufficient-available-ram-before-start"
    assert browser["initial_available_ram"] < browser["startup_floor_bytes"] == 2684354560
    for version in (1, 2):
        pending = load(f"qa-artifacts/copied-price-browser-v{version}/plan.json")
        for key in ("source_sha256", "build_sha256"):
            for name, expected in pending[key].items():
                bind(name, expected)
        tree(f"qa-artifacts/copied-price-browser-v{version}")
    protection = load(BASE + "/protection-and-test-amendment.json")
    assert protection["stable"] == "ee725ba45e799bee8501d3de034e0302c0127afd"
    assert protection["original_head"] == "29a187af7347be94c0728f4785be674500833748"
    assert protection["original_diff_sha256"] == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    assert protection["final_e2e_typecheck_observed_exit_code"] == 0 and not protection["future_browser_started"]
    refresh = load(BASE + "/medium-plan-refresh.json")
    assert refresh["same_models_cases_limits_parameters_scope_scoring_timing"] and not refresh["new_medium_inference"]
    for folder in (BASE, "qa-artifacts/copied-price-build-v1", "qa-artifacts/browser-paddle-medium-paired-plan-v13"):
        tree(folder)
    for name in ("COPIED_PRICE_RECOVERY.md", "GOAL_ACCEPTANCE_AUDIT.md", "ADVANCED_OCR_REPORT.md"):
        bind("receipt_training/evaluation/" + name)
    bind("receipt_training/scripts/build_copied_price_report.py")
    result = {"recorded_at": datetime.now(timezone.utc).isoformat(), "parent_commit": plan["parent_commit"],
              "scope": "One source-supported invalid line-price proposal despite a name difference; familiar original-fifty offline replay, not new model accuracy or full-goal completion.",
              "counts": counts, "improvements": scores["improvements"], "regressions": scores["regressions"],
              "unit_tests_passed": 1077, "browser_test_status": "unexecuted: startup RAM guard refused; amended version 2 prepared",
              "new_model_inferences": 0, "external_receipt_uploads": 0, "protected_checkouts_unchanged": True,
              "evidence_sha256": hashes}
    with PACKET.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"bound_files": len(hashes), "unit_tests_passed": 1077, "new_inference": 0}))


if __name__ == "__main__":
    main()
