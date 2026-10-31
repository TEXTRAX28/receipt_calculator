"""Publish aggregate evidence for the source-guard fix; never runs inference."""
from pathlib import Path
import hashlib
import json
import re
import sys

from build_provider_crop_report import metrics

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUNS = DATA / "evaluation/runs"
QA = ROOT / "qa-artifacts"
OUT = DATA / "evaluation/advanced-headerless-coupon-recovery.json"
EVIDENCE = set()


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    path = path.resolve()
    path.relative_to(ROOT)
    if expected is not None and sha(path) != expected:
        raise ValueError("Frozen evidence changed: " + path.relative_to(ROOT).as_posix())
    EVIDENCE.add(path)
    return path


def load(path, expected=None):
    return json.loads(remember(path, expected).read_text(encoding="utf-8"))


def canonical(row):
    """Ignore timing and generated IDs, retaining values and all ID relationships."""
    receipt = row["receipt"]
    ids = {receipt["id"]: "receipt"}
    for collection in ["items", "adjustments"]:
        ids.update({item["id"]: f"{collection}-{i}" for i, item in enumerate(receipt[collection])})

    def visit(value):
        if isinstance(value, dict):
            return {key: visit(item) for key, item in value.items() if key != "elapsed_ms"}
        if isinstance(value, list):
            return [visit(item) for item in value]
        if isinstance(value, str):
            for old, new in ids.items():
                value = value.replace(old, new)
        return value

    return visit(row)


def replay(name):
    folder = RUNS / name
    meta = load(folder / "metadata.json")
    remember(folder / "evaluate.mjs", meta["evaluation_runner_sha256"])
    remember(folder / "package-lock.json", meta["package_lock_sha256"])
    predictions = remember(folder / "predictions.jsonl", meta["predictions_sha256"])
    for file, expected in meta["source_sha256"].items():
        remember(folder / "source" / file, expected)
    for file, expected in meta["loaded_frozen_source_sha256"].items():
        if meta["source_sha256"][file] != expected:
            raise ValueError("A browser imported a different source module")
    if not {"verify-readings.ts", "engine.ts"} <= meta["loaded_frozen_source_sha256"].keys():
        raise ValueError("Missing verifier/calculator module-load proof")
    if meta["api_requests"] or meta["native_inference_requests"] or meta["blocked_external_requests"]:
        raise ValueError("Replay was not local frozen-evidence-only processing")
    remember(DATA / "evaluation/config.json", meta["config_sha256"])
    return meta, {row["receipt_id"]: row for row in map(json.loads, predictions.read_text(encoding="utf-8").splitlines())}


def cohort(split):
    names = [f"headerless-coupon-v2-{side}-{split}" if split != "supplement" else f"headerless-coupon-v2-supplement-{side}" for side in ["before", "after"]]
    (before, a), (after, b) = [replay(name) for name in names]
    if a.keys() != b.keys() or before["paired_inputs"] != after["paired_inputs"]:
        raise ValueError("Comparison receipt inventory or paired evidence differs")
    for key in ["package_lock_sha256", "evaluation_runner_sha256", "manifest_sha256", "frozen_vision_sha256", "frozen_plan_sha256", "node", "browser"]:
        if before[key] != after[key]:
            raise ValueError("Comparison configuration differs: " + key)
    changed = [key for key, value in before["source_sha256"].items() if value != after["source_sha256"].get(key)]
    if changed != ["verify-readings.ts"]:
        raise ValueError("Unexpected changed application source")
    return {"receipts": len(a), "changed_semantic_results": sum(canonical(a[key]) != canonical(b[key]) for key in a),
            "identical_paired_inputs": True, "changed_source_files": changed,
            "loaded_frozen_modules_per_run": [len(meta["loaded_frozen_source_sha256"]) for meta in [before, after]]}, after


