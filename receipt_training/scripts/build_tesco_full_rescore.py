"""Rescore unchanged predictions on v2 and one full-source Tesco row revision."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

from score import aggregate, score_one

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
QA = ROOT / "qa-artifacts/tesco-truth-review-v1"
OUT = DATA / "evaluation/advanced-tesco-full-rescore-v1.json"
EVIDENCE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    digest = sha(path)
    assert expected is None or expected == digest, "Evidence changed: " + str(path)
    EVIDENCE[path.relative_to(ROOT).as_posix()] = digest
    return path


def load(path, expected=None):
    return json.loads(remember(path, expected).read_text(encoding="utf-8"))


def lines(path, expected=None):
    return [json.loads(line) for line in remember(path, expected).read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in value["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "cohort": 50, "new_inference": 0}))
        return
    assert not OUT.exists(), "Preserve the report; use --check"
    truth = load(DATA / "evaluation/advanced-tesco-full-truth-v1.json")
    for name, expected in truth["evidence_sha256"].items():
        remember(ROOT / name, expected)
    old = {row["receipt_id"]: row for row in lines(DATA / "annotations/private/priced-rows-v2-labels.jsonl")}
    new = {row["receipt_id"]: row for row in lines(ROOT / truth["label_file"])}
    records = {row["receipt_id"]: row for row in lines(DATA / "manifest.jsonl")}
    config = load(DATA / "evaluation/config.json")
    assert old.keys() == new.keys()
    changed = [name for name in old if old[name] != new[name]]
    assert changed == ["tesco-gb-1994"]
    unchanged = lambda label: {k: v for k, v in label.items() if k not in ("items", "verification", "coverage", "review_flags")}
    assert unchanged(old[changed[0]]) == unchanged(new[changed[0]])
    assert not new[changed[0]]["coverage"]["financial_fields_complete"]
    assert new[changed[0]]["items"][0]["line_total"]["value"] is None

    def scores(rows, labels):
        result = aggregate([score_one(records[row["receipt_id"]], labels[row["receipt_id"]], row, config) for row in rows])
        result.pop("latency_ms", None)
        return result

    def paired(rows):
        assert len(rows) == 50 and len({row["receipt_id"] for row in rows}) == 50
        for row in rows:
            record = records[row["receipt_id"]]
            assert row["image_sha256"] == record["sha256"]
            remember(DATA / record["file_path"], record["sha256"])
        before, after = scores(rows, old), scores(rows, new)
        assert before["counts"]["complete_receipt_known"] == after["counts"]["complete_receipt_known"] == 0
        assert after["counts"]["expected_items"] - before["counts"]["expected_items"] == 10
        assert after["counts"]["item_price_known"] - before["counts"]["item_price_known"] == 9
        assert after["counts"]["quantity_known"] == before["counts"]["quantity_known"]
        case = next(row for row in rows if row["receipt_id"] == changed[0])
        return {"before_v2": before, "after_v3": after,
                "newly_scorable_tesco": score_one(records[changed[0]], new[changed[0]], case, config)}

    previous = load(DATA / "evaluation/advanced-priced-row-rescore-v2.json")
    historical = {}
    inventory = None
    for method, reference in previous["methods"].items():
        predictions = []
        for name in reference["frozen_runs"]:
            folder = DATA / "evaluation/runs" / name
            meta = load(folder / "metadata.json")
            remember(DATA / "evaluation/config.json", meta["config_sha256"])
            assert meta.get("source_unchanged") or meta.get("source_served_from_frozen_snapshot")
            for file, expected in meta["source_sha256"].items():
                remember(folder / "source" / file, expected)
            for file, expected in meta.get("runtime_source_sha256", {}).items():
                remember(folder / "runtime-source" / file, expected)
            if meta.get("evaluation_runner_sha256"):
                remember(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
            rows = lines(folder / "predictions.jsonl", meta["predictions_sha256"])
            assert all(records[row["receipt_id"]]["split"] == meta["split"] for row in rows)
            predictions.extend(rows)
        result = paired(predictions)
        assert result["before_v2"]["counts"] == reference["repaired_truth_counts"]
        ids = {row["receipt_id"] for row in predictions}
        assert inventory is None or inventory == ids
        inventory = ids
        historical[method] = result

    current = load(DATA / "evaluation/advanced-current-preparation-v1.json")
    file = ROOT / "qa-artifacts/current-preparation-summary-v1/predictions.jsonl"
    current_rows = lines(file, current["evidence_sha256"][file.relative_to(ROOT).as_posix()])
    current_modes = {}
    for mode in ("primary", "auto"):
        rows = [row for row in current_rows if row["mode"] == mode]
        assert {row["receipt_id"] for row in rows} == inventory
        current_modes[mode] = paired(rows)
        assert current_modes[mode]["before_v2"]["counts"] == current["mixed_original_50"]["priced_row_truth"][mode]["counts"]
    split_counts = dict(Counter(records[name]["split"] for name in inventory))
    assert split_counts == {"development": 38, "evaluation": 12}

    compact = load(DATA / "evaluation/advanced-compact-multiphoto-v1.json")
    diagnostic = {}
    for mode in ("canonical", "compact"):
        path = ROOT / f"qa-artifacts/compact-long-extension-v1/tesco-gb-1994-{mode}-hybrid.json"
        value = load(path, compact["evidence_sha256"][path.relative_to(ROOT).as_posix()])
        prediction = {**value, "elapsed_ms": None}
        diagnostic[mode] = score_one(records[changed[0]], new[changed[0]], prediction, config)

    log = remember(QA / "evaluation-tests.log").read_text(encoding="utf-8")
    assert "OK" in log and "FAILED" not in log
    for file in (Path(__file__), Path(__file__).with_name("test_tesco_truth.py"), Path(__file__).with_name("test_evaluation.py"), Path(__file__).with_name("score.py")):
        snapshot = QA / "source" / file.name
        snapshot.parent.mkdir(parents=True, exist_ok=True)
        with snapshot.open("xb") as destination:
            destination.write(file.read_bytes())
        remember(snapshot, sha(file))
    value = {
        "scope": "Annotation coverage repair only. Identical saved predictions are rescored against v2 and v3 labels on the original fifty financial transactions. No scanner/model change, fresh inference, new timing or cloud upload.",
        "cohort_size": 50, "counts_by_split": split_counts, "changed_truth_receipts": changed,
        "historical_frozen_pipelines": historical, "current_mixed_vintage": current_modes,
        "additional_same_pixel_tesco_native_trials": diagnostic,
        "annotation_limits": "Full original image checked by the assistant after previous output inspection; not independent human verification, fresh holdout or complete financial truth. Ten purchase groups and nine known payable line prices are newly scorable. First price, purchased quantities, unit prices, numeric reductions and tax basis remain unknown. Description numbers are not purchased quantities. Matching ignores prices; the two repeated purchases remain distinct.",
        "comparison_limits": "Historical pipelines differ in versions/preparation and retain their old observations. Current modes combine forty-four retained with six fresh receipts as documented separately. Label revisions are compared on identical predictions within each method; increases in scorable/correct counts are not model accuracy gains. No new full-cohort latency or provider ranking is claimed.",
        "complete_original_financial_truth_available": False, "new_extraction_calls": 0, "external_requests": 0,
        "evidence_sha256": EVIDENCE,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"methods": len(historical) + len(current_modes), "cohort": 50, "source_rows": 145,
                      "known_prices": 143, "evidence_files": len(EVIDENCE), "new_inference": 0}))


if __name__ == "__main__":
    main()
