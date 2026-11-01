"""Score one fully fresh original-50 local run, retaining failed model attempts."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import statistics
import sys

from score import aggregate, score_one

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUN = DATA / "evaluation/runs/current-native-original50-v1"
CAPTURE = ROOT / "qa-artifacts/current-native-original50-summary-v1"
OUT = DATA / "evaluation/advanced-current-native-original50-v1.json"
EVIDENCE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    name = path.resolve().relative_to(ROOT).as_posix()
    actual = sha(path)
    assert expected is None or expected == actual, "Evidence changed: " + name
    assert not path.name.startswith(".env")
    EVIDENCE[name] = actual
    return path


def load(path, expected=None):
    return json.loads(remember(path, expected).read_text(encoding="utf-8"))


def lines(path):
    return [json.loads(line) for line in remember(path).read_text(encoding="utf-8").splitlines()]


def timing(values):
    values = sorted(values)
    return {"samples": len(values), "mean": statistics.mean(values) if values else None,
            "median": statistics.median(values) if values else None,
            "p95_nearest_rank": values[(95 * len(values) + 99) // 100 - 1] if values else None,
            "min": min(values) if values else None, "max": max(values) if values else None}


def main():
    if "--check" in sys.argv:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "fresh_original_receipts": 50, "cloud_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve the report; use --check"
    assert (RUN / "metadata.json").exists(), "The fifty-case native run has not finished"
    meta, plan = load(RUN / "metadata.json"), load(RUN / "plan.json")
    assert meta["source_unchanged"] and meta["completed_at"]
    assert meta["source_sha256"] == plan["source_sha256"]
    assert meta["records"] == plan["records"] and len(meta["cases"]) == len(plan["records"]) == 50
    assert meta["cloud_requests"] == meta["automatic_retries"] == 0 and not meta["label_files_read"]
    records = {row["receipt_id"]: row for row in plan["records"]}
    assert len(records) == len({row["group_id"] for row in records.values()}) == 50
    assert Counter(row["split"] for row in records.values()) == {"development": 38, "evaluation": 12}
    for name, expected in plan["source_sha256"].items():
        remember(RUN / "source" / name, expected)
    for row in records.values():
        remember(DATA / row["file_path"], row["sha256"])
        assert row["external_processing_allowed"] is False
    config = load(DATA / "evaluation/config.json")
    truth = {name: {row["receipt_id"]: row for row in lines(DATA / path)} for name, path in (
        ("original", "annotations/labels.jsonl"),
        ("priced_rows_v2", "annotations/private/priced-rows-v2-labels.jsonl"),
        ("priced_rows_v3", "annotations/private/priced-rows-v3-labels.jsonl"))}
    rows, cases = [], []
    for index, summary in enumerate(meta["cases"], 1):
        name = summary["receipt_id"]
        assert name in records and name == plan["records"][index - 1]["receipt_id"]
        remember(RUN / f"case-summary-{index:02}.json")
        folder = RUN / name
        item = load(folder / "metadata.json", summary["metadata_sha256"])
        assert item["image_sha256"] == records[name]["sha256"] and item["split"] == records[name]["split"]
        assert not item["blocked_requests"] and item["cloud_requests"] == item["automatic_retries"] == 0
        paths = [packet["path"] for packet in item["http"]]
        assert paths in ([], ["/api/receipts/recognize"], ["/api/receipts/recognize", "/api/receipts/vision"])
        if len(item["http"]) == 2:
            assert item["http"][0]["request_sha256"] == item["http"][1]["request_sha256"]
        for packet in item["http"]:
            file = "ocr-response.json" if packet["path"].endswith("recognize") else "vision-response.json"
            remember(folder / file, packet["response_sha256"])
        for source, expected in item["loaded_frozen_source_sha256"].items():
            assert plan["source_sha256"][source] == expected
        value = load(folder / "result.json") if (folder / "result.json").exists() else None
        if value:
            assert value["cached_reads"] == item["primary_reference_saved_response_reads"] == 1
            for panel_index, panel in enumerate(value["panels"], 1):
                assert panel["width"] * panel["height"] <= 4_000_000 and max(panel["width"], panel["height"]) <= 3200
                remember(folder / f"panel-{panel_index}.jpg", panel["sha256"])
            if value["comparison_complete"]:
                assert value["comparison_attempted"] and [packet["status"] for packet in item["http"]] == [200, 200]
                outcome = "completed_independent_comparison"
            elif value["comparison_attempted"]:
                outcome = "incomplete_comparison_primary_draft_preserved"
                assert value["auto"]["calculation"]["issues"]
            else:
                outcome = "automatic_vision_skip_source_review_required"
                assert not value["decision"]["needed"]
        else:
            outcome = "input_or_pipeline_error"
        for mode in ("primary", "auto"):
            prediction = {"receipt_id": name, "image_sha256": records[name]["sha256"],
                "split": records[name]["split"], "mode": mode,
                "elapsed_ms": summary["worker_wall_ms"],
                "pipeline_elapsed_ms": item.get("elapsed_ms"),
                "timing_scope": "One shared owned-worker lifetime for both scoring views, including startup, native calls, saved-response primary reference and teardown. Not primary-only inference latency.",
                "outcome": outcome}
            if value:
                prediction.update(value[mode])
            else:
                prediction["error"] = "input-or-pipeline-error"
            rows.append(prediction)
        cases.append({"receipt_id": name, "split": records[name]["split"], "outcome": outcome,
            "http_statuses": [packet["status"] for packet in item["http"]],
            "worker_wall_ms": summary["worker_wall_ms"], "pipeline_elapsed_ms": item.get("elapsed_ms"),
            "native_vision_ms": [process["elapsed_ms"] for process in item["native_processes"] if process["stage"] == "vision-inference" and "elapsed_ms" in process]})
        for path in sorted(folder.rglob("*")):
            if path.is_file(): remember(path)
    assert len({case["receipt_id"] for case in cases}) == 50
    CAPTURE.mkdir()
    prediction_file = CAPTURE / "predictions.jsonl"
    with prediction_file.open("x", encoding="utf-8", newline="\n") as output:
        output.write("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    remember(prediction_file)
    scores = {}
    for revision, labels in truth.items():
        scores[revision] = {}
        for mode in ("primary", "auto"):
            selected = [row for row in rows if row["mode"] == mode]
            result = aggregate([score_one(records[row["receipt_id"]], labels[row["receipt_id"]], row, config) for row in selected])
            result.pop("latency_ms")
            assert result["counts"]["samples"] == result["counts"]["complete_receipt_unscorable"] == 50
            assert result["counts"]["complete_receipt_known"] == 0
            scores[revision][mode] = result
    for path in (Path(__file__), Path(__file__).with_name("score.py")):
        copy = CAPTURE / path.name
        with copy.open("xb") as output: output.write(path.read_bytes())
        remember(copy, sha(path))
    outcomes = dict(Counter(case["outcome"] for case in cases))
    value = {"scope": "One fully fresh current-preparation/current-orchestration native run on all fifty original financial receipts. No retained model response substitutes for a new case. Primary-only scoring reuses each same successful fresh OCR response through the real primary parser; it is not a second model call or separately timed primary workflow.",
        "original_receipts": 50, "counts_by_split": {"development": 38, "evaluation": 12},
        "outcomes": outcomes, "cases": cases, "known_field_scores": scores,
        "worker_lifetime_ms_all_50": timing([case["worker_wall_ms"] for case in cases]),
        "preparation_through_draft_ms_where_returned": timing([case["pipeline_elapsed_ms"] for case in cases if case["pipeline_elapsed_ms"] is not None]),
        "timing_limits": "Worker lifetime includes fresh Node/Vite/Chrome startup, reader/asset setup, native extraction, observation, cached-response primary reference and teardown. The preparation timer excludes that host startup/reference/teardown and includes comparison failures returning a safe primary draft. Conditional timer coverage is shown explicitly. One serial laptop run, existing OS/GPU caches and host load; not physical-phone timing, shared-server throughput, isolated model ablation or a controlled before/after speed ratio. API instances keep 2/minute and 10/hour limits per case.",
        "selection_limits": "Original already inspected development/evaluation data, not a new untouched holdout. Original, v2 and v3 annotations are all scored separately on identical new predictions. Unknown fields stay excluded; original complete financial accuracy remains unscorable. Item/total agreement does not establish financial correctness or clear source checks.",
        "no_labels_or_currency_hints_in_inference": True, "new_cloud_requests": 0, "automatic_retries": 0,
        "api_cost": "0", "compute_cost": None, "source_unchanged_during_run": True,
        "evidence_sha256": EVIDENCE}
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"fresh_receipts": 50, "outcomes": outcomes, "evidence_files": len(EVIDENCE), "cloud_requests": 0}))


if __name__ == "__main__":
    main()
