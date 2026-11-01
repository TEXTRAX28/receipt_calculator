"""Seal source-expression parsing and independently checked unit-price proposals."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/separate-purchase-expressions-v3"
PROTOTYPES = ROOT / "qa-artifacts/separate-purchase-expressions-v1"
NATIVE = ROOT / "qa-artifacts/purchase-expression-native-phone-v2"
CAPTURE = ROOT / "qa-artifacts/purchase-expression-summary-v3"
OUT = ROOT / "receipt_training/evaluation/advanced-purchase-expressions-v3.json"
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def lines(path, expected=None):
    return list(map(json.loads, read(path, expected).decode("utf-8").splitlines()))


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            read(ROOT / name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_external_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve published evidence"
    meta = load(RUN / "replay/metadata.json")
    assert meta["unit_price_recovery_replay"] and meta["unrelated_financial_vectors_unchanged"]
    assert not meta["scalar_only_recovery_replay"]
    assert meta["predictions"] == meta["primary_predictions"] == 200
    assert meta["new_model_requests"] == meta["external_requests"] == 0
    for variant, sources in meta["source_sha256"].items():
        for name, expected in sources.items():
            read(RUN / variant / name, expected)
            if variant == "after":
                read(ROOT / name, expected)
    for variant, sources in meta["loaded_frozen_source_sha256"].items():
        for name, expected in sources.items():
            assert meta["source_sha256"][variant][name] == expected
    for name, expected in meta["input_sha256"].items():
        read(ROOT / name, expected)
    read(RUN / "replay/runner.mjs", meta["runner_sha256"])
    hybrid = lines(RUN / "replay/predictions.jsonl", meta["predictions_sha256"])
    primary = lines(RUN / "replay/primary-predictions.jsonl", meta["primary_predictions_sha256"])
    plan = load(ROOT / "qa-artifacts/row-first-original50-v1/plan.json")
    cases = {case["id"]: case["record"] for case in plan["cases"]}
    labels = {row["receipt_id"]: row for row in lines(ROOT / "receipt_training/annotations/private/priced-rows-v4-labels.jsonl")}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    scores = [{"method": method, "variant": row["variant"], "mode": row["mode"],
               **score_with_adjustments(cases[row["receipt_id"]], labels[row["receipt_id"]], row, config)}
              for method, rows in (("primary", primary), ("hybrid", hybrid)) for row in rows]
    totals = {split: {method: {mode: {variant: dict(sum((Counter(row["counts"]) for row in scores
        if row["method"] == method and row["mode"] == mode and row["variant"] == variant
        and (split == "all" or row["split"] == split)), Counter())) for variant in ("before", "after")}
        for mode in ("automatic", "known-currency")} for method in ("primary", "hybrid")}
        for split in ("all", "development", "evaluation")}
    regressions, changes = [], []
    for before in (row for row in scores if row["variant"] == "before"):
        after = next(row for row in scores if row["method"] == before["method"] and row["variant"] == "after" and row["receipt_id"] == before["receipt_id"] and row["mode"] == before["mode"])
        for field in set(before["counts"]) | set(after["counts"]):
            old, new = before["counts"].get(field, 0), after["counts"].get(field, 0)
            worse = (field.endswith("_correct") or field == "matched_items") and new < old
            worse |= field in ("missing_items", "extra_items_on_complete_labels", "unmatched_predictions", "processing_errors") and new > old
            if worse:
                regressions.append({"method": before["method"], "receipt_id": before["receipt_id"], "mode": before["mode"], "field": field, "before": old, "after": new})
    for after in (row for row in hybrid if row["variant"] == "after"):
        before = next(row for row in hybrid if row["variant"] == "before" and row["receipt_id"] == after["receipt_id"] and row["mode"] == after["mode"])
        for index, item in enumerate(after["receipt"]["items"]):
            for field, collection in (("unitPrice", "unitRecoveries"), ("lineTotal", "priceRecoveries")):
                previous = before["receipt"]["items"][index][field]
                if item[field] == previous:
                    continue
                proof = next(row["evidence"] for row in after[collection] if row["itemId"] == item["id"])
                assert proof["previous"] == previous and proof["word"]["confidence"] >= 0.98
                check = next(check for check in after["receipt"]["reviewChecks"] if check["scope"] == "item" and check["itemId"] == item["id"] and check["field"] == field)
                assert check["reason"] == "recovered" and check["confirmedValue"] == ""
                changes.append({"receipt_id": after["receipt_id"], "mode": after["mode"], "field": field, "previous": previous,
                    "proposed": item[field], "literal": proof["literal"], "word_confidence": proof["word"]["confidence"]})
    for after in (row for row in scores if row["method"] == "hybrid" and row["variant"] == "after"):
        before = next(row for row in scores if row["method"] == "hybrid" and row["variant"] == "before" and row["receipt_id"] == after["receipt_id"] and row["mode"] == after["mode"])
        for field, metric in (("unitPrice", "unit_price_correct"), ("lineTotal", "item_price_correct")):
            changed = sum(row["receipt_id"] == after["receipt_id"] and row["mode"] == after["mode"] and row["field"] == field for row in changes)
            assert after["counts"].get(metric, 0) - before["counts"].get(metric, 0) == changed, "A changed field is not a correct known-field gain"
    native = load(NATIVE / "execution.json")
    assert native["exit_code"] == 0 and native["source_unchanged"] and native["checks_separate_expressions"]
    assert native["external_uploads"] == native["retries"] == 0
    ui = load(NATIVE / "ui/result.json")
    assert ui["external_requests"] == 0 and not ui["blocked"] and not ui["financial_fields_edited"]
    assert 0 < len(ui["unitRecoveries"]) <= 2 and len(ui["reviewed"]) == 2
    assert all(item["unitPrice"] == item["lineTotal"] == "22000" and item["quantity"] == "1" for item in ui["reviewed"])
    assert ui["posts"] == ["/api/receipts/recognize", "/api/receipts/vision"]
    for item in sorted(NATIVE.rglob("*")):
        if item.is_file(): read(item)
    prototype = PROTOTYPES / "prototype-v1"
    hashes = load(prototype / "source-sha256.json")
    for name, expected in hashes.items(): read(prototype / name, expected)
    failure = load(prototype / "unit.json")
    assert not failure["success"] and failure["numFailedTests"] == 4
    read(prototype / "unit.log")
    label_prototype = PROTOTYPES / "label-prototype-v1"
    for name, expected in load(label_prototype / "source-sha256.json").items(): read(label_prototype / name, expected)
    label_failure = load(label_prototype / "unit.json")
    assert not label_failure["success"] and label_failure["numFailedTests"] == 10
    read(label_prototype / "unit.log")
    earlier_native = ROOT / "qa-artifacts/purchase-expression-native-phone-v1"
    earlier = load(earlier_native / "execution.json")
    assert earlier["exit_code"] == 0 and earlier["source_unchanged"] and earlier["external_uploads"] == 0
    for item in sorted(earlier_native.rglob("*")):
        if item.is_file(): read(item)
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name; target.write_bytes(source.read_bytes()); read(target)
    detail = CAPTURE / "detail-scores.json"
    detail.write_text(json.dumps(scores, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"); read(detail)
    result = {"scope": "Isolated source-expression parser and literal unit-price recovery on the original fifty retained image readings. Four hundred primary/hybrid/context/before-after views are not new receipt samples. No replay inference or external calls.",
        "original_fifty_counts": totals, "known_field_regressions": regressions, "changes": changes,
        "original_transactions": 50, "replay_views": 400, "unchanged_hybrid_financial_vector_scope": meta["unchanged_financial_vector_scope"],
        "original_split_membership": "38 development / 12 evaluation, unchanged and already inspected; not a blind holdout",
        "every_proposal_requires_review": True, "new_replay_model_requests": 0, "new_external_requests": 0,
        "every_changed_hybrid_field_matches_existing_known_truth": True,
        "native_phone_observations": [{"run": path.name, "exit_code": observed["exit_code"], "started_at": observed["started_at"], "completed_at": observed["completed_at"]} for path, observed in ((earlier_native, earlier), (NATIVE, native))],
        "successful_native_scan_to_review_ms": ui["elapsed_ms"], "native_unit_recoveries": len(ui["unitRecoveries"]),
        "limits": ["The parser proposes literal quantity/unit/total roles from complete printed expressions and adjacent labels. It uses number format, currency marks and operator binding, never multiplication/division or bill balance. Ambiguous roles/ownership stay under a blocking coverage check. Description and quantity source checks survive reader agreement.",
            "Only nonempty invalid model unit prices are replaced. Exact row/word character alignment, the actual unit word's confidence >=0.98, matching identity/photo/quantity and resolved matching currency are required. A copied source price is not independent agreement. Valid or missing amounts, ambiguous signs, weak unit words, different currencies and unlabelled numeric columns remain unresolved.",
            "All changed hybrid fields are source proposals; purchase identity/quantity/discount, receipt metadata, tax basis/codes and charges remain unchanged. Most gains require explicit currency after extraction. Original models, pixels, source labels and split membership are unchanged; all fifty complete financial results remain unscorable.",
            "The initial prototype reversed some quantity/unit roles and allowed unmatched expression text to fall through as product names. Its four failing tests and exact prototype sources are retained. The corrected parser never uses a total equation to choose roles.",
            "A later review reproduced ten label/title failures. Final guards exclude financial markers, preserve genuine titles that begin with summary-like words, and retain footer boundaries. Both passing native observations are the same source-inspected development receipt, not independent accuracy samples.",
            "Native timing is one development observation on Chrome phone emulation, not a p95, physical handset, speed comparison, blind holdout, complete bill or paid-cloud result. Remaining header, bag-code, tax-basis and coverage errors keep confirmation blocked.",
            "No Azure app integration, provider/default change, private external upload, paid activation or new model download occurs."],
        "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as output: output.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"verified_files": len(HASHES), "changed_hybrid_fields": len(changes), "regressions": regressions,
        "hybrid_prices": {mode: {v: totals["all"]["hybrid"][mode][v]["item_price_correct"] for v in ("before", "after")} for mode in ("automatic", "known-currency")},
        "native_unit_recoveries": len(ui["unitRecoveries"]), "new_external_requests": 0}))


if __name__ == "__main__": main()
