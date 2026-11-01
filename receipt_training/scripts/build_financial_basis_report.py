"""Score unchanged independent readings through both frozen tax-basis verifiers."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/financial-basis-recovery-v3/replay"
LOGS = ROOT / "qa-artifacts/financial-basis-recovery-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-financial-basis-recovery-v1.json"
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for path, digest in report["evidence_sha256"].items():
            read(ROOT / path, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists(), "Preserve sealed evidence"
    meta = load(RUN / "metadata.json")
    for path, digest in meta["input_sha256"].items():
        read(ROOT / path, digest)
    for variant, mapping in meta["source_sha256"].items():
        for path, digest in mapping.items():
            read(ROOT / meta["frozen_source_paths"][variant] / path, digest)
        for path, digest in meta["loaded_frozen_source_sha256"][variant].items():
            assert digest == mapping[path]
    for path, digest in meta["source_sha256"]["after"].items():
        read(ROOT / path, digest)
    read(RUN / "runner.mjs", meta["runner_sha256"])
    raw = read(RUN / "predictions.jsonl", meta["predictions_sha256"])
    predictions = list(map(json.loads, raw.decode("utf-8").splitlines()))
    assert len(predictions) == meta["prediction_views"] == 200
    truth = load(ROOT / "receipt_training/evaluation/advanced-financial-truth-v1.json")
    for path, digest in truth["evidence_sha256"].items():
        read(ROOT / path, digest)
    labels = {row["receipt_id"]: row for row in map(json.loads, read(ROOT / truth["labels"]).decode("utf-8").splitlines())}
    plan = load(ROOT / "qa-artifacts/row-first-original50-v1/plan.json")
    records = {case["id"]: case["record"] for case in plan["cases"]}
    for record in records.values():
        read(ROOT / "receipt_training" / record["file_path"], record["sha256"])
    config = load(ROOT / "receipt_training/evaluation/config.json")
    counts, scores, changed = defaultdict(Counter), [], []
    for row in predictions:
        record, label = records[row["receipt_id"]], labels[row["receipt_id"]]
        assert row["image_sha256"] == record["sha256"]
        result = score_with_adjustments(record, label, row, config)
        key = row["mode"] + "/" + row["variant"]
        counts[key].update(result["counts"])
        scores.append({"variant": row["variant"], "mode": row["mode"], **result})
        if row.get("taxBasisRecovery"):
            check = next(check for check in row["receipt"]["reviewChecks"] if check["field"] == "pricesIncludeTax")
            assert check["reason"] == "recovered" and check["confirmedValue"] == ""
            assert any(issue["path"] == "pricesIncludeTax" for issue in row["calculation"]["issues"])
            changed.append({"receipt_id": row["receipt_id"], "split": record["split"], "mode": row["mode"],
                            "reference_basis_known": type(label.get("prices_include_tax")) is bool,
                            "basis": row["receipt"]["pricesIncludeTax"], "pending_review": True})
    for mode in ("automatic", "known-currency"):
        before, after = counts[mode + "/before"], counts[mode + "/after"]
        for field in ("expected_items", "predicted_items", "matched_items", "description_correct", "quantity_correct", "item_price_correct", "unit_price_correct", "item_discount_correct", "receipt_discount_correct", "receipt_fee_correct", "rounding_correct", "subtotal_correct", "tax_correct", "total_correct", "complete_receipt_known", "complete_receipt_correct"):
            assert before.get(field, 0) == after.get(field, 0), (mode, field)
    (RUN / "scores.json").write_text(json.dumps(scores, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read(RUN / "scores.json")
    for path in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py"), ROOT / "receipt_training/scripts/replay_financial_basis.mjs", ROOT / "tests/financial-basis.test.ts", ROOT / "tests/e2e/financial-basis.spec.ts", ROOT / "tests/e2e/qa-artifacts.ts", ROOT / "package.json", ROOT / "package-lock.json", ROOT / "playwright.config.ts"):
        read(path)
    for name in ("unit.log", "build.log", "format.log", "format-final.log", "browser-focus.log", "browser-focus-final.log", "browser-all.log", "financial-basis-pre-geometry.spec.ts", "replay.log", "replay-final.log", "replay-final2.log", "replay-final3.log", "graph-check.log", "graph-final-refresh.log", "graph-final-check.log", "integrity-before-browser.log"):
        read(LOGS / name)
    assert "645 passed" in (LOGS / "unit.log").read_text(encoding="utf-8")
    assert "175 passed" in (LOGS / "browser-all.log").read_text(encoding="utf-8")
    assert "2 passed" in (LOGS / "browser-focus-final.log").read_text(encoding="utf-8")
    assert "All matched files use Prettier code style" in (LOGS / "format-final.log").read_text(encoding="utf-8")
    assert "Graph is current" in (LOGS / "graph-final-check.log").read_text(encoding="utf-8")
    for path in (ROOT / "qa-artifacts/e2e-runs").glob("*/test.json"):
        if "net-price interpretation stays blocked" in path.read_text(encoding="utf-8"):
            for artifact in path.parent.iterdir():
                if artifact.is_file():
                    read(artifact)
    audit = load(ROOT / "qa-artifacts/evidence-audits/financial-basis-pre-browser-v1.json")
    pilot = load(ROOT / "receipt_training/evaluation/advanced-financial-vision-pilot-v1.json")
    for path, digest in pilot["evidence_sha256"].items():
        read(ROOT / path, digest)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    assert git("rev-parse", "stable/receipt-verified").decode().strip() == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    assert git("-C", original, "rev-parse", "HEAD").decode().strip() == "29a187af7347be94c0728f4785be674500833748"
    assert hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest() == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    report = {"scope": "All original fifty, identical retained independent OCR/vision readings, frozen before/after verifier; explicit currency enters deterministic interpretation only after extraction.",
              "prediction_views": 200, "counts": {key: dict(value) for key, value in counts.items()}, "proposals": changed,
              "unchanged_amounts_products_and_metadata": meta["unchanged_amounts_products_and_metadata"],
              "new_model_requests": 0, "external_requests": 0, "new_scanner_latency_samples": 0,
              "verification": {"unit_tests": 645, "browser_tests": 175, "existing_browser_skips": 1,
                               "focused_final_browser_tests": 2, "stable_and_original_dirty_checkout_unchanged": True},
              "limits": [
                  "Previously inspected source-informed development/evaluation receipts, not a blind holdout. References remain unchanged.",
                  "Four proposals have prior known net-basis references; the fifth (validation-007) remains unscored for basis. Its original photo was inspected after extraction: SubTotal 63,636; Discount -9,545; PB1 5,409; Total 59,500. This retrospective observation is not a new scored success.",
                  "All proposals need human source review. Automatic-currency results are unchanged, every receipt still needs checking and complete original financial accuracy remains unscorable.",
                  "No price, tax, fee, quantity, coupon, rate, tax-mode or total is repaired. Existing incorrect financial roles and raw amounts can remain despite a correct net-basis proposal.",
                  "Browser financial workflow uses a synthetic fixture and mocked independent-reader protocols; phone emulation on desktop Chrome is not physical-handset or native-reader accuracy evidence.",
                  "Full browser run used the retained pre-geometry version of the new synthetic test. Visual review found its boxes offset from the drawn text. The fixture now measures bounds while drawing; its final focused rerun passes both projects. Earlier screenshots and the initially failing format/stale-graph checks remain retained alongside the corrected passing evidence.",
                  "Two local replay setup failures (missing output parent, then missing baseline snapshot path) and the provisional replay are retained. Neither made inference or external requests.",
                  "The preceding integrity audit retains thirteen known overwritten legacy artifacts. This checkpoint does not recover or certify those missing historical bytes.",
                  "The separate three-call Qwen specialist is rejected. A larger model was neither downloaded nor benchmarked. No default reader or cloud allowance changes."],
              "preceding_evidence_audit": {key: value for key, value in audit.items() if key not in ("verified", "files", "entries") and isinstance(value, (int, str, bool))},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print(json.dumps({"prediction_views": len(predictions), "proposals": changed, "files": len(HASHES), "counts": {key: {name: value.get(name) for name in ("price_basis_known", "price_basis_correct", "trusted_reconciliation_correct", "complete_receipt_known")} for key, value in counts.items()}}))


if __name__ == "__main__":
    main()
