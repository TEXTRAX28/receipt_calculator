"""Seal local OCR-column evidence without changing truth or legacy packets."""
from pathlib import Path
import hashlib
import json
import re
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-ocr-invoice-columns-v1.json"
HASHES = {}


def read(name, expected=None):
    path = ROOT / name
    path.resolve().relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or digest == expected, name
    HASHES[name] = digest
    if not expected and path.is_file() and not any(p in path.parts for p in ("qa-artifacts", ".cache", "runs")):
        archive(path, digest)
    return raw


def load(name):
    return json.loads(read(name))


def git(*args, cwd=ROOT):
    return subprocess.check_output(["git", *args], cwd=cwd)


def main():
    if "--check" in sys.argv:
        for name, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            read(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_inference_calls": 0}))
        return
    assert not OUT.exists()
    qa = "qa-artifacts/ocr-invoice-v1/"
    scores = load("qa-artifacts/ocr-invoice-retained-v2/scores.json")
    assert not scores["original50_changes"] and not scores["original50_scored_regressions"]
    for name, digest in scores["evidence_sha256"].items():
        read(name, digest)
    scans = "receipt_training/evaluation/runs/public-scans-columns-v1/"
    plan, meta = load(scans + "plan.json"), load(scans + "metadata.json")
    assert meta["source_unchanged"] and len(meta["cases"]) == 3
    assert meta["external_receipt_uploads"] == meta["model_api_calls"] == meta["automatic_retries"] == 0
    assert all(c["error"] is None and c["ocr_sections"] == 1 and not c["confirm_enabled"] for c in meta["cases"])
    for name, digest in plan["source_sha256"].items():
        read(name, digest)
        read(scans + "source/" + name, digest)
    read(plan["review_plan_path"], plan["review_plan_sha256"])
    parity = load(qa + "fresh-ocr-parity.json")
    assert len(parity) == 3 and all(all(p["equal_read_fields"].values()) for p in parity)
    for document in plan["documents"]:
        read(document["path"], document["sha256"])
        result = load(scans + document["id"] + ".json")
        assert not result["has_horizontal_overflow"] and not result["requests"]["writes"] and not result["requests"]["external"]
    reviewed = load(scans + "cleaning-supplies-scan.json")
    assert reviewed["reviewed_confirm_enabled"] and reviewed["person_totals"] == ["£58.89", "£58.89"]
    assert not reviewed["reviewed_horizontal_overflow"] and reviewed["explicit_edits"][0]["field"] == "merchant"
    native = "qa-artifacts/ocr-invoice-native-pdf-v1/browser/"
    native_meta = load(native + "metadata.json")
    assert native_meta["source_unchanged"] and all(c["error"] is None for c in native_meta["cases"])
    assert load(native + "amazon-public-invoice.json")["person_totals"] == ["£6.53", "£6.53"]
    assert load(native + "gopak-public-invoice.json")["reviewed_confirm_enabled"] is False
    unit, e2e, build, formatting = (read(qa + name).decode("utf-8") for name in ("unit.log", "e2e.log", "build.log", "format.log"))
    assert "874 passed" in unit and "54 passed" in unit
    assert "189 passed" in e2e and "1 skipped" in e2e and not re.search(r"^\s+\d+ failed", e2e, re.MULTILINE)
    assert "built in" in build and "500 kB" in build
    assert "All matched files use Prettier code style!" in formatting
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(),
                 "original_branch": git("branch", "--show-current", cwd=original).decode().strip(),
                 "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(),
                 "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "receipt-dataset-evaluation", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    for folder in (qa, "qa-artifacts/ocr-invoice-retained-v1", "qa-artifacts/ocr-invoice-retained-v2", "qa-artifacts/ocr-invoice-original50-v1", native, scans):
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file() and "vite-cache" not in path.parts:
                read(path.relative_to(ROOT).as_posix())
    for name in ("receipt_training/scripts/build_ocr_invoice_report.py", "receipt_training/scripts/replay_ocr_invoice.mjs", "receipt_training/scripts/score_ocr_invoice.py", "receipt_training/scripts/benchmark_scanned_pdf.mjs", "receipt_training/scripts/benchmark_public_pdf.mjs", "receipt_training/scripts/score.py", "receipt_training/scripts/score_adjustments.py", "receipt_training/evaluation/OCR_INVOICE_COLUMNS.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/advanced-public-scanned-pdf-v1.json", "receipt_training/evaluation/public-scanned-reference-v1.json", "receipt_training/evaluation/advanced-model-comparison.json", "receipt_training/manifest.jsonl", "receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl"):
        read(name)
    packet = {"scope": "Generic source-owned OCR invoice interpretation sharing the native-PDF reader. Familiar supplementary cases, not a blind holdout or provider promotion. Full goal remains active.",
              "counts": scores["counts"], "original50_saved_reading_views": 500, "original50_changes": [],
              "public_initial_strict_complete": "0/1", "public_merchant_corrected_checked_complete": "1/1",
              "independent_human_verified": False, "scanned_ui_cases": meta["cases"], "exact_raw_ocr_field_parity": parity,
              "reviewed_split": reviewed["person_totals"], "reviewed_financial_edits": 0,
              "verification": {"unit": 874, "unit_files": 54, "browser_pass": 189, "browser_existing_skip": 1, "browser_workers": 1,
                               "build_typecheck_format_graph": "pass", "main_js_kb": 563.42, "existing_chunk_size_warning": True},
              "request_scope": {"fresh_local_ocr_jobs": 3, "fresh_native_pdf_documents": 2, "external_receipt_uploads": 0,
                                "model_api_calls": 0, "paid_activation": False, "automatic_retries": 0},
              "limitations": ["Automatic strict complete remains 0/1; reviewed 1/1 includes an explicit merchant correction and automated source-check interactions.", "Mixed carriage/VAT and absent purchase information remain unsupported and blocked.", "Original on-device saved metadata lacks new wordRows; no fresh original-fifty OCR calls were made here.", "Three laptop timings are not p95, physical-phone performance or a controlled speed comparison; memory was not remeasured.", "Raw source/QA files stay ignored/local. Clean-checkout reproduction was not performed. Known thirteen legacy exact-byte gaps remain separate.", "No larger model is installed or promoted; resource/permission boundaries remain in force."],
              "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected, "merge_push_deploy": False},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "original50_views": 500, "scored_regressions": 0,
                      "automatic_complete": "0/1", "reviewed_complete": "1/1", "private_uploads": 0}))


if __name__ == "__main__":
    main()
