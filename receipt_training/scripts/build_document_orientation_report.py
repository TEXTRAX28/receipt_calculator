"""Reproduce the small orientation pilot's summary without model inference."""
from datetime import datetime, timezone
import json
from pathlib import Path
import statistics
import sys

from audit_evidence_integrity import sha

ROOT = Path(__file__).resolve().parents[2]
BASE = "qa-artifacts/document-orientation-pilot-v1"
PACKET = ROOT / "receipt_training/evaluation/document-orientation-pilot-v1.json"


def summarize(result, threshold):
    rows = result["observations"]
    genuine = [row for row in rows if not row["identity"].startswith("synthetic-")]
    controls = [row for row in rows if row["identity"].startswith("synthetic-")]
    correct = lambda row: row["expected_degrees"] == row["predicted_degrees"]
    eligible = [row for row in genuine if row["score"] >= threshold]
    groups = {}
    for row in genuine:
        group = groups.setdefault(row["identity"], {"views": 0, "correct": 0})
        group["views"] += 1
        group["correct"] += int(correct(row))
    return {
        "genuine_photo_count": len(groups), "genuine_views": len(genuine),
        "genuine_correct": sum(map(correct, genuine)), "per_photo": groups,
        "threshold": threshold, "threshold_views": len(eligible),
        "threshold_correct": sum(map(correct, eligible)),
        "errors": [row for row in genuine if not correct(row)],
        "controls": controls, "initialize_ms": result["initialize_ms"],
        "mean_preprocess_ms": statistics.mean(row["preprocess_ms"] for row in rows),
        "mean_inference_ms": statistics.mean(row["inference_ms"] for row in rows),
        "maximum_inference_ms": max(row["inference_ms"] for row in rows),
    }


def main():
    check = sys.argv[1:] == ["--check"]
    assert check or not sys.argv[1:]
    hashes = {}
    packet = json.loads(PACKET.read_bytes()) if check else None

    def bind(name, expected=None):
        path = (ROOT / name).resolve()
        path.relative_to(ROOT)
        assert not path.name.startswith(".env")
        if expected and (not path.is_file() or sha(path) != expected):
            path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
        assert expected is None or digest == expected, name
        hashes[name] = digest
        return path

    def load(name):
        expected = packet["evidence_sha256"][name] if packet else None
        return json.loads(bind(name, expected).read_bytes())

    if check:
        for name, expected in packet["evidence_sha256"].items():
            bind(name, expected)
    else:
        assert not PACKET.exists()
    plan = load(BASE + "/plan.json")
    output = load(BASE + "/output.json")
    control = load(BASE + "/controller.json")
    memory = load("receipt_training/evaluation/runs/document-orientation-pilot-v1/owned-memory.json")
    exits = load(BASE + "/process-exit-check.json")
    assert plan["recorded_before_inference"] and len(plan["cases"]) == 5
    assert output["calls"] == len(output["observations"]) == plan["maximum_calls"] == 26
    assert output["plan_sha256"] == control["plan_sha256"] == hashes[BASE + "/plan.json"]
    assert control["spawned"] and control["exit_code"] == control["observer_exit_code"] == 0
    assert "error" not in control and not memory["errors"]
    assert control["initial_available_ram"] >= plan["limits"]["startup_ram_bytes"] == 2684354560
    assert control["minimum_available_ram"] >= plan["limits"]["runtime_ram_floor_bytes"] == 1073741824
    assert control["elapsed_seconds"] < plan["limits"]["deadline_seconds"] == 60
    assert not exits["same_identity_still_running"] and not exits["inspection_errors"]
    assert output["receipt_uploads"] == output["model_downloads_during_inference"] == 0
    for name, expected in plan["input_sha256"].items():
        bind(name, expected)
    summary = summarize(output, plan["threshold_for_descriptive_coverage_only"])
    assert summary["genuine_views"] == 20 and summary["genuine_correct"] == 15
    assert summary["threshold_views"] == 15 and summary["threshold_correct"] == 14
    if check:
        assert packet["summary"] == summary
        print(json.dumps({"verified_files": len(hashes), "summary_reproduced": True, "new_inference": 0}))
        return
    for folder in (BASE, "qa-artifacts/document-orientation-model-v1"):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file():
                bind(path.relative_to(ROOT).as_posix())
    assert control["controller_sha256"] == hashes[BASE + "/run.py"]
    for name in ("DOCUMENT_ORIENTATION_PILOT.md", "GOAL_ACCEPTANCE_AUDIT.md", "ADVANCED_OCR_REPORT.md"):
        bind("receipt_training/evaluation/" + name)
    bind("receipt_training/scripts/build_document_orientation_report.py")
    packet = {
        "recorded_at": datetime.now(timezone.utc).isoformat(),
        "parent_commit": plan["parent_commit"], "summary": summary,
        "model_bytes": (ROOT / plan["model_path"]).stat().st_size,
        "model_revision": plan["model_revision"], "memory": memory,
        "decision": "Reject automatic rotation and app integration from this pilot: five wrong views, including one above the frozen 0.9 threshold.",
        "scope": "Five familiar photos from four transactions, transformed into twenty quarter-turn views. Four synthetic text views and two blank/dark controls are separate. No receipt OCR, field-score improvement, held-out accuracy or physical-phone claim.",
        "new_orientation_inferences": 26, "new_receipt_ocr_inferences": 0,
        "private_uploads": 0, "evidence_sha256": hashes,
    }
    with PACKET.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"bound_files": len(hashes), "correct_views": 15, "genuine_views": 20, "new_inference_during_report": 0}))


if __name__ == "__main__":
    main()
