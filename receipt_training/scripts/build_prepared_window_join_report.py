"""Bind section-join replays and actual browser evidence, without inference."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
PACKET = ROOT / "receipt_training/evaluation/advanced-prepared-window-join-v2.json"
REPLAY = "qa-artifacts/prepared-window-join-replay-v3"
BASE = "qa-artifacts/prepared-window-join-v1"


def main():
    if sys.argv[1:] == ["--check"]:
        packet = json.loads(PACKET.read_bytes())
        for name, digest in packet["evidence_sha256"].items():
            path = ROOT / name
            if not path.is_file() or sha(path) != digest:
                path = ROOT / "qa-artifacts/evidence-blobs" / digest
            assert path.is_file() and sha(path) == digest, name
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
        assert expected is None or expected == digest, name
        key = path.relative_to(ROOT).as_posix()
        assert key not in hashes or hashes[key] == digest
        hashes[key] = digest
        return path

    def load(name):
        return json.loads(bind(name).read_bytes())

    def tree(name):
        for path in sorted((ROOT / name).rglob("*")):
            if path.is_file() and not any("vite-cache" in p for p in path.parts):
                bind(path.relative_to(ROOT).as_posix())

    protocol = load(REPLAY + "/protocol.json")
    assert protocol["changes"] == ["src/lib/paddle-browser.ts", "src/lib/receipt-layout.ts", "src/lib/window-overlap.ts"]
    meta = load(REPLAY + "/metadata.json")
    assert len(meta["cases"]) == 62 and meta["new_model_inferences"] == meta["private_uploads"] == 0
    scores = load(REPLAY + "/scores.json")
    assert len(scores["scores"]) == 248
    for name, expected in {**meta["input_sha256"], **scores["evidence_sha256"]}.items():
        bind(name, expected)
    for name, expected in meta["source_sha256"]["after"].items():
        assert sha(ROOT / name) == expected, name
    for key, counts in scores["counts"].items():
        if key.endswith("/before") and not key.startswith("supplied-uk/"):
            assert counts == scores["counts"][key[:-6] + "after"], key
    assert len(scores["scored_regressions"]) == 2
    for regression in scores["scored_regressions"]:
        assert regression["identity"].endswith("--manual-straighten")
        assert regression["losses"] == {"description_correct": [14, 13]} and not regression["additions"]
    uk = {}
    for variant in ("original", "auto-crop", "manual-straighten"):
        case = load(f"{REPLAY}/supplied-uk--supplement-user-uk-20261026-group--{variant}.json")
        pair = {}
        for arm in ("before", "after"):
            view = next(v for v in case[arm]["views"] if v["mode"] == "known-currency")
            assert all(not c["confirmedValue"] for c in view["receipt"]["reviewChecks"])
            assert view["calculation"]["issues"]
            pair[arm] = {"items": len(view["receipt"]["items"]), **{k: view["calculation"][k] for k in ("total", "printed", "discrepancy")}}
        assert pair["after"] == {"items": 18, "total": "17678", "printed": "17678", "discrepancy": "0"}
        assert pair["before"]["items"] == (18 if variant == "original" else 27)
        uk[variant] = pair
    units = load(BASE + "/full-unit-v3.json")
    assert units["numPassedTests"] == 1064 and units["numFailedTests"] == units["numPendingTests"] == 0
    for version in (1, 2, 3):
        proof = load(f"qa-artifacts/prepared-window-join-build-v{version}/proof.json")
        assert proof["exit_code"] == (2 if version == 1 else 0)
        assert proof["source_unchanged"] and proof["provider_keys_disabled"] and not proof["new_api_requests"]
        for section in ("source_sha256", "build_sha256", "log_sha256"):
            for name, expected in proof[section].items():
                bind(name, expected)
        tree(f"qa-artifacts/prepared-window-join-build-v{version}")
    browser = []
    for version in (1, 2, 3, 4, 5):
        folder = f"qa-artifacts/prepared-window-join-browser-v{version}"
        plan, control = load(folder + "/plan.json"), load(folder + "/controller.json")
        for section in ("source_sha256", "build_sha256"):
            for name, expected in plan[section].items():
                bind(name, expected)
        assert control["startup_floor_bytes"] == 2684354560
        assert control["minimum_available_ram"] >= control["runtime_floor_bytes"] == 1073741824
        assert control["spawned"] and control["observer_exit_code"] == 0 and not control.get("error")
        results = load(folder + "/results.json")
        memory = load(f"receipt_training/evaluation/runs/prepared-window-join-browser-v{version}/owned-memory.json")
        browser.append({"run": version, "controller": control, "stats": results["stats"],
                        "memory": {k:memory[k] for k in ("peak_sampled_process_tree_working_set_bytes", "observed_process_count", "errors")}})
        tree(folder)
    assert browser[2]["stats"]["expected"] == 6 and browser[2]["stats"]["unexpected"] == 1
    assert browser[3]["stats"]["expected"] == 3 and not browser[3]["stats"]["unexpected"]
    assert browser[4]["stats"]["expected"] == 1 and not browser[4]["stats"]["unexpected"]
    before_guard = load(BASE + "/before-guard-tests.json")
    after_guard = load(BASE + "/focused-v3.json")
    assert before_guard["numFailedTests"] == 2 and after_guard["numFailedTests"] == 0
    app = load("qa-artifacts/prepared-window-join-browser-v5/result.json")
    assert len(app["receipt"]["items"]) == 18 and app["calculation"]["total"] == "17678"
    assert app["calculation"]["discrepancy"] == "0" and app["calculation"]["issues"]
    assert all(not c["confirmedValue"] for c in app["receipt"]["reviewChecks"])
    assert len(app["alternateSources"]) == 2 and not app["external"] and not app["writes"] and not app["errors"]
    for name, expected in {**app["source_sha256"], **app["input_sha256"]}.items():
        bind(name, expected)
    refresh = load(BASE + "/medium-plan-refresh-v2.json")
    assert refresh["same_models_cases_limits_parameters_scoring_timing"] and not refresh["new_medium_inference"]
    validation = load(BASE + "/validation-v2.json")
    assert all(c["exit_code"] == 0 for c in validation["checks"])
    exits = load(BASE + "/process-exit-check-v2.json")
    assert not exits["same_identity_still_running"] and not exits["inspection_errors"]
    for folder in (BASE, REPLAY, "qa-artifacts/prepared-window-join-plan-v1", "qa-artifacts/prepared-window-join-replay-v1", "qa-artifacts/browser-paddle-medium-paired-plan-v11", "qa-artifacts/browser-paddle-medium-paired-plan-v12", "qa-artifacts/prepared-window-join-replay-v2"):
        tree(folder)
    for name in ("build_prepared_window_join_report.py", "replay_prepared_windows.mjs", "score_prepared_windows.py"):
        bind("receipt_training/scripts/" + name)
    for name in ("PREPARED_WINDOW_JOIN.md", "GOAL_ACCEPTANCE_AUDIT.md", "ADVANCED_OCR_REPORT.md"):
        bind("receipt_training/evaluation/" + name)
    assert subprocess.check_output(["git", "rev-parse", "stable/receipt-verified"], cwd=ROOT, text=True).strip() == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    assert subprocess.check_output(["git", "-C", original, "rev-parse", "HEAD"], text=True).strip() == "29a187af7347be94c0728f4785be674500833748"
    assert hashlib.sha256(subprocess.check_output(["git", "-C", original, "diff", "--binary"])).hexdigest() == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    packet = {"recorded_at": datetime.now(timezone.utc).isoformat(), "parent_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
              "scope": "Same-photo prepared-section join for enhanced reader; familiar retained readings and one actual cropped app transaction. No model/preparation/default promotion or whole-goal completion.",
              "uk": uk, "counts": scores["counts"], "scored_regressions": scores["scored_regressions"],
              "unit_tests_passed": 1064, "browser": browser, "app_scan_ms": app["elapsed_ms"],
              "new_private_receipt_section_reads": 16, "external_uploads": 0, "model_downloads": 0,
              "stable_and_original_checkout_unchanged": True, "evidence_sha256": hashes}
    with PACKET.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"bound_files": len(hashes), "unit_tests_passed": 1064, "new_inference_during_report": 0}))


if __name__ == "__main__":
    main()
