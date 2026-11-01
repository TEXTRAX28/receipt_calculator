"""Evaluate sealed same-pixel prompt pairs, including negative promotion evidence."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUN = ROOT / "qa-artifacts/row-first-pilot-v1"
OUT = DATA / "evaluation/advanced-row-first-pilot-v2.json"
CAPTURE = ROOT / "qa-artifacts/row-first-pilot-summary-v2"
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
    return [json.loads(line) for line in remember(path).read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve published evidence; use --check"
    plan = load(RUN / "plan.json")
    execution = load(RUN / "execution.json")
    assert execution["source_unchanged"] and execution["native_requests"] == len(execution["calls"]) == 4
    assert execution["cloud_requests"] == execution["automatic_retries"] == 0
    assert all(call["accepted"] for call in execution["calls"])
    for path, expected in plan["input_sha256"].items():
        remember(ROOT / path, expected)
    for path, expected in plan["source_sha256"].items():
        remember(RUN / "source" / path, expected)
    rows = lines(RUN / "postprocess/predictions.jsonl")
    assert len(rows) == 8
    config = load(DATA / "evaluation/config.json")
    labels = {row["receipt_id"]: row for row in lines(DATA / "annotations/private/priced-rows-v4-labels.jsonl")}
    labels.update({row["receipt_id"]: row for row in lines(DATA / "annotations/private/supplement-labels.jsonl")})
    cases = {row["id"]: row for row in plan["cases"]}
    scores, sums, regressions = [], {}, []
    fields = ("matched_items", "description_correct", "quantity_correct", "unit_price_correct",
              "item_price_correct", "item_discount_correct", "receipt_discount_correct", "subtotal_correct",
              "tax_correct", "total_correct", "receipt_fee_correct", "rounding_correct", "price_basis_correct")
    for row in rows:
        result = score_with_adjustments(cases[row["receipt_id"]]["record"], labels[row["receipt_id"]], row, config)
        scores.append({"receipt_id": row["receipt_id"], "variant": row["variant"], "mode": row["mode"],
                       "counts": result["counts"], "errors": result["errors"]})
    for mode in ("auto", "selected-context"):
        sums[mode] = {}
        for variant in ("control", "candidate"):
            counts = sum((Counter(row["counts"]) for row in scores if row["mode"] == mode and row["variant"] == variant), Counter())
            sums[mode][variant] = dict(counts)
        for name in cases:
            before = next(row["counts"] for row in scores if row["receipt_id"] == name and row["mode"] == mode and row["variant"] == "control")
            after = next(row["counts"] for row in scores if row["receipt_id"] == name and row["mode"] == mode and row["variant"] == "candidate")
            for field in fields:
                if after.get(field, 0) < before.get(field, 0):
                    regressions.append({"receipt_id": name, "mode": mode, "field": field,
                                        "control": before.get(field, 0), "candidate": after.get(field, 0)})
    price_gain = all(sums[mode]["candidate"].get("item_price_correct", 0) > sums[mode]["control"].get("item_price_correct", 0) for mode in sums)
    accepted = price_gain and not regressions
    for file in sorted(RUN.rglob("*")):
        if file.is_file(): remember(file)
    native = []
    for request in plan["requests"]:
        path = ROOT / "qa-artifacts/advanced-ocr" / request["native_run"]
        meta = load(path / "metadata.json")
        assert meta["request_sha256"] == request["sha256"]
        assert meta["external_api_requests"] == meta["external_receipt_uploads"] == 0
        assert meta["exit_code"] == 0 and meta["parsed_json"] and not meta["decoder_schema_warning"]
        for file in sorted(path.rglob("*")):
            if file.is_file(): remember(file)
        native.append({"receipt_id": request["id"], "variant": request["variant"],
                       "elapsed_ms": meta["elapsed_ms"], "peak_process_working_set_bytes": meta["peak_process_working_set_bytes"]})
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name
        with target.open("xb") as output: output.write(source.read_bytes())
        remember(target)
    report = {"scope": plan["scope"], "decision": "Promising pilot; broader native regression required before any app change" if accepted else "Rejected; no app change",
        "promotion_gate": plan["promotion_gate"], "price_improves_in_both_contexts": price_gain,
        "known_field_regressions": regressions, "counts_by_context": sums, "case_scores": scores,
        "native_calls": native, "independent_transactions": 2, "native_requests": 4,
        "postprocessing_views": 8, "cloud_requests": 0, "automatic_retries": 0,
        "api_cost": "0", "compute_cost": None,
        "limits": "Two already inspected development transactions, not a blind holdout or the full fifty. The context view supplies currency only after extraction. Unknown/faint fields remain excluded; copied totals do not establish calculated financial correctness. Frozen real verifier/calculator uses the same independent saved OCR for each pair. CLI times include model load/encoding/generation, exclude preparation/setup/validation and have cache/order/host effects; no speed ratio, p95 or handset claim. Process working set excludes GPU/browser/backend. No receipt values or source checks were repaired.",
        "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "decision": report["decision"],
                      "counts": sums, "known_field_regressions": regressions}))


if __name__ == "__main__":
    main()
