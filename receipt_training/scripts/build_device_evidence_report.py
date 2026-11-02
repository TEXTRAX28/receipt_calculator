"""Score paired local Tesseract calls and seal their source/review evidence."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import archive
from score_adjustments import score_with_adjustments, aggregate_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
QA = ROOT / "qa-artifacts/tesseract-evidence-v1"
OUT = DATA / "evaluation/advanced-device-source-evidence-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env"), "Do not read live configuration"
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or expected == digest, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if not expected and "qa-artifacts" not in path.parts:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path, expected=None):
    return [json.loads(line) for line in read(path, expected).decode("utf-8").splitlines()]


def folder(path):
    for item in sorted(path.rglob("*")):
        if item.is_file() and not {"vite-cache", "__pycache__"}.intersection(item.parts):
            read(item)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            read(ROOT / name, digest)
        print(json.dumps({"verified_files": len(HASHES), "external_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the earlier sealed report"
    records = {r["receipt_id"]: r for r in rows(DATA / "manifest.jsonl")}
    labels = {r["receipt_id"]: r for r in rows(DATA / "annotations/private/priced-rows-v5-financial-labels.jsonl")}
    config = load(DATA / "evaluation/config.json")
    runs, scored = {}, {}
    for version in (1, 2, 3, 4):
        path = DATA / f"evaluation/runs/tesseract-source-original50-v{version}"
        metadata = load(path / "metadata.json")
        assert metadata["completed_at"] and metadata["original_receipts"] == 50
        assert metadata["requests_observed"] == {"post": 0, "external": 0}
        for name, digest in metadata["source_sha256"].items():
            read(path / name, digest)
            if version == 4 and name.startswith("source/after/"):
                assert hashlib.sha256(read(ROOT / "src/lib" / name.removeprefix("source/after/"))).hexdigest() == digest
        pairs = rows(path / "paired.jsonl", metadata["paired_sha256"])
        assert len(pairs) == 50 and len({r["receipt_id"] for r in pairs}) == 50
        assert Counter(r["split"] for r in pairs) == {"development": 38, "evaluation": 12}
        for pair in pairs:
            record = records[pair["receipt_id"]]
            assert record["sha256"] == pair["image_sha256"] and not record["external_processing_allowed"]
            assert pair["identical_prepared_pixels"] and pair["identical_legacy_text"]
            assert pair["after"]["parser_finances_equal"]
            for source in record.get("source_files", [record]):
                read(DATA / source["file_path"], source["sha256"])
        metrics = {}
        for variant in ("before", "after"):
            case_scores = [score_with_adjustments(records[pair["receipt_id"]], labels[pair["receipt_id"]], dict(pair[variant], receipt_id=pair["receipt_id"]), config) for pair in pairs]
            metrics[variant] = aggregate_adjustments(case_scores)
            scored[(version, variant)] = case_scores
        runs[f"v{version}"] = {
            "metrics": metrics,
            "identical_pixels_cases": sum(r["identical_prepared_pixels"] for r in pairs),
            "identical_assembled_text_cases": sum(r["identical_text"] for r in pairs),
            "unchanged_raw_readings_under_legacy_join_cases": sum(r["identical_legacy_text"] for r in pairs),
            "parser_financial_parity_cases": sum(r["after"]["parser_finances_equal"] for r in pairs),
            "source_purchases": sum((r["after"].get("source_summary") or {}).get("items_with_source", 0) for r in pairs),
            "parsed_purchases": sum(len(r["after"]["receipt"]["items"]) for r in pairs),
            "source_conflict_rows": sum(len(r["after"].get("sourceConflicts", [])) for r in pairs),
            "spatially_joined_rows": sum(r["after"].get("joinedSectionRows", 0) for r in pairs),
            "pending_review_checks": sum(len(r["after"]["receipt"]["reviewChecks"]) for r in pairs),
            "local_provider_invocations": 100,
            "native_recognize_calls": sum(len(r[v]["panels"]) for r in pairs for v in ("before", "after")),
            "timing_scope": metadata["timing_scope"],
        }
        folder(path)
    assert runs["v4"]["identical_assembled_text_cases"] == 50
    # Numeric values remain unchanged, including individually scored per-case outcomes.
    score_fields = {key for case in scored[(4, "before")] for key in case["counts"] if key.endswith(("_correct", "_known"))}
    regressions = [{"receipt_id": old["receipt_id"], "field": key, "before": old["counts"].get(key, 0), "after": new["counts"].get(key, 0)} for old, new in zip(scored[(4, "before")], scored[(4, "after")]) for key in sorted(score_fields) if new["counts"].get(key, 0) < old["counts"].get(key, 0)]
    assert not regressions, regressions
    clean = lambda path: re.sub(r"\x1b\[[0-9;]*m", "", read(path).decode("utf-8-sig"))
    unit = clean(QA / "unit-full-final.txt")
    browser = clean(QA / "browser-full-final-v2.txt")
    units = int(re.findall(r"Tests\s+(\d+) passed", unit)[-1])
    browsers = int(re.findall(r"(\d+) passed", browser)[-1])
    assert units >= 755 and browsers >= 187 and "1 skipped" in browser
    assert not re.search(r"\d+ failed", browser[-1800:])
    assert "error TS" not in clean(QA / "typecheck-final-v2.txt")
    assert "built in" in clean(QA / "build-final-v2.txt")
    assert "All matched files use Prettier code style" in clean(QA / "format-final-v3.txt")
    for directory in ("src", "server", "tests", "scripts", "dist"):
        folder(ROOT / directory)
    for name in ("package.json", "package-lock.json", "playwright.config.ts", "vite.config.ts", "tsconfig.json", "receipt_training/scripts/benchmark_device_evidence.mjs", "receipt_training/scripts/build_device_evidence_report.py", "receipt_training/scripts/score.py", "receipt_training/scripts/score_adjustments.py", "receipt_training/evaluation/DEVICE_SOURCE_EVIDENCE.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        read(ROOT / name)
    folder(QA)
    # Source/UI screenshots are local evidence; test identity files make runs distinguishable.
    artifacts = []
    for identity in (ROOT / "qa-artifacts/e2e-runs").glob("*/test.json"):
        record = json.loads(identity.read_text(encoding="utf-8"))
        if any(s in record["title"] for s in ("on-device word evidence", "native tall-receipt source evidence", "real local correction", "actual on-device OCR preserves")):
            artifacts.append(identity.parent.relative_to(ROOT).as_posix())
            folder(identity.parent)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original = r"C:\Users\natan\VSC Code\costco_calc"
    original_head = git("-C", original, "rev-parse", "HEAD").decode().strip()
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    assert original_head == "29a187af7347be94c0728f4785be674500833748"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    result = {
        "scope": "On-device source geometry, conservative overlap assembly and mandatory uncertainty review. Four paired native original-fifty runs retain rejected trials; final raw/text/financial compatibility is verified. This is not a provider promotion or general receipt-price accuracy gain.",
        "runs": runs,
        "final_scored_regressions": regressions,
        "trial_findings": ["v1 retained no source geometry for purchases when a malformed row invalidated an entire panel.", "v2 withheld malformed rows locally, but any unmatched text/source slot still invalidated whole-receipt source collection. Aggressive spatial splicing regressed Tesco matched names and one known line price. Reject that assembly.", "v3 preserves valid independent source slots. If any matched numeric reading is not literally equivalent, the whole photo retains legacy text assembly and both actual regions. Same-area name differences with an identical literal quantity/unit/total suffix can join; no amount is chosen by confidence or reconciliation.", "v4 adds explicit signed-quantity, Unicode-minus and tax-code conflict guards, then repeats the full paired native cohort on the final source. Earlier full browser attempts were interrupted: one overlapped a rebuild, the other exposed a test selector waiting for Edit details on an automatically expanded Hide details row. Preserve both attempts; use the separate final full run after the selector fix."],
        "synthetic_native_result": {"forty_printed_rows_before": 43, "forty_printed_rows_after": 40, "genuine_identical_milk_purchases_preserved": 2, "native_source_first_and_last_sections": True, "contexts": ["desktop Chrome", "iPhone-sized Chromium"], "physical_phone": False, "genuine_photo_gain_claim": False},
        "verification": {"unit_tests": units, "browser_tests": browsers, "existing_skip": 1, "browser_artifact_folders": artifacts},
        "private_uploads": 0, "external_ocr_or_vlm_requests": 0, "paid_activation": False,
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "branch": git("branch", "--show-current").decode().strip(), "stable": stable, "original_head": original_head, "original_diff_sha256": original_diff, "merge_push_deploy": False},
        "limitations": ["English browser OCR remains very inaccurate on this multilingual original corpus. The metadata change improves review, not raw numeric recognition. The stronger local hybrid and prior saved-response provider results are separate measurements.", "Source boxes and SDK confidence are not truth or calibrated probabilities. Same-engine overlapping readings are not independent verification. Missing or ambiguous regions remain unhighlighted and pending.", "Ground-truth coverage remains partial and source-informed. All fifty complete receipts remain unscorable. Reused original evaluation images are compatibility evidence, not a new blind accuracy study; numeric parsing/recognition rules were not tuned to their labels.", "One controlled tall synthetic shows the overlap improvement. Broader genuine-photo overlap, physical-phone memory/camera/timing, Safari and accessibility acceptance remain incomplete.", "Per-panel layout/node budgets and worker deadline exist. Worst-case mobile memory and main-thread overlap work have not been profiled.", "Historical thirteen artifact gaps remain. Gemini private six-crop approval is pending; no new provider upload occurred. Whole goal remains active."],
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(result, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"files": len(HASHES), "unit_tests": units, "browser_tests": browsers, "final_source_purchases": runs["v4"]["source_purchases"], "final_parsed_purchases": runs["v4"]["parsed_purchases"], "final_scored_regressions": len(regressions), "external_requests": 0}))


if __name__ == "__main__":
    main()
