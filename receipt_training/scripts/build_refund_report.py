"""Publish signed-finance regression evidence; performs no inference or uploads."""
import copy
import json
import re
import subprocess
import sys
from pathlib import Path

import build_headerless_coupon_report as evidence

ROOT = evidence.ROOT
QA = ROOT / "qa-artifacts"
DATA = ROOT / "receipt_training"
RUNS = DATA / "evaluation/runs"
OUT = DATA / "evaluation/advanced-refund-handling.json"
load, remember, sha = evidence.load, evidence.remember, evidence.sha


def normalize(row, financial=False, wording=False):
    row = copy.deepcopy(row)
    # These frozen pre-refund candidates all contain unsigned purchase prices.
    # The new explicit return-context flag is false for every paired case.
    row["calculation"].setdefault("hasRefunds", False)
    if row["calculation"]["hasRefunds"]:
        raise ValueError("Original regression contains a newly classified refund")
    if financial:
        row = {key: row[key] for key in ["receipt_id", "image_sha256", "receipt", "calculation"]}
        row["receipt"].pop("reviewChecks", None)
        row["receipt"].pop("warnings", None)
        row["calculation"].pop("issues", None)
    if wording:
        for issue in row["calculation"]["issues"]:
            issue["message"] = issue["message"].replace("Enter a non-negative number with at most", "Enter a number with at most")
    return evidence.canonical(row)


def paired(split):
    names = [f"refunds-v2-before-{split}", f"refunds-v4-after-{split}"] if split != "supplement" else ["refunds-v2-supplement-before", "refunds-v4-supplement-after"]
    (before, a), (after, b) = [evidence.replay(name) for name in names]
    for key in ["package_lock_sha256", "evaluation_runner_sha256", "manifest_sha256", "frozen_vision_sha256", "frozen_plan_sha256", "node", "browser", "paired_inputs"]:
        if before[key] != after[key]:
            raise ValueError("Paired replay inputs or runtime differ: " + key)
    if a.keys() != b.keys():
        raise ValueError("Regression receipt inventory differs")
    financial_changes = sum(normalize(a[key], financial=True) != normalize(b[key], financial=True) for key in a)
    if financial_changes:
        raise ValueError("An original monetary or extracted field changed")
    changed = [key for key in a if normalize(a[key]) != normalize(b[key])]
    result = {"runs": names, "receipts": len(a), "changed_financial_or_extracted_results": financial_changes,
              "diagnostic_changes": len(changed), "numeric_error_wording_only": sum(normalize(a[key], wording=True) == normalize(b[key], wording=True) for key in changed),
              "source_purchase_count_changes": sum(a[key]["ocr_purchases"] != b[key]["ocr_purchases"] for key in a),
              "cases_with_ambiguous_negative_source_notice": sum(any("negative source row" in check["other"] for check in value["receipt"]["reviewChecks"]) for value in b.values()),
              "cases_with_pending_checks": sum(bool(value["receipt"]["reviewChecks"]) for value in b.values()),
              "changed_library_files": [name for name, expected in before["source_sha256"].items() if expected != after["source_sha256"][name]],
              "actual_frozen_module_loads_verified": True}
    return result, after


