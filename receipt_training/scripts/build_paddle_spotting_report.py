"""Seal the actual local spotting pilot and same-reading parser comparison."""
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from audit_evidence_integrity import archive
from score_adjustments import score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/paddle-spotting-pilot-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-paddle-spotting-v2.json"
HASHES, RESOLVED = {}, {}


def read(path, expected=None):
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected is not None and (not path.is_file() or digest != expected):
        frozen = ROOT / "qa-artifacts/evidence-blobs" / expected
        assert frozen.is_file(), str(path)
        raw = frozen.read_bytes()
        assert hashlib.sha256(raw).hexdigest() == expected
        RESOLVED[path.relative_to(ROOT).as_posix()] = frozen.relative_to(ROOT).as_posix()
        HASHES[frozen.relative_to(ROOT).as_posix()] = expected
        return raw
    assert path.is_file(), str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def verify_inputs(mapping):
    for path, digest in mapping.items():
        read(ROOT / path, digest)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        verify_inputs(report["evidence_sha256"])
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "exact_archive_resolutions": len(RESOLVED), "new_model_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the sealed evidence"
    plan, execution = load(RUN / "plan.json"), load(RUN / "execution.json")
    assert execution["status"] == "completed" and len(execution["calls"]) == 12
    verify_inputs(plan["input_sha256"])
    replay = load(RUN / "postprocess-v1/replay-metadata.json")
    verify_inputs(replay["input_sha256"])
    for path, digest in replay["source_sha256"].items():
        read(RUN / "source" / path, digest)
    for path, digest in replay["loaded_frozen_source_sha256"].items():
        assert digest == replay["source_sha256"][path]
    read(RUN / "postprocess-v1/runner.mjs", replay["runner_sha256"])
    raw = read(RUN / "postprocess-v1/predictions.jsonl", replay["predictions_sha256"])
    predictions = list(map(json.loads, raw.decode("utf-8").splitlines()))
    assert len(predictions) == 54
    labels = {}
    for filename in ("priced-rows-v5-financial-labels.jsonl", "supplement-financial-v2-labels.jsonl"):
        labels.update({row["receipt_id"]: row for row in map(json.loads, read(ROOT / "receipt_training/annotations/private" / filename).decode("utf-8").splitlines())})
    config = load(ROOT / "receipt_training/evaluation/config.json")
    counts, detail, controls = defaultdict(Counter), [], []
    for row in predictions:
        result = score_with_adjustments(row["record"], labels[row["receipt_id"]], row, config)
        key = "/".join((row["cohort"], row["variant"], row["mode"]))
        detail.append({"variant": row["variant"], "mode": row["mode"], "cohort": row["cohort"], "control": row["control"], **result})
        if row["control"]:
            controls.append({"variant": row["variant"], "mode": row["mode"], "predicted_items": len(row["receipt"]["items"]), "processing_error": "error" in row})
        else:
            counts[key].update(result["counts"])
    score_path = RUN / "postprocess-v1/final-scores.json"
    if score_path.exists():
        assert json.loads(score_path.read_text(encoding="utf-8")) == json.loads(json.dumps(detail))
    else:
        with score_path.open("x", encoding="utf-8") as file:
            json.dump(detail, file, ensure_ascii=False, indent=2)
            file.write("\n")
    natives = []
    for case in plan["cases"]:
        for panel in case["panels"]:
            directory = ROOT / "qa-artifacts/advanced-ocr" / panel["native_run"]
            native = load(directory / "metadata.json")
            assert native["completed_at"] and native["exit_code"] == 0
            assert native["request_sha256"] == panel["request_sha256"]
            assert native["settings"]["special_tokens"] is True
            assert native["external_api_requests"] == native["external_receipt_uploads"] == 0
            natives.append({"id": case["id"], "panel": panel["position"], "elapsed_ms": native["elapsed_ms"], "peak_process_working_set_bytes": native["peak_process_working_set_bytes"]})
            for path in directory.iterdir():
                if path.is_file():
                    read(path)
            if panel["old_text_run"]:
                for path in (ROOT / "qa-artifacts/advanced-ocr" / panel["old_text_run"]).iterdir():
                    if path.is_file():
                        read(path)
    for name in ("paddle-spotting-compat-v1", "paddle-spotting-compat-v2"):
        folder = ROOT / "qa-artifacts" / name
        old = load(folder / "plan.json")
        verify_inputs(old["input_sha256"])
        for path in folder.iterdir():
            if path.is_file():
                read(path)
        for path in (ROOT / "qa-artifacts/advanced-ocr" / name).iterdir():
            if path.is_file():
                read(path)
    for path in RUN.rglob("*"):
        if path.is_file() and "vite-cache" not in path.parts and path.name != "report-build.log":
            read(path)
    for name, count in (("decoder-tests.log", 5), ("layout-tests.log", 4), ("framing-tests.log", 8), ("json-tests.log", 8)):
        log = read(RUN / name).decode("utf-8")
        assert f"Ran {count} tests" in log and "\nOK" in log and "FAILED" not in log
    for name in ("build_paddle_spotting_report.py", "score.py", "score_adjustments.py", "audit_evidence_integrity.py", "paddle_spotting.py", "test_paddle_spotting.py", "paddle_spotting_layout.py", "test_paddle_spotting_layout.py", "prepare_paddle_spotting.py", "paddle_spotting_trial.py", "prepare_spotting_replay.py", "replay_paddle_spotting.mjs", "benchmark_vision_cli.py", "vision_cli_text.py", "requirements-spotting-tools.lock"):
        path = ROOT / "receipt_training/scripts" / name
        digest = hashlib.sha256(read(path)).hexdigest()
        # Preserve code bytes separately from mutable producer paths.
        archive(path, digest)
    for path in (ROOT / "receipt_training/evaluation/paddle-vl16-candidate-manifest.json", ROOT / "receipt_training/evaluation/paddle-spotting-candidate-manifest.json", ROOT / "package-lock.json"):
        read(path)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    assert git("diff", "4686b8e", "--", "src", "server", "tests", "scripts", "package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts") == b""
    assert git("rev-parse", "stable/receipt-verified").decode().strip() == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    assert hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest() == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    geometry = load(ROOT / "qa-artifacts/paddle-spotting-compat-v2/geometry-check.json")
    report = {"scope": plan["scope"], "counts": {key: dict(value) for key, value in counts.items()}, "controls": controls,
              "native_processes": natives, "native_transport_successes": 12, "strict_spotting_successes": sum(call["spotting_valid"] for call in execution["calls"]),
              "synthetic_geometry_check": geometry, "new_local_native_requests": 14,
              "external_receipt_uploads": 0, "external_model_requests": 0, "api_cost_usd": "0", "compute_cost_usd": None,
              "python_tests": 25, "app_source_matches_commit": "4686b8e", "fresh_app_tests": False,
              "decision": "Not selected as an app reader: geometry improves conditional prices over the retained Paddle text control, but quantities/totals and decoder reliability are insufficient. Independent recovery remains unimplemented.",
              "limits": [
                  "Previously inspected development receipts and one no-purchase control, not a blind holdout. No reference, original image or permission is changed.",
                  "Latest v5/v2 references and the same frozen current parser score both modes. Denominators differ from the older 55-row report. The original seven's nine panel bytes are identical to its retained Paddle transcription; three added financial cases use their own exact earlier current panels.",
                  "The spotting profile also changes projector maximum pixels, output/context budgets and offloading settings. This is a measured profile comparison, not an isolated prompt ablation.",
                  "One fiscal certificate repeats an unlocated numeric sequence; Bristol includes unlocated/multiline text. The strict chosen line contract rejects both complete readings, not merely their bad rows. This does not prove all their raw text is unreadable or every deployment would fail.",
                  "Locations are model-predicted line/fragment polygons. No OCR confidence or word-level confidence is fabricated. Only the synthetic geometry has measured reference IoU; real-photo region accuracy is not quantitatively certified.",
                  "Currency is supplied after extraction only in the explicit branch. No number is multiplied, rescaled, rounded, repaired or chosen to balance. Geometry groups copied fragments, preserving duplicates and original text values.",
                  "Native timings include fresh CLI/model loading and image generation work, exclude preprocessing/setup/app workflow, and use sequential potentially warm caches. Historical control timing is not a paired current speed comparison or handset result.",
                  "Current application code is unchanged from 4686b8e. Its prior 645 unit/175 browser passes with one skip remain prior evidence; no fresh app test pass, full-corpus gain, provider winner or public release is claimed.",
                  "Modified mutable research code is preserved by exact-byte snapshots/archives. Earlier checkpoint commands that require their original root source can require that checkpoint; the new verifier permits only exact expected archived bytes, never a newer substitute."],
              "report_revision": "Revision 2 excludes the producer's live stdout log. The unverified first packet remains local; all native outputs and scored field values are unchanged, with no repeated model call.",
              "source_resolutions": RESOLVED,
              "sources": {"official_spotting_usage": "https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF#usage-tips", "official_model": "https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6", "official_gguf_reader": "https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/gguf-py/gguf/scripts/gguf_set_metadata.py"},
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print(json.dumps({"native_requests": 14, "transport_successes": 12, "strict_spotting_successes": report["strict_spotting_successes"], "evidence_files": len(HASHES), "controls": controls, "decision": report["decision"]}))


if __name__ == "__main__":
    main()
