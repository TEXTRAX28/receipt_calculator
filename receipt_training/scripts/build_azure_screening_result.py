"""Seal consumed Azure responses and fair saved-output field comparisons."""
from collections import Counter, defaultdict
import base64
import hashlib
import json
from pathlib import Path
import sys

from build_printed_provider_checkpoint import field_score
from review_azure_screening import project_bytes
from review_veryfi_screening import exact_json, project as veryfi_project, compare

ROOT = Path(__file__).resolve().parents[2]
FOLDER = ROOT / "qa-artifacts/provider-review/azure-screening-v1"
VERYFI = ROOT / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
OUT = ROOT / "receipt_training/evaluation/advanced-azure-screening-result-v2.json"
CAPTURE = FOLDER / "offline-review-v3"
HASHES = {}


def remember(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(remember(path, expected))


def native_totals(results):
    count = Counter()
    for row in results:
        count.update({key: row[key] for key in ("expected_priced_rows", "native_rows", "matched_reference_names", "exact_normalized_descriptions")})
        for field, values in row["native_field_equality"].items():
            count.update({field + "_" + key: value for key, value in values.items()})
        for field, value in row["document_equality"].items():
            if value is not None:
                count[field + "_document_known"] += 1
                count[field + "_document_correct"] += int(value)
    return dict(count)


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for name, expected in report["evidence_sha256"].items(): remember(ROOT / name, expected)
        print(json.dumps({"verified_files": len(HASHES), "new_external_requests": 0}))
        return
    assert not OUT.exists() and not CAPTURE.exists(), "Preserve recorded evidence"
    plan_bytes = remember(FOLDER / "run/plan.json")
    plan = json.loads(plan_bytes)
    remember(ROOT / "receipt_training/evaluation/azure-screening-plan-v1.json", hashlib.sha256(plan_bytes).hexdigest())
    auth = load(FOLDER / "authorization.json")
    consumed = load(FOLDER / "consumed.json")
    assert consumed["authorization"] == auth and auth["approved_by_user"]
    assert auth["free_f0_confirmed"] and auth["unused_free_pages_confirmed"] and auth["resource_region"] == "UK South"
    assert auth["plan_sha256"] == hashlib.sha256(plan_bytes).hexdigest()
    assert auth["max_processing_requests"] == auth["max_deletion_requests"] == 6 and auth["max_poll_requests"] == 180 and auth["automatic_retries"] == 0
    for name, expected in plan["protocol_sha256"].items(): remember(FOLDER / "run/source" / Path(name).name, expected)
    for name, expected in plan["review_sha256"].items(): remember(ROOT / name, expected)
    labels = {row["receipt_id"]: row for row in map(json.loads, remember(VERYFI / "screening-labels-v1.jsonl").decode().splitlines())}
    config = load(ROOT / "receipt_training/evaluation/config.json")
    summary = load(FOLDER / "run/summary.json")["results"]
    assert len(summary) == len(plan["cases"]) == 6
    by_provider, per_case, views = defaultdict(list), [], {}
    result_ids = set()
    currency_correct = 0
    for case, meta in zip(plan["cases"], summary, strict=True):
        assert meta["id"] == case["id"]
        folder = FOLDER / "run" / case["id"]
        assert load(folder / "metadata.json") == meta
        ledger = load(folder / "consumed.json")
        assert meta["image_sha256"] == case["image_sha256"] == auth["images"][case["id"]]
        image = remember(ROOT / case["image"], case["image_sha256"])
        body = json.dumps({"base64Source": base64.b64encode(image).decode()}, separators=(",", ":")).encode()
        assert hashlib.sha256(body).hexdigest() == meta["request_sha256"]
        assert ledger["image_sha256"] == meta["image_sha256"]
        assert meta["endpoint_sha256"] == auth["endpoint_sha256"]
        assert meta["processing_requests"] == meta["deletion_requests"] == 1 and meta["automatic_retries"] == 0
        assert meta["processing_http_status"] == 202 and meta["deletion_http_status"] == 204
        assert meta["extraction_received"] and meta["deletion_status"] == "provider-reported-success"
        assert meta["result_id"] not in result_ids and 1 <= meta["poll_requests"] <= 30
        result_ids.add(meta["result_id"])
        raw = remember(folder / "response.json", meta["response_sha256"])
        azure = project_bytes(raw)
        vf_meta = load(VERYFI / "run" / case["id"] / "metadata.json")
        veryfi = veryfi_project(exact_json(remember(VERYFI / "run" / case["id"] / "response.json", vf_meta["response_sha256"])))
        label = labels[case["receipt_id"]]
        metrics = {}
        for name, view in (("azure-native", azure), ("veryfi-native", veryfi)):
            metrics[name] = compare(label, view, config)
            by_provider[name].append(metrics[name])
        currency_correct += azure["returned_currency_not_used_for_scoring"] == label["currency"]["value"]
        views[case["id"]] = azure
        per_case.append({"case":case["id"], "receipt_id":case["receipt_id"], "metrics":metrics,
            "azure_currency_returned":azure["returned_currency_not_used_for_scoring"],
            "source_context_currency":label["currency"]["value"], "request_plus_cleanup_ms":meta["elapsed_ms"]})
    text = FOLDER / "current-text-comparison-v1"
    meta = load(text / "metadata.json")
    assert meta["model_requests"] == meta["external_requests"] == 0 and meta["variants"] == 24
    for name, expected in meta["source_sha256"].items(): remember(text / "source" / name, expected)
    for name, expected in meta["loaded_frozen_module_sha256"].items(): assert meta["source_sha256"][name] == expected
    remember(text / "runner.mjs", meta["runner_sha256"])
    predictions = [json.loads(line) for line in remember(text / "predictions.jsonl", meta["predictions_sha256"]).decode().splitlines()]
    text_totals = defaultdict(Counter)
    for prediction in predictions:
        assert prediction["trusted"] is False
        score = field_score(labels[prediction["receipt_id"]], prediction, config)
        count = text_totals[prediction["method"] + "/" + prediction["mode"]]
        count.update({name:score[name] for name in ("expected_purchases", "proposed_rows", "matched_purchase_names", "exact_normalized_descriptions")})
        for field, values in score["field_equality"].items(): count.update({field + "_" + key:value for key,value in values.items()})
        count["copied_final_total_correct"] += score["document_equality"]["printedTotal"] is True
        row = next(row for row in per_case if row["case"] == prediction["case"])
        row.setdefault("text_metrics", {})[prediction["method"] + "/" + prediction["mode"]] = score
    CAPTURE.mkdir()
    for source in (Path(__file__), Path(__file__).with_name("review_azure_screening.py"),
        Path(__file__).with_name("review_veryfi_screening.py"), Path(__file__).with_name("score.py"),
        Path(__file__).with_name("build_printed_provider_checkpoint.py"), Path(__file__).with_name("test_review_azure_screening.py")):
        target = CAPTURE / source.name
        target.write_bytes(source.read_bytes())
        remember(target)
    # Exact decimal polygon/page tokens are strings in this derived audit view;
    # original numeric JSON remains preserved byte-for-byte in each response.
    (CAPTURE / "native-fields.json").write_text(json.dumps(views,ensure_ascii=False,indent=2,default=str),encoding="utf-8")
    remember(CAPTURE / "native-fields.json")
    for name in ("evidence-tests.log", "preparation-check.log", "protocol-tests.log", "cli-results.json"):
        remember(ROOT / "qa-artifacts/azure-current-readiness-v1" / name)
    remember(ROOT / "qa-artifacts/row-first-validation-v1/azure-protocol.log")
    test_log = remember(ROOT / "qa-artifacts/azure-screening-audit-tests-v2.log").decode("utf-8")
    assert "Ran 8 tests" in test_log and "\nOK" in test_log and "FAILED" not in test_log
    report = {"scope":"Exactly six approved identifier-reduced PNG crops in UK South F0, same source-reviewed screen as Veryfi. Assistant-reviewed development evidence, not blind, complete receipt truth or an upload of the original fifty.",
        "live_execution":{"processing_requests":6,"poll_requests":sum(row["poll_requests"] for row in summary),
            "deletion_requests":6,"provider_reported_deletions":6,"automatic_retries":0,"paid_activation":False,
            "free_quota_confirmed_by_user":True,"actual_billing_verified":False,"region_confirmed_by_user":"UK South",
            "authorization_state":"Consumed; no further uploads, retries or unrelated-result deletion authorized"},
        "native_aggregate":{key:native_totals(rows) for key,rows in by_provider.items()},
        "azure_currency_correct":{"correct":currency_correct,"known":6},
        "current_literal_text_aggregate":{key:dict(count) for key,count in text_totals.items()},
        "per_case":per_case,"new_external_requests_by_analysis":0,
        "tests":{"offline_projection_tests_passed":8,"synthetic_protocol_tests_passed":16,"historical_evidence_tests_passed":5},
        "decision":{"change_default_reader":False,"app_azure_integration":False,
            "reason":"Azure native fields outperform native Veryfi on these six crops, while currencies, coupon ownership and Tesco price association remain wrong. Current Veryfi text/parser is a separate stronger price path. Plain Azure content splits columns; an actual word-geometry adapter needs its own benchmark before provider selection."},
        "limits":["Prices are compared in source reference currency, never converted using returned provider codes. A numerically correct amount with the wrong returned currency is not a correct bill.",
            "All negative coupon/redemption rows remain separate native rows. Unknown Taiwan ownership, faint first Tesco amount and unprinted fields remain excluded. No arithmetic repair or inferred discount attaches them.",
            "Literal-text ablation uses the same current frozen parser for both providers, without native fields or fabricated boxes/confidence. It does not test Azure's available word-geometry potential.",
            "Copied final totals are distinct from source-verified financial reconciliation; no complete payable receipt is certified. Full-collected-dataset Azure accuracy remains unmeasured.",
            "Network-plus-cleanup timing includes polling and cannot be ranked against local inference or declared a p95. Actual invoice/quota/region were not inspected via management APIs.",
            "Microsoft's same-region temporary-storage/deletion policy and HTTP204 cleanup do not establish an independent erasure audit or account-specific training-use exclusion. No custom training or paid activation occurred."],
        "evidence_sha256":HASHES}
    with OUT.open("x",encoding="utf-8",newline="\n") as output: output.write(json.dumps(report,ensure_ascii=False,indent=2)+"\n")
    print(json.dumps({"evidence_files":len(HASHES),"native":report["native_aggregate"],"text":report["current_literal_text_aggregate"],"new_external_requests":0}))


if __name__ == "__main__": main()
