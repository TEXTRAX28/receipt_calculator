"""Seal exact source-word alignment, retained trials and unchanged-reading scores."""
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
RUN = QA / "grouped-amounts-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-source-word-alignment-v1.json"
HASHES = {}


def read(path, expected=None):
    assert not path.name.startswith(".env"), "Never read live configuration"
    raw = path.read_bytes() if path.is_file() else b""
    digest = hashlib.sha256(raw).hexdigest()
    if expected and digest != expected:
        raw = (QA / "evidence-blobs" / expected).read_bytes()
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
    assert not OUT.exists(), "Preserve this report"
    trials = {}
    for version in (1, 2):
        path = QA / f"grouped-amounts-v{version}"
        score = load(path / "scores.json")
        assert not score["regressions"]
        for name, digest in score["evidence_sha256"].items():
            read(ROOT / name, digest)
        meta = load(path / "replay/metadata.json")
        assert meta["prediction_views"] == 400 and meta["new_model_requests"] == meta["external_requests"] == 0
        for name, digest in meta["input_sha256"].items():
            read(ROOT / name, digest)
        for variant, hashes in meta["source_sha256"].items():
            for name, digest in hashes.items():
                read(ROOT / meta["frozen_source_paths"][variant] / name, digest)
                if version == 2 and variant == "after":
                    assert hashlib.sha256(read(ROOT / name)).hexdigest() == digest
            for name, digest in meta["loaded_frozen_source_sha256"][variant].items():
                assert digest == hashes[name]
        if version == 2:
            assert "src/lib/source-words.ts" in meta["loaded_frozen_source_sha256"]["after"]
        read(path / "replay/runner.mjs", meta["runner_sha256"])
        predictions = rows(path / "replay/predictions.jsonl", meta["predictions_sha256"])
        assert len(predictions) == 400
        trials[f"v{version}"] = {"counts": score["counts"], "improvements": score["improvements"], "scored_regressions": score["regressions"], "new_model_requests": 0}
        folder(path)
    final = trials["v2"]
    assert final["counts"]["hybrid/known-currency/after"]["item_price_correct"] == 133
    assert final["counts"]["hybrid/known-currency/after"]["unit_price_correct"] == 26
    assert final["counts"]["hybrid/automatic/before"] == final["counts"]["hybrid/automatic/after"]
    assert all(change["receipt_id"] == "cord-v2-train-006" and change["mode"] == "known-currency" for change in final["improvements"])
    assert len(final["improvements"]) == 2
    case = next(row for row in predictions if row["receipt_id"] == "cord-v2-train-006" and row["reader"] == "hybrid" and row["mode"] == "known-currency" and row["variant"] == "after")
    observations = []
    for key, field in (("priceRecoveries", "lineTotal"), ("unitRecoveries", "unitPrice")):
        proposal = next(item for item in case[key] if item["evidence"]["previous"] == "43.181")
        evidence = proposal["evidence"]
        assert evidence["value"] == "43181" and evidence["literal"] == "43,181" and evidence["word"]["confidence"] >= 0.98
        assert any(check["scope"] == "item" and check.get("itemId") == proposal["itemId"] and check["field"] == field and check["reason"] == "recovered" and check["confirmedValue"] == "" for check in case["receipt"]["reviewChecks"])
        panel = next(p for p in case["recognition"]["panels"] if p["photo"] == evidence["region"]["photo"] and p["part"] == evidence["region"]["part"])
        assert evidence["word"] in panel["words"]
        observations.append({"field": field, "previous_invalid_amount": evidence["previous"], "printed_literal": evidence["literal"], "proposed_value": evidence["value"], "actual_word": evidence["word"], "source_indices": proposal["sourceIndices"], "confirmed": False})
    records = {row["receipt_id"]: row for row in rows(ROOT / "receipt_training/manifest.jsonl")}
    original = {row["receipt_id"] for row in predictions}
    assert len(original) == 50 and sum(records[key]["split"] == "development" for key in original) == 38
    for identity in original:
        assert not records[identity]["external_processing_allowed"]
    source = records["cord-v2-train-006"]
    read(ROOT / "receipt_training" / source["file_path"], source["sha256"])
    clean = lambda name: re.sub(r"\x1b\[[0-9;]*m", "", read(RUN / name).decode("utf-8-sig"))
    assert "775 passed" in clean("unit-full-final.txt")
    assert "187 passed" in clean("browser-full-final.txt") and "1 skipped" in clean("browser-full-final.txt")
    assert "built in" in clean("build-final.txt") and "error TS" not in clean("typecheck-final.txt")
    assert "All matched files use Prettier code style" in clean("format-final.txt")
    assert "Graph is current" in clean("graph-check.txt")
    artifacts = []
    for identity in (QA / "e2e-runs").glob("*/test.json"):
        record = json.loads(identity.read_text(encoding="utf-8"))
        if record["title"].startswith("overlapping source rows"):
            folder(identity.parent)
            artifacts.append(identity.parent.relative_to(ROOT).as_posix())
    assert len(artifacts) >= 2
    for directory in ("src", "server", "tests", "scripts", "dist"):
        folder(ROOT / directory)
    for name in ("package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "playwright.config.ts", "receipt_training/scripts/replay_grouped_amounts.mjs", "receipt_training/scripts/score_grouped_amounts.py", "receipt_training/scripts/build_source_word_alignment_report.py", "receipt_training/scripts/score.py", "receipt_training/scripts/score_adjustments.py", "receipt_training/evaluation/SOURCE_WORD_ALIGNMENT.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md"):
        read(ROOT / name)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original_checkout = r"C:\Users\natan\VSC Code\costco_calc"
    original_head = git("-C", original_checkout, "rev-parse", "HEAD").decode().strip()
    original_diff = hashlib.sha256(git("-C", original_checkout, "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd" and original_head == "29a187af7347be94c0728f4785be674500833748"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    report = {
        "scope": "Literal word alignment for anchored source-price proposals. Four hundred frozen before/after context/reader views on the unchanged original fifty and unchanged v5 references. No new original-receipt OCR/VLM call or latency cohort.",
        "trials": trials, "final_observations": observations,
        "trial_disposition": ["The initial valid-decimal hypothesis was wrong: money() already rejects three fractional places. Preserve the inspection amendment and failed harness syntax trial.", "The first prototype could ignore unexplained extra words. It is retained but not selected. Final code requires another reported source row for each ignored word and rejects selected words with another reported owner.", "Only one previously inspected development receipt improves. The same frozen evaluation cases have no scored changes; this is not a blind generalization study."],
        "verification": {"unit_tests": 775, "new_unit_tests": 12, "browser_tests": 187, "existing_skip": 1, "strengthened_browser_workflow": "overlapping synthetic row boxes, source confirmation, responsive 320/390px views and exact GBP 1.50/1.50 split", "browser_artifact_folders": artifacts},
        "request_scope": {"comparison_native_or_cloud_model_calls": 0, "new_private_uploads": 0, "paid_activation": False, "standard_browser_suite": "Includes existing real on-device synthetic OCR/PDF paths; local computer/vision transports in the changed workflow are mocked."},
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "branch": git("branch", "--show-current").decode().strip(), "stable": stable, "original_head": original_head, "original_diff_sha256": original_diff, "merge_push_deploy": False},
        "limitations": ["Conditional known-currency hybrid line prices improve 132/143 to 133/143 and known units 25/31 to 26/31. Automatic prices remain 116/143. Amount decoding, numeric validation, identity/role gates and monetary-word threshold 0.98 are unchanged.", "The proposal is copied from actual primary OCR word evidence and remains pending. It does not count as independent agreement or a verified whole receipt. All fifty original complete receipts remain unscorable and trusted reconciliation is 0/49.", "Rows above 2000 characters, 256 word candidates or 256 intersecting neighboring rows, or over 50000 search/ownership operations, abstain. Ambiguous, missing or conflicting provenance abstains; no geometric price box is fabricated.", "This is an interpretation gain on saved native readings, not better raw transcription, new-model superiority or a fresh end-to-end latency claim. No dependency/model/prompt/default-provider changes.", "The 543.60 kB main bundle retains its existing size warning. Physical phone/Safari, worst-case mobile memory, broader genuine-photo gains and public acceptance remain open.", "Gemini private-crop approval remains pending. Existing Azure/Veryfi scopes are consumed. Thirteen known historical evidence gaps are not restored. Full goal stays active."],
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"files": len(HASHES), "line_prices": "133/143 with explicit currency", "units": "26/31", "scored_regressions": 0, "unit_tests": 775, "browser_tests": 187, "comparison_model_calls": 0}))


if __name__ == "__main__":
    main()
