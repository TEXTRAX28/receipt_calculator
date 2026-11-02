"""Seal genuine image-only PDF observations; keep original-cohort truth unchanged."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts/public-scan-v1"
RUNS = ROOT / "receipt_training/evaluation/runs"
RUN = RUNS / "public-scans-on-device-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-public-scanned-pdf-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env")
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (ROOT / "qa-artifacts/evidence-blobs" / expected).read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
    assert not expected or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    if not expected and "qa-artifacts" not in path.parts and ".cache" not in path.parts and "runs" not in path.parts:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def main():
    if "--check" in sys.argv:
        packet = json.loads(OUT.read_text(encoding="utf-8"))
        for name, digest in packet["evidence_sha256"].items():
            read(ROOT / name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_ocr_jobs": 0, "receipt_uploads": 0}))
        return
    assert not OUT.exists(), "Preserve the existing packet"
    truth_raw = read(QA / "source-truth.json")
    assert read(ROOT / "receipt_training/evaluation/public-scanned-reference-v1.json") == truth_raw
    truth = json.loads(truth_raw)
    freeze = load(QA / "reference-freeze.json")
    assert hashlib.sha256(truth_raw).hexdigest() == freeze["truth_sha256"]
    plan = load(RUN / "plan.json")
    meta = load(RUN / "metadata.json")
    assert freeze["recorded_before_new_ocr"] and freeze["recorded_at"] < plan["started_at"]
    assert meta["source_unchanged"] and meta["external_receipt_uploads"] == meta["model_api_calls"] == meta["automatic_retries"] == 0
    extraction = load(QA / "page-extraction.json")
    renders = load(QA / "render-verification.json")
    assert extraction["documents"] == plan["documents"] and len(plan["documents"]) == 3
    assert all(x["pixel_identical"] for x in renders["pages"]) and len(renders["pages"]) == 3
    for document in plan["documents"]:
        read(ROOT / document["path"], document["sha256"])
        read(ROOT / document["source_path"], document["source_sha256"])
        assert document["original_native_text_characters"] == 0 and document["external_processing_allowed"] is False
        assert document["content_streams_preserved"] and document["image_streams_preserved"] and document["page_geometry_preserved"]
    for name, digest in plan["source_sha256"].items():
        read(RUN / "source" / name, digest)
        read(ROOT / name, digest)
    finances = load(RUN / "financial-checks.json")
    for name, digest in finances["input_sha256"].items():
        read(ROOT / name, digest)
    cases = []
    jobs = 0
    for source in truth["documents"]:
        d = load(RUN / (source["id"] + ".json"))
        assert d["error"] is None and not d["confirm_enabled"] and not d["has_horizontal_overflow"]
        assert not d["requests"]["writes"] and not d["requests"]["external"] and len(d["requests"]["local_heads"]) == 3
        assert len(d["ocr"]["reads"]) == 1 and not d["ocr"]["errors"]
        jobs += len(d["ocr"]["reads"])
        receipt = d["state"]["receipt"]
        assert receipt["rawText"] == "" and receipt["printedTotal"] == source["final_total"]
        expected = len(source["items"]) if source["items"] is not None else None
        if expected is not None:
            assert all(item["quantity"] == item["unitPrice"] == "" for item in receipt["items"])
        else:
            assert receipt["items"] == [] and not source["purchase_information_available"]
        calc = next(x["calculation"] for x in finances["cases"] if x["id"] == source["id"])
        cases.append({"id": source["id"], "expected_visible_goods": expected, "returned_rows": len(receipt["items"]), "printed_quantity_fields_copied": 0 if expected is not None else None, "printed_unit_fields_copied": 0 if expected is not None else None, "copied_final_total": receipt["printedTotal"], "final_total_correct": True, "confirmation_enabled": False, "elapsed_ms": d["elapsed_ms"], "calculation": calc})
    assert jobs == 3
    label = load(QA / "strict-label-v2.json")
    initial_label = load(QA / "strict-label.json")
    assert label["items"] == initial_label["items"] and label["coverage"]["tax_legend_visible"] is False
    config = load(ROOT / "receipt_training/evaluation/config.json")
    prediction = next(x for x in finances["cases"] if x["id"] == label["receipt_id"])
    strict = score_with_adjustments({"receipt_id": label["receipt_id"], "category": "non_costco/physical", "country": "GB", "split": "supplementary_source_reviewed"}, label, prediction, config)
    assert json.loads(json.dumps(strict)) == load(QA / "strict-score.json")["result"]
    counts = strict["counts"]
    assert counts["complete_receipt_known"] == 1 and counts["complete_receipt_correct"] == 0
    assert counts["extra_items_on_complete_labels"] == 1 and counts["receipt_fee_correct"] == 0
    memory = load(RUN / "owned-memory.json")
    scope = load(QA / "memory-session.json")
    read(QA / "observer-used.py", scope["observer_source_sha256"])
    assert memory["pid"] == scope["observed_root_pid"] == plan["pid"] and not memory["errors"] and memory["samples"] == 50
    first = load(QA / "first-run-failure.json")
    assert first["ocr_inference_jobs"] == 0 and first["owned_process_tree_terminated"]
    first_plan = load(RUNS / "public-scans-on-device-v1/plan.json")
    for name, digest in first_plan["source_sha256"].items():
        read(RUNS / "public-scans-on-device-v1/source" / name, digest)
        read(ROOT / name, digest)
    for path in sorted(QA.rglob("*")):
        if path.is_file(): read(path)
    for name in ("public-scans-on-device-v1", "public-scans-on-device-v2"):
        for path in sorted((RUNS / name).rglob("*")):
            if path.is_file() and "vite-cache" not in path.parts: read(path)
    for name in ("receipt_training/scripts/benchmark_scanned_pdf.mjs", "receipt_training/scripts/check_scanned_pdf_finances.mjs", "receipt_training/scripts/build_public_scan_baseline.py", "receipt_training/scripts/observe_process_memory.py", "receipt_training/scripts/score.py", "receipt_training/scripts/score_adjustments.py", "receipt_training/evaluation/PUBLIC_SCANNED_PDF_BASELINE.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/manifest.jsonl", "receipt_training/annotations/private/priced-rows-v5-financial-labels.jsonl", "receipt_training/evaluation/advanced-model-comparison.json"):
        read(ROOT / name)
    resource = load(ROOT / "qa-artifacts/qwen8b-resource-20261102T0924.json")
    assert not resource["download_headroom_ok"] and not resource["inference_start_headroom_ok"]
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    original = r"C:\Users\natan\VSC Code\costco_calc"
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(), "original_head": git("-C", original, "rev-parse", "HEAD").decode().strip(), "original_diff_sha256": hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()}
    assert protected == {"stable": "ee725ba45e799bee8501d3de034e0302c0127afd", "original_head": "29a187af7347be94c0728f4785be674500833748", "original_diff_sha256": "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"}
    packet = {"scope": "Three genuine image-only PDF inputs: two purchase invoices and a payment-only control. Current actual on-device UI baseline; no scanner gain or provider superiority claim.", "cases": cases, "strict_single_source_reviewed_case": strict, "resource_observation": {"samples": memory["samples"], "peak_owned_node_browser_tree_bytes": memory["peak_sampled_process_tree_working_set_bytes"], "scope_note": scope["scope_correction"], "physical_phone": False}, "requests": {"new_browser_ocr_jobs": 3, "initial_harness_failed_ocr_jobs": 0, "receipt_uploads": 0, "model_api_calls": 0, "automatic_retries": 0, "local_asset_head_checks": 9, "new_downloads": 0, "paid_activation": False}, "limits": ["Assistant source references frozen before new readings; no independent human verification or blind holdout.", "Complete metric is 0/1 on one new compatible fully referenced invoice. Mixed carriage/VAT and absent purchase information remain outside that denominator; original-fifty truth stays unchanged and unscorable as complete receipts.", "Three local timing observations and sampled development-process memory are not p95, phone performance, model-only memory or a controlled provider comparison.", "First harness HEAD rejection is retained as setup failure. Corrected app scan is not a product improvement; financial interpretation and ambiguous date handling still need work.", "Current app is unchanged from 5fa0d80. No fresh full software suite or heavy/native/cloud comparison ran here. Full goal active."], "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as f: f.write(json.dumps(packet, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "genuine_image_only_pages": 3, "actual_ocr_jobs": 3, "copied_final_totals": "3/3", "strict_complete": "0/1", "payment_control_proposed_purchases": 0, "receipt_uploads": 0}))


if __name__ == "__main__":
    main()