def score_pair(prefix, suffix):
    before, after = [load(RUNS / f"{prefix}{side}{suffix}") for side in ["before", "after"]]
    if before["overall"]["counts"] != after["overall"]["counts"]:
        raise ValueError("The frozen scored field counts changed")
    return {"counts_before_and_after": after["overall"]["counts"], "latency_excluded": True}


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "scope": "headerless coupon guard checkpoint"}))
        return

    comparisons = {}
    for split in ["development", "evaluation", "supplement"]:
        comparisons[split], current = cohort(split)
    if [comparisons[key]["receipts"] for key in comparisons] != [38, 12, 1]:
        raise ValueError("Unexpected regression cohort scope")
    original_score = score_pair("headerless-coupon-v2-", "-development/score-original50.json")
    supplement_score = score_pair("headerless-coupon-v2-supplement-", "/score.json")
    for name in ["manifest.jsonl", "annotations/labels.jsonl", "annotations/private/supplement-manifest.jsonl", "annotations/private/supplement-labels.jsonl"]:
        remember(DATA / name)

    base = QA / "provider-review/local-redacted-comparison-v1"
    meta = load(base / "metadata.json")
    before = load(base / "result.json", meta["result_sha256"])
    fixed = QA / "provider-review/local-redacted-coupon-replay-v1"
    fixed_meta = load(fixed / "metadata.json")
    after = load(fixed / "result.json", fixed_meta["result_sha256"])
    for name, expected in fixed_meta["input_sha256"].items():
        remember(base / name, expected)
    if fixed_meta["changed_source_sha256"]["src/lib/verify-readings.ts"] != current["source_sha256"]["verify-readings.ts"]:
        raise ValueError("Cropped diagnostic used a different verifier version")
    for name, expected in meta["source_sha256"].items():
        remember(base / "source" / name, expected)
    labels = next(row for row in map(json.loads, (DATA / "annotations/private/supplement-labels.jsonl").read_text(encoding="utf-8").splitlines()) if row["receipt_id"] == "supplement-user-uk-20261026-group")
    config = load(DATA / "evaluation/config.json")
    cropped = {}
    for phase, value in [("before", before), ("after", after)]:
        cropped[phase] = metrics(labels, value["result"]["receipt"], config)
        cropped[phase]["financial_gate"] = {**{key: value["calculated"][key] for key in ["total_minor", "printed_minor", "discrepancy_minor"]},
                                            "blocking_issues": len(value["calculated"]["issues"]), "pending_review_checks": len(value["result"]["receipt"]["reviewChecks"])}
    cropped["recovered_coupons"] = len(after["result"]["corrections"])
    cropped["remaining_extra_purchases"] = cropped["after"]["unmatched_proposals"]
    cropped["timing_scope"] = "The before result is the retained actual installed hybrid run. The after result is a deterministic browser replay of those exact saved responses, with no inference or provider upload. Its elapsed time is not an OCR/combined latency result. The crop replay retains input/output/verifier hashes; the 51 full-cohort replays additionally record actual frozen module loads."

    logs = {name: remember(QA / f"headerless-coupon-{name}-final.log").read_text(encoding="utf-8") for name in ["unit", "e2e", "build", "format", "graph"]}
    if re.search(r"\b(?:FAIL|failed)\b", logs["unit"] + logs["e2e"]) or "built in" not in logs["build"] or "All matched files use Prettier" not in logs["format"]:
        raise ValueError("Checkpoint validation is incomplete")
    for name in ["unit-before", "unit-after-v1", "unit-after-v2"]:
        remember(QA / f"headerless-coupon-{name}.log")
    remember(Path(__file__))
    remember(Path(__file__).with_name("build_provider_crop_report.py"))
    remember(Path(__file__).with_name("score.py"))
    remember(Path(__file__).with_name("replay_independent_cohort.mjs"), current["evaluation_runner_sha256"])
    report = {
        "scope": "Source-guard regression fix, not a provider selection, new model run, blind holdout or production acceptance",
        "change": "Permit independently recognized Costco coupon/summary handling when source OCR starts at a purchase despite a missing merchant header. Keep all reliable row, unique owner, adjacency, same-photo/tax-code, quantity and amount checks. A conflicting unrecognized merchant heading cannot be overridden by product-name markers or a vision merchant claim.",
        "verified_source_location": "src/lib/verify-readings.ts:L155",
        "cohort_replays": comparisons,
        "semantic_comparison": "Generated receipt/item/adjustment identifiers are mapped to their positions; all values, review checks, source text, warnings, financial issues and ID relationships are retained. Only replay elapsed_ms is excluded.",
        "original50": original_score,
        "grouped_supplement": supplement_score,
        "redacted_diagnostic": cropped,
        "tests": {"unit_passes": int(re.search(r"Tests\s+(\d+) passed", logs["unit"]).group(1)), "browser_passes": int(re.search(r"(\d+) passed \(", logs["e2e"]).group(1)), "browser_skips": int(re.search(r"(\d+) skipped", logs["e2e"]).group(1)), "typecheck_build_format_graph_passed": True},
        "limitations": ["Original complete financial truth denominator remains zero", "The grouped supplement retains a merchant mismatch and pending review; no trusted/strict complete receipt gain", "The cropped draft still has two extra ambiguous purchases and a 447-minor-unit discrepancy, so confirmation remains blocked", "Known parent GBP context is used only for crop scoring; hidden merchant/date/currency extraction is not scored", "The initial broad merchant guard failed an existing other-retailer regression; its log is preserved", "Veryfi credentials/free quota remain unconfigured; zero live Veryfi calls and no new Gemini upload"],
        "native_inference_requests": 0, "external_requests": 0,
        "evidence_sha256": {path.relative_to(ROOT).as_posix(): sha(path) for path in sorted(EVIDENCE)},
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "original_unchanged": comparisons["development"]["changed_semantic_results"] == comparisons["evaluation"]["changed_semantic_results"] == 0, "cropped_recovered_coupons": cropped["recovered_coupons"], "tests": report["tests"]}))


if __name__ == "__main__":
    main()
