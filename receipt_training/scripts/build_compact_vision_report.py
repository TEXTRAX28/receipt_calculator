"""Verify the bounded multi-photo format change and its actual local workflows."""
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

from build_provider_crop_report import metrics
from score import score_one

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "receipt_training"
QA = ROOT / "qa-artifacts"
OUT = DATA / "evaluation/advanced-compact-multiphoto-v1.json"
VALIDATION = QA / "compact-runtime-validation-v1"
BROWSER = QA / "compact-runtime-browser-v2"
EVIDENCE = {}


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def remember(path, expected=None):
    path = path.resolve()
    name = path.relative_to(ROOT).as_posix()
    assert not path.name.startswith(".env"), "Environment files are not evidence"
    actual = sha(path)
    assert expected is None or expected == actual, "Evidence changed: " + name
    EVIDENCE[name] = actual
    return path


def load(path, expected=None):
    return json.loads(remember(path, expected).read_text(encoding="utf-8"))


def tree(folder):
    for path in sorted(folder.rglob("*")):
        if path.is_file():
            remember(path)


def snapshots(folder, plan):
    for name, expected in plan["source_sha256"].items():
        remember(folder / "source" / name, expected)
    for name, expected in plan.get("input_sha256", {}).items():
        current, frozen = ROOT / name, folder / "source" / name
        if current.is_file() and sha(current) == expected:
            remember(current, expected)
        else:
            # An old root source path is satisfied only by its exact frozen bytes.
            remember(frozen, expected)


def native(folder, expected_meta=None):
    meta = load(folder / "metadata.json", expected_meta)
    request = load(folder / "request.json", meta["request_sha256"])
    for file, key in (("stdout.txt", "stdout_sha256"), ("stderr.txt", "stderr_sha256"),
                      ("harness.py", "harness_sha256"), ("vision_cli_text.py", "text_helper_sha256"),
                      ("model-manifest.json", "manifest_sha256"), ("schema.json", "schema_sha256")):
        remember(folder / file, meta[key])
    assert load(folder / "schema.json") == request["schema"]
    assert meta["external_api_requests"] == meta["external_receipt_uploads"] == 0
    assert meta["label_files_read"] is False and meta["input_ocr_text"] is False
    assert meta["runtime"] == "b11960" and meta["decoder_schema_enforced"]
    assert meta["cli_sha256"] == "5073109b15d7d19fd3cc4c23bdbdc2f3dfdae39a6410d80ea6e7b6929eb30b3a"
    for image in meta["images"]:
        remember(ROOT / image["path"], image["sha256"])
    tree(folder)
    return meta


