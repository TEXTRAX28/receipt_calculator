"""Audit the measured reduced-price grouping fix without re-running extraction."""
import json
from pathlib import Path
import shutil
import sys

import build_printed_provider_checkpoint as audit
import build_headerless_coupon_report as cohort
from build_veryfi_screening_result import chain, predictions

ROOT = audit.ROOT
QA = ROOT / "qa-artifacts"
FOLDER = QA / "provider-review/veryfi-screening-crops-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-reduced-price-grouping-v1.json"
load, remember = audit.load, audit.remember


def aggregate(rows, labels, config):
    result = {}
    for row in rows:
        score = audit.field_score(labels[row["receipt_id"]], row, config)
        group = result.setdefault(row["mode"], {
            "matched_names": 0, "exact_descriptions": 0, "expected_names": 0,
            "line_prices_correct": 0, "line_prices_known": 0,
            "copied_final_totals_correct": 0, "accepted_payable_results": 0})
        for target, source in (("matched_names", "matched_purchase_names"),
                               ("exact_descriptions", "exact_normalized_descriptions"),
                               ("expected_names", "expected_purchases")):
            group[target] += score[source]
        group["line_prices_correct"] += score["field_equality"]["lineTotal"]["correct"]
        group["line_prices_known"] += score["field_equality"]["lineTotal"]["known"]
        group["copied_final_totals_correct"] += score["document_equality"]["printedTotal"] is True
        group["accepted_payable_results"] += score["accepted_payable_result"]
    return result


