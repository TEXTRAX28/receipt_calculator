"""Verify the exact-panel primary-OCR comparison without new inference."""
from collections import Counter, defaultdict
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from audit_evidence_integrity import archive, sha
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
BASE = "qa-artifacts/doctr-hybrid-saved-v1"
PACKET = ROOT / "receipt_training/evaluation/doctr-hybrid-comparison-v1.json"


def main():
    check = sys.argv[1:] == ["--check"]
    assert check or not sys.argv[1:]
    prior = json.loads(PACKET.read_bytes()) if check else None
    assert check or not PACKET.exists()
    hashes = {}

    def record(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        if expected is None and prior:
            expected = prior["evidence_sha256"].get(name)
        actual = sha(path) if path.is_file() else None
        if expected and actual != expected:
            path = ROOT / "qa-artifacts/evidence-blobs" / expected
            actual = sha(path)
        assert actual and (expected is None or actual == expected), name
        assert name not in hashes or hashes[name] == actual, name
        hashes[name] = actual
        if not any(p in path.parts for p in ("qa-artifacts", ".cache", "runs")):
            archive(path, actual)
        return path

    def load(name):
        return json.loads(record(name).read_text(encoding="utf-8-sig"))

    def lines(name, digest=None):
        return [json.loads(line) for line in record(name, digest).read_text(encoding="utf-8").splitlines()]

    def bind(values):
        for name, digest in values.items():
            record(name, digest)

    if check:
        bind(prior["evidence_sha256"])
    plan = load(BASE + "/plan.json")
    assert plan["recorded_before_new_inference_and_replay"]
    assert len(plan["source_sha256"]) == 68 and len(plan["refreshed_ids"]) == 6
    bind(plan["input_sha256"])
    for name, digest in plan["source_sha256"].items():
        record(BASE + "/source/" + name, digest)
    meta = load(BASE + "/replay/metadata.json")
    bind(meta["input_sha256"])
    assert meta["plan_sha256"] == hashes[BASE + "/plan.json"]
    assert meta["prediction_views"] == 400 and meta["errors"] == 0
    assert meta["new_model_calls"] == meta["private_uploads"] == meta["financial_edits"] == meta["checks_confirmed"] == 0
    assert all(plan["source_sha256"][name] == digest for name, digest in meta["loaded_source_sha256"].items())
    control = load(BASE + "/native-controller.json")
    assert control["spawned"] and control["exit_code"] == control["observer_exit_code"] == 0
    assert not control.get("error") and control["elapsed_ms"] < 600000
    assert control["initial_available_ram"] >= plan["native_limits"]["startup_ram_bytes"] == 2616025088
    assert control["minimum_available_ram"] >= plan["native_limits"]["runtime_floor_bytes"] == 1073741824
    assert control["controller_sha256"] == sha(record(BASE + "/run_native.py"))
    assert control["worker_sha256"] == sha(record(BASE + "/native_worker.py"))
    native = load(plan["fresh_native_run"] + "/metadata.json")
    fresh = lines(plan["fresh_native_run"] + "/ocr.jsonl", native["ocr_sha256"])
    assert native["completed_at"] and native["errors"] == 0
    assert native["selected_ids"] == plan["refreshed_ids"] == [r["receipt_id"] for r in fresh]
    for weight in native["model_files"]:
        record("receipt_training/.cache/doctr-models/models/" + weight["path"], weight["sha256"])
    memory = load("receipt_training/evaluation/runs/doctr-current-six-v1-observation/owned-memory.json")
    assert not memory["errors"] and memory["observed_process_count"] == 3
    exits = load(BASE + "/process-exit-check.json")
    assert not exits["same_identity_still_running"] and not exits["inspection_errors"]
    assert not load(BASE + "/replay-process-exit-check.json")["observed_matching_processes"]
    for label in ("replay", "scoring"):
        controller = load(BASE + f"/{label}-controller.json")
        assert controller["exit_code"] == 0 and controller["stop"] is None and controller["source_unchanged"]
        bind(controller["source_sha256"])
    pixels = load(BASE + "/pixel-and-adapter-validation.json")
    assert (pixels["verified_current_panels"], pixels["retained_exact_panels"], pixels["new_panels"]) == (51, 45, 6)
    assert pixels["word_and_line_text_confidence_geometry_unchanged_in_adapter"] and pixels["all50_transactions_included"]
    observations = lines(BASE + "/replay/observations.jsonl", meta["observations_sha256"])
    assert len(observations) == 100
    predictions = lines(BASE + "/replay/predictions.jsonl", meta["predictions_sha256"])
    assert len(predictions) == len({(r["receipt_id"], r["primary"], r["reader"], r["mode"]) for r in predictions}) == 400
    labels = {r["receipt_id"]: r for r in lines("receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl")}
    records = {r["receipt_id"]: r for r in lines("receipt_training/manifest.jsonl")}
    config = load("receipt_training/evaluation/config.json")
    totals = defaultdict(Counter)
    for prediction in predictions:
        assert not prediction.get("error")
        identity = prediction["receipt_id"]
        score = score_with_adjustments(records[identity], labels[identity], prediction, config)
        key = "/".join(prediction[k] for k in ("primary", "reader", "mode"))
        totals[key].update(score["counts"])
    scores = load(BASE + "/scores.json")
    bind(scores["evidence_sha256"])
    assert scores["counts"] == scores["raw_counts"] == {k: dict(v) for k, v in totals.items()}
    assert scores["paddle_baseline_counts_identical"]
    baseline = load("qa-artifacts/grouped-amounts-v15/scores.json")
    for reader in ("primary", "hybrid"):
        for mode in ("automatic", "known-currency"):
            assert scores["counts"][f"paddle/{reader}/{mode}"] == baseline["counts"][f"{reader}/{mode}/after"]
    for primary, prices in (("paddle", 134), ("doctr", 128)):
        counts = scores["counts"][f"{primary}/hybrid/known-currency"]
        assert counts["item_price_correct"] == prices and counts["requires_review"] == 50
        assert counts["trusted_reconciliation_correct"] == counts["complete_receipt_known"] == 0
        assert counts["complete_receipt_unscorable"] == 50
    protection = load(BASE + "/protection.json")
    assert not protection["app_source_changed"]
    if check:
        assert prior["counts"] == scores["counts"]
        print(json.dumps({"verified_files": len(hashes), "scored_views_reproduced": 400, "new_inference": 0}))
        return
    for folder in (BASE, plan["fresh_native_run"], plan["fresh_panel_run"], "receipt_training/evaluation/runs/doctr-current-six-v1-observation"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                record(path.relative_to(ROOT).as_posix())
    for name in ("receipt_training/scripts/build_doctr_hybrid_report.py", "receipt_training/scripts/replay_doctr_hybrid.mjs", "receipt_training/scripts/score_doctr_hybrid.py", "receipt_training/evaluation/DOCTR_HYBRID_COMPARISON.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        record(name)
    value = {"recorded_at": datetime.now(timezone.utc).isoformat(), "status": "exact-panel-comparison-complete-default-replacement-rejected", "scope": plan["scope"], "counts": scores["counts"], "improvements": scores["improvements"], "regressions": scores["regressions"], "paddle_control_identical": True, "new_ocr_calls": 6, "retained_exact_panels": 45, "new_vision_calls": 0, "private_uploads": 0, "app_changed": False, "native_controller": control, "native_memory": memory, "git": protection, "evidence_sha256": hashes}
    with PACKET.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(value, indent=2) + "\n")
    print(json.dumps({"bound_files": len(hashes), "scored_views": 400, "new_ocr_calls": 6, "default_replacement": False}))


if __name__ == "__main__":
    main()
