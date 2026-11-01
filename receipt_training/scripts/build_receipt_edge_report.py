"""Freeze local crop-edge studies, actual preview/worker replay and mobile QA."""
import hashlib
import json
from pathlib import Path
import shutil
import statistics
import sys

import build_printed_provider_checkpoint as evidence
from build_veryfi_screening_result import chain

ROOT = evidence.ROOT
QA = ROOT / "qa-artifacts"
OUT = ROOT / "receipt_training/evaluation/advanced-receipt-edges-v2.json"
load, remember = evidence.load, evidence.remember


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def study(tag):
    folder = QA / tag
    result = load(folder / "results.json")
    remember(folder / "source.ts", result["source_sha256"])
    remember(folder / "runner.mjs", result["runner_sha256"])
    selection = load(folder / "selection.json")
    remember(ROOT / "receipt_training/manifest.jsonl", result["manifest_sha256"])
    if len(selection) != 53 or len(result["results"]) != 53 or result["new_external_requests"] or result["blocked_external_requests"]:
        raise ValueError("Unexpected selection or external request")
    selected = {row["id"]: row for row in selection}
    if len(selected) != 53:
        raise ValueError("Duplicate source identifier")
    for row in result["results"]:
        source = Path(selected[row["id"]]["path"])
        if row["input_sha256"] != selected[row["id"]]["sha256"]:
            raise ValueError("Study input differs from selection")
        if not source.is_relative_to(ROOT):
            if row["id"] not in ("user-original-items", "user-original-totals"):
                raise ValueError("Unexpected external input path")
            canonical = QA / "receipt-edge-inputs-v1" / (row["id"] + ".jpeg")
            canonical.parent.mkdir(exist_ok=True)
            if not canonical.exists():
                payload = source.read_bytes()
                if hashlib.sha256(payload).hexdigest() != row["input_sha256"]:
                    raise ValueError("Original attachment bytes changed")
                with canonical.open("xb") as handle:
                    handle.write(payload)
            source = canonical
        remember(source, row["input_sha256"])
        remember(folder / "cases" / (row["id"] + ".png"), row["overlay_sha256"])
        case_path = folder / "cases" / (row["id"] + ".json")
        if case_path.exists() and load(case_path) != row:
            raise ValueError("Per-image metrics differ from the summary")
    for name, digest in result.get("source_module_sha256", {}).items():
        remember(folder / "source" / name, digest)
    for name, digest in result.get("loaded_frozen_module_sha256", {}).items():
        if digest != result["source_module_sha256"][name]:
            raise ValueError("A browser module differs from its frozen source")
    if result.get("pipeline_includes_preview_and_real_worker"):
        expected = {"images.ts", "image-quality.ts", "edge-preview.ts", "receipt-edges.worker.ts", "receipt-edges.ts"}
        if set(result["loaded_frozen_module_sha256"]) != expected:
            raise ValueError("Missing actual preview/worker load proof")
    elif not result["loaded_frozen_source_sha256"] or any(d != result["source_sha256"] for d in result["loaded_frozen_source_sha256"]):
        raise ValueError("Missing kernel load proof")
    return result


