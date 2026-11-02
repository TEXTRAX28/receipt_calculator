"""Offline corpus/score/checkpoint audit; never performs extraction or uploads."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from score_adjustments import aggregate_adjustments, score_with_adjustments

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
RUN = ROOT / "qa-artifacts/goal-acceptance-audit-v1/comparison-v1"
OUT = DATA / "evaluation/advanced-goal-acceptance-audit-v1.json"
HASHES = {}


def read(path, expected=None):
    """Verify declared bytes, including an explicitly archived old source."""
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    if expected is not None and digest != expected:
        archived = ROOT / "qa-artifacts/evidence-blobs" / expected
        raw = archived.read_bytes()
        digest = hashlib.sha256(raw).hexdigest()
        assert digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path, expected=None):
    return [json.loads(line) for line in read(path, expected).decode("utf-8").splitlines()]


def baseline(names, records, labels, config):
    scores, seen = [], set()
    for name in names:
        folder = DATA / "evaluation/runs" / name
        meta = load(folder / "metadata.json")
        assert meta.get("source_served_from_frozen_snapshot")
        for filename, digest in meta["source_sha256"].items():
            read(folder / "source" / filename, digest)
        for prediction in rows(folder / "predictions.jsonl", meta["predictions_sha256"]):
            identity = prediction["receipt_id"]
            record = records[identity]
            assert identity not in seen and prediction["image_sha256"] == record["sha256"]
            assert record["split"] == meta["split"]
            seen.add(identity)
            scores.append(score_with_adjustments(record, labels[identity], prediction, config))
    assert len(seen) == 50
    return aggregate_adjustments(scores), seen, scores


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for filename, digest in report["evidence_sha256"].items():
            read(ROOT / filename, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0, "external_requests": 0}))
        return
    assert not OUT.exists() and not RUN.exists(), "Preserve this audit; choose a new version"
    records = {row["receipt_id"]: row for row in rows(DATA / "manifest.jsonl")}
    supplements = rows(DATA / "annotations/private/supplement-manifest.jsonl")
    labels = {row["receipt_id"]: row for row in rows(DATA / "annotations/private/priced-rows-v5-financial-labels.jsonl")}
    config = load(DATA / "evaluation/config.json")

    mapped = set()
    for record in [*records.values(), *supplements]:
        assert not record["external_processing_allowed"]
        for source in record.get("source_files", [record]):
            path = DATA / source["file_path"]
            read(path, source["sha256"])
            mapped.add(source["sha256"])
    inventory = []
    suffixes = {".jpg", ".jpeg", ".png", ".webp", ".pdf"}
    for folder in ("costco", "non_costco"):
        for path in sorted((DATA / folder).rglob("*")):
            if path.is_file() and path.suffix.lower() in suffixes:
                raw = read(path)
                digest = hashlib.sha256(raw).hexdigest()
                assert digest in mapped, "Unaccounted source: " + str(path)
                inventory.append({"path": path.relative_to(DATA).as_posix(), "bytes": len(raw), "sha256": digest})
    assert len(inventory) == 54 and len({row["sha256"] for row in inventory}) == 53

    old, old_ids, old_scores = baseline(("baseline-development", "baseline-evaluation"), records, labels, config)
    verified, verified_ids, verified_scores = baseline(("advanced-baseline-20261031-development", "advanced-baseline-20261031-evaluation"), records, labels, config)
    assert old_ids == verified_ids
    assert old["counts"] == verified["counts"], "Document any baseline-vintage metric difference"
    replay = ROOT / "qa-artifacts/financial-basis-recovery-v3/replay"
    meta = load(replay / "metadata.json")
    packet = load(DATA / "evaluation/advanced-financial-basis-recovery-v1.json")
    assert meta["new_model_requests"] == meta["external_requests"] == 0
    for filename, digest in meta["input_sha256"].items():
        read(ROOT / filename, digest)
    for variant, folder in meta["frozen_source_paths"].items():
        for filename, digest in meta["source_sha256"][variant].items():
            read(ROOT / folder / filename, digest)
        for filename, digest in meta["loaded_frozen_source_sha256"][variant].items():
            assert meta["loaded_frozen_source_sha256"][variant][filename] == meta["source_sha256"][variant][filename]
    read(replay / "runner.mjs", meta["runner_sha256"])
    current, details = {}, []
    predictions = rows(replay / "predictions.jsonl", meta["predictions_sha256"])
    for mode in ("automatic", "known-currency"):
        selected = [row for row in predictions if row["variant"] == "after" and row["mode"] == mode]
        assert len(selected) == 50 and {row["receipt_id"] for row in selected} == verified_ids
        scores = []
        for prediction in selected:
            identity = prediction["receipt_id"]
            assert prediction["image_sha256"] == records[identity]["sha256"]
            score = score_with_adjustments(records[identity], labels[identity], prediction, config)
            scores.append(score)
            details.append({"method": "current-hybrid/" + mode, **score})
        current[mode] = aggregate_adjustments(scores)
        assert current[mode]["counts"] == packet["counts"][mode + "/after"]

    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"

    RUN.mkdir()
    for path in (Path(__file__), Path(__file__).with_name("score.py"), Path(__file__).with_name("score_adjustments.py")):
        raw = read(path)
        target = RUN / path.name
        target.write_bytes(raw)
        read(target)
    detailed = [{"method": "tesseract-oct29", **row} for row in old_scores]
    detailed += [{"method": "verified-tesseract-oct31", **row} for row in verified_scores] + details
    for filename, value in (("scores.json", detailed), ("source-inventory.json", inventory)):
        path = RUN / filename
        path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        read(path)
    objective = ROOT / "qa-artifacts/goal-acceptance-audit-v1/objective.md"
    read(objective)
    for filename in ("unit-tests-final.txt", "build.txt", "format.txt", "browser-tests.txt", "graph-refresh-final.txt"):
        text = read(ROOT / "qa-artifacts/gemini-upload-guard-v1" / filename).decode("utf-8-sig")
        assert not re.search(r"\b[1-9]\d* failed\b|^ FAIL ", text, re.MULTILINE), filename
        expected = {"unit-tests-final.txt": "653 passed", "build.txt": "built in", "format.txt": "All matched files", "browser-tests.txt": "175 passed", "graph-refresh-final.txt": "Graph:"}[filename]
        assert expected in text, filename

    report = {
        "scope": "Offline requirement checkpoint: complete original-source accounting, same-v5-truth baseline-vintage audit and retained current-hybrid rescore. No new extraction, provider selection, whole-goal completion or public-release claim.",
        "source_coverage": {"files": 54, "unique_source_hashes": 53, "unmapped_source_hashes": 0, "master_records": len(records), "supplement_views": len(supplements), "original_financial_receipts": 50, "original_split": dict(Counter(records[key]["split"] for key in verified_ids)), "genuine_digital_or_pdf_sources": 0},
        "same_v5_truth": {"tesseract-oct29": old, "verified-tesseract-oct31": verified, "current-hybrid/automatic": current["automatic"], "current-hybrid/known-currency": current["known-currency"]},
        "baseline_vintage": "The previous financial-summary rescore uses October 29 stored Tesseract outputs. The protected-baseline experiment was repeated October 31 with the same frozen application sources. Both retained runs now reproduce identical field counts under v5 truth; neither historical result is overwritten. Their native times belong to separate observations.",
        "git": {"stable": stable, "improvement_branch": git("branch", "--show-current").decode().strip(), "parent_commit": git("rev-parse", "HEAD").decode().strip(), "original_dirty_diff_sha256": original_diff, "original_head": git("-C", original, "rev-parse", "HEAD").decode().strip(), "merge_push_deploy": False},
        "verification": {"unit_tests": 653, "standard_browser_tests": 175, "existing_browser_skip": 1, "build_typecheck_format": "passed"},
        "new_model_requests": 0, "external_requests": 0, "new_scanner_latency_samples": 0,
        "limitations": ["Original receipts and references were inspected during development; this is a regression comparison, not a fresh blind holdout.", "Explicit currency is supplied after extraction and reported separately from automatic recognition. Its scores must not be described as unattended accuracy.", "Source-informed assistant labels remain partial; all fifty original complete receipts are unscorable. Known-field equality and zero arithmetic discrepancy are not trusted financial acceptance.", "The latest scores replay retained native readings. Current API image validation does not affect these local parser/verifier predictions; no fresh full-pipeline latency or accuracy run is claimed.", "Historical global evidence audit has thirteen disclosed lost artifact declarations. This audit does not restore their bytes or rewrite earlier timing claims.", "Synthetic PDF, transport, security and browser fixtures do not establish genuine retailer-PDF, physical-phone or live-cloud accuracy."],
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sources": report["source_coverage"], "baseline_price": verified["item_price"], "current_price": current["automatic"]["item_price"], "evidence_files": len(HASHES)}))


if __name__ == "__main__":
    main()
