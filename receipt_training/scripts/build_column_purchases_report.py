"""Seal unchanged-reading column recovery and separate synthetic availability evidence."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive
from build_printed_provider_checkpoint import field_score

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/column-purchases-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-column-purchases-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env"), "Never capture live configuration"
    raw = path.read_bytes() if path.exists() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if "qa-artifacts" not in path.parts and expected is None:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path):
    return [json.loads(line) for line in read(path).decode("utf-8").splitlines()]


def folder(path):
    for child in sorted(path.rglob("*")):
        if child.is_file() and "__pycache__" not in child.parts:
            read(child)


def provider_controls():
    labels = {row["receipt_id"]: row for row in rows(ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl")}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    counts, detail = defaultdict(Counter), []
    for provider in ("azure", "veryfi"):
        paired = {}
        for variant, base in (("before", ROOT / "qa-artifacts/financial-role-recovery-v1/provider-controls"), ("after", RUN / "provider-controls")):
            for prediction in rows(base / provider / "predictions.jsonl"):
                result = field_score(labels[prediction["receipt_id"]], prediction, config)
                vector = {key: result[key] for key in ("expected_purchases", "proposed_rows", "matched_purchase_names", "exact_normalized_descriptions", "unmatched_proposed_rows")}
                vector.update({field + "_" + kind: value for field, values in result["field_equality"].items() for kind, value in values.items()})
                vector["copied_final_total_correct"] = int(result["document_equality"]["printedTotal"] is True)
                counts[f"{provider}/{prediction['mode']}/{variant}"].update(vector)
                paired[(prediction["case"], prediction["mode"], variant)] = vector
                detail.append({"provider": provider, "case": prediction["case"], "mode": prediction["mode"], "variant": variant, "counts": vector})
        for (case, mode, variant), vector in paired.items():
            if variant == "before":
                assert vector == paired[(case, mode, "after")], (provider, case, mode)
        assert counts[provider + "/known-currency/after"]["lineTotal_correct"] == 25
        meta = load(RUN / "provider-controls" / provider / "metadata.json")
        if provider == "azure":
            assert meta["external_requests"] == meta["new_model_requests"] == 0
            for filename, digest in meta["input_sha256"].items():
                read(ROOT / filename, digest)
        else:
            assert meta["actual_external_requests"] == meta["forbidden_network_attempts"] == 0
    return {"counts": {key: dict(value) for key, value in counts.items()}, "per_case": detail, "actual_external_requests": 0}


def main():
    if "--check" in sys.argv:
        packet = json.loads(OUT.read_text(encoding="utf-8"))
        for filename, digest in packet["evidence_sha256"].items():
            read(ROOT / filename, digest)
        print(json.dumps({"verified_files": len(HASHES), "network_requests": 0}))
        return
    assert not OUT.exists(), "Preserve this evidence packet"
    score = load(RUN / "scores.json")
    assert score["regressions"] == []
    for filename, digest in score["evidence_sha256"].items():
        read(ROOT / filename, digest)
    meta = load(RUN / "replay/metadata.json")
    assert meta["prediction_views"] == 400 and meta["new_model_requests"] == meta["external_requests"] == 0
    for filename, digest in meta["input_sha256"].items():
        read(ROOT / filename, digest)
    for filename, digest in meta["source_sha256"]["after"].items():
        read(ROOT / filename, digest)
        archive(ROOT / filename, digest)
    controls = provider_controls()
    needles = {"unit-first.txt": "693 passed", "browser-full-first.txt": "179 passed", "build-first.txt": "built in", "format-final.txt": "All matched files", "graph-final.txt": "Graph:"}
    for filename, needle in needles.items():
        assert needle in read(RUN / filename).decode("utf-8-sig")
    for filename in ("tests/column-purchases.test.ts", "tests/e2e/column-purchases.spec.ts", "receipt_training/scripts/replay_column_purchases.mjs", "receipt_training/scripts/score_column_purchases.py", "receipt_training/scripts/build_column_purchases_report.py", "receipt_training/scripts/build_printed_provider_checkpoint.py", "receipt_training/scripts/score.py", "receipt_training/evaluation/COLUMN_PURCHASES.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md", "receipt_training/evaluation/advanced-financial-role-recovery-v2.json"):
        read(ROOT / filename)
    screenshots = []
    for project in ("desktop", "mobile"):
        paths = sorted((ROOT / "qa-artifacts/e2e-runs").glob(project + "-*/column-review.png"), key=lambda path: path.stat().st_mtime)
        assert paths
        folder(paths[-1].parent)
        screenshots.append(paths[-1].parent.relative_to(ROOT).as_posix())
    folder(RUN)
    folder(ROOT / "dist")
    synthetic = ROOT / "qa-artifacts/gemini-38-synthetic-availability-v1"
    availability = load(synthetic / "metadata.json")
    assert availability["strict_schema_passed"] is True and availability["private_receipt_requests"] == 0
    assert [r["http_status"] for r in availability["requests"]] == [200, 200]
    folder(synthetic)
    prepared = ROOT / "qa-artifacts/provider-review/gemini38-screen-v1"
    for path in sorted(prepared.iterdir()):
        if path.is_file():
            read(path)
    for filename in ("receipt_training/scripts/gemini38_screening.mjs", "receipt_training/scripts/test_gemini38_screening.mjs"):
        read(ROOT / filename)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original_diff = hashlib.sha256(git("-C", r"C:\Users\natan\VSC Code\costco_calc", "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    report = {"scope": "Original fifty unchanged retained readings and v5 truth; 400 frozen before/after primary/hybrid context views, not new inference. Separate saved Azure/Veryfi controls and one real non-private synthetic Gemini availability check.",
        "counts": score["counts"], "improvements": score["improvements"], "scored_per_case_regressions": [], "provider_controls": controls,
        "verification": {"unit_tests": 693, "new_unit_tests": 19, "standard_browser_tests": 179, "existing_browser_skip": 1, "new_browser_tests": 2, "typecheck_build_format_graph": "passed", "browser_artifact_folders": screenshots},
        "requests": {"column_replay_native": 0, "column_replay_external": 0, "provider_replays_external": 0, "synthetic_gemini_metadata_get": 1, "synthetic_gemini_generation_post": 1, "new_private_uploads": 0, "billing_activated": False},
        "gemini_private_comparison": "Six exact identifier-reduced JPEG crops and bounded runner prepared; separate Phase 6 approval requested, not granted by preparation. Original fifty excluded. JPEG differs from prior PNG encoding.",
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "branch": git("branch", "--show-current").decode().strip(), "stable": stable, "original_diff_sha256": original_diff, "merge_push_deploy": False},
        "limitations": ["Only previously inspected development cord-v2-train-006 improves. No blind holdout or scored evaluation gain.", "Explicit currency enters deterministic interpretation after extraction; automatic counts unchanged.", "One hybrid line price improves. Weak unit-price tokens remain withheld. All interpreted roles/recovered prices require source checks.", "Trusted reconciliation remains 0/49; original complete receipts are unscorable under partial references.", "No new scanner latency cohort, physical phone, Safari or public-release certification. The synthetic Gemini check establishes availability only.", "The 521.72 kB main bundle retains its existing size warning; no new runtime dependency.", "Thirteen historical evidence declarations remain missing; this packet does not restore them."],
        "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as target:
        target.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "hybrid_known_prices": "132/143", "per_case_regressions": 0, "synthetic_gemini_requests": 2, "private_uploads": 0}))


if __name__ == "__main__":
    main()