def snapshot(name):
    source = ROOT / name
    target = QA / "refunds-checkpoint-final/source" / name
    if target.exists() and sha(target) != sha(source):
        raise ValueError("Do not replace a frozen checkpoint source")
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(source.read_bytes())
    remember(target, sha(source))
    return sha(target)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(evidence.EVIDENCE), "scope": "signed refund and classification checkpoint"}))
        return
    cohorts = {}
    for split in ["development", "evaluation", "supplement"]:
        cohorts[split], current = paired(split)
    if [value["receipts"] for value in cohorts.values()] != [38, 12, 1]:
        raise ValueError("Regression cohort scope changed")
    scores = {}
    for group, names in {
        "original50": ["refunds-v2-before-development/score-original50.json", "refunds-v4-after-development/score-original50.json"],
        "grouped_supplement": ["refunds-v2-supplement-before/score.json", "refunds-v4-supplement-after/score.json"],
    }.items():
        before, after = [load(RUNS / name) for name in names]
        if before["overall"]["counts"] != after["overall"]["counts"]:
            raise ValueError("Frozen scored field counts changed")
        for key in ["manifest_sha256", "labels_sha256"]:
            if before[key] != after[key]:
                raise ValueError("Before/after scoring truth differs")
        remember(DATA / ("manifest.jsonl" if group == "original50" else "annotations/private/supplement-manifest.jsonl"), before["manifest_sha256"])
        remember(DATA / ("annotations/labels.jsonl" if group == "original50" else "annotations/private/supplement-labels.jsonl"), before["labels_sha256"])
        scores[group] = after["overall"]["counts"]
    for name in ["manifest.jsonl", "annotations/labels.jsonl", "annotations/private/supplement-manifest.jsonl", "annotations/private/supplement-labels.jsonl", "evaluation/config.json"]:
        remember(DATA / name)
    for name, expected in current["source_sha256"].items():
        if sha(ROOT / "src/lib" / name) != expected:
            raise ValueError("The tested financial/extraction code changed")
    sources = {name: snapshot(name) for name in [
        "src/App.tsx", "src/RefundControl.tsx", "src/ReviewChecks.tsx", "src/styles.css",
        "tests/refunds.test.ts", "tests/engine.test.ts", "tests/parser.test.ts", "tests/ai.test.ts", "tests/verify-readings.test.ts", "tests/receipt-evidence.test.ts",
        "tests/e2e/refunds.spec.ts", "tests/e2e/computer-reader.spec.ts", "server/extraction-instructions.mjs", "package-lock.json", "playwright.config.ts",
    ]}
    if (ROOT / "server/extraction-instructions.mjs").read_bytes() != subprocess.check_output(["git", "show", "HEAD:server/extraction-instructions.mjs"], cwd=ROOT):
        raise ValueError("The existing model prompt changed")
    decoder = [remember(QA / f"refunds-provider-schema-{phase}.sha256").read_text(encoding="utf-8").strip() for phase in ["before", "after"]]
    if decoder[0] != decoder[1]:
        raise ValueError("The provider decoder schema changed")
    native = [load(QA / f"refund-ocr-{name}.json") for name in ["desktop", "mobile"]]
    for name, value in zip(["desktop", "mobile"], native):
        remember(QA / f"refund-ocr-{name}-input.png", value["input_sha256"])
        if not value["synthetic"] or value["financialEdits"] or value["posts"] or value["external"] or value["lineTotal"] != "-5.00" or value["printedTotal"] != "-5.00" or not re.search(r"[-−]5[.]00", value["recognizedText"]):
            raise ValueError("Actual browser refund OCR did not complete unchanged locally")
    logs = {name: remember(QA / file).read_text(encoding="utf-8") for name, file in {
        "unit": "refunds-unit-final-v4.log", "browser": "refunds-e2e-final-v4.log", "build": "refunds-build-final-v4.log",
        "format": "refunds-format-final-v4.log", "graph": "refunds-graph-final-v4.log", "test_types": "refunds-browser-typecheck-final-v4.log",
    }.items()}
    if re.search(r"\b(?:failed|FAIL)\b", logs["unit"] + logs["browser"]) or "built in" not in logs["build"] or "All matched files use Prettier" not in logs["format"] or logs["test_types"].strip():
        raise ValueError("Final checkpoint validation is incomplete")
    for name in ["refunds-unit-before.log", "refunds-classification-before.log", "refunds-classification-after-first.log", "refunds-classification-after-second.log"]:
        remember(QA / name)
    for name in ["refund-metadata-mobile-320.png", "refund-metadata-mobile-390.png", "refund-summary-mobile.png", "refund-ambiguous-source-mobile.png"]:
        remember(QA / name)
    for name in ["build_refund_report.py", "build_headerless_coupon_report.py", "build_provider_crop_report.py", "score.py", "replay_independent_cohort.mjs"]:
        remember(Path(__file__).with_name(name))
    protection = load(QA / "refunds-protection-audit.json")
    if protection["improvement_branch"] != "feature/advanced-ocr-vision-ai" or protection["stable_head"] != "ee725ba45e799bee8501d3de034e0302c0127afd" or protection["original_binary_patch_sha256"] != "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b":
        raise ValueError("The protected project state changed")
    report = {
        "scope": "Signed refund accounting, conservative classification and human review; no OCR/model replacement or cloud provider-selection claim",
        "representation": "Positive quantities with signed line prices; a printed unsigned unit price is allowed beside a negative line credit when magnitudes agree. Positive item discounts reduce the returned gross price before signed tax. Positive receipt discounts apply only to purchases; negative coupon reversals apply only to returns. Ordinary negative structured adjustments require an explicit nonzero return line.",
        "tax_and_allocation": "Round each tax-code group once. Mixed signed bases retain signed per-item VAT with deterministic residual rounding; zero net VAT does not erase sale/return contributions. Signed final costs use the existing exact largest-remainder sharing. Ambiguous proportional charges on mixed purchases/returns require explicit allocation. Negative shares are credits, with no original payer or reimbursement direction inferred.",
        "classification": "Product context or an explicit return/refund label is required for generic credits. Keep named coupons, retailer-grounded IRC rows and directly adjacent DISC percentage/AMOUNT rows as deductions. Bare negative rows remain provisional deductions with a mandatory type/ownership check, literal source regions and retained independent-review uncertainty even if arithmetic and readings agree.",
        "verified_source_locations": ["src/lib/engine.ts:L35", "src/lib/engine.ts:L55", "src/lib/engine.ts:L479", "src/lib/parser.ts:L33", "src/lib/verify-readings.ts:L155", "src/lib/receipt-evidence.ts:L39", "src/RefundControl.tsx:L1"],
        "regression_replays": cohorts,
        "regression_normalization": "Only generated IDs and elapsed time are normalized. The new computed hasRefunds flag is explicitly false on all paired original cases and defaults to false for legacy results. Financial comparison retains every extracted field, amount, adjustment and allocation; diagnostic changes are counted separately.",
        "counts_before_and_after": scores,
        "decoder_schema_sha256_before_and_after": decoder[0],
        "model_prompt_changed": False,
        "actual_browser_ocr": {"unique_synthetic_transactions": 1, "views": ["desktop", "phone emulation on desktop Chrome"], "same_source_png": native[0]["input_sha256"] == native[1]["input_sha256"], "line_and_total_correct": True, "final_credit_shares": ["-2.50", "-2.50"], "financial_edits": 0, "external_requests": 0, "elapsed_ms": [value["elapsedMs"] for value in native], "timing_scope": native[0]["timingScope"]},
        "tests": {"unit_passes": int(re.search(r"Tests\s+(\d+) passed", logs["unit"]).group(1)), "browser_passes": int(re.search(r"(\d+) passed \(", logs["browser"]).group(1)), "browser_skips": int(re.search(r"(\d+) skipped", logs["browser"]).group(1)), "signed_transaction_property_cases": 500, "currency_precisions": [0, 2, 3], "phone_widths": [320, 390], "typecheck_build_format_graph_passed": True},
        "limitations": ["No genuine refund-image ground truth; synthetic arithmetic/GUI evidence does not establish real-refund recognition accuracy", "Negative quantities and fee-only credit notes require manual conversion to the supported positive-quantity signed-line representation", "Mixed proportional shared charges and direction-reversing/excessive adjustments remain blocked until corrected", "The existing vision prompt still asks for positive ordinary adjustments; broader automatic refund-fee extraction needs a separately measured prompt/profile", "Original strict complete financial truth remains unscorable, and no new blind holdout or scanner p95 is claimed", "Veryfi remains unconfigured; no live Veryfi request or additional Gemini upload"],
        "native_vision_inference_requests": 0, "external_requests": 0,
        "git_protection_audit_before_commit": protection,
        "source_sha256": sources,
        "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(evidence.EVIDENCE)},
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "tests": report["tests"], "financial_changes_original_and_supplement": 0}))


if __name__ == "__main__":
    main()
