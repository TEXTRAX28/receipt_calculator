"""Bind paired replay, actual app proof, tests, resources and protected Git state."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from audit_evidence_integrity import archive, sha

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "receipt_training/evaluation/advanced-footer-overlap-v1.json"
HASHES = {}


def record(name, expected=None):
    path = (ROOT / name).resolve()
    path.relative_to(ROOT.resolve())
    assert not path.name.startswith(".env")
    digest = sha(path) if path.is_file() else None
    if expected and digest != expected:
        path = ROOT / "qa-artifacts/evidence-blobs" / expected
        digest = sha(path)
    assert digest is not None and (expected is None or digest == expected), name
    HASHES[name] = digest
    if "qa-artifacts" not in path.parts and "runs" not in path.parts and ".cache" not in path.parts:
        archive(path, digest)
    return path


def load(name):
    return json.loads(record(name).read_text(encoding="utf-8"))


def tree(folder):
    for path in sorted((ROOT / folder).rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())


def main():
    if "--check" in sys.argv:
        for name, expected in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            record(name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_model_calls": 0}))
        return
    assert not OUT.exists()
    logs = {key: record("qa-artifacts/footer-overlap-" + file).read_text(encoding="utf-8") for key, file in {
        "unit": "unit-v1.log", "browser": "browser-v1.log", "build": "build-v1.log", "format": "format-v1.log", "typecheck": "typecheck-v1.log"}.items()}
    assert "912 passed" in logs["unit"]
    assert "195 passed" in logs["browser"] and "1 skipped" in logs["browser"]
    assert "built in" in logs["build"] and "All matched files" in logs["format"]
    replay = load("qa-artifacts/footer-overlap-replay-v3/scores.json")
    meta = load("qa-artifacts/footer-overlap-replay-v3/metadata.json")
    assert len(meta["cases"]) == 108 and len(replay["scores"]) == 432
    assert len(replay["changed_financial_predictions"]) == 4
    assert all(c["group"] == "genuine" and c["id"] == "supplement-user-uk-20261026-group" and c["before_items"] == 20 and c["after_items"] == 18 and c["before_discrepancy"] == "1138" and c["after_discrepancy"] == "0" and c["overlap_purchases"] == 2 for c in replay["changed_financial_predictions"])
    for name, digest in replay["evidence_sha256"].items():
        record(name, digest)
    for name, digest in meta["input_sha256"].items():
        record(name, digest)
    for name, digest in meta["source_sha256"]["after"].items():
        assert sha(ROOT / name) == digest, "Changed since replay: " + name
        record(name, digest)
    actual = load("qa-artifacts/footer-overlap-app-uk-v1/result.json")
    scores = load("qa-artifacts/footer-overlap-app-uk-v1/scores.json")
    score = scores["score"]
    counts = score["counts"]
    assert actual["noFinancialEdits"] and actual["noChecksConfirmed"]
    assert actual["external"] == actual["writes"] == actual["errors"] == []
    assert actual["closed"] == 1 and len(actual["workers"]) == 1
    assert counts["predicted_items"] == counts["matched_items"] == counts["item_price_correct"] == 18
    assert counts["complete_receipt_correct"] == counts["trusted_reconciliation_correct"] == 0
    assert score["scanner_discrepancy_minor"] == "0" and actual["calculation"]["issues"]
    for entries in (scores["evidence_sha256"], actual["input_sha256"], actual["source_sha256"]):
        for name, digest in entries.items():
            record(name, digest)
    controller = load("qa-artifacts/footer-overlap-app-uk-v1-control/controller.json")
    memory = load("receipt_training/evaluation/runs/footer-overlap-app-uk-v1/owned-memory.json")
    assert controller["exit_code"] == 0 and not controller.get("error") and not memory["errors"]
    assert controller["minimum_available_ram"] >= controller["runtime_ram_floor"]
    for name, digest in controller["source_sha256"].items():
        prefix = "qa-artifacts/footer-overlap-app-uk-v1-control/"
        snapshot = prefix + (Path(name).name if name.startswith("receipt_training/scripts/") else "source/" + name)
        record(snapshot, digest)
    for folder in ("footer-overlap-replay-v1", "footer-overlap-replay-v2", "footer-overlap-replay-v3", "footer-overlap-app-uk-v1", "footer-overlap-app-uk-v1-control"):
        tree("qa-artifacts/" + folder)
    tree("receipt_training/evaluation/runs/footer-overlap-app-uk-v1")
    for path in sorted((ROOT / "qa-artifacts").glob("footer-overlap-*.log")):
        record(path.relative_to(ROOT).as_posix())
    record("qa-artifacts/evidence-blobs/88ca44adbe005ff89593bb7a4fa0c6c2ea37c70e40aed54007bbf8ca36f8d237", "88ca44adbe005ff89593bb7a4fa0c6c2ea37c70e40aed54007bbf8ca36f8d237")
    tree("dist")
    for path in sorted((ROOT / "src").rglob("*")):
        if path.is_file():
            record(path.relative_to(ROOT).as_posix())
    for name in ("package.json", "package-lock.json", "playwright.config.ts", "vite.config.ts", "tests/receipt-layout.test.ts", "tests/e2e/enhanced-reader-real.spec.ts", "receipt_training/scripts/replay_footer_overlap.mjs", "receipt_training/scripts/score_footer_overlap.py", "receipt_training/scripts/guard_browser_paddle_probe.py", "receipt_training/scripts/build_footer_overlap_report.py", "receipt_training/evaluation/FOOTER_OVERLAP_RECOVERY.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md"):
        record(name)
    git = lambda *args, cwd=ROOT: subprocess.check_output(["git", *args], cwd=cwd)
    parent = git("rev-parse", "HEAD").decode().strip()
    assert parent == meta["parent_commit"] == "68654b2307b6db39cb133c0e4c30cdb1b798e63a"
    assert hashlib.sha256(git("show", parent + ":package-lock.json")).hexdigest() == sha(ROOT / "package-lock.json")
    original = Path(r"C:\Users\natan\VSC Code\costco_calc")
    protected = {"stable": git("rev-parse", "stable/receipt-verified").decode().strip(), "original_commit": git("rev-parse", "HEAD", cwd=original).decode().strip(), "original_diff_sha256": hashlib.sha256(git("diff", "--binary", cwd=original)).hexdigest()}
    assert list(protected.values()) == ["ee725ba45e799bee8501d3de034e0302c0127afd", "29a187af7347be94c0728f4785be674500833748", "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"]
    packet = {"scope": "Source-backed footer merge and narrow nonfinancial heading recovery; exact amounts, source evidence and mandatory app checks preserved. Full production goal remains active.",
              "checks": {"unit_passes": 912, "browser_passes": 195, "existing_browser_skips": 1, "additional_actual_private_app_test": 1, "retained_observations": 108, "paired_predictions": 432, "original50_financial_predictions_changed": 0},
              "paired_changes": replay["changed_financial_predictions"], "paired_counts": replay["counts"],
              "actual_app": {"counts": counts, "discrepancy_minor": score["scanner_discrepancy_minor"], "observed_scan_to_review_ms": actual["elapsed_ms"], "financial_edits": 0, "checks_confirmed": 0},
              "resources": {"controller": controller, "owned_tree_observation": memory},
              "privacy": {"new_private_external_uploads": 0, "new_model_downloads": 0, "paid_activation": False, "live_env_files_read_by_report": False},
              "new_private_image_inferences": 2, "api_cost_usd": "0", "compute_cost_usd": None,
              "limits": ["UK strict complete accuracy remains0/1; enhanced app confirmation blocked by source/VAT issues despite zero discrepancy.", "Original-fifty references are partial; no complete-receipt accuracy claim or new native/VLM whole-cohort run.", "Four familiar development transactions, no independent blind annotation or physical phone/Safari proof.", "Replay preserves two failed missing-currency attempts and a scorer harness failure; no external retries or financial edits.", "Production authentication, durable quota/privacy/retention operations and public release remain open."],
              "git": {"parent_commit": parent, **protected, "merge_push_deploy": False}, "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(packet, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "unit_passes": 912, "browser_passes": 195, "original50_changes": 0, "private_uploads": 0}))


if __name__ == "__main__":
    main()
