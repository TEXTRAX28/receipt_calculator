"""Freeze the required AI tax-basis review and its bounded regression evidence."""
import json
from pathlib import Path
import subprocess
import sys

import build_headerless_coupon_report as evidence

ROOT, QA = evidence.ROOT, evidence.QA
OUT = ROOT / "receipt_training/evaluation/advanced-unknown-tax-review-v1.json"
load, remember = evidence.load, evidence.remember


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            remember(ROOT / name, digest)
        print(json.dumps({"verified_files": len(evidence.EVIDENCE), "scope": "required AI tax-basis review"}))
        return
    if OUT.exists():
        raise ValueError("Preserve the checkpoint; use --check")
    logs = {
        "unknown-tax-full-unit-v1.log": "369 passed",
        "unknown-tax-build-v1.log": "built in",
        "unknown-tax-browser-full-v1.log": "141 passed",
        "unknown-tax-browser-focused-v1.log": "2 passed",
        "unknown-tax-format-v1.log": "All matched files use Prettier code style",
        "unknown-tax-graph-v1.log": "Graph is current",
    }
    for name, text in logs.items():
        if text not in remember(QA / name).read_text(encoding="utf-8"):
            raise ValueError("Missing final successful validation: " + name)
    regressions = {}
    for split in ("development", "evaluation", "supplement"):
        before, after = "reading-currency-v2-default-" + split, "unknown-tax-hybrid-" + split + "-v1"
        (old_meta, old), (new_meta, new) = [evidence.replay(name) for name in (before, after)]
        if old.keys() != new.keys() or old_meta["paired_inputs"] != new_meta["paired_inputs"]:
            raise ValueError("Different retained model inputs")
        if any(evidence.canonical(old[key]) != evidence.canonical(new[key]) for key in old):
            raise ValueError("A default hybrid receipt changed")
        regressions[split] = {"receipts": len(old), "changed_semantic_results": 0,
                              "identical_paired_inputs": True, "loaded_frozen_modules": len(new_meta["loaded_frozen_source_sha256"])}
    replay = QA / "unknown-tax-native-replay-v1"
    meta = load(replay / "metadata.json")
    remember(replay / "predictions.jsonl", meta["predictions_sha256"])
    remember(replay / "runner.mjs", meta["runner_sha256"])
    for name, digest in meta["source_sha256"].items():
        remember(replay / "source" / name, digest)
    if meta["offline_variants"] != 12 or meta["unknown_tax_variants"] != 12 or meta["changed_monetary_results"] or meta["changed_receipt_values"]:
        raise ValueError("Unexpected six-case AI replay result")
    before_predictions = QA / "provider-review/veryfi-screening-crops-v2/native-protocol-v1/offline-v1/predictions.jsonl"
    remember(before_predictions, meta["before_predictions_sha256"])
    for row in map(json.loads, (replay / "predictions.jsonl").read_text(encoding="utf-8").splitlines()):
        remember(QA / "advanced-ocr" / ("screening-native-png-v1-" + row["case"]) / "model-output.json", row["raw_model_output_sha256"])
    audits = [load(QA / "evidence-audits" / (name + ".json")) for name in
              ("unknown-tax-before-browser-v1", "unknown-tax-after-browser-v1")]
    if any(audit["unresolved_declared_hashes"] != 13 for audit in audits):
        raise ValueError("Inspect the changed historical evidence gaps")
    old_gaps, new_gaps = [sorted((name, gap["path"], gap["expected_sha256"]) for name, value in audit["reports"].items() for gap in value["gaps"]) for audit in audits]
    if old_gaps != new_gaps:
        raise ValueError("A new historical byte gap appeared")
    screenshots = ["e2e-runs/mobile-gTLAk6/unknown-tax-mobile.png", "e2e-runs/desktop-O3VGZF/unknown-tax-desktop.png"]
    for name in screenshots:
        remember(QA / name)
        load((QA / name).parent / "test.json")
    checkpoint = QA / "unknown-tax-checkpoint-final-v1"
    checkpoint.mkdir(exist_ok=False)
    for name in ("src/lib/gemini.ts", "src/lib/engine.ts", "src/lib/model.ts", "src/lib/review-checks.ts",
                 "src/App.tsx", "src/ReviewChecks.tsx", "tests/ai.test.ts", "tests/e2e/local-vision.spec.ts",
                 "tests/e2e/qa-artifacts.ts", "package-lock.json", "receipt_training/scripts/replay_tax_review_guard.mjs"):
        target = checkpoint / "source" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes((ROOT / name).read_bytes())
        remember(target)
    remember(Path(__file__))
    report = {
        "change": "A newly extracted AI receipt whose pricesIncludeTax is null now has a required field-specific source check. Matching provisional arithmetic cannot clear it; explicit user verification/correction is required. Known true/false values keep their existing behavior.",
        "verified_source_location": "src/lib/gemini.ts:L13 (receiptFromAi)",
        "scope": "Financial review guard, not a new reader, recognition improvement, tax inference or provider selection. The provisional Boolean and all returned prices/amounts are retained.",
        "tests": {"application_unit_passes": 369, "new_unit_cases": 5, "browser_passes": 141,
                  "browser_skips": 1, "new_focused_browser_passes": 2, "build_format_graph_passed": True},
        "synthetic_workflow": "Mocked structured 5.50 receipt remains blocked with zero discrepancy until its specific tax-basis check is confirmed. Confirmation survives refresh; unchecking it blocks again, and an explicit human edit supplies a new verified field value. Desktop and phone emulation, not physical-device or model accuracy evidence.",
        "original_frozen_hybrid_regression": regressions,
        "six_case_ai_replay": {"transactions": 6, "automatic_and_known_currency_variants": 12,
                               "required_tax_checks_added": 12, "changed_receipt_values": 0,
                               "changed_monetary_results": 0, "model_requests": 0},
        "evidence_integrity": {"before_after_declared_gaps": [13, 13], "new_gaps": 0,
                               "historical_limit": "The previously disclosed thirteen missing historical screenshots/QA JSON bytes remain unresolved in the area/PDF/refund reports. New checks do not repair them."},
        "privacy": {"new_external_receipt_uploads": 0, "new_model_calls_for_guard": 0,
                    "six_case_Veryfi_approval_still_pending": True, "billing_activated": False},
        "git": {"base_improvement_commit": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
                "stable_branch": subprocess.check_output(["git", "rev-parse", "stable/receipt-verified"], cwd=ROOT, text=True).strip()},
        "limits": ["This check cannot establish correctness when a model confidently returns the wrong Boolean. Source review and independent validation are still required.",
                   "It applies when new AI extraction retains an explicit null. Old stored Boolean-only drafts do not retain that original null; no retrospective classification from warning prose is performed.",
                   "No complete-corpus accuracy or end-to-end model latency gain is claimed. The full production upgrade and pending six-case provider comparison remain open."],
        "evidence_sha256": {path.relative_to(ROOT).as_posix(): evidence.sha(path) for path in sorted(evidence.EVIDENCE)},
    }
    serialized = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(serialized)
    print(json.dumps({"verified_files": len(evidence.EVIDENCE), "hybrid_receipts_unchanged": 51,
                      "ai_tax_checks_added": 12, "external_requests": 0}))


if __name__ == "__main__":
    main()
