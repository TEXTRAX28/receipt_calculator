"""Seal same-reading receipt-level recovery and actual local workflow evidence."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/invalid-scalar-recovery-v2"
NATIVE = ROOT / "qa-artifacts/invalid-scalar-native-phone-v1"
CAPTURE = ROOT / "qa-artifacts/scalar-recovery-summary-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-scalar-recovery-v2.json"
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
    assert meta["scalar_only_recovery_replay"] and meta["unrelated_financial_vectors_unchanged"]
    assert meta["recovery_checks_unconfirmed"]
    assert meta["predictions"] == 200 and meta["new_model_requests"] == meta["external_requests"] == 0
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
    rows = lines(RUN / "replay/predictions.jsonl", meta["predictions_sha256"])
    plan = load(ROOT / "qa-artifacts/row-first-original50-v1/plan.json")
    cases = {case["id"]: case["record"] for case in plan["cases"]}
    labels = {row["receipt_id"]: row for row in lines(ROOT / "receipt_training/annotations/private/priced-rows-v4-labels.jsonl")}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    scores = [{"variant": row["variant"], "mode": row["mode"],
               **score_with_adjustments(cases[row["receipt_id"]], labels[row["receipt_id"]], row, config)} for row in rows]
    totals = {split: {mode: {variant: dict(sum((Counter(row["counts"]) for row in scores
        if row["mode"] == mode and row["variant"] == variant and (split == "all" or row["split"] == split)), Counter()))
        for variant in ("before", "after")} for mode in ("automatic", "known-currency")}
        for split in ("all", "development", "evaluation")}
    regressions, proposals = [], []
    for before in (row for row in scores if row["variant"] == "before"):
        after = next(row for row in scores if row["variant"] == "after" and row["receipt_id"] == before["receipt_id"] and row["mode"] == before["mode"])
        for field in set(before["counts"]) | set(after["counts"]):
            old, new = before["counts"].get(field, 0), after["counts"].get(field, 0)
            worse = (field.endswith("_correct") or field == "matched_items") and new < old
            worse |= field in ("missing_items", "extra_items_on_complete_labels", "unmatched_predictions", "processing_errors") and new > old
            if worse:
                regressions.append({"receipt_id": before["receipt_id"], "mode": before["mode"], "field": field, "before": old, "after": new})
    for row in rows:
        for proposal in row.get("scalarRecoveries", []):
            assert row["variant"] == "after"
            field, proof = proposal["field"], proposal["evidence"]
            check = next(check for check in row["receipt"]["reviewChecks"] if check["scope"] == "receipt" and check["field"] == field)
            assert check["reason"] == "recovered" and check["confirmedValue"] == "" and check["other"] == proof["previous"]
            label_field = {"printedTotal": "grand_total", "subtotal": "subtotal", "printedTax": "tax"}[field]
            assert labels[row["receipt_id"]][label_field]["value"] == row["receipt"][field], "Unknown/wrong proposal is not a correct-price claim"
            proposals.append({"receipt_id": row["receipt_id"], "mode": row["mode"], "field": field,
                "previous": proof["previous"], "proposed": row["receipt"][field], "literal": proof["literal"],
                "word_confidence": proof["word"]["confidence"]})
    native = load(NATIVE / "execution.json")
    assert native["exit_code"] == 0 and native["source_unchanged"] and native["checks_scalar_proposals"]
    assert native["external_uploads"] == native["retries"] == 0
    ui = load(NATIVE / "ui/result.json")
    assert ui["external_requests"] == 0 and not ui["blocked"] and not ui["financial_fields_edited"]
    assert len(ui["scalarRecoveries"]) == 2 and ui["recoveries"] == 5
    assert ui["receipt"]["printedTotal"] == "261333" and ui["receipt"]["subtotal"] == "221000"
    assert ui["posts"] == ["/api/receipts/recognize", "/api/receipts/vision"]
    for item in sorted(NATIVE.rglob("*")):
        if item.is_file():
            read(item)
    failure = load(ROOT / "qa-artifacts/invalid-scalar-validation-v1/batch-conflict-before.json")
    assert not failure["success"] and failure["numFailedTests"] == 3
    for name in ("qa-artifacts/invalid-scalar-validation-v1/batch-conflict-before.log",
                 "qa-artifacts/invalid-scalar-recovery-v1/after/src/lib/verify-readings.ts",
                 "qa-artifacts/invalid-scalar-recovery-v1/after/src/lib/join-vision-batches.ts"):
        read(ROOT / name)
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        target = CAPTURE / source.name
        target.write_bytes(source.read_bytes())
        read(target)
    detail = CAPTURE / "detail-scores.json"
    detail.write_text(json.dumps(scores, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read(detail)
    result = {
        "scope": "Same saved original-fifty readings through frozen current baseline and new receipt-level literal recovery. No replay inference, source label changes or currency/model hints. Separate actual native single-photo phone workflow.",
        "original_fifty_counts": totals, "known_field_regressions": regressions, "proposals": proposals,
        "replay_views": 200, "original_transactions": 50, "unchanged_financial_vector_scope": meta["unchanged_financial_vector_scope"],
        "original_split_membership": "38 development / 12 evaluation, unchanged and already inspected; not a blind holdout",
        "every_recovery_requires_review": True, "new_replay_model_requests": 0, "new_external_requests": 0,
        "native_phone_observations": [{"run": NATIVE.name, "exit_code": native["exit_code"], "started_at": native["started_at"], "completed_at": native["completed_at"]}],
        "successful_native_scan_to_review_ms": ui["elapsed_ms"], "native_scalar_recoveries": len(ui["scalarRecoveries"]),
        "limits": [
            "Only nonempty invalid amounts with uniquely labelled literal source rows qualify. All matching rows must be reliable, the money word must score at least 0.98, and currency/sign checks must agree. Valid conflicts, absent values, multiple totals, embedded instructions and uncertain batch currencies stay unresolved.",
            "The proposals improve copied total/subtotal fields, not extraction-model accuracy or complete-bill correctness. A source copy is not independent agreement. No amount is selected using a purchase sum, tax calculation, payment amount or reference label.",
            "Most gains require explicit post-extraction currency; one automatic total also improves. Price/quantity/unit/discount/tax-basis/charge vectors are unchanged. Fees, unit prices and other unsupported fields still need source review.",
            "Native five-item timing is one source-inspected development observation on Chrome phone emulation, not a p95, physical-phone, speed ratio, paid-cloud or complete financial result. All fifty complete financial results remain unscorable with current truth.",
            "The actual single-batch native observation precedes the isolated final guard against receipt-level proposals when separate batches disagree on the same field. Its failure evidence is retained. Final original-fifty replay verifies the ordinary path; three synthetic per-field batch tests verify the guard while preserving independent item recovery. No second native or real multi-batch-conflict receipt result is claimed.",
            "Original images, frozen OCR/VLM outputs, labels and split membership are unchanged. No new external receipt upload, billing activation or Azure app integration occurs."],
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"verified_files": len(HASHES), "proposals": len(proposals), "regressions": regressions,
        "totals": {mode: {variant: totals["all"][mode][variant]["total_correct"] for variant in ("before", "after")} for mode in ("automatic", "known-currency")},
        "native_scalar_recoveries": len(ui["scalarRecoveries"]), "new_external_requests": 0}))


if __name__ == "__main__":
    main()
