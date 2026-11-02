"""Seal the two familiar public-PDF repairs, without changing source truth."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
OUT = ROOT / "receipt_training/evaluation/advanced-pdf-invoice-columns-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env")
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (QA / "evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if not expected and "qa-artifacts" not in path.parts and ".cache" not in path.parts:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def score(receipt, source):
    gross = receipt["pricesIncludeTax"]
    units = source["gross_unit_prices" if gross else "net_unit_prices"]
    lines = source["gross_line_totals" if gross else "net_line_totals"]
    norm = lambda text: " ".join(text.split()).casefold()
    descriptions = [norm(item["description"] + " " + item["note"].removeprefix("Description continues: ")) for item in receipt["items"]]
    return {
        "purchase_rows": len(receipt["items"]),
        "quantity_correct": sum(item["quantity"] == target for item, target in zip(receipt["items"], source["quantities"], strict=True)),
        "unit_price_correct": sum(item["unitPrice"] == target for item, target in zip(receipt["items"], units, strict=True)) if units else 0,
        "basis_consistent_line_correct": sum(item["lineTotal"] == target for item, target in zip(receipt["items"], lines, strict=True)) if lines else 0,
        "full_description_text_correct": sum(actual == norm(target) for actual, target in zip(descriptions, source["line_descriptions"], strict=True)),
        "merchant_correct": receipt["merchant"] in source["merchant_aliases"],
        "currency_correct": receipt["currency"] == source["currency"],
        "final_total_correct": receipt["printedTotal"] == source["printed_final_total"],
        "printed_tax_correct": receipt["printedTax"] == source["printed_tax"],
    }


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in report["evidence_sha256"].items():
            read(ROOT / name, digest)
        print(json.dumps({"verified_files": len(HASHES), "receipt_uploads": 0}))
        return
    assert not OUT.exists(), "Preserve the previous result"
    baseline = load(ROOT / "receipt_training/evaluation/advanced-public-digital-pdf-v1.json")
    for name, digest in baseline["evidence_sha256"].items():
        read(ROOT / name, digest)
    truth = load(QA / "public-digital-v1/source-truth.json")
    plan = load(QA / "pdf-columns-v5/browser/plan.json")
    meta = load(QA / "pdf-columns-v5/browser/metadata.json")
    finances = load(QA / "pdf-columns-v5/financial-checks.json")
    assert plan["review_workflow"] and meta["source_unchanged"]
    assert meta["cloud_requests"] == meta["native_model_calls"] == meta["automatic_retries"] == 0
    for name, digest in plan["source_sha256"].items():
        read(QA / "pdf-columns-v5/browser/source" / name, digest)
        read(ROOT / name, digest)
    for name, digest in finances["input_sha256"].items():
        read(ROOT / name, digest)
    comparisons = []
    for source in truth["documents"]:
        id = source["id"]
        before = load(QA / "public-digital-v1/browser" / (id + ".json"))
        after = load(QA / "pdf-columns-v5/browser" / (id + ".json"))
        assert after["error"] is None and after["requests"] == {"posts": [], "external": []}
        assert after["confirm_enabled"] is False and not after["has_horizontal_overflow"] and not after["reviewed_horizontal_overflow"]
        assert len(after["source_views"]) == len(source["quantities"]) and all(view["regions"] > 0 for view in after["source_views"])
        clean = lambda receipt: {k: v for k, v in receipt.items() if k != "reviewChecks"}
        assert clean(after["state"]["receipt"]) == clean(after["reviewed_state"]["receipt"])
        before_score, after_score = score(before["state"]["receipt"], source), score(after["state"]["receipt"], source)
        count = len(source["quantities"])
        assert all(after_score[field] == count for field in ("quantity_correct", "unit_price_correct", "basis_consistent_line_correct", "full_description_text_correct"))
        assert all(after_score[field] for field in ("merchant_correct", "currency_correct", "final_total_correct", "printed_tax_correct"))
        checks = next(case for case in finances["cases"] if case["id"] == id)["after_checked"]
        assert checks["discrepancy_minor"] == "0"
        if id == "amazon-public-invoice":
            assert after["reviewed_confirm_enabled"] and after["person_totals"] == ["£6.53", "£6.53"]
            assert after["final_state"]["step"] == "summary" and not checks["issues"]
            assert clean(after["final_state"]["receipt"]) == clean(after["state"]["receipt"])
            assert after["state"]["receipt"]["date"] == "2024-08-30"
        else:
            assert after["reviewed_confirm_enabled"] is False and len(checks["issues"]) == 2
            assert {issue["path"] for issue in checks["issues"]} == {"items.0.unitPrice", "items.1.unitPrice"}
        comparisons.append({"id": id, "before": before_score, "after": after_score, "known_purchases": count, "after_checked_finances": checks, "automated_checked_confirmation_enabled": after["reviewed_confirm_enabled"], "shares": after.get("person_totals"), "elapsed_ms": after["elapsed_ms"]})
    logs = {name: read(QA / ("pdf-columns-v5-" + name + ".log")).decode("utf-8", errors="replace") for name in ("unit", "build", "format", "graph", "run", "financial-checks")}
    first_e2e = read(QA / "pdf-columns-v3-e2e.log").decode("utf-8", errors="replace")
    preceding_e2e = read(QA / "pdf-columns-v4-e2e.log").decode("utf-8", errors="replace")
    final_e2e = read(QA / "pdf-columns-v6-e2e.log").decode("utf-8", errors="replace")
    edge_recheck = read(QA / "pdf-columns-edge-recheck-v1.log").decode("utf-8", errors="replace")
    assert "853 passed" in logs["unit"] and "53 passed" in logs["unit"]
    assert "188 passed" in first_e2e and "1 failed" in first_e2e
    failure = load(QA / "pdf-columns-v3/first-e2e-failure.json")
    assert failure["failed_network_requests"] == [{"url": "http://127.0.0.1:4173/assets/index-DsVqHrDX.css", "resource_type": "stylesheet", "failure": "net::ERR_NO_BUFFER_SPACE"}]
    assert "189 passed" in final_e2e and "1 skipped" in final_e2e and "1 failed" not in final_e2e
    assert "189 passed" in preceding_e2e and "1 skipped" in preceding_e2e
    assert "4 passed" in edge_recheck
    assert "built in" in logs["build"] and "Some chunks are larger than 500 kB" in logs["build"]
    bundle_kb = float(re.search(r"dist/assets/index-[^\s]+\.js\s+(\d+\.\d+) kB", logs["build"])[1])
    assert "All matched files" in logs["format"]
    for run in ("pdf-columns-v1", "pdf-columns-v2", "pdf-columns-v3", "pdf-columns-v4", "pdf-columns-v5", "pdf-columns-v6", "pdf-columns-edge-recheck-v1"):
        for path in sorted((QA / run).rglob("*")):
            if path.is_file() and "vite-cache" not in path.parts:
                read(path)
    for name in ("src/lib/pdf-text.ts", "src/lib/pdf-invoice.ts", "src/lib/pdf-invoice-layout.ts", "tests/pdf-invoice.test.ts", "receipt_training/scripts/benchmark_public_pdf.mjs", "receipt_training/scripts/check_public_pdf_finances.mjs", "receipt_training/scripts/build_pdf_invoice_columns.py", "receipt_training/evaluation/PDF_INVOICE_COLUMNS.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md"):
        read(ROOT / name)
    tracked = subprocess.check_output(["git", "ls-files", "-z", "tests", "server", "scripts"], cwd=ROOT).decode().split("\0")
    for name in filter(None, tracked):
        read(ROOT / name)
    for name in ("playwright.config.ts", "vite.config.ts", "tsconfig.json", "package.json"):
        read(ROOT / name)
    for path in sorted((ROOT / "dist").rglob("*")):
        if path.is_file():
            read(path)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    original = r"C:\Users\natan\VSC Code\costco_calc"
    invariants = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(), "original_head": git("-C", original, "rev-parse", "HEAD").decode().strip(), "original_diff_sha256": hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()}
    assert invariants == {"stable": "ee725ba45e799bee8501d3de034e0302c0127afd", "original_head": "29a187af7347be94c0728f4785be674500833748", "original_diff_sha256": "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"}
    report = {"scope": "Native PDF invoice-column repair on the same two familiar public invoices. Source-preserving supplementary regression, not a blind holdout or original-fifty rescore.", "comparisons": comparisons, "verification": {"unit_passed": 853, "unit_files": 53, "first_browser_run": {"passed": 188, "failed": 1, "existing_skip": 1, "failure": "Stylesheet request failed with Chromium net::ERR_NO_BUFFER_SPACE before Crop click; trace retained."}, "unchanged_targeted_mobile_recheck_passed": 4, "preceding_serial_browser_run": {"passed": 189, "existing_skip": 1, "latest_tax_currency_guard_present": False}, "final_browser_run": {"workers": 1, "passed": 189, "existing_skip": 1}, "build_typecheck_format": "passed", "main_bundle_kb": bundle_kb, "existing_chunk_warning": True}, "limits": ["Automated source-checkbox interactions prove controls, not independent human verification. Initial drafts remain pending source review.", "Gopak remains blocked by two printed quantity/unit/line disagreements despite zero final-total discrepancy. Its ambiguous date remains blank.", "Two source-informed PDFs do not establish general PDF, scanned-receipt, refund, physical-phone or complete-receipt accuracy. No current original-fifty inference or model latency cohort ran.", "PDF timings are local observations, not a controlled before/after speed comparison. No financial engine tolerance or financial source value changed.", "Original private-upload permissions remain consumed; pending Gemini approval and larger-model resource constraints remain. Full goal active."], "requests": {"ocr_vlm_calls": 0, "receipt_uploads": 0, "paid_activation": False, "original_fifty_changed": False}, "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **invariants, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "genuine_documents": 2, "quantities_units_lines": "6/6", "final_totals_tax": "2/2", "automated_checked_split": "GBP 6.53/6.53", "gopak_blocking_unit_errors": 2, "receipt_uploads": 0}))


if __name__ == "__main__":
    main()
