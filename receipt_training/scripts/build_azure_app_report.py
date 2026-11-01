"""Freeze the optional Azure word reader's saved-response and local UI evidence."""
from collections import Counter, defaultdict
import base64
import hashlib
import json
from pathlib import Path
import subprocess
import sys

from build_printed_provider_checkpoint import field_score

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/azure-app-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-azure-app-v1.json"
CAPTURE = RUN / "release-v1"
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or expected == digest, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def rows(path, expected=None):
    return list(map(json.loads, read(path, expected).decode("utf-8").splitlines()))


def folder(path):
    for item in sorted(path.rglob("*")):
        if item.is_file():
            read(item)


def main():
    if "--check" in sys.argv:
        for path, digest in json.loads(OUT.read_text(encoding="utf-8"))["evidence_sha256"].items():
            read(ROOT / path, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_external_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve published evidence"
    meta = load(RUN / "replay-v2/metadata.json")
    assert meta["predictions"] == 12 and meta["application_engine_registered"]
    assert meta["new_model_requests"] == meta["external_requests"] == 0
    assert meta["every_draft_requires_source_review"] and meta["native_field_poisoning_invariant"]
    for path, digest in meta["input_sha256"].items():
        read(ROOT / path, digest)
    for path, digest in meta["source_sha256"].items():
        read(RUN / "replay-v2/source" / Path(path).name, digest)
        read(ROOT / path, digest)
    for path, digest in meta["loaded_frozen_source_sha256"].items():
        assert digest == meta["source_sha256"][path]
    read(RUN / "replay-v2/processor.mjs", meta["processor_sha256"])
    predictions = rows(RUN / "replay-v2/predictions.jsonl", meta["predictions_sha256"])
    previous = [row for row in rows(ROOT / "qa-artifacts/provider-review/azure-screening-v1/word-comparison-recovery-v1/predictions.jsonl") if row["method"] == "azure-word-layout"]
    labels = {row["receipt_id"]: row for row in rows(ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl")}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    totals, details, scores = defaultdict(Counter), [], {}
    for version, items in (("research", previous), ("app", predictions)):
        assert len(items) == 12
        for row in items:
            score = field_score(labels[row["receipt_id"]], row, config)
            scores[version, row["mode"], row["case"]] = score
            details.append({"version": version, "mode": row["mode"], "case": row["case"], "score": score})
            counts = totals[version + "/" + row["mode"]]
            for field in ("expected_purchases", "proposed_rows", "matched_purchase_names", "exact_normalized_descriptions", "unmatched_proposed_rows"):
                counts[field] += score[field]
            for field, values in score["field_equality"].items():
                counts.update({field + "_" + key: value for key, value in values.items()})
            counts["copied_final_total_correct"] += score["document_equality"]["printedTotal"] is True
            counts["coupon_correct"] += score["nonzero_coupons_on_matched_purchase"]["correct"]
    for row in predictions:
        comparable = lambda score: {key: value for key, value in score.items() if key != "blocking_issues"}
        assert comparable(scores["app", row["mode"], row["case"]]) == comparable(scores["research", row["mode"], row["case"]])
        assert not row["trusted"]
        for field in ("items", "adjustments", "pricesIncludeTax"):
            assert any(check["scope"] == "receipt" and check["field"] == field and check["confirmedValue"] == "" for check in row["receipt"]["reviewChecks"])
    assert totals["app/known-currency"]["lineTotal_correct"] == 25
    validation = RUN / "validation-v3"
    unit = load(validation / "unit.json")
    assert unit["success"] and unit["numPassedTests"] == 615 and unit["numFailedTests"] == 0
    browser = load(validation / "browser.json")
    assert browser["stats"]["expected"] == 173 and browser["stats"]["skipped"] == 1 and browser["stats"]["unexpected"] == browser["stats"]["flaky"] == 0
    for name, needle in (("build.log", "built in"), ("format-final.log", "All matched files use Prettier"), ("graph-check-final.log", "Graph is current")):
        assert needle in read(validation / name).decode("utf-8")
    source_checks = load(RUN / "source-safety.json")
    assert source_checks["configured_private_value_matches"] == 0 and source_checks["app_azure_uploads_enabled"] is False
    identity = load(RUN / "build-identity.json")
    assert identity["current_production_build_identical_to_browser_test_build"] and identity["files"] == 222
    git = lambda *args: subprocess.check_output(["git", *args], cwd=ROOT)
    stable = git("rev-parse", "stable/receipt-verified").decode().strip()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    original = r"C:\Users\natan\VSC Code\costco_calc"
    head = git("-C", original, "rev-parse", "HEAD").decode().strip()
    patch = hashlib.sha256(git("-C", original, "diff", "--binary")).hexdigest()
    assert head == "29a187af7347be94c0728f4785be674500833748" and patch == "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b"
    dirty = sorted(line.strip() for line in git("-C", original, "status", "--porcelain=v1").decode().strip().splitlines())
    assert dirty == ["M server/receipt-api.mjs", "M src/lib/extraction-schema.mjs", "M tests/ai.test.ts"]
    CAPTURE.mkdir()
    source_hashes = {}
    paths = [path for name in ("src", "server", "tests", "scripts", "dist") for path in (ROOT / name).rglob("*") if path.is_file() and "__pycache__" not in path.parts]
    paths += [ROOT / path for path in (".env.example", "README.md", "package.json", "package-lock.json", "vite.config.ts", "playwright.config.ts", "tsconfig.json", "index.html", "receipt_training/evaluation/AZURE_APP_READER.md", "receipt_training/evaluation/ADVANCED_OCR_REPORT.md", "receipt_training/scripts/replay_azure_app.mjs", "receipt_training/scripts/build_azure_app_report.py", "receipt_training/scripts/build_printed_provider_checkpoint.py", "receipt_training/scripts/score.py")]
    for path in paths:
        name = path.relative_to(ROOT)
        raw = path.read_bytes()
        source_hashes[name.as_posix()] = hashlib.sha256(raw).hexdigest()
        target = CAPTURE / "source" / name
        target.parent.mkdir(parents=True, exist_ok=True)
        with target.open("xb") as file:
            file.write(raw)
        read(target)
    (CAPTURE / "detail-scores.json").write_text(json.dumps(details, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    read(CAPTURE / "detail-scores.json")
    attachment_folders = set()
    def attachments(value):
        if isinstance(value, dict):
            if value.get("name") == "QA artifact directory" and value.get("contentType") == "text/plain":
                name = base64.b64decode(value["body"]).decode().replace("\\", "/")
                path = (ROOT / name).resolve()
                path.relative_to((ROOT / "qa-artifacts/e2e-runs").resolve())
                attachment_folders.add(path)
            for child in value.values():
                attachments(child)
        elif isinstance(value, list):
            for child in value:
                attachments(child)
    attachments(browser)
    attachments(load(RUN / "validation-v2/focused-browser.json"))
    for path in attachment_folders:
        folder(path)
    folder(RUN)
    report = {"scope": "Optional registered Azure word reader: same six saved exact-response accuracy, actual local HTTP and browser integration with synthetic provider transport, financial/security regressions and protected Git state. No new live Azure request.",
              "counts": {key: dict(value) for key, value in totals.items()}, "per_case_known_scores_preserved": True,
              "exact_word_and_row_geometry_parity": meta["geometry"], "unit_passed": 615, "browser_passed": 173, "browser_existing_skip": 1,
              "new_external_requests": 0, "new_model_requests": 0, "default_reader_changed": False, "azure_uploads_enabled": False,
              "source_sha256": source_hashes, "stable_commit": stable, "original_checkout_commit": head, "original_dirty_patch_sha256": patch,
              "browser_attachment_folders": len(attachment_folders),
              "limits": ["Six previously inspected development crops and twelve currency-context views, not twelve independent transactions, blind or original-fifty Azure evaluation. Explicit currency is supplied only after extraction.",
                         "The app path preserves 25/25 known prices with explicit currency, 18/25 automatically, 9/15 known quantities, 9/11 known units and 2/3 coupons. One unmatched proposed row, exact-name gaps and financial/tax uncertainty remain; no complete payable bill is certified.",
                         "Desktop/mobile tests use the actual local API, credential/allowance/consent boundaries and word adapter, with injected synthetic Azure responses. They are not fresh Azure recognition, a physical handset, cloud latency or price measurements.",
                         "Thirty new unit tests cover geometry, native-field exclusion, weak rows, cancellation, polling, no retry, finite shared reservations, private-value echoes and HTTP consent/origin boundaries. F0 key presence alone cannot enable uploads; one prepared JPEG section reserves one persistent slot.",
                         "Initial build failed on Promise<void>/Promise<undefined> typing in the injected wait hook; its source and log remain. First offline replay failed at BigInt serialization after extraction; its frozen processor/modules remain. Corrected runs do not erase these failures.",
                         "The final browser run uses the final production app; only whitespace formatting of one new test's locator changed after that run. Both exact test bytes and the whitespace-only diff are preserved. Final formatting passes.",
                         "Azure same-region temporary storage/deletion is a documented provider policy, not independent erasure or account-specific training exclusion. Crash cleanup, authenticated public backend, full truth/device validation and full goal acceptance remain open."],
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        file.write(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"evidence_files": len(HASHES), "source_files": len(source_hashes), "unit_passed": 615, "browser_passed": 173, "new_external_requests": 0, "app_uploads_enabled": False}))


if __name__ == "__main__":
    main()
