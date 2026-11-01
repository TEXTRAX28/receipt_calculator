"""Score every original receipt, retaining per-case regressions and exact inputs."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

from score import match_items
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUN = ROOT / "qa-artifacts/row-first-original50-v1"
OUT = DATA / "evaluation/advanced-row-first-original50-v1.json"
CAPTURE = ROOT / "qa-artifacts/row-first-original50-summary-v1"
HASHES = {}


def remember(path, expected=None):
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    name = path.relative_to(ROOT).as_posix()
    assert expected is None or digest == expected, name
    HASHES[name] = digest
    return path


def load(path):
    return json.loads(remember(path).read_text(encoding="utf-8"))


def lines(path):
    return [json.loads(row) for row in remember(path).read_text(encoding="utf-8").splitlines()]


def totals(rows):
    return dict(sum((Counter(row["counts"]) for row in rows), Counter()))


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve published evidence"
    plan, execution = load(RUN / "plan.json"), load(RUN / "execution.json")
    assert execution["source_unchanged"] and execution["native_requests"] == len(execution["calls"]) == 48
    assert execution["cloud_requests"] == execution["automatic_retries"] == 0
    assert len(plan["cases"]) == 50 and len({row["id"] for row in plan["cases"]}) == 50
    for name, expected in plan["input_sha256"].items():
        remember(ROOT / name, expected)
    for name, expected in plan["source_sha256"].items():
        remember(RUN / "source" / name, expected)
    rows = lines(RUN / "postprocess/predictions.jsonl")
    assert len(rows) == 200
    config = load(DATA / "evaluation/config.json")
    labels = {row["receipt_id"]: row for row in lines(DATA / "annotations/private/priced-rows-v4-labels.jsonl")}
    cases = {row["id"]: row for row in plan["cases"]}
    scores = []
    for row in rows:
        result = score_with_adjustments(cases[row["receipt_id"]]["record"], labels[row["receipt_id"]], row, config)
        scores.append({"variant": row["variant"], "mode": row["mode"], **result})
    groups = {}
    for split in ("all", "development", "evaluation"):
        groups[split] = {mode: {variant: totals([row for row in scores if
            row["mode"] == mode and row["variant"] == variant and (split == "all" or row["split"] == split)])
            for variant in ("control", "candidate")} for mode in ("auto", "selected-context")}
    changes, regressions = [], []
    count_fields = ("matched_items", "description_correct", "quantity_correct", "unit_price_correct",
        "item_price_correct", "item_discount_correct", "grouping_correct", "merchant_correct",
        "currency_correct", "subtotal_correct", "tax_correct", "total_correct", "receipt_discount_correct",
        "receipt_fee_correct", "rounding_correct", "price_basis_correct", "trusted_reconciliation_correct")
    for mode in ("auto", "selected-context"):
        for name, case in cases.items():
            before = next(row for row in scores if row["receipt_id"] == name and row["mode"] == mode and row["variant"] == "control")
            after = next(row for row in scores if row["receipt_id"] == name and row["mode"] == mode and row["variant"] == "candidate")
            delta = {field: [before["counts"].get(field, 0), after["counts"].get(field, 0)] for field in count_fields
                     if before["counts"].get(field, 0) != after["counts"].get(field, 0)}
            for field, values in delta.items():
                if values[1] < values[0]:
                    regressions.append({"receipt_id": name, "mode": mode, "field": field, "control": values[0], "candidate": values[1]})
            for field in ("missing_items", "unmatched_predictions", "extra_items_on_complete_labels", "processing_errors"):
                old, new = before["counts"].get(field, 0), after["counts"].get(field, 0)
                if old != new:
                    delta[field] = [old, new]
                if new > old:
                    regressions.append({"receipt_id": name, "mode": mode, "field": field, "control": old, "candidate": new})
            if delta:
                changes.append({"receipt_id": name, "split": case["record"]["split"], "mode": mode, "counts": delta})
    # Capture every changed matched item, including values with no truth coverage.
    item_changes = []
    for mode in ("auto", "selected-context"):
        for name in cases:
            expected = labels[name]["items"]
            pair = {variant: next(row for row in rows if row["receipt_id"] == name and row["mode"] == mode and row["variant"] == variant)["receipt"]
                    for variant in ("control", "candidate")}
            matches = {variant: match_items(expected, pair[variant]["items"], config["item_matching"]["minimum_similarity"])
                       for variant in pair}
            for i, truth in enumerate(expected):
                actual = {variant: pair[variant]["items"][matches[variant][i]] if i in matches[variant] else {} for variant in pair}
                delta = {field: [actual["control"].get(field), actual["candidate"].get(field)] for field in
                         ("description", "quantity", "unitPrice", "lineTotal", "discount", "taxCode")
                         if actual["control"].get(field) != actual["candidate"].get(field)}
                if delta:
                    item_changes.append({"receipt_id": name, "mode": mode, "truth_item_id": truth["id"],
                        "expected_description": truth["description"]["value"], "changes": delta,
                        "truth": {key: truth[key]["value"] for key in ("quantity", "unit_price", "line_total", "discount", "tax_code")}})
    for path in sorted(RUN.rglob("*")):
        if path.is_file():
            remember(path)
    native = []
    for request in plan["requests"]:
        folder = ROOT / "qa-artifacts/advanced-ocr" / request["native_run"]
        meta = load(folder / "metadata.json")
        assert meta["request_sha256"] == request["sha256"]
        assert meta["external_api_requests"] == meta["external_receipt_uploads"] == 0
        for path in sorted(folder.rglob("*")):
            if path.is_file():
                remember(path)
        native.append({"receipt_id": request["id"], "elapsed_ms": meta["elapsed_ms"],
            "exit_code": meta["exit_code"], "parsed_json": meta["parsed_json"],
            "peak_process_working_set_bytes": meta["peak_process_working_set_bytes"]})
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name
        target.write_bytes(source.read_bytes())
        remember(target)
    report = {"scope": plan["scope"], "promotion_gate": plan["promotion_gate"],
        "decision": "Full original-cohort comparison complete; inspect retained regressions before changing the app",
        "counts_by_split_and_context": groups, "case_count_changes": changes, "known_field_regressions": regressions,
        "changed_matched_item_values": item_changes, "case_scores": scores,
        "extension_native_calls": native, "independent_transactions": 50, "new_native_requests": 48,
        "retained_pilot_candidates": 2, "retained_controls": 50, "postprocessing_views": 200,
        "cloud_requests": 0, "automatic_retries": 0, "api_cost": "0", "compute_cost": None,
        "native_failures": sum(not row["accepted"] for row in execution["calls"]),
        "limits": "All fifty original transactions with unchanged 38-development/12-evaluation membership, already inspected and not blind. Forty-eight new candidate reads, two reused pilot candidates, fifty retained controls. Identical prepared pixels/model/prompt/generation settings except decoder item property and required-key order; successful old controls used the earlier wall limit. Model-output comparison with same frozen current independent verifier/OCR, not fifty fresh full workflows. Context supplies currency after extraction. Unknown/faint values remain excluded; copied totals are not calculated financial correctness. No speed ratio or mobile latency claim. No post-extraction amount repair or source-check removal.",
        "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    concise = {split: {mode: {variant: {field: counts.get(field, 0) for field in
        ("matched_items", "description_correct", "quantity_correct", "unit_price_correct", "item_price_correct", "total_correct", "tax_correct", "receipt_fee_correct", "unmatched_predictions")}
        for variant, counts in variants.items()} for mode, variants in modes.items()} for split, modes in groups.items()}
    print(json.dumps({"evidence_files": len(HASHES), "counts": concise, "regressions": regressions}))


if __name__ == "__main__":
    main()