def main():
    if "--check" in sys.argv:
        chain(OUT)
        print(json.dumps({"verified_files": len(audit.EVIDENCE), "new_external_requests": 0}))
        return
    if OUT.exists():
        raise ValueError("Preserve this report; use --check")
    chain(ROOT / "receipt_training/evaluation/advanced-veryfi-screening-result-v1.json")
    logs = {"reduced-price-unit-v1.log": "377 passed",
            "reduced-price-build-v1.log": "built in",
            "reduced-price-browser-focused-v4.log": "2 passed",
            "reduced-price-browser-full-v1.log": "143 passed",
            "reduced-price-format-v1.log": "All matched files use Prettier code style",
            "reduced-price-graph-v1.log": "Graph is current"}
    for name, marker in logs.items():
        if marker not in remember(QA / name).read_text(encoding="utf-8"):
            raise ValueError("Missing successful check: " + name)
    before, old_meta = predictions(FOLDER / "ocr-text-app-v1", "runner.mjs")
    after, new_meta = predictions(FOLDER / "ocr-text-reduced-price-v1", "runner.mjs")
    changed_sources = [name for name in old_meta["source_sha256"]
                       if old_meta["source_sha256"][name] != new_meta["source_sha256"][name]]
    if changed_sources != ["parser.ts"]:
        raise ValueError("Unexpected app-library changes in the isolated replay")
    old = {(r["case"], r["mode"]): r for r in before}
    new = {(r["case"], r["mode"]): r for r in after}
    if len(old) != 12 or old.keys() != new.keys():
        raise ValueError("Different provider replay selection")
    changed_cases = []
    for key, prior in old.items():
        current = new[key]
        for field in ("provider_response_sha256", "provider_metadata_sha256", "literal_ocr_text_sha256", "context"):
            if prior[field] != current[field]:
                raise ValueError("Different saved extraction or selected context")
        slim = lambda row: cohort.canonical({"receipt": row["receipt"], "calculation": row["calculation"]})
        if slim(prior) != slim(current):
            changed_cases.append(list(key))
    if changed_cases != [["case-03", "automatic"], ["case-03", "known-currency"]]:
        raise ValueError("An unrelated provider replay changed")
    for row in after:
        if row["case"] == "case-03":
            first = row["receipt"]["items"][0]
            if first["lineTotal"] != "" or first["quantity"] != "" or first["unitPrice"] != "":
                raise ValueError("Unknown first Tesco values were invented")
    labels = {r["receipt_id"]: r for r in map(json.loads, remember(FOLDER / "screening-labels-v1.jsonl").read_text(encoding="utf-8").splitlines())}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    regressions = {}
    for split in ("development", "evaluation", "supplement"):
        (old_meta, prior), (new_meta, current) = [cohort.replay(name) for name in (
            "unknown-tax-hybrid-" + split + "-v1", "reduced-price-hybrid-" + split + "-v1")]
        old_inputs = {r["receipt_id"]: r for r in old_meta["paired_inputs"]}
        new_inputs = {r["receipt_id"]: r for r in new_meta["paired_inputs"]}
        if not prior.keys() <= current.keys() or (split != "supplement" and prior.keys() != current.keys()):
            raise ValueError("Original receipt membership changed")
        if any(old_inputs[key] != new_inputs[key] for key in prior):
            raise ValueError("Different independent extractor inputs")
        changed = []
        for key, row in prior.items():
            a, b = cohort.canonical(row), cohort.canonical(current[key])
            if a != b:
                changed.append(key)
            # Numeric values, product/adjustment identities and all original
            # extracted fields must remain identical. Only checks can change.
            a_receipt = {k: v for k, v in a["receipt"].items() if k != "reviewChecks"}
            b_receipt = {k: v for k, v in b["receipt"].items() if k != "reviewChecks"}
            if a_receipt != b_receipt:
                raise ValueError("A frozen hybrid extracted value changed")
            for field in ("subtotal", "receiptDiscount", "tax", "otherCharges", "total", "printed", "discrepancy"):
                if a["calculation"][field] != b["calculation"][field]:
                    raise ValueError("A frozen hybrid monetary result changed")
        regressions[split] = {"paired_receipts": len(prior), "changed_semantic_results": changed,
                              "extracted_fields_and_calculated_money_identical": True,
                              "unpaired_additional_after_receipts": sorted(current.keys() - prior.keys()),
                              "loaded_frozen_modules": len(new_meta["loaded_frozen_source_sha256"])}
    for path in cohort.EVIDENCE:
        remember(path)
    for version in (1, 2, 3):
        remember(QA / f"reduced-price-browser-focused-v{version}.log")
        for path in (QA / f"reduced-price-focused-failure-v{version}").rglob("*"):
            if path.is_file():
                remember(path)
    screenshots = []
    for path in (QA / "e2e-runs").glob("*/reduced-price-*.png"):
        remember(path)
        remember(path.parent / "test.json")
        screenshots.append(path.relative_to(ROOT).as_posix())
    if len(screenshots) != 6:
        raise ValueError("Expected six captures: third failed attempt, final focused run and full suite")
    checkpoint = QA / "reduced-price-checkpoint-v1"
    checkpoint.mkdir()
    for name in ("src/lib/parser.ts", "tests/parser.test.ts", "tests/e2e/reduced-price.spec.ts"):
        path = checkpoint / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, path)
        remember(path)
    remember(Path(__file__))
    prior_audit = load(QA / "evidence-audits/veryfi-six-closed-v1.json")
    final_audit = load(QA / "evidence-audits/reduced-price-after-browser-v1.json")
    gaps = lambda record: {name: row["gaps"] for name, row in record["reports"].items() if row["gaps"]}
    if gaps(prior_audit) != gaps(final_audit) or final_audit["unresolved_declared_hashes"] != 13:
        raise ValueError("Historical evidence gap set changed")
    report = {
        "scope": "Merchant-independent grouping of immediately adjacent product/reduced-selling-price rows. No extractor/model/prompt/currency-inference or tax-basis change.",
        "verified_source_location": {"source_file": "src/lib/parser.ts", "source_location": "L40"},
        "provider_text_before": aggregate(before, labels, config),
        "provider_text_after": aggregate(after, labels, config),
        "changed_provider_replays": changed_cases,
        "invariants": ["Unreadable first Tesco price, quantity and unit price stay empty; no price is inferred from the printed total.",
                       "Pack counts remain in descriptions and never become purchased quantity.",
                       "Reduced selling prices are used once; they are not subtracted again as discounts.",
                       "Each recovered association requires source review. Missing amounts remain blocked by the independent validator.",
                       "Non-adjacent, boundary-crossing and orphan labels do not create guessed purchases. Signed reductions retain separate classification review."],
        "original_frozen_hybrid_regression": regressions,
        "tests": {"unit": "377 passed, including eight new reduced-price cases", "focused_browser": "2 passed",
                  "full_browser": "143 passed, one existing skip", "build_typecheck_format_graph": "passed",
                  "screenshots": screenshots,
                  "initial_browser_attempts": "Three preserved test-only failures: an incorrect quantity label, an incorrect expectation that a blank-value source check was already applicable, and an incorrect expectation that an explicit human edit would clear its source stamp. Existing behavior records human correction as verification and separately blocks arithmetic mismatch. None required an app change; exact test sources, traces and logs are retained."},
        "privacy": {"new_native_inference_requests": 0, "new_external_requests": 0,
                    "cloud_permission": "The six-case authorization remains consumed"},
        "evidence_integrity": {"historical_declared_gaps_before": 13,
                               "historical_declared_gaps_after": 13,
                               "same_gap_set": True, "new_gaps": 0},
        "limits": ["The 25/25 readable line-price result uses a predeclared selected currency and six source-informed crops. It is not automatic-currency success, a new blind holdout or complete receipt accuracy.",
                   "Quantities, unknown prices, coupon ownership, tax errors, totals and missing adjustments still need review. Correct line-price fields do not establish payable totals.",
                   "The hybrid retains original financial values, including known failures. Tesco has fewer unsupported checks through better source grouping; its existing bad quantities/units and discrepancy remain blocked.",
                   "The supplement replay also processed two existing individual-photo records with no matched prior control; these are listed separately and not counted as regression gains.",
                   "Browser phone emulation verifies the UI, not physical-camera capture or real handset performance. Thirteen historical evidence gaps remain separately recorded."],
        "evidence_sha256": audit.EVIDENCE,
    }
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "verified_files": len(audit.EVIDENCE),
                      "selected_currency_known_prices": report["provider_text_after"]["known-currency"]["line_prices_correct"],
                      "new_external_requests": 0}))


if __name__ == "__main__":
    main()
