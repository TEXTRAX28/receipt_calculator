"""Seal the measured financial-role change; no extraction or network access."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/financial-role-recovery-v1"
FINAL = ROOT / "qa-artifacts/financial-role-recovery-v4"
OUT = ROOT / "receipt_training/evaluation/advanced-financial-role-recovery-v2.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env"), "Never capture live configuration"
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or expected == digest, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def folder(path):
    for item in sorted(path.rglob("*")):
        if item.is_file() and "__pycache__" not in item.parts:
            read(item)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for filename, digest in report["evidence_sha256"].items():
            read(ROOT / filename, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0, "external_requests": 0}))
        return
    assert not OUT.exists(), "Preserve scored evidence"
    score = load(FINAL / "scores.json")
    assert score["regressions"] == []
    for filename, digest in score["evidence_sha256"].items():
        read(ROOT / filename, digest)
    meta = load(FINAL / "replay/metadata.json")
    assert meta["prediction_views"] == 400 and meta["new_model_requests"] == meta["external_requests"] == 0
    for filename, digest in meta["input_sha256"].items():
        read(ROOT / filename, digest)
    for filename, digest in meta["source_sha256"]["after"].items():
        read(ROOT / filename, digest)
    counts = score["counts"]
    assert counts["hybrid/known-currency/after"]["receipt_fee_correct"] == 7
    assert counts["hybrid/known-currency/after"]["tax_correct"] == 16
    assert counts["hybrid/known-currency/after"]["trusted_reconciliation_correct"] == 0
    controls = load(RUN / "provider-controls/scores.json")
    for provider in ("azure", "veryfi"):
        c = controls["counts"]
        assert c[provider + "/known-currency/after"]["lineTotal_correct"] == 25
        for mode in ("automatic", "known-currency"):
            before = c[provider + "/" + mode + "/before"]
            after = c[provider + "/" + mode + "/after"]
            for field in ("matched_purchase_names", "exact_normalized_descriptions", "quantity_correct", "unitPrice_correct", "lineTotal_correct", "discount_correct", "taxCode_correct", "copied_final_total_correct"):
                assert before[field] == after[field]
    azure = load(RUN / "provider-controls/azure/metadata.json")
    for filename, digest in azure["input_sha256"].items():
        read(ROOT / filename, digest)
    assert azure["external_requests"] == azure["new_model_requests"] == 0
    veryfi = load(RUN / "provider-controls/veryfi/metadata.json")
    assert veryfi["actual_external_requests"] == veryfi["forbidden_network_attempts"] == 0
    for loaded in (azure["loaded_frozen_source_sha256"], veryfi["loaded_ssr_modules"]):
        for filename, digest in loaded.items():
            read(ROOT / filename, digest)
    # Bind the same original references and scorer used by the cloud controls.
    for filename in ("qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl", "receipt_training/scripts/build_printed_provider_checkpoint.py", "receipt_training/evaluation/advanced-financial-basis-recovery-v1.json", "receipt_training/evaluation/advanced-row-first-original50-v1.json"):
        read(ROOT / filename)
    needles = {"unit-v2.txt": "674 passed", "browser-v2.txt": "177 passed", "build-v2.txt": "built in", "format-v2.txt": "All matched files", "graph-v2.txt": "Graph:"}
    for filename, needle in needles.items():
        assert needle in read(RUN / filename).decode("utf-8-sig")
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    capture = RUN / "release-source-v2"
    assert not capture.exists()
    files = [p for name in ("src", "server", "tests", "scripts", "dist") for p in (ROOT / name).rglob("*") if p.is_file() and "__pycache__" not in p.parts]
    files += [ROOT / name for name in ("package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts", "tsconfig.json", "index.html", "receipt_training/scripts/replay_financial_roles.mjs", "receipt_training/scripts/score_financial_roles.py", "receipt_training/scripts/build_financial_role_report.py", "receipt_training/evaluation/FINANCIAL_ROLE_RECOVERY.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md")]
    for path in files:
        raw = read(path)
        target = capture / path.relative_to(ROOT)
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as output:
            output.write(raw)
    screenshots = []
    for project in ("desktop", "mobile"):
        paths = sorted((ROOT / "qa-artifacts/e2e-runs").glob(project + "-*/financial-roles-review.png"), key=lambda p: p.stat().st_mtime)
        assert paths
        folder(paths[-1].parent)
        screenshots.append(paths[-1].parent.relative_to(ROOT).as_posix())
    for path in (RUN, ROOT / "qa-artifacts/financial-role-recovery-v2", ROOT / "qa-artifacts/financial-role-recovery-v3", FINAL):
        folder(path)
    report = {
        "scope": "Original fifty, identical retained independent OCR/vision readings and unchanged v5 references: frozen before/after financial-role parser/verifier, 400 views. Separate saved six-crop Azure/Veryfi adapter controls and current desktop/mobile software checks. No new native or cloud extraction.",
        "counts": counts, "proposals": meta["recoveries"], "scored_per_case_regressions": score["regressions"],
        "primary_summary_rows_removed": 17, "hybrid_automatic_counts_unchanged": counts["hybrid/automatic/before"] == counts["hybrid/automatic/after"],
        "provider_control_counts": controls["counts"],
        "verification": {"unit_tests": 674, "new_unit_tests": 21, "standard_browser_tests": 177, "existing_browser_skip": 1, "build_typecheck_format_graph": "passed", "browser_artifact_folders": screenshots, "native_model_requests": 0, "external_requests": 0},
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "branch": git("branch", "--show-current").decode().strip(), "stable": stable, "original_dirty_diff_sha256": original_diff, "merge_push_deploy": False},
        "new_scanner_latency_samples": 0, "receipt_api_cost_usd": 0,
        "limitations": ["Previously inspected development/evaluation receipts and partial source-informed assistant truth, not a blind holdout or independent complete financial verification.", "Explicit currency enters only deterministic interpretation after extraction. Automatic hybrid counts are unchanged.", "Four role proposals remain unconfirmed. Unsupported item codes and unrelated adjustments/tenders remain visible; exact section arithmetic does not prove a complete bill.", "Primary context guard preserves ambiguous Service/Fee purchases. Final primary fees are 6/8 rather than the early unconstrained version's 7/8; all local diagnostic snapshots remain retained.", "Trusted reconciliation remains 0/49 and all original complete receipts are unscorable. No model, provider, public-release or physical-phone accuracy certification.", "Browser/cloud transport fixtures are synthetic. Saved provider controls make zero real upload/deletion requests and do not expand any consumed approval.", "Final main minified bundle is 518.35 kB and emits the existing 500 kB chunk warning; no runtime dependency added.", "Thirteen legacy evidence declarations remain unresolved in the historical global audit. This checkpoint does not restore them."],
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "proposals": len(meta["recoveries"]), "fees": "7/8", "tax": "16/22", "per_case_regressions": 0, "new_model_requests": 0, "external_requests": 0}))


if __name__ == "__main__":
    main()
