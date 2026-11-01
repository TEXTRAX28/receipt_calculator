"""Source-covered quantity change and unchanged copied monetary evidence."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUN = ROOT / "qa-artifacts/leading-quantity-current-replay-v2"
OUT = DATA / "evaluation/advanced-leading-quantity-v1.json"
CAPTURE = ROOT / "qa-artifacts/leading-quantity-summary-v1"
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
    meta = load(RUN / "metadata.json")
    assert meta["records"] == 51 and meta["predictions"] == 408 and meta["paired_reader_contexts"] == 204
    assert meta["financial_vectors_unchanged"] and meta["explicit_leading_count_checks_preserved"]
    assert meta["new_model_requests"] == meta["cloud_requests"] == 0 and not meta["label_files_read"]
    for name, expected in meta["input_sha256"].items():
        remember(ROOT / name, expected)
    records = {row["receipt_id"]: row for row in load(DATA / "evaluation/runs/current-native-original50-v1/plan.json")["records"]}
    original = set(records)
    records.update({row["receipt_id"]: row for row in lines(DATA / "annotations/private/supplement-manifest.jsonl")})
    labels = {row["receipt_id"]: row for row in lines(DATA / "annotations/private/priced-rows-v4-labels.jsonl")}
    labels.update({row["receipt_id"]: row for row in lines(DATA / "annotations/private/supplement-labels.jsonl")})
    config = load(DATA / "evaluation/config.json")
    predictions = lines(RUN / "predictions.jsonl")
    scored = [{**{key: row[key] for key in ("receipt_id", "reader", "variant", "mode", "split")},
               **score_with_adjustments(records[row["receipt_id"]], labels[row["receipt_id"]], row, config)} for row in predictions]
    counts = {}
    for cohort in ("original", "supplement"):
        counts[cohort] = {}
        for reader in ("primary", "compared"):
            counts[cohort][reader] = {}
            for mode in ("auto", "selected-context"):
                counts[cohort][reader][mode] = {}
                for variant in ("control", "candidate"):
                    selected = [row for row in scored if row["reader"] == reader and row["variant"] == variant and row["mode"] == mode
                                and ((row["receipt_id"] in original) == (cohort == "original"))]
                    assert len(selected) == (50 if cohort == "original" else 1)
                    total = Counter()
                    for row in selected: total.update(row["counts"])
                    counts[cohort][reader][mode][variant] = dict(total)
                pair = counts[cohort][reader][mode]
                for field in ("item_price_correct", "unit_price_correct", "item_discount_correct", "receipt_discount_correct",
                              "total_correct", "tax_correct", "receipt_fee_correct", "rounding_correct", "price_basis_correct"):
                    assert pair["control"].get(field, 0) == pair["candidate"].get(field, 0), field
    auto = counts["original"]["primary"]["auto"]
    assert auto["control"]["quantity_correct"] == 6 and auto["candidate"]["quantity_correct"] == 22
    changes = []
    for before in [row for row in scored if row["reader"] == "primary" and row["variant"] == "control" and row["mode"] == "auto"]:
        after = next(row for row in scored if row["receipt_id"] == before["receipt_id"] and row["reader"] == "primary" and row["variant"] == "candidate" and row["mode"] == "auto")
        if before["counts"].get("quantity_correct", 0) != after["counts"].get("quantity_correct", 0):
            changes.append({"receipt_id": before["receipt_id"], "split": before["split"],
                            "control": before["counts"].get("quantity_correct", 0), "candidate": after["counts"].get("quantity_correct", 0)})
    assert changes == [{"receipt_id": "cord-v2-train-000", "split": "development", "control": 0, "candidate": 16}]
    for path in sorted(RUN.rglob("*")):
        if path.is_file(): remember(path)
    for name in ("advanced-literal-total-prompt-v1.json", "advanced-leading-quantity-validation-v1.json"):
        report = load(DATA / "evaluation" / name)
        for path, expected in report["evidence_sha256"].items(): remember(ROOT / path, expected)
    validation = ROOT / "qa-artifacts/leading-quantity-validation-v2"
    assert "505 passed" in (validation / "unit.log").read_text(encoding="utf-8")
    assert "built in" in (validation / "build.log").read_text(encoding="utf-8")
    browser = load(validation / "browser.json")
    assert browser["stats"]["expected"] == 167 and browser["stats"]["unexpected"] == 0 and browser["stats"]["skipped"] == 1
    for folder in (validation, ROOT / "qa-artifacts/leading-quantity-validation-v1", ROOT / "qa-artifacts/leading-quantity-probe-v1", ROOT / "qa-artifacts/leading-quantity-current-replay-v1"):
        for path in sorted(folder.rglob("*")):
            if path.is_file(): remember(path)
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name
        with target.open("xb") as output: output.write(source.read_bytes())
        remember(target)
    value = {
        "scope": meta["scope"], "counts_by_cohort_reader_context": counts, "quantity_gain_receipts": changes,
        "copied_unit_line_discount_tax_adjustment_vectors_unchanged": True,
        "leading_count_checks_survive_independent_agreement": True, "new_model_requests_in_replay": 0,
        "native_ui_repeats": 2, "unique_native_ui_receipts": 1, "cloud_requests": 0,
        "validation": {"unit_passes": 505, "browser_stats": browser["stats"], "real_native_ui_passes": 2,
                       "typecheck_build_format_graph": "passed", "configured_secret_matches": 0},
        "limits": "Sixteen additional quantities on one inspected development receipt, with no original evaluation gain and no model price gain. Pack ambiguity still requires human review. Unknown quantities elsewhere remain unknown. This is a deterministic parser/verifier comparison over saved evidence, not new full-cohort native inference or timed orchestration. Selected currency is post-extraction dataset context. Copied financial vectors exclude quantity; calculated totals can change when an empty quantity is filled, but source checks remain blocking. The two UI repeats use one source and identical prepared pixels; desktop Chrome emulation is not a physical phone. The clearer-prompt native experiment is independently rejected and no prompt/default-provider change is made.",
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "primary_known_quantities": {"before": 6, "after": 22, "known": 120}, "price_gain": 0, "cloud_requests": 0}))


if __name__ == "__main__":
    main()
