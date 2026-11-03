"""Seal the bounded partial reader trial and completed synthetic phone review check."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/browser-paddle-medium-result-v1.json"
PLAN = "qa-artifacts/browser-paddle-medium-paired-plan-v14"
PROOF = "qa-artifacts/browser-paddle-medium-result-v1"
PHONE = "qa-artifacts/copied-price-browser-v4"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT)
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest and (expected is None or digest == expected), name
    assert name not in HASHES or HASHES[name] == digest, name
    HASHES[name] = digest
    if not any(part in path.parts for part in ("qa-artifacts", ".cache", "runs")):
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8-sig"))


def tree(name):
    for path in sorted((ROOT / name).rglob("*")):
        if path.is_file() and not any(p in path.parts for p in ("vite-cache", "__pycache__")):
            record(path.relative_to(ROOT).as_posix())


def bindings(value):
    for name, expected in value.items():
        record(name, expected)


def main():
    if "--check" in sys.argv:
        bindings(json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"])
        print(json.dumps({"verified_files": len(HASHES), "new_model_calls": 0}))
        return
    assert not OUT.exists(), "Preserve the existing result packet"
    plan = load(PLAN + "/study-plan.json")
    assert plan["recorded_before_new_ocr"] and len(plan["cases"]) == 7
    assert sum(len(c["frames"]) for c in plan["cases"]) == 8
    bindings(plan["input_sha256"])
    tree(PLAN)
    arms = {}
    for size in ("tiny", "medium"):
        tag = "browser-paddle-paired-" + size + "-v14"
        base = "qa-artifacts/" + tag
        control = load(base + "-control/controller.json")
        assert control["spawned"] and not control.get("observer_error")
        if size == "tiny":
            assert control["exit_code"] == 0 and not control.get("error")
            assert control["elapsed_ms"] < plan["limits"]["whole_run_deadline_seconds"] * 1000
        else:
            assert control["exit_code"] == 1 and control["error"] == "whole-run-deadline"
            assert 300000 <= control["elapsed_ms"] < 310000
        assert control["startup_available_ram"] >= control["startup_required_ram"] == plan["limits"]["startup_ram_bytes"]
        assert control["minimum_available_ram"] >= control["runtime_ram_floor"] == plan["limits"]["runtime_ram_floor_bytes"]
        assert control["private_receipt_uploads"] == control["model_downloads"] == 0
        bindings(control["source_sha256"])
        synthetic = load(base + "/result.json")
        assert not synthetic.get("error") and len(synthetic["reading"][0]["items"]) == 6
        assert not synthetic["errors"] and not synthetic["requests"]["external"] and not synthetic["requests"]["writes"]
        starting = load(base + "/starting.json")
        bindings(starting["input_sha256"])
        delivered, missing = [], []
        for case in plan["cases"]:
            for frame in case["frames"]:
                name = f"{case['receipt_id']}-photo-{frame['photo']}-part-{frame['part']}.json"
                if not (ROOT / base / name).exists():
                    missing.append(name)
                    continue
                panel = load(base + "/" + name)
                assert not panel.get("error") and panel["frame"] == frame and len(panel["reading"]) == 1
                assert panel["reading"][0]["image"] == {"width": frame["width"], "height": frame["height"]}
                delivered.append({"receipt_id": case["receipt_id"], "photo": frame["photo"],
                                  "part": frame["part"], "warm_reading_ms": panel["elapsed_ms"]})
        assert len(delivered) == (8 if size == "tiny" else 7)
        if size == "tiny":
            captures = load(base + "/capture-results.json")
            assert not captures["errors"] and not captures["requests"]["external"] and not captures["requests"]["writes"]
            assert len(captures["cases"]) == 7 and not missing
            bindings(captures["input_sha256"])
            for case in captures["cases"]:
                for panel in case["panels"]:
                    record(base + "/" + panel["result"], panel["result_sha256"])
        else:
            assert missing == ["supplement-user-uk-20261026-group-photo-2-part-1.json"]
            assert not (ROOT / base / "capture-results.json").exists()
        memory = load("receipt_training/evaluation/runs/" + tag + "/owned-memory.json")
        assert memory["samples"] and not memory["errors"] and not memory["excluded_stale_parent_links"]
        exited = load(base + "-control/process-exit-check.json")
        assert exited["observed_identities"] == memory["observed_process_count"] and not exited["still_live_owned_pids"]
        for directory in (base, base + "-control"):
            tree(directory)
        arms[size] = {"controller": control, "initialization_ms": synthetic["initialized_ms"],
                      "browser": synthetic["browser"], "planned_receipt_image_calls": 8,
                      "completed_panels": delivered, "missing_panel_results": missing, "synthetic_calls": 1,
                      "complete_final_network_ledger": size == "tiny",
                      "peak_sampled_owned_tree_bytes": memory["peak_sampled_process_tree_working_set_bytes"],
                      "memory_scope": memory["scope"], "processes_exited": True}
    selected = {}
    for size, expected in (("tiny", "9.49 7"), ("medium", "9.49 Z")):
        crop = load(f"qa-artifacts/browser-paddle-paired-{size}-v14/uk-selected-chicken-skewer-photo-1-part-1.json")
        assert expected in [item["text"] for item in crop["reading"][0]["items"]]
        selected[size] = {"literal_line_price_and_code_fragment": expected}
    phone_plan = load(PHONE + "/plan.json")
    bindings(phone_plan["source_sha256"])
    bindings(phone_plan["build_sha256"])
    phone = load(PHONE + "/controller.json")
    assert phone["spawned"] and phone["exit_code"] == phone["observer_exit_code"] == 0
    assert phone["initial_available_ram"] >= phone_plan["startup_floor_bytes"]
    assert phone["minimum_available_ram"] >= phone_plan["runtime_floor_bytes"]
    results = load(PHONE + "/results.json")
    assert results["stats"]["expected"] == 1 and not results["errors"]
    assert all(results["stats"][k] == 0 for k in ("unexpected", "skipped", "flaky"))
    journey_base = "qa-artifacts/e2e-runs/mobile-VqRfFi"
    journey = load(journey_base + "/result.json")
    assert not journey["external"] and not journey["errors"]
    assert journey["posts"] == ["/api/receipts/recognize", "/api/receipts/vision"]
    assert journey["priceCheckedExplicitlyAndOtherChecksStillBlock"]
    phone_memory = load("receipt_training/evaluation/runs/copied-price-browser-v4/owned-memory.json")
    assert not phone_memory["errors"] and not phone_memory["excluded_stale_parent_links"]
    phone_exit = load(PHONE + "/process-exit-check.json")
    assert not phone_exit["still_live_owned_pids"]
    assert phone_exit["observed_identities"] == phone_memory["observed_process_count"]
    tree(PHONE)
    tree(journey_base)
    proof = load(PROOF + "/validation.json")
    assert all(command["exit_code"] == 0 for command in proof["commands"])
    tree(PROOF)
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    parent = git("rev-parse", "HEAD").decode().strip()
    assert parent == "1df78e7680006c8ccd95e969a937fec302eed964"
    unchanged = git("ls-files", "src", "server", "tests", "scripts", "package.json", "package-lock.json", "index.html", "vite.config.ts", "playwright.config.ts").decode().splitlines()
    for name in unchanged:
        assert hashlib.sha256(git("show", parent + ":" + name)).hexdigest() == sha(ROOT / name), name
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    for name in ("receipt_training/scripts/build_browser_paddle_medium_result.py",
                 "receipt_training/evaluation/BROWSER_PADDLE_MEDIUM_RESULT.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        record(name)
    result = {"status": "partial-medium-whole-run-deadline", "scope": plan["scope"],
              "plan": PLAN + "/study-plan.json", "arms": arms,
              "literal_selected_observation": selected, "paired_financial_scoring": "not run: medium did not deliver all frozen inputs",
              "planned_receipt_image_calls": 16, "completed_receipt_image_results": 15, "synthetic_calls": 2,
              "unlogged_attempt_start_limit": "The runner saves per-image completion but not individual start records. The final medium footer has no result; do not invent its isolated elapsed time or retry it.",
              "network_ledger_limit": "Tiny final and both synthetic-gate request ledgers are empty for external/writes. Medium's final ledger was not emitted at termination. The frozen browser route blocks external requests and non-GET/HEAD requests throughout; no external private upload or secret access was enabled.",
              "private_receipt_uploads": 0, "model_downloads": 0, "api_cost_usd": "0",
              "compute_cost_usd": None, "provider_promoted": False, "paid_activation": False,
              "phone_review": {"controller": phone, "stats": results["stats"],
                               "peak_sampled_owned_tree_bytes": phone_memory["peak_sampled_process_tree_working_set_bytes"],
                               "scope": phone_plan["scope"], "screenshot_visually_inspected": True},
              "unchanged_application_files": unchanged,
              "git": {"parent_commit": parent, **protected, "merge_push_deploy": False},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "receipt_image_calls": 16, "phone_tests_passed": 1}))


if __name__ == "__main__":
    main()
