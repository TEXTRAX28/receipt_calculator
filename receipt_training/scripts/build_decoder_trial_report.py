"""Audit two rejected recovery/decoder candidates from retained local evidence."""
from collections import defaultdict
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys

import build_printed_provider_checkpoint as audit
from build_headerless_coupon_report import canonical, replay

ROOT = audit.ROOT
QA = ROOT / "qa-artifacts"
PRICE = QA / "source-price-pilot-v1"
DECODER = QA / "currency-decoder-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-recovery-decoder-trials-v1.json"


def sha(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path):
    return json.loads(path.read_text(encoding="utf-8-sig"))


def rows(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def main():
    if "--check" in sys.argv:
        report = load(OUT)
        for name, digest in report["evidence_sha256"].items():
            assert sha(ROOT / name) == digest, "Evidence changed: " + name
        print(json.dumps({"verified_files": len(report["evidence_sha256"]), "promoted_candidates": 0}))
        return
    assert not OUT.exists(), "Preserve report; use --check"
    price_results = {}
    for split in ("development", "evaluation", "supplement"):
        before_meta, before = replay("source-price-baseline-" + split + "-v1")
        after_meta, after = replay("source-price-candidate-" + split + "-v1")
        assert before_meta["paired_inputs"] == after_meta["paired_inputs"]
        assert [name for name, digest in before_meta["source_sha256"].items()
                if digest != after_meta["source_sha256"].get(name)] == ["verify-readings.ts"]
        assert before.keys() == after.keys()
        changed = [key for key in before if canonical(before[key]) != canonical(after[key])]
        count = sum(len(row.get("price_recoveries", [])) for row in after.values())
        assert not changed and not count
        price_results[split] = {"paired_outputs": len(before), "changed_semantic_results": changed, "source_price_recoveries": count}
    screening_before = rows(PRICE / "screening-baseline-v1/predictions.jsonl")
    screening_after = rows(PRICE / "screening-candidate-v1/predictions.jsonl")
    key = lambda row: (row["case"], row["method"], row["mode"])
    prior = {key(row): row for row in screening_before}
    current = {key(row): row for row in screening_after}
    assert len(prior) == len(current) == 36 and prior.keys() == current.keys()
    assert all(canonical(prior[key]) == canonical(current[key]) for key in prior)
    price_results["six_crops"] = {"paired_variants": 36, "hybrid_variants": 12, "source_price_recoveries": 0, "changed_semantic_results": []}

    plan = load(DECODER / "plan.json")
    fixtures = load(DECODER / "smoke-fixtures.json")
    execution = load(DECODER / "native-execution.json")
    assert len(execution["results"]) == 6 and not any(row["exit_code"] or row["timed_out"] for row in execution["results"])
    assert execution["plan_sha256"] == sha(DECODER / "plan.json")
    assert execution["source_sha256"] == sha(DECODER / "native-runner.mjs")
    assert fixtures["plan_sha256"] == sha(DECODER / "plan.json")
    post = load(DECODER / "postprocess/metadata.json")
    assert post["variants"] == 12 and post["external_requests"] == post["blocked_network_attempts"] == 0
    assert sha(DECODER / "postprocess/predictions.jsonl") == post["predictions_sha256"]
    for name, digest in post["source_sha256"].items():
        assert sha(DECODER / "postprocess/source" / name) == digest
    for name, digest in post["loaded_frozen_module_sha256"].items():
        assert post["source_sha256"][name] == digest
    predictions = rows(DECODER / "postprocess/predictions.jsonl")
    selected = {(row["id"], row["mode"]): row for row in predictions if row["currencyMode"] == "selected-currency"}
    labels = {}
    label_paths = [ROOT / "receipt_training/annotations/labels.jsonl", ROOT / "receipt_training/annotations/private/supplement-labels.jsonl"]
    for path in label_paths:
        labels.update({row["receipt_id"]: row for row in rows(path)})
    config = load(ROOT / "receipt_training/evaluation/config.json")
    native_cases = []
    aggregate = {mode: defaultdict(int) for mode in ("control", "candidate")}
    for case in plan["cases"]:
        methods, native_data = {}, {}
        control_request, candidate_request = (load(ROOT / case[mode]["path"]) for mode in ("control", "candidate"))
        changed_keys = [key for key in control_request if control_request[key] != candidate_request[key]]
        assert changed_keys == ["schema"]
        for mode in ("control", "candidate"):
            tag = "currency-decoder-v1-" + case["id"] + "-" + mode
            folder = QA / "advanced-ocr" / tag
            meta = audit.native(folder, case[mode]["sha256"], plan["harness_sha256"])
            assert not meta["decoder_schema_warning"]
            native_data[mode] = load(folder / "model-output.json")
            prediction = selected[(case["id"], mode)]
            assert prediction["native_metadata_sha256"] == sha(folder / "metadata.json")
            assert prediction["native_model_output_sha256"] == sha(folder / "model-output.json")
            score = audit.field_score(labels[case["id"]], prediction, config)
            methods[mode] = {**score, "native_elapsed_ms": meta["elapsed_ms"], "peak_cli_working_set_bytes": meta["peak_process_working_set_bytes"]}
            for target, source in (("names_matched", "matched_purchase_names"), ("expected_purchases", "expected_purchases"), ("proposed_rows", "proposed_rows")):
                aggregate[mode][target] += score[source]
            for field in ("quantity", "unitPrice", "lineTotal", "discount", "taxCode"):
                aggregate[mode][field + "_correct"] += score["field_equality"][field]["correct"]
                aggregate[mode][field + "_known"] += score["field_equality"][field]["known"]
            aggregate[mode]["copied_totals_correct"] += score["document_equality"]["printedTotal"] is True
        native_cases.append({"id": case["id"], "native_outputs_identical": native_data["control"] == native_data["candidate"], "methods": methods})
    smokes = []
    for fixture in fixtures["controls"]:
        smoke = next(row for row in plan["smokes"] if row["currency"] == fixture["currency"])
        folder = QA / "advanced-ocr" / ("currency-decoder-v1-smoke-" + fixture["currency"])
        meta = audit.native(folder, smoke["request"]["sha256"], plan["harness_sha256"])
        result = load(folder / "model-output.json")
        assert result["currency"] == fixture["currency"]
        assert result["printedTotal"] == fixture["known_printed_total"]
        assert result["items"][0]["lineTotal"] == fixture["known_line_total"]
        assert result["items"][0]["unitPrice"] == fixture["known_unit_price"]
        smokes.append({"currency": fixture["currency"], "source_prices_correct": True,
            "unprinted_subtotal_supplied": result["subtotal"] != "", "unprinted_item_count_supplied": result["printedItemCount"] is not None,
            "native_elapsed_ms": meta["elapsed_ms"]})

    evidence = dict(audit.EVIDENCE)
    paths = [path for base in (PRICE, DECODER) for path in base.rglob("*") if path.is_file()]
    for split in ("development", "evaluation", "supplement"):
        for variant in ("baseline", "candidate"):
            paths += [path for path in (ROOT / "receipt_training/evaluation/runs" / ("source-price-" + variant + "-" + split + "-v1")).rglob("*") if path.is_file()]
    for row in execution["results"]:
        paths += [path for path in (QA / "advanced-ocr" / row["run"]).rglob("*") if path.is_file()]
    for fixture in fixtures["controls"]:
        paths += [path for path in (QA / "advanced-ocr" / ("currency-decoder-v1-smoke-" + fixture["currency"])).rglob("*") if path.is_file()]
    paths += label_paths + [ROOT / "receipt_training/evaluation/config.json", QA / "evidence-audits/source-price-before-v1.json"]
    for path in paths:
        assert not path.name.startswith(".env")
        evidence[path.relative_to(ROOT).as_posix()] = sha(path)
    report = {
        "created_at": datetime.now(timezone.utc).isoformat(),
        "scope": "Direct-source price recovery and currency-coupled decoder trials; no app/default-provider changes",
        "decisions": {"source_price_recovery": "Rejected: zero eligible replacements in retained evidence; not integrated",
                      "currency_precision_decoder": "Rejected: all three real outputs are identical to their fresh controls; not integrated"},
        "source_price_replay": price_results,
        "decoder": {"actual_native_calls": 8, "real_pairs": native_cases, "aggregate_selected_context": {key: dict(value) for key, value in aggregate.items()},
                    "smokes": smokes, "all_real_native_outputs_identical": all(row["native_outputs_identical"] for row in native_cases)},
        "limits": ["Previously inspected development/supplement selection, not a fresh holdout",
            "Selected currency is supplied only after native inference, identically in both arms",
            "A matching copied total or numerical syntax does not prove correct financial interpretation",
            "Unknown currency branch retains six decimal places; no model currency inference is forced",
            "Crops and diagnostics are not additional independent transactions",
            "Fresh control-first native times exclude setup/preparation and are not production latency or p95",
            "Eight local model calls, zero external receipt uploads or paid activation; all earlier cloud scopes remain consumed",
            "Current disk availability was below the existing model setup's ten-GiB reserve; larger model not downloaded"],
        "evidence_sha256": evidence,
    }
    with OUT.open("x", encoding="utf-8", newline="\n") as output:
        json.dump(report, output, indent=2)
        output.write("\n")
    print(json.dumps({"report": OUT.relative_to(ROOT).as_posix(), "evidence_files": len(evidence), "native_calls": 8, "promoted_candidates": 0,
                      "aggregate": report["decoder"]["aggregate_selected_context"]}))


if __name__ == "__main__":
    main()
