"""Verify the new classifier pilot and broader paired orientation experiment."""
from datetime import datetime, timezone
import json
from pathlib import Path
import sys

from audit_evidence_integrity import archive, sha
from build_document_orientation_report import summarize

ROOT = Path(__file__).resolve().parents[2]
PACKET = ROOT / "receipt_training/evaluation/onnxtr-orientation-comparison-v1.json"
PAIR = "qa-artifacts/orientation-original50-paired-v1"
PILOT = "qa-artifacts/onnxtr-orientation-pilot-v1"


def main():
    check = sys.argv[1:] == ["--check"]
    assert check or not sys.argv[1:]
    existing = json.loads(PACKET.read_bytes()) if check else None
    assert check or not PACKET.exists()
    hashes = {}

    def record(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        if expected is None and existing:
            expected = existing["evidence_sha256"].get(name)
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

    if existing:
        for name, digest in existing["evidence_sha256"].items():
            record(name, digest)
    protocol = load(PAIR + "/protocol.json")
    assert protocol["recorded_before_cohort_inference"] and protocol["total_calls_permitted"] == 420
    reviewed = load("qa-artifacts/orientation-cohort-review-v1/orientation-labels.json")
    assert reviewed["recorded_before_cohort_inference"] and len(reviewed["frames"]) == 51
    assert len({c["receipt_id"] for c in reviewed["frames"]}) == 50
    stored = load(PAIR + "/summary.json")
    summaries, results = {}, {}
    alias = {"receipt_training/scripts/benchmark_onnxtr_orientation.py": PILOT + "/frozen-runner.py"}

    def verify_run(tag, expected_calls, historical=False):
        base = "qa-artifacts/" + tag
        plan, output, controller = [load(base + "/" + name + ".json") for name in ("plan", "output", "controller")]
        assert plan["recorded_before_inference"] and plan["maximum_calls"] == expected_calls
        assert output["calls"] == len(output["observations"]) == expected_calls
        assert output["plan_sha256"] == controller["plan_sha256"] == hashes[base + "/plan.json"]
        assert controller["spawned"] and controller["exit_code"] == controller["observer_exit_code"] == 0
        assert not controller.get("error") and controller["elapsed_seconds"] < 60
        assert controller["initial_available_ram"] >= plan["limits"]["startup_ram_bytes"] == 2684354560
        assert controller["minimum_available_ram"] >= plan["limits"]["runtime_ram_floor_bytes"] == 1073741824
        assert output["receipt_uploads"] == output["model_downloads_during_inference"] == 0
        assert plan["threshold_for_descriptive_coverage_only"] == .9
        for name, digest in plan["input_sha256"].items():
            record(alias.get(name, name) if historical else name, digest)
        memory = load("receipt_training/evaluation/runs/" + tag + "/owned-memory.json")
        assert not memory["errors"] and memory["observed_process_count"] == 3
        exits = load(base + "/process-exit-check.json")
        assert not exits["same_identity_still_running"] and not exits["inspection_errors"]
        assert len(exits["results"]) == memory["observed_process_count"]
        return plan, output, memory

    pilot_plan, pilot, _ = verify_run("onnxtr-orientation-pilot-v1", 26, historical=True)
    pilot_summary = summarize(pilot, .9)
    assert (pilot_summary["genuine_correct"], pilot_summary["threshold_views"], pilot_summary["threshold_correct"]) == (20, 19, 19)
    prior = load("qa-artifacts/document-orientation-pilot-v1/output.json")
    assert [(r["identity"], r["clockwise_turns"], r["rgb_sha256"]) for r in pilot["observations"]] == [(r["identity"], r["clockwise_turns"], r["rgb_sha256"]) for r in prior["observations"]]
    prior_receipts = {"cord-v2-train-000", "cord-v2-train-001", "cord-v2-train-005"}
    for model in ("paddle", "onnxtr"):
        plan, result, memory = verify_run("orientation-original50-" + model + "-v1", 210)
        assert plan["cases"] == reviewed["frames"] and len(plan["cases"]) == 51
        assert all(c["base_orientation_degrees"] == 0 for c in plan["cases"])
        summary = summarize(result, .9)
        summary["controls"] = [{k: v for k, v in row.items() if k not in ("logits", "tensor_sha256", "rgb_sha256", "probabilities")} for row in summary["controls"]]
        genuine = [r for r in result["observations"] if not r["identity"].startswith("synthetic-")]
        for name, rows in (
            ("new_to_pilot", [r for r in genuine if r["identity"].split("-photo-")[0] not in prior_receipts]),
            ("upright", [r for r in genuine if r["clockwise_turns"] == 0]),
        ):
            high = [r for r in rows if r["score"] >= .9]
            summary[name] = {"views": len(rows), "correct": sum(r["predicted_degrees"] == r["expected_degrees"] for r in rows), "threshold_views": len(high), "threshold_correct": sum(r["predicted_degrees"] == r["expected_degrees"] for r in high)}
        summary["peak_sampled_owned_process_tree_bytes"] = memory["peak_sampled_process_tree_working_set_bytes"]
        assert stored["models"][model] == summary
        assert all(r["predicted_degrees"] == r["expected_degrees"] for r in result["observations"][:4])
        summaries[model], results[model] = summary, result
    pairs = list(zip(results["paddle"]["observations"], results["onnxtr"]["observations"]))
    assert len(pairs) == 210
    assert all((a["identity"], a["clockwise_turns"], a["expected_degrees"], a["rgb_sha256"]) == (b["identity"], b["clockwise_turns"], b["expected_degrees"], b["rgb_sha256"]) for a, b in pairs)
    agreement = [(a, b) for a, b in pairs if a["expected_degrees"] is not None and min(a["score"], b["score"]) >= .9 and a["predicted_degrees"] == b["predicted_degrees"]]
    assert len(agreement) == stored["exploratory_agreement"]["views"] == 145
    assert all(a["predicted_degrees"] == a["expected_degrees"] for a, _ in agreement)
    assert summaries["paddle"]["genuine_correct"] == 188 and summaries["onnxtr"]["genuine_correct"] == 191
    assert summaries["paddle"]["threshold_views"] - summaries["paddle"]["threshold_correct"] == 2
    assert summaries["onnxtr"]["threshold_views"] - summaries["onnxtr"]["threshold_correct"] == 5
    download = load("qa-artifacts/onnxtr-orientation-model-v1/download.json")
    record(download["model_path"], download["sha256"])
    assert download["bytes"] == 6097456 and download["download_attempts"] == 1
    assert download["final_free_disk"] >= download["disk_reserve_bytes"] == 10737418240
    parity = load("qa-artifacts/onnxtr-orientation-model-v1/preprocessing-parity.json")
    assert parity["compared_inputs"] == 27 and parity["all_exact"]
    protection = load(PAIR + "/protection.json")
    assert not protection["app_source_changed"]
    if check:
        assert existing["summaries"] == summaries and existing["pilot_summary"] == pilot_summary
        print(json.dumps({"verified_files": len(hashes), "summaries_reproduced": True, "new_inference": 0}))
        return
    for folder in ("qa-artifacts/onnxtr-orientation-model-v1", PILOT, "qa-artifacts/orientation-cohort-review-v1", PAIR, "qa-artifacts/orientation-original50-paddle-v1", "qa-artifacts/orientation-original50-onnxtr-v1"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and "__pycache__" not in path.parts:
                record(path.relative_to(ROOT).as_posix())
    for name in ("receipt_training/scripts/build_onnxtr_orientation_report.py", "receipt_training/scripts/build_document_orientation_report.py", "receipt_training/evaluation/ONNXTR_ORIENTATION_COMPARISON.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        record(name)
    value = {"recorded_at": datetime.now(timezone.utc).isoformat(), "status": "paired-local-classification-complete-no-automatic-promotion", "pilot_summary": pilot_summary, "summaries": summaries, "exploratory_agreement": stored["exploratory_agreement"], "decision": stored["decision"], "scope": pilot_plan["scope"], "cohort_scope": plan["scope"], "historical_pilot_input_aliases": alias, "new_orientation_inferences": 446, "new_receipt_ocr_inferences": 0, "private_uploads": 0, "app_changed": False, "git": protection, "evidence_sha256": hashes}
    with PACKET.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(value, indent=2) + "\n")
    print(json.dumps({"bound_files": len(hashes), "orientation_inferences": 446, "automatic_promotion": False}))


if __name__ == "__main__":
    main()
