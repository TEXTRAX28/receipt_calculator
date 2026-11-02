"""Seal source-audited payment exclusions and unchanged original-field scores."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from audit_evidence_integrity import archive

ROOT = Path(__file__).resolve().parents[2]
QA = ROOT / "qa-artifacts"
RUN = QA / "tender-roles-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-payment-rows-v1.json"
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
    if not expected and "qa-artifacts" not in path.parts:
        archive(path, digest)
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


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
    scores = load(RUN / "scores.json")
    assert not scores["regressions"] and not scores["improvements"]
    for name, digest in scores["evidence_sha256"].items():
        read(ROOT / name, digest)
    count_changes = {}
    for key, counts in scores["counts"].items():
        if key.endswith("/before"):
            after = scores["counts"][key.replace("/before", "/after")]
            changes = {field: {"before": counts.get(field, 0), "after": after.get(field, 0)} for field in set(counts) | set(after) if counts.get(field, 0) != after.get(field, 0)}
            if changes:
                count_changes[key] = changes
    assert count_changes == {"hybrid/known-currency/before": {"reconciliation_failed": {"before": 30, "after": 27}, "untrusted_zero_discrepancy": {"before": 19, "after": 22}}}
    meta = load(RUN / "replay/metadata.json")
    assert meta["prediction_views"] == 400 and meta["new_model_requests"] == meta["external_requests"] == 0
    assert meta["frozen_source_paths"]["before"] == "qa-artifacts/tender-roles-v1/before"
    for name, digest in meta["input_sha256"].items():
        read(ROOT / name, digest)
    for variant, hashes in meta["source_sha256"].items():
        for name, digest in hashes.items():
            read(ROOT / meta["frozen_source_paths"][variant] / name, digest)
            if variant == "after":
                assert hashlib.sha256(read(ROOT / name)).hexdigest() == digest
        for name, digest in meta["loaded_frozen_source_sha256"][variant].items():
            assert hashes[name] == digest
    assert "src/lib/payment-rows.ts" in meta["loaded_frozen_source_sha256"]["after"]
    read(RUN / "replay/runner.mjs", meta["runner_sha256"])
    predictions = [json.loads(line) for line in read(RUN / "replay/predictions.jsonl", meta["predictions_sha256"]).decode("utf-8").splitlines()]
    assert len(predictions) == 400
    inspection = load(RUN / "source-inspection.json")
    inspected = {}
    for case in inspection["cases"]:
        read(ROOT / case["source"], case["source_sha256"])
        for row in case["rows"]:
            inspected[(case["receipt_id"], row["label"].upper())] = row
    assert len(inspected) == inspection["proposed_rows"] == 17
    observations, seen = [], set()
    for case in predictions:
        if case["reader"] != "hybrid" or case["variant"] != "after":
            continue
        payments = [row for row in case["removedAdjustments"] if row["reason"].startswith("payment-")]
        if not payments:
            continue
        assert case["mode"] == "known-currency"
        check = next(row for row in case["receipt"]["reviewChecks"] if row["scope"] == "receipt" and row["field"] == "adjustments")
        assert check["confirmedValue"] == "" and check["reason"] in ("coverage", "recovered", "source")
        for row in payments:
            key = (case["receipt_id"], row["label"].upper())
            expected = inspected[key]
            assert key not in seen and row["printedLiteral"] == expected["literal"]
            assert row["reason"] == "payment-" + expected["role"]
            assert len(row["sourceIndices"]) == 2
            anchor, source = [case["sourceLines"][index] for index in row["sourceIndices"]]
            assert anchor["photo"] == source["photo"] and anchor["part"] == source["part"]
            assert source["confidence"] >= 0.98 and anchor["confidence"] >= 0.98
            assert row["sourceIndices"][0] < row["sourceIndices"][1]
            assert expected["literal"] in source["text"]
            seen.add(key)
            observations.append({"receipt_id": case["receipt_id"], "split": case["split"], "label": row["label"], "previous_false_adjustment": row["amount"], "role": expected["role"], "printed_literal": expected["literal"], "source_indices": row["sourceIndices"], "confirmed": False})
    assert seen == set(inspected) and len({row["receipt_id"] for row in observations}) == 11
    raw = {row["receipt_id"]: row for row in predictions if row["reader"] == "hybrid" and row["variant"] == "after" and row["mode"] == "known-currency"}
    for label in ("Cash", "Tendered"):
        assert any(row["label"] == label for row in raw["cord-v2-train-014"]["receipt"]["adjustments"])
    assert any(row["label"] == "Coupon" for row in raw["cord-v2-train-005"]["receipt"]["adjustments"])
    clean = lambda name: re.sub(r"\x1b\[[0-9;]*m", "", read(RUN / name).decode("utf-8-sig"))
    assert "820 passed" in clean("unit-full.txt")
    assert "189 passed" in clean("browser-full.txt") and "1 skipped" in clean("browser-full.txt")
    assert "2 passed" in clean("browser-payment-corrected.txt")
    assert "2 failed" in clean("browser-payment-target.txt")
    assert "built in" in clean("build.txt") and "error TS" not in clean("build.txt")
    assert "All matched files use Prettier code style" in clean("format.txt")
    assert "Graph is current" in clean("graph-check.txt")
    artifacts = []
    for path in (QA / "e2e-runs").glob("*/test.json"):
        info = json.loads(path.read_text(encoding="utf-8"))
        if info["title"].startswith("payment-row exclusions"):
            folder(path.parent)
            artifacts.append(path.parent.relative_to(ROOT).as_posix())
    assert len(artifacts) >= 4
    folder(RUN)
    for name in ("src", "server", "tests", "scripts", "dist"):
        folder(ROOT / name)
    for name in ("package.json", "package-lock.json", "tsconfig.json", "vite.config.ts", "playwright.config.ts", "receipt_training/scripts/replay_grouped_amounts.mjs", "receipt_training/scripts/score_grouped_amounts.py", "receipt_training/scripts/build_payment_rows_report.py", "receipt_training/evaluation/PAYMENT_ROWS.md", "receipt_training/evaluation/GOAL_ACCEPTANCE_AUDIT.md"):
        read(ROOT / name)
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    original = r"C:\Users\natan\VSC Code\costco_calc"
    original_head = git("-C", original, "rev-parse", "HEAD").decode().strip()
    original_diff = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd" and original_head == "29a187af7347be94c0728f4785be674500833748"
    assert original_diff == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    value = {
        "scope": "Source-backed payment/change exclusions from saved independent readings. Unchanged original fifty/v5 field references; separate post-replay manual audit of every proposal. No new original-receipt inference or latency cohort.",
        "counts": scores["counts"], "scored_improvements": [], "scored_regressions": [], "diagnostic_count_changes": count_changes,
        "proposal_audit": {"proposed_rows": 17, "visually_supported_rows": 17, "affected_receipts": 11, "receipt_splits": dict(Counter(case["split"] for case in inspection["cases"])), "observations": observations, "payment_recall": None, "whole_receipt_accuracy": None},
        "verification": {"unit_tests": 820, "new_unit_tests": 45, "browser_tests": 189, "existing_skip": 1, "focused_browser_tests": 2, "artifact_folders": artifacts, "exact_synthetic_split": ["GBP 10.50", "GBP 10.50"], "build_typecheck_format_graph": "passed"},
        "request_scope": {"new_original_receipt_model_calls": 0, "new_private_uploads": 0, "paid_activation": False, "standard_browser_suite": "Includes existing actual on-device synthetic OCR/PDF workflows; the changed independent-reading journey uses synthetic provider responses."},
        "limitations": ["All 17 proposals use supplied currency context. There are no new automatic-currency exclusions. Existing partial-reference field scores are unchanged: known-currency hybrid line prices 133/143, units 26/31 and copied totals 41/49; trusted reconciliation stays 0/49 and all fifty complete receipts remain unscorable.", "Every exclusion remains pending, including an empty adjustment list. Unknown or ambiguous coupons, weak monetary words and unvalued headings remain. No tender arithmetic invents or selects a price, total or role.", "Three inspected development images informed the rule; all other changed source images were inspected after the frozen replay. These repeatedly used cases are not a blind holdout or an exhaustive payment reference. The audit does not measure missed payments.", "The initial browser test expected six source areas, but the four relevant printed regions were correct. Its failed assertion, screenshot and trace are preserved; only the expectation changed.", "The 545.90 kB main bundle retains its size warning. Physical phone/Safari, broader financial truth and public readiness remain open. The 8B resource gate and pending Gemini private-crop approval are unchanged; the goal remains active."],
        "git": {"parent_commit": git("rev-parse", "HEAD").decode().strip(), "branch": git("branch", "--show-current").decode().strip(), "stable": stable, "original_head": original_head, "original_diff_sha256": original_diff, "merge_push_deploy": False},
        "evidence_sha256": HASHES,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        output.write(json.dumps(value, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"sealed_files": len(HASHES), "source_audited_payment_exclusions": 17, "affected_receipts": 11, "scored_field_regressions": 0, "unit_tests": 820, "browser_tests": 189, "new_private_uploads": 0}))


if __name__ == "__main__":
    main()