def main():
    if "--check" in sys.argv:
        chain(OUT)
        print(json.dumps({"verified_files": len(evidence.EVIDENCE), "new_external_requests": 0}))
        return
    if OUT.exists():
        raise ValueError("Preserve this report; use --check")
    chain(ROOT / "receipt_training/evaluation/advanced-reduced-price-grouping-v1.json")
    logs = {"receipt-edge-full-unit-final-v1.log": "392 passed",
            "receipt-edge-browser-focused-v1.log": "8 passed",
            "receipt-edge-browser-full-v1.log": "151 passed",
            "receipt-edge-async-unit-v1.log": "7 passed",
            "receipt-edge-build-v1.log": "built in",
            "receipt-edge-typecheck-v1.log": "tsc --noEmit",
            "receipt-edge-format-v2.log": "All matched files use Prettier code style",
            "receipt-edge-graph-v2.log": "Graph is current"}
    for name, marker in logs.items():
        if marker not in remember(QA / name).read_text(encoding="utf-8"):
            raise ValueError("Missing successful validation: " + name)
    studies = [study("receipt-edge-study-v" + str(i)) for i in (1, 2, 3)]
    pipeline = study("receipt-edge-pipeline-v1")
    if studies[-1]["source_sha256"] != pipeline["source_sha256"]:
        raise ValueError("The actual pipeline uses another kernel")
    geometry = load(QA / "receipt-edge-geometry-audit-v1.json")
    for version in geometry["versions"]:
        for name, digest in version["source_sha256"].items():
            remember(ROOT / name, digest)
    remember(ROOT / "receipt_training/scripts/audit_receipt_edge_geometry.py", geometry["audit_source_sha256"])
    validation = load(QA / "receipt-edge-pipeline-v1/validation.json")
    remember(QA / "record-edge-pipeline-validation-v1.py", validation["script_sha256"])
    for name, digest in validation["geometry"]["source_sha256"].items():
        remember(ROOT / name, digest)
    if validation["geometry"]["words_not_fully_enclosed"] or len(validation["assistant_visual_reviews"]) != 5 or not all(r["enclosed"] for r in validation["assistant_visual_reviews"]):
        raise ValueError("Source word/window review failed")
    old = load(QA / "provider-review/veryfi-screening-crops-v2/ocr-text-reduced-price-v1/metadata.json")
    changed = [name for name, digest in old["source_sha256"].items() if pipeline["source_module_sha256"].get(name) != digest]
    if changed:
        raise ValueError("Existing image or financial library changed")
    before, after = [load(QA / "evidence-audits" / (name + ".json")) for name in
                     ("receipt-edge-before-browser-v1", "receipt-edge-after-browser-v1")]
    gaps = lambda report: {(name, gap["path"], gap["expected_sha256"])
                           for name, row in report["reports"].items() for gap in row["gaps"]}
    if gaps(before) != gaps(after) or len(gaps(after)) != 13:
        raise ValueError("The declared historical evidence gap set changed")
    equivalent = load(QA / "receipt-edge-format-equivalence-v2.json")
    remember(QA / "receipt-edge-e2e-run-source-v1.ts", equivalent["executed_source_sha256"])
    if sha(ROOT / "tests/e2e/receipt-edges.spec.ts") != equivalent["formatted_source_sha256"]:
        raise ValueError("The current test differs from the validated formatted source")
    if not equivalent["only_whitespace_changed"] or not equivalent["emitted_javascript_ast_identical"]:
        raise ValueError("The final browser test changed beyond formatting")
    viewport = load(QA / "receipt-edge-viewport-v1/results.json")
    for row in viewport["results"]:
        if row["horizontalOverflow"] or row["apply"]["height"] < 44:
            raise ValueError("Phone viewport/action inspection failed")
        for kind, field in (("frame", "frame_sha256"), ("controls", "controls_sha256")):
            remember(QA / "receipt-edge-viewport-v1" / f"phone-{row['width']}-{kind}.png", row[field])
    remember(QA / "receipt-edge-viewport-v1/runner.mjs")
    screenshots = list((QA / "e2e-runs").glob("*/receipt-edges-*.png"))
    if len(screenshots) != 4:
        raise ValueError("Missing focused/full mobile/desktop browser artifacts")
    for path in screenshots:
        remember(path)
        remember(path.parent / "test.json")
    for name in ("receipt-edge-kernel-unit-v1.log", "receipt-edge-kernel-unit-v2.log", "receipt-edge-kernel-unit-v3.log",
                 "receipt-edge-full-unit-v1.log", "receipt-edge-format-v1.log", "receipt-edge-graph-v1.log",
                 "receipt-edge-format-equivalence-v1.mjs", "receipt-edge-format-equivalence-v2.mjs"):
        remember(QA / name)
    checkpoint = QA / "receipt-edge-checkpoint-v2"
    checkpoint.mkdir()
    for name in ("src/ImageCropper.tsx", "src/ReceiptAreaReader.tsx", "src/styles.css", "tests/receipt-edges.test.ts",
                 "tests/edge-preview.test.ts", "tests/e2e/receipt-edges.spec.ts", "tests/e2e/computer-reader.spec.ts"):
        path = checkpoint / name
        path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / name, path)
        remember(path)
    assets = list((ROOT / "dist/assets").glob("receipt-edges.worker-*.js"))
    if len(assets) != 1:
        raise ValueError("Missing built production edge worker")
    shutil.copyfile(assets[0], checkpoint / "worker.js")
    remember(checkpoint / "worker.js")
    for name in (Path(__file__), ROOT / "receipt_training/scripts/benchmark_receipt_edges.mjs"):
        remember(name)
    remember(QA / "receipt-edge-report-capture-v1/report.json")
    remember(QA / "receipt-edge-report-capture-v1/builder.py")
    latency = sorted(row["edge_preview_ms"] for row in pipeline["results"])
    report = {
        "scope": "Optional local receipt-side/frame suggestions before manual Apply crop. Bounded pixel analysis in an owned worker; original and current crop remain unchanged until confirmation. This is not financial OCR accuracy or public-release acceptance.",
        "verified_source_locations": [{"source_file": "src/lib/receipt-edges.ts", "source_location": "L26"},
                                      {"source_file": "src/lib/edge-preview.ts", "source_location": "L6"},
                                      {"source_file": "src/ImageCropper.tsx", "source_location": "L44"}],
        "development_studies": [{"version": i + 1, "source_sha256": value["source_sha256"], "inputs": len(value["results"]),
                                 "suggestions": sum(r["suggestion"] is not None for r in value["results"])} for i, value in enumerate(studies)],
        "prototype_rejections": ["Version 1 clipped 52 of 786 upstream visible word regions across 30 proposed CORD crops and failed two synthetic containment tests; not exposed to users.",
                                 "Version 2 passed synthetic tests but proposed only three of 53 crops and no CORD crops; zero scored CORD words is not evidence of successful containment."],
        "actual_preview_worker_pipeline": {"inputs": 53, "suggestions": sum(r["suggestion"] is not None for r in pipeline["results"]),
                                           "abstentions": sum(r["suggestion"] is None for r in pipeline["results"]),
                                           "loaded_frozen_modules": list(pipeline["loaded_frozen_module_sha256"]),
                                           "raw_to_prepared_frame_differences": validation["raw_and_preview_pipeline_frame_differences"],
                                           "word_geometry": {key: validation["geometry"][key] for key in ("proposed_crops_with_upstream_geometry", "upstream_visible_words", "words_not_fully_enclosed")},
                                           "assistant_visual_envelopes": validation["assistant_visual_reviews"],
                                           "edge_preview_worker_wall_median_ms": statistics.median(latency),
                                           "edge_preview_worker_wall_max_ms": max(latency),
                                           "timing_scope": "Desktop Chrome, includes preview decode/sampling, worker load and computation; excludes upload preparation, user review and OCR. Not physical handset performance.",
                                           "new_ocr_or_vlm_calls_by_geometry_studies": 0, "new_external_receipt_uploads": 0},
        "safety": {"sample_max_side": 640, "sample_max_pixels": 409600, "deadline_ms": 5000,
                   "cancel_reset_unmount_terminate_owned_worker": True, "late_decode_closed": True,
                   "area_reread_and_pdf_pages_offer_no_whole_receipt_edge_button": True,
                   "existing_library_files_unchanged": len(old["source_sha256"]),
                   "existing_financial_or_ocr_provider_changed": False},
        "tests": {"unit": "392 passed, including eight geometry and seven asynchronous resource-lifetime cases",
                  "focused_browser": "8 passed", "full_browser": "151 passed; one existing skip",
                  "real_ocr_scope": "New synthetic photo reads through actual on-device Tesseract after applying the real suggestion, retaining both product names and total 5.50. This is not real-receipt field accuracy.",
                  "build_typecheck_format_graph": "passed", "built_worker_bytes": assets[0].stat().st_size,
                  "test_source_formatting": "After the full run, a host-side method chain was formatted. Executed source is preserved; non-whitespace bytes and emitted JavaScript AST remain identical. Initial raw emitted-text equality check rejected preserved layout whitespace; version 2 checks AST and character identity excluding whitespace."},
        "mobile_viewport_inspection": viewport,
        "evidence_integrity": {"historical_missing_declared_hashes_before": 13, "after": 13, "same_expected_gap_set": True, "new_gaps": 0},
        "provisional_report_capture": "The unpublished v1 report/builder are preserved privately. That capture pinned a mutable working-test path; the published v2 instead verifies the exact frozen snapshot so later app/test edits do not invalidate this evidence.",
        "limits": ["Source-informed development work, not a new holdout or independently human-verified geometry truth. Upstream CORD word geometry covers only its annotated text; five other envelopes are assistant visual review of target receipt columns.",
                   "The partial adjacent document in the 20180210 photograph is outside that target-receipt envelope. A proposed frame requires user review of the intended document and every item/total.",
                   "Observed crop suggestions are predominantly side trims. Perspective correction, arbitrary rotation, faint/occluded boundaries and broader document coverage remain open. Abstention can also mean a receipt is already framed.",
                   "Full-page browser screenshots expand fixed-overlay capture and are not viewport-fit evidence. Separate 320/390 by 844 viewport-only captures and measured dialog/action bounds are retained.",
                   "No recognition improvement, complete receipt correctness, private-service retry, production authentication or handset-camera performance is claimed. Cloud permissions remain consumed; original labels/splits/permissions and stable branch remain preserved."],
        "evidence_sha256": evidence.EVIDENCE,
    }
    payload = json.dumps(report, ensure_ascii=False, indent=2) + "\n"
    with OUT.open("x", encoding="utf-8", newline="\n") as handle:
        handle.write(payload)
    print(json.dumps({"output": OUT.relative_to(ROOT).as_posix(), "verified_files": len(evidence.EVIDENCE),
                      "real_photo_inputs": 53, "suggestions": report["actual_preview_worker_pipeline"]["suggestions"],
                      "new_external_receipt_uploads": 0}))


if __name__ == "__main__":
    main()
