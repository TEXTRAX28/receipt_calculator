"""Seal the three-case, source-informed financial-reader diagnostic, not an app score."""
from collections import Counter
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
RUN = ROOT / "qa-artifacts/financial-vision-pilot-v1"
OUT = ROOT / "receipt_training/evaluation/advanced-financial-vision-pilot-v1.json"
HASHES = {}


def read(path, expected=None):
    raw = path.read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    assert expected is None or digest == expected, str(path)
    HASHES[path.relative_to(ROOT).as_posix()] = digest
    return raw


def load(path, expected=None):
    return json.loads(read(path, expected))


def amount(token):
    """Post-extraction IDR reference context; no amount goes back to a reader."""
    assert isinstance(token, str)
    if re.fullmatch(r"-?\d{1,3}(?:[,\.]\d{3})+", token):
        token = token.replace(",", "").replace(".", "")
    if not re.fullmatch(r"-?\d+", token):
        return None
    return str(Decimal(token))


def expected_rows(label):
    result = [(role, label[field]["value"]) for role, field in
              (("subtotal", "subtotal"), ("tax", "tax"), ("total", "grand_total"))]
    result.extend(("fee", row["amount"]["value"]) for row in label["fees"])
    result.extend(("change" if row["kind"] == "changeprice" else "payment",
                   row["amount"]["value"]) for row in label["payments"])
    assert all(value is not None for _, value in result)
    return result


def main():
    if "--check" in sys.argv:
        report = json.loads(OUT.read_text(encoding="utf-8"))
        for path, digest in report["evidence_sha256"].items():
            read(ROOT / path, digest)
        print(json.dumps({"verified_files": len(HASHES), "new_model_requests": 0}))
        return
    assert not OUT.exists(), "Preserve the sealed diagnostic"
    plan = load(RUN / "plan.json")
    for path, digest in plan["input_sha256"].items():
        read(ROOT / path, digest)
    read(ROOT / plan["model_manifest"])
    truth = load(ROOT / "receipt_training/evaluation/advanced-financial-truth-v1.json")
    for path, digest in truth["evidence_sha256"].items():
        read(ROOT / path, digest)
    labels = {row["receipt_id"]: row for row in
              map(json.loads, read(ROOT / truth["labels"]).decode("utf-8").splitlines())}
    validation_script = """
import { readFile } from 'node:fs/promises';
import { financialSummarySchema } from './qa-artifacts/financial-vision-pilot-v1/financial_vision_profile.mjs';
const plan = JSON.parse(await readFile('./qa-artifacts/financial-vision-pilot-v1/plan.json', 'utf8'));
for (const c of plan.cases) financialSummarySchema.parse(JSON.parse(await readFile('./qa-artifacts/advanced-ocr/' + c.native_run + '/model-output.json', 'utf8')));
console.log(JSON.stringify({schema_valid: plan.cases.length}));
"""
    schema_check = subprocess.check_output(["node", "--input-type=module", "--eval", validation_script], cwd=ROOT)
    assert json.loads(schema_check)["schema_valid"] == 3
    (RUN / "schema-validation.json").write_bytes(schema_check)
    read(RUN / "schema-validation.json")
    cases, total = [], Counter()
    for case in plan["cases"]:
        request = load(ROOT / case["request"], case["request_sha256"])
        folder = ROOT / "qa-artifacts/advanced-ocr" / case["native_run"]
        meta = load(folder / "metadata.json")
        assert meta["exit_code"] == 0 and meta["parsed_json"] is True
        assert meta["request_sha256"] == case["request_sha256"]
        assert meta["decoder_schema_warning"] is False
        assert meta["input_ocr_text"] is False and meta["label_files_read"] is False
        assert meta["external_receipt_uploads"] == meta["external_api_requests"] == 0
        assert request["prompt"] == load(ROOT / plan["cases"][0]["request"])["prompt"]
        for image in meta["images"]:
            read(ROOT / image["path"], image["sha256"])
        for path in folder.iterdir():
            if path.is_file():
                read(path)
        read(RUN / ("run-" + str(len(cases) + 1) + ".log"))
        output = load(folder / "model-output.json")
        expected = expected_rows(labels[case["id"]])
        predicted = [(row["role"], amount(row["amountText"])) for row in output["entries"]]
        expected_amounts = Counter(value for _, value in expected)
        predicted_amounts = Counter(value for _, value in predicted)
        roles = sum((Counter(expected) & Counter(predicted)).values())
        amounts = sum((expected_amounts & predicted_amounts).values())
        known_basis = labels[case["id"]]["prices_include_tax"]
        expected_basis = "unknown" if known_basis is None else "inclusive" if known_basis else "exclusive"
        counts = {"known_summary_rows": len(expected), "returned_summary_rows": len(predicted),
                  "literal_amount_multiset_matches": amounts, "role_and_amount_multiset_matches": roles,
                  "unknown_roles": sum(role == "unknown" for role, _ in predicted),
                  "known_basis": int(known_basis is not None),
                  "known_basis_correct": int(known_basis is not None and output["itemPriceTaxBasis"] == expected_basis),
                  "unknown_basis_controls": int(known_basis is None),
                  "unknown_basis_controls_preserved": int(known_basis is None and output["itemPriceTaxBasis"] == "unknown")}
        total.update(counts)
        cases.append({"receipt_id": case["id"], "counts": counts,
                      "expected_role_amount_rows": expected, "predicted_role_amount_rows": predicted,
                      "expected_basis": expected_basis, "predicted_basis": output["itemPriceTaxBasis"],
                      "elapsed_ms": meta["elapsed_ms"],
                      "peak_process_working_set_bytes": meta["peak_process_working_set_bytes"]})
    read(Path(__file__))
    hardware = ROOT / "qa-artifacts/financial-reader-next-v1/hardware-preflight.json"
    read(hardware)
    read(hardware.with_name("official-qwen8-metadata.json"))
    report = {"scope": plan["scope"], "cases": cases, "counts": dict(total),
              "promotion": "rejected: financial roles and positive-tax price basis fail the frozen gate",
              "new_local_native_requests": 3, "external_receipt_uploads": 0,
              "external_provider_requests": 0, "api_cost_usd": "0",
              "app_source_changed": False, "larger_model_downloaded_or_run": False,
              "limitations": [
                  "Three previously inspected development cases, not a blind holdout, full-receipt score or new provider comparison.",
                  "Amounts are multiset matches in explicit post-extraction IDR reference context; this does not score row identity or exact labels.",
                  "Role/amount matching counts unknown as an abstention and does not certify absent financial rows or arithmetic reconciliation.",
                  "No OCR or reference enters inference. The specialist uses the same Qwen weights as the existing vision reader, not an independent second model.",
                  "Latency is fresh CLI load plus this smaller output task; it cannot demonstrate speedup against full-receipt extraction or a useful p95.",
                  "Available-memory snapshot defers an 8B download; it is not an accuracy result or proof that another deployment cannot run it."],
              "evidence_sha256": HASHES}
    with OUT.open("x", encoding="utf-8", newline="\n") as file:
        json.dump(report, file, ensure_ascii=False, indent=2)
        file.write("\n")
    print(json.dumps({"cases": len(cases), "counts": dict(total), "promotion": report["promotion"], "files": len(HASHES)}))


if __name__ == "__main__":
    main()