def pilot(name, config, labels, records):
    folder = QA / name
    execution = load(folder / "execution.json")
    plan = load(folder / "plan.json", execution["plan_sha256"])
    snapshots(folder, plan)
    assert execution["cloud_requests"] == execution["automatic_retries"] == 0
    requests = {row["native_run"]: row for row in plan["requests"]}
    if "smoke" in plan:
        requests[plan["smoke"]["native_run"]] = plan["smoke"]
    result = []
    for call in execution["native_calls"]:
        entry = requests[call["native_run"]]
        remember(ROOT / entry["path"], entry["sha256"])
        meta = native(QA / "advanced-ocr" / call["native_run"], call["native_metadata_sha256"])
        assert meta["elapsed_ms"] == call["elapsed_ms"] and meta["exit_code"] == call["exit_code"]
        row = {key: call.get(key) for key in ("id", "mode", "accepted", "elapsed_ms", "error")}
        if call["accepted"]:
            receipt = load(ROOT / call["receipt_path"], call["receipt_sha256"])
            raw = json.loads((QA / "advanced-ocr" / call["native_run"] / "stdout.txt").read_text(encoding="utf-8"))
            if call["mode"] == "compact":
                raw = {**raw, "items": [dict(zip(("description", "quantity", "unitPrice", "lineTotal", "taxCode", "discount", "sourcePhotos"), item), note="") for item in raw["items"]]}
            assert raw == receipt, "Representation adapter altered extracted values"
        if call.get("hybrid_path"):
            value = load(ROOT / call["hybrid_path"], call["hybrid_sha256"])
            receipt, calc = value["receipt"], value["calculation"]
            row["gate"] = {key: calc[key] for key in ("total", "printed", "discrepancy")}
            row["gate"].update({"issues": len(calc["issues"]), "pending_checks": len(receipt["reviewChecks"])})
            if call["id"].startswith("supplement-user-uk"):
                row["known_fields"] = metrics(labels[call["id"]], receipt, config)
            else:
                score = score_one(records[call["id"]], labels[call["id"]], {"receipt": receipt, "calculation": calc, "elapsed_ms": None}, config)
                row["known_fields"] = score["counts"]
        result.append(row)
    tree(folder)
    return result


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items():
            remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(EVIDENCE), "cloud_requests": 0, "native_workflows": 2}))
        return
    assert not OUT.exists(), "Preserve the report; use --check"
    config = load(DATA / "evaluation/config.json")
    labels, records = {}, {}
    for file, target in (("annotations/private/priced-rows-v2-labels.jsonl", labels),
                          ("annotations/private/supplement-labels.jsonl", labels),
                          ("manifest.jsonl", records)):
        for line in remember(DATA / file).read_text(encoding="utf-8").splitlines():
            row = json.loads(line)
            target[row["receipt_id"]] = row
    pilots = {name: pilot(name, config, labels, records) for name in
              ("compact-vision-v1", "compact-vision-v2", "compact-long-extension-v1")}
    assert len(pilots["compact-vision-v1"]) == 1 and not pilots["compact-vision-v1"][0]["accepted"]
    assert len(pilots["compact-vision-v2"]) == 7 and len(pilots["compact-long-extension-v1"]) == 2
    diagnostic = QA / "vision-timeout-diagnostic-v1"
    diagnostic_plan = load(diagnostic / "plan.json")
    for name, expected in diagnostic_plan["source_sha256"].items():
        path = diagnostic / "source" / Path(name).name if name.startswith("src/lib/") else diagnostic / "runtime-source" / name
        remember(path, expected)
    for source in diagnostic_plan["record"]["source_files"]:
        remember(DATA / source["file_path"], source["sha256"])
    tree(diagnostic)
    failed = native(QA / "advanced-ocr/vision-timeout-diagnostic-v1")
    assert not failed["parsed_json"] and failed["error"] == "deadline-or-output-bound"
    stderr = (QA / "advanced-ocr/vision-timeout-diagnostic-v1/stderr.txt").read_text(encoding="utf-8")
    assert "offloaded 37/37 layers to GPU" in stderr

    uk = DATA / "evaluation/runs/compact-local-native-uk-v1"
    uk_plan, uk_meta, uk_execution = [load(uk / file) for file in ("plan.json", "metadata.json", "execution.json")]
    snapshots(uk, uk_plan)
    assert uk_execution["worker_exit_code"] == 0 and uk_execution["source_unchanged"]
    assert uk_meta["completed_workflow"] and uk_meta["source_checked_financial_rows_match"]
    assert uk_meta["no_financial_edits"] and not uk_meta["blocked_requests"]
    assert uk_meta["external_requests"] == 0 and not uk_meta["gemini_configured"]
    assert not uk_meta["providers"]["veryfi"]["configured"] and uk_meta["providers"]["veryfi"]["remaining"] == 0
    assert [row["status"] for row in uk_meta["native_http_requests"]] == [200, 200]
    assert len(set(uk_meta["request_body_sha256"])) == 1
    assert uk_meta["shares"] == ["£58.93", "£58.93", "£58.92"]
    for entry, file in zip(uk_meta["native_http_requests"], ("ocr-response.json", "vision-response.json")):
        remember(uk / file, entry["response_sha256"])
    draft = load(uk / "app-draft.json")
    uk_fields = metrics(labels["supplement-user-uk-20261026-group"], draft["receipt"], config)
    assert uk_fields["lineTotal"] == uk_fields["unitPrice"] == uk_fields["discount"] == {"correct": 18, "known": 18}
    assert uk_fields["nonzero_coupons"] == {"correct": 4, "known": 4}
    assert draft["calculation"]["total"] == "17678" and draft["calculation"]["discrepancy"] == "0"
    assert len(draft["receipt"]["reviewChecks"]) == len(draft["calculation"]["issues"]) == 8
    memory = load(uk / "memory.json")
    assert not memory["errors"]
    tree(uk)

    long = QA / "compact-local-native-long-v1"
    long_plan, long_execution = [load(long / file) for file in ("plan.json", "execution.json")]
    snapshots(long, long_plan)
    assert long_execution["exit_code"] == 0 and long_execution["source_unchanged"]
    assert len(long_execution["new_e2e_directories"]) == 1 and long_execution["external_uploads"] == 0
    long_folder = ROOT / long_execution["new_e2e_directories"][0]
    long_evidence = load(long_folder / "long-vision-real-four.json")
    long_split = load(long_folder / "long-vision-split.json")
    assert long_evidence["completeStream"] and long_evidence["batchCount"] == 2
    assert long_evidence["moneyRowsMatch"] and long_evidence["finalMinor"] == "1950"
    assert len(long_evidence["receipt"]["items"]) == 6
    assert len([item for item in long_evidence["receipt"]["items"] if "chicken" in item["description"].lower()]) == 2
    assert long_split["participants"] == ["6.50", "6.50", "6.50"] and long_split["noFinancialEdits"]
    assert long_evidence["externalBrowserRequests"] == long_split["externalBrowserRequests"] == 0
    for panel in long_evidence["prepared"]:
        remember(Path(panel["path"]), panel["sha256"])
    tree(long_folder)
    tree(long)

    unit = remember(VALIDATION / "unit-final.log").read_text(encoding="utf-8")
    failed_browser = load(VALIDATION / "browser.json")
    assert failed_browser["stats"]["expected"] == 165 and failed_browser["stats"]["unexpected"] == 2
    browser = load(BROWSER / "browser.json")
    build = remember(VALIDATION / "build.log").read_text(encoding="utf-8")
    formatting = remember(VALIDATION / "format.log").read_text(encoding="utf-8")
    assert re.search(r"Tests\s+484 passed", unit)
    assert browser["stats"]["expected"] == 167 and browser["stats"]["unexpected"] == 0 and browser["stats"]["skipped"] == 1
    assert "built in" in build and "All matched files use Prettier" in formatting
    tree(VALIDATION)
    tree(BROWSER)
    current = load(DATA / "evaluation/advanced-current-preparation-v1.json")
    assert current["mixed_original_50"]["current_pixel_gate_errors"] == 0
    remember(Path(__file__))
    for name in ("build_provider_crop_report.py", "score.py"):
        remember(Path(__file__).with_name(name))
    stable = subprocess.check_output(["git", "rev-parse", "stable/receipt-verified"], cwd=ROOT, text=True).strip()
    assert stable == "ee725ba45e799bee8501d3de034e0302c0127afd"
    report = {
        "scope": "Measured compact native item representation only for multiple distinct original photos, with unchanged strict financial schema and mandatory source review. One-photo requests, including multiple panels from one photo, retain the canonical item objects. This is a bounded reliability fix, not global financial-accuracy certification.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "pilots": pilots,
        "prior_canonical_diagnostic": {"elapsed_ms": failed["elapsed_ms"], "complete_json": False, "gpu_layers_offloaded": "37/37", "finding": "The canonical item stream remained incomplete. Image encoding completed; CPU layer offload and trailing whitespace are not supported explanations."},
        "actual_two_photo_workflow": {"click_to_review_ms": uk_meta["click_to_review_ms"], "http_statuses": [200, 200],
                                      "known_fields": uk_fields, "pending_source_checks": 8, "no_financial_edits": True,
                                      "total_minor": "17678", "shares": uk_meta["shares"],
                                      "peak_sampled_owned_process_tree_bytes": memory["peak_sampled_process_tree_working_set_bytes"],
                                      "memory_scope": uk_execution["memory_scope"], "timing_scope": uk_meta["timing_scope"]},
        "actual_four_photo_workflow": {"synthetic": True, "click_to_review_ms": long_evidence["elapsedMs"], "batches": 2,
                                       "purchases": 6, "genuine_repeated_chicken_purchases": 2, "total_minor": "1950", "shares": ["6.50"] * 3,
                                       "no_financial_edits": True, "pending_source_checks": len(long_evidence["issuePaths"]), "timing_scope": long_evidence["timingScope"]},
        "selection": "Canonical-first development pilots with known sources and caches; no controlled speed ratio or p95 claim. Single-photo compact cases still have serious price/currency errors, so the profile is not promoted to those requests. All original-50 photos have one source photo; their retained format and separately reported 44+6 mixed-vintage field scores are unchanged.",
        "limits": {"multi_photo_model_ms": 180000, "multi_photo_reader_ms": 200000, "multi_photo_client_ms": 205000,
                   "single_photo_reader_ms": 120000, "single_photo_client_ms": 125000, "vision_http_ms": 200000,
                   "whole_batch_job_ms": 900000, "attempts_per_minute": 2, "attempts_per_hour": 10},
        "validation": {"unit_passed": 484, "browser_passed": 167, "browser_existing_skips": 1, "native_long_playwright_passed": 1,
                       "build_typecheck": True, "formatting": True, "failed_unit_fixture_retained": True,
                       "first_browser_attempt": "165 passes, one skip and two navigation failures while the agent rebuilt the served dist directory. Failure traces retained. The complete suite was rerun with a stable build."},
        "safety": "Representation expansion copies strings and photo indices without deriving, rounding or normalizing amounts. Strict validation rejects tuple length/type errors and invalid photo references, and the existing process/output/body/asset/cleanup/cancellation limits remain in force. No automatic cloud fallback or retries.",
        "stable_commit": stable, "cloud_requests": 0, "paid_activation": False, "api_cost": "0", "compute_cost": None,
        "remaining_work": "Three-minute two-photo latency is still unsuitable for a fast phone scan. Locale/price extraction, broader overlap layouts and independent recovery, complete original financial truth, genuine digital/refund cases, physical-device and public-backend controls remain open. Thirteen historical overwritten evidence artifacts remain disclosed; newer successes do not repair them. The full twelve-phase goal remains active.",
        "evidence_sha256": EVIDENCE,
    }
    OUT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({"evidence_files": len(EVIDENCE), "native_pilot_calls": 10, "actual_workflows": 2, "unit_passed": 484,
                      "browser_passed": 167, "cloud_requests": 0}))


if __name__ == "__main__":
    main()
