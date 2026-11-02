"""Seal the genuine-photo preparation experiment, including losing options."""
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-genuine-capture-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest is not None and (not expected or digest == expected), name
    HASHES[name] = digest
    if not expected and not any(p in path.parts for p in ("qa-artifacts", ".cache", "runs")):
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def main():
    if "--check" in sys.argv:
        for name, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_inference_calls": 0}))
        return
    assert not OUT.exists()
    studies = {}
    for reader, run in [("tesseract", "genuine-capture-read-v1"), ("doctr", "genuine-capture-doctr-parsed-v1")]:
        base = "qa-artifacts/" + run
        score, meta = load(base + "/scores.json"), load(base + "/metadata.json")
        assert meta["source_unchanged"] and score["fresh_ocr_sections"] == 17
        assert len(score["cases"]) == 12 and sum(c["reused_original"] for c in score["cases"]) == 2
        assert not any(any(c["initial_confirmable"]) for c in score["cases"])
        for name, digest in score["evidence_sha256"].items():
            record(name, digest)
        studies[reader] = {"counts": score["counts"], "timings": score["timings"], "cases": score["cases"]}
    plan = load("qa-artifacts/genuine-capture-plan-v1/plan.json")
    assert plan["recorded_before_new_ocr"] and len(plan["cases"]) == 4
    coverage = [c["source_word_containment"] for c in plan["cases"] if c["source_word_containment"]]
    assert sum(c["source_visible_word_boxes"] for c in coverage) == 170 and all(not c["boxes_not_enclosed"] for c in coverage)
    controller = load("qa-artifacts/genuine-capture-doctr-v1/controller.json")
    assert controller["exit_code"] == 0 and not controller.get("error") and controller["selected_panels"] == 17
    assert controller["minimum_available_ram"] >= controller["runtime_floor"]
    for name, digest in controller["input_sha256"].items():
        record(name, digest)
    native = load(controller["native_run"] + "/metadata.json")
    assert native["errors"] == 0 and native["peak_working_set_bytes"] == 1379475456
    memory = load("qa-artifacts/genuine-capture-doctr-v1/memory-scope.json")
    assert memory["actual_native_model_process_peak_working_set_bytes"] == native["peak_working_set_bytes"]
    for name in ["genuine-capture-plan-v1", "genuine-capture-read-v1", "genuine-capture-doctr-v1", "genuine-capture-doctr-parsed-v1"]:
        for path in sorted((ROOT / "qa-artifacts" / name).rglob("*")):
            if path.is_file() and "vite-cache" not in path.parts:
                record(path.relative_to(ROOT).as_posix())
    for folder in [controller["native_run"], controller["panel_run"]]:
        for path in sorted((ROOT / folder).rglob("*")):
            if path.is_file():
                record(path.relative_to(ROOT).as_posix())
    for name in ["prepare_capture_accuracy.py", "benchmark_capture_accuracy.mjs", "benchmark_capture_doctr.py", "replay_capture_doctr.mjs", "score_capture_accuracy.py", "build_genuine_capture_report.py", "benchmark_local.py"]:
        record("receipt_training/scripts/" + name)
    for name in ["GENUINE_CAPTURE_COMPARISON.md", "GOAL_ACCEPTANCE_AUDIT.md", "advanced-ocr-invoice-columns-v1.json", "advanced-qwen8b-trial-guards-v1.json"]:
        record("receipt_training/evaluation/" + name)
    # Protected Git state and immutable source data are checked before sealing.
    git = lambda *a, cwd=ROOT: subprocess.check_output(["git", *a], cwd=cwd)
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    import hashlib
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(), "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(), "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    packet = {"scope": "Four familiar development transactions/five photos. Genuine-photo original/crop/straighten comparison; application behavior unchanged. Do not promote automatic correction or a model from this experiment.", "readers": studies, "source_visible_word_boxes_enclosed": 170, "fresh_image_section_inferences": 34, "private_external_uploads": 0, "model_downloads": 0, "automatic_retries": 0, "memory": memory, "request_scope": "Cached local CPU/browser readers only; Python socket denial is not OS isolation", "limits": ["Original CORD subset and supplied UK transaction remain separate; labels/splits/permissions unchanged. Familiar assistant-reviewed development cases, not an independent holdout.", "Correction changes contrast/resolution/panel planning as well as geometry; causal attribution to homography alone is invalid.", "Correction loses totals and/or adds repeats in docTR; no automatic correction selection is justified. All drafts remain blocked and UK strict complete remains 0/1.", "Native-only docTR timing excludes initialization and preparation; Tesseract includes browser preparation/checks. No p95 or handset comparison.", "Controller peak measures the Windows launcher only. Native model process OS peak is separate; GPU/whole-app memory unmeasured.", "Latest app tests remain 874 unit/189 browser passes and one existing skip; no runtime source change warrants repeating that suite. The full goal remains active."], "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), **protected, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "fresh_image_sections": 34, "external_uploads": 0, "automatic_correction_promoted": False}))


if __name__ == "__main__":
    main()
