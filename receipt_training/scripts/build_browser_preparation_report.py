"""Bind the completed tiny-reader preparation experiment; never rerun inference."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
PACKET = ROOT / "receipt_training/evaluation/advanced-browser-preparation-v1.json"
PLAN = "qa-artifacts/browser-paddle-preparation-plan-v2"
RUN = "qa-artifacts/browser-paddle-preparation-tiny-v1"
REPLAY = "qa-artifacts/browser-paddle-preparation-replay-v2"


def main():
    if sys.argv[1:] == ["--check"]:
        packet = json.loads(PACKET.read_text(encoding="utf-8"))
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
        digest = sha(path)
        assert expected is None or expected == digest, name
        if name in hashes:
            assert hashes[name] == digest
        hashes[name] = digest
        return path

    def load(name):
        return json.loads(bind(name).read_text(encoding="utf-8"))

    plan = load(PLAN + "/study-plan.json")
    for name, expected in plan["input_sha256"].items():
        if name in plan["source_sha256"]:
            bind(PLAN + "/source/" + name, expected)
        else:
            bind(name, expected)
    readings = load(RUN + "/capture-results.json")
    assert len(readings["cases"]) == 10
    assert sum(len(c["panels"]) for c in readings["cases"]) == 17
    assert not readings["errors"] and not readings["requests"]["external"] and not readings["requests"]["writes"]
    assert readings["engine"] == "paddle-ppocrv6-tiny-browser-wasm"
    for case in readings["cases"]:
        assert not case["error"]
        for panel in case["panels"]:
            bind(RUN + "/" + panel["result"], panel["result_sha256"])
    control = load(RUN + "-control/controller.json")
    assert control["spawned"] and control["exit_code"] == 0 and not control.get("error")
    assert control["startup_required_ram"] == 2684354560
    assert control["minimum_available_ram"] >= control["runtime_ram_floor"] == 1073741824
    memory = load(control["memory_observation"].replace("\\", "/"))
    assert memory["observed_process_count"] == 12 and not memory["errors"]
    exits = load(RUN + "-control/process-exit-check.json")
    assert not exits["same_identity_still_running"] and not exits["inspection_errors"]
    validation = load(RUN + "-control/validation.json")
    assert len(validation["checks"]) == 6 and all(c["exit_code"] == 0 for c in validation["checks"])
    scores = load(REPLAY + "/scores.json")
    metadata = load(REPLAY + "/metadata.json")
    assert len(scores["scores"]) == 24 and len(metadata["cases"]) == 12
    assert scores["fresh_ocr_sections"] == 17 and not scores["source_references_changed"]
    for index in (scores["evidence_sha256"], metadata["input_sha256"]):
        for name, expected in index.items():
            bind(name, expected)
    uk = {}
    for variant in ("original", "auto-crop", "manual-straighten"):
        result = load(f"{REPLAY}/supplement-user-uk-20261026-group-{variant}.json")
        for prediction in result["predictions"]:
            assert prediction["calculation"]["issues"]
            assert all(not c["confirmedValue"] for c in prediction["receipt"]["reviewChecks"])
        known = next(p for p in result["predictions"] if p["mode"] == "known-currency")
        uk[variant] = {"predicted_items": len(known["receipt"]["items"]),
                       **{k: known["calculation"][k] for k in ("total", "printed", "discrepancy")}}
    assert [r["predicted_items"] for r in uk.values()] == [18, 27, 27]
    assert [r["total"] for r in uk.values()] == ["17678", "27987", "27987"]
    assert all(r["printed"] == "17678" for r in uk.values())

    for folder in (RUN, RUN + "-control", "qa-artifacts/browser-paddle-preparation-plan-v1",
                   "qa-artifacts/browser-paddle-preparation-replay-v1",
                   "qa-artifacts/browser-paddle-preparation-join-diagnostic-v1"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and "vite-cache" not in path.parts:
                bind(path.relative_to(ROOT).as_posix())
    for name in ("qa-artifacts/browser-paddle-preparation-replay-correction-v1.json",
                 "qa-artifacts/browser-paddle-medium-paired-plan-v9/study-plan.json",
                 "qa-artifacts/browser-paddle-medium-paired-plan-v10/study-plan.json",
                 "receipt_training/evaluation/BROWSER_PREPARATION_COMPARISON.md",
                 "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md",
                 "receipt_training/evaluation/ADVANCED_OCR_REPORT.md",
                 "receipt_training/scripts/build_browser_preparation_report.py"):
        bind(name)
    for name in plan["source_sha256"]:
        bind(name)
    refresh = load(RUN + "-control/medium-plan-refresh.json")
    assert refresh["same_models_cases_limits_parameters_scoring_timing"] and not refresh["new_medium_inference"]
    parent = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    assert parent.startswith("17fa9c8")
    assert not subprocess.check_output(["git", "diff", parent, "--", "src", "server", "package.json", "package-lock.json", "vite.config.ts"], cwd=ROOT)
    assert subprocess.check_output(["git", "rev-parse", "stable/receipt-verified"], cwd=ROOT, text=True).strip() == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    assert subprocess.check_output(["git", "-C", original, "rev-parse", "HEAD"], text=True).strip() == "29a187af7347be94c0728f4785be674500833748"
    assert hashlib.sha256(subprocess.check_output(["git", "-C", original, "diff", "--binary"])).hexdigest() == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    packet = {"recorded_at": datetime.now(timezone.utc).isoformat(), "parent_commit": parent,
              "scope": "Four familiar development transactions, same preselected original/crop/straighten JPEGs. Actual tiny WASM readings, current frozen app interpretation and unchanged v5/UK-v2 references. Separate supplied currency; no app change, reference edit, model/preparation promotion or whole-goal completion.",
              "counts": scores["counts"], "uk_calculation_minor_units": uk,
              "new_receipt_section_inferences": 17, "new_synthetic_inferences": 1,
              "retries": 0, "external_receipt_uploads": 0, "model_downloads": 0,
              "guard": control, "memory": {k: memory[k] for k in ("scope", "peak_sampled_process_tree_working_set_bytes", "observed_process_count", "errors")},
              "findings": ["Crop modestly helps CORD supplied-currency prices/totals.", "Corrected UK windows produce nine false purchases and GBP103.09 discrepancy.", "Existing strict spatial helper alone is not verified as a complete sequence repair; no app integration.", "All verification checks remain pending; UK complete score0/1 and CORD complete truth unavailable."],
              "frozen_medium_plan": refresh["current"], "application_unchanged": True,
              "stable_and_original_checkout_unchanged": True, "evidence_sha256": hashes}
    with PACKET.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"bound_files": len(hashes), "receipt_sections_read": 17, "new_inference_during_report": 0}))


if __name__ == "__main__":
    main()
