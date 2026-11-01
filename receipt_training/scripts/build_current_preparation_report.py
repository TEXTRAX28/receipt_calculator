"""Verify six fresh native reruns and a clearly mixed-vintage original-50 rescore."""
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import statistics
import sys

from score import aggregate, score_one

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUNS = DATA / "evaluation/runs"
OUT = DATA / "evaluation/advanced-current-preparation-v1.json"
CAPTURE = ROOT / "qa-artifacts/current-preparation-summary-v1"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def lines(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            assert sha(ROOT / name) == expected, "Evidence changed: " + name
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "fresh_receipts": 6, "cloud_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the report; use --check"
    CAPTURE.mkdir()
    evidence = {}

    def remember(path, expected=None):
        path = path.resolve()
        name = path.relative_to(ROOT).as_posix()
        assert not path.name.startswith(".env")
        actual = sha(path)
        assert expected is None or actual == expected, "Changed evidence: " + name
        evidence[name] = actual
        return path

    def load(path, expected=None):
        return json.loads(remember(path, expected).read_text(encoding="utf-8"))

    config = load(DATA / "evaluation/config.json")
    manifest = {row["receipt_id"]: row for row in lines(remember(DATA / "manifest.jsonl"))}
    labels = {row["receipt_id"]: row for row in lines(remember(DATA / "annotations/private/priced-rows-v2-labels.jsonl"))}
    old_labels = {row["receipt_id"]: row for row in lines(remember(DATA / "annotations/labels.jsonl"))}
    prior = load(DATA / "evaluation/advanced-automatic-local-v1.json")
    replay = RUNS / "automatic-local-original-v3"
    old_meta = load(replay / "metadata.json")
    old = lines(remember(replay / "predictions.jsonl", old_meta["predictions_sha256"]))
    for path, expected in old_meta["source_sha256"].items():
        remember(replay / "source" / path, expected)
    for path, expected in old_meta["input_sha256"].items():
        remember(ROOT / path, expected)
    remember(replay / "evaluate.mjs", old_meta["evaluation_runner_sha256"])
    fresh = RUNS / "current-preparation-six-v1"
    meta = load(fresh / "metadata.json")
    plan = load(fresh / "plan.json")
    assert meta["source_unchanged"] and meta["completed_at"]
    assert len(meta["cases"]) == len(plan["records"]) == 6
    assert set(row["receipt_id"] for row in plan["records"]) == set(prior["original_50"]["current_transport_rejected_ids"])
    assert meta["cloud_requests"] == meta["automatic_retries"] == 0
    for path, expected in plan["source_sha256"].items():
        remember(fresh / "source" / path, expected)
    for path, expected in old_meta["source_sha256"].items():
        assert plan["source_sha256"]["src/lib/" + path] == expected
    cases, rows = [], []
    for case in meta["cases"]:
        receipt_id = case["receipt_id"]
        assert case["exit_code"] == 0 and case["comparison_complete"] and not case["error"]
        folder = fresh / receipt_id
        item = load(folder / "metadata.json", case["metadata_sha256"])
        result = load(folder / "result.json")
        assert not item["blocked_requests"] and item["primary_reference_saved_response_reads"] == 1
        assert result["comparison_complete"] and result["comparison_attempted"] and result["decision"]["needed"]
        assert [row["path"] for row in item["http"]] == ["/api/receipts/recognize", "/api/receipts/vision"]
        assert [row["status"] for row in item["http"]] == [200, 200]
        assert item["http"][0]["request_sha256"] == item["http"][1]["request_sha256"]
        for entry, file in zip(item["http"], ("ocr-response.json", "vision-response.json")):
            remember(folder / file, entry["response_sha256"])
        for path, expected in item["loaded_frozen_source_sha256"].items():
            assert plan["source_sha256"][path] == expected
        for index, panel in enumerate(item["panels"]):
            assert panel["width"] * panel["height"] <= 4_000_000
            remember(folder / f"panel-{index + 1}.jpg", panel["sha256"])
        assert [(p["width"], p["height"]) for p in item["panels"]] == [(1500, 2666)]
        for mode in ("primary", "auto"):
            rows.append({"receipt_id": receipt_id, "image_sha256": item["image_sha256"], "split": item["split"],
                         "mode": mode, "elapsed_ms": result["elapsed_ms"], **result[mode],
                         "evidence_origin": "fresh current-preparation native comparison"})
        assert result["auto"]["calculation"]["issues"], "No inferred draft is silently accepted"
        # A primary worker is deliberately stopped before vision; its process
        # exit status must not replace the successful recognition HTTP status.
        processes = item["native_processes"]
        assert all(p["exit_code"] == 0 for p in processes if p["stage"] != "primary-worker")
        cases.append({"receipt_id": receipt_id, "split": item["split"], "panels": item["panels"],
                      "whole_pipeline_ms": item["elapsed_ms"], "preparation_ms": item["preparation_ms"],
                      "stages": [{k: p.get(k) for k in ("stage", "elapsed_ms", "exit_code", "stdout_bytes")} for p in processes]})
        for path in folder.rglob("*"):
            if path.is_file(): remember(path)
    fresh_ids = {row["receipt_id"] for row in rows}
    retained = [dict(row, evidence_origin="retained saved-response orchestration") for row in old
                if row["receipt_id"] not in fresh_ids and row["mode"] in ("primary", "auto")]
    assert len(retained) == 88 and not any("error" in row for row in retained)
    mixed = retained + rows
    assert len(mixed) == 100 and len({row["receipt_id"] for row in mixed}) == 50
    for row in mixed:
        record = manifest[row["receipt_id"]]
        assert row["image_sha256"] == record["sha256"] and row["split"] == record["split"]
        remember(DATA / record["file_path"], record["sha256"])
    merged_file = CAPTURE / "predictions.jsonl"
    merged_file.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in mixed), encoding="utf-8", newline="\n")
    remember(merged_file)

    def scores(predictions, truth):
        result = aggregate([score_one(manifest[row["receipt_id"]], truth[row["receipt_id"]], row, config) for row in predictions])
        result.pop("latency_ms")
        return result

    def modes(predictions, truth):
        return {mode: scores([row for row in predictions if row["mode"] == mode], truth) for mode in ("primary", "auto")}

    for name in ("score.py", "build_current_preparation_report.py"):
        remember(Path(__file__).with_name(name))
    # All experiments bind their exact snapshots; no current .env or model bytes.
    report = {"scope": "Six fresh current-preparation native comparisons close six historical pixel-limit failures. Original-50 field totals combine those six with 44 unchanged saved-response results. This is not a newly inferred full cohort or a new 50-receipt latency benchmark.",
              "fresh_native": {"cases": cases, "receipts": 6, "local_http_requests": 12, "native_vision_successes": 6,
                               "new_ocr_calls": 6, "saved_primary_reference_reads": 6, "known_field_scores": modes(rows, labels),
                               "min_pipeline_ms": min(c["whole_pipeline_ms"] for c in cases),
                               "max_pipeline_ms": max(c["whole_pipeline_ms"] for c in cases),
                               "median_pipeline_ms": statistics.median(c["whole_pipeline_ms"] for c in cases),
                               "timing_limits": "Each case uses fresh reader/API instances under unmodified 2/minute and 10/hour quotas; at most two POSTs per instance. Native model loading/asset checks and observation overhead included; OS/GPU caches and host load vary. Not shared-server throughput, cold hardware, physical phone, or full-cohort p95."},
              "mixed_original_50": {"retained_receipts": 44, "fresh_receipts": 6,
                                    "split_counts": dict(Counter(manifest[row["receipt_id"]]["split"] for row in mixed if row["mode"] == "auto")),
                                    "priced_row_truth": modes(mixed, labels), "original_truth": modes(mixed, old_labels),
                                    "current_pixel_gate_errors": 0, "new_latency_p95": None,
                                    "source_limits": "Same original 50 transactions and label versions; already inspected development/evaluation data, not a fresh holdout. Six images/recognitions/vision outputs are newly prepared/inferred; all other observations retain their historical model evidence. Unknown fields remain excluded; complete original financial truth remains unscorable."},
              "unchanged_runtime": True, "guard_was_weakened": False, "cloud_requests": 0, "api_cost": "0", "compute_cost": None,
              "complete_original_financial_truth_available": False,
              "remaining_work": "Long two-photo vision reliability, field extraction/recovery errors and locale context, complete financial truth, genuine digital/refund coverage, physical devices and public-backend controls remain open. Old thirteen historical artifact gaps remain disclosed.",
              "evidence_sha256": evidence}
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"fresh_receipts": 6, "local_http_requests": 12, "mixed_original": 50, "current_pixel_errors": 0,
                      "evidence_files": len(evidence), "cloud_requests": 0}))


if __name__ == "__main__":
    main()
