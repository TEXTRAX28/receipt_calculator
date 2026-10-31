"""Synthetic offline checks of the six-case audit; no account or network access."""
import base64
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from review_veryfi_screening import compare, exact_json, project

CONFIG = json.loads((Path(__file__).resolve().parents[1] / "evaluation/config.json").read_text())


def label(currency="GBP", price="9.49"):
    return {"receipt_id": "fixture", "currency": {"value": currency}, "items": [
        {"id": "pears", **{key: {"value": value} for key, value in {
            "description": "Pears", "quantity": "1", "unit_price": price,
            "line_total": price, "discount": "-2.00", "tax_code": "Z"}.items()}}
    ], "subtotal": {"value": None}, "tax": {"value": None}, "grand_total": {"value": "7.49"}}


def audit(wire, reference=None):
    view = project(exact_json(wire))
    return view, compare(reference or label(), view, CONFIG)


class ScreeningReviewTests(unittest.TestCase):
    def test_wrapped_and_scalar_numbers_are_exact_and_null_does_not_become_zero(self):
        view, result = audit(b'{"ocr_text":"Pears 9.49","total":{"value":null,"score":1},'
                             b'"tax":{"score":1},"line_items":[{"description":{"value":"Pears"},'
                             b'"price":{"value":9.49,"score":0.99},"total":9.490000000001,"quantity":1}]}')
        self.assertIsNone(view["document"]["total"])
        self.assertIsNone(view["document"]["tax"])
        self.assertFalse(result["document_equality"]["total"])
        self.assertEqual(view["line_items"][0]["total"], "9.490000000001")
        self.assertEqual(result["native_field_equality"]["price"]["correct"], 1)
        self.assertEqual(result["native_field_equality"]["total"]["correct"], 0)
        self.assertEqual(view["native_field_issues"], ["document.tax: missing wrapped value"])
        large = project(exact_json(b'{"ocr_text":"x","total":90071992547409.91,"line_items":[]}'))
        self.assertEqual(large["document"]["total"], "90071992547409.91")

    def test_high_precision_confidence_coordinates_are_not_financial_numbers(self):
        wire = b'{"ocr_text":"x","total":{"value":7.49,"score":0.99999999999999999,"bounding_box":[0,0.12345678901234567,0,1,1]},"line_items":[]}'
        view = project(exact_json(wire))
        self.assertEqual(view["document"]["total"], "7.49")
        self.assertEqual(view["document_geometry_fields"], ["total"])
        self.assertEqual(view["native_field_issues"], [])

    def test_reference_currency_never_uses_wrong_returned_currency_or_rounding(self):
        reference = label("IDR", "43636")
        _, result = audit(b'{"ocr_text":"Pears 43.636","currency_code":{"value":"HKD"},'
                          b'"line_items":[{"description":"Pears","total":43.636,"price":43636}]}', reference)
        self.assertEqual(result["native_field_equality"]["total"]["correct"], 0)
        self.assertEqual(result["native_field_equality"]["price"]["correct"], 1)
        self.assertNotIn("currency", result)

    def test_unmatched_negative_rows_do_not_satisfy_purchase_discount_ownership(self):
        view, result = audit(b'{"ocr_text":"Pears 9.49; offer -2","line_items":['
                             b'{"description":"Pears","total":9.49,"gross_total":9.49,"discount_price":7.49},'
                             b'{"description":"Offer","total":-2}]}')
        self.assertEqual(view["line_items"][1]["total"], "-2")
        self.assertEqual(result["unmatched_native_row_indices"], [1])
        self.assertEqual(result["native_field_equality"]["discount"]["correct"], 0)
        self.assertIsNone(result["purchase_precision"])
        self.assertIsNone(result["calculated_payable_total"])
        self.assertFalse(result["accepted_payable_result"])

    def test_unknown_reference_fields_are_excluded_and_invalid_rows_preserved(self):
        reference = label()
        for key in ("quantity", "unit_price", "discount", "tax_code"):
            reference["items"][0][key]["value"] = None
        view, result = audit(b'{"ocr_text":"x","line_items":[null,{"description":"Pears","total":"9.49","quantity":true}]}', reference)
        self.assertEqual(result["native_rows"], 2)
        self.assertEqual(set(result["native_field_equality"]), {"total"})
        self.assertEqual(result["native_field_equality"]["total"], {"known": 1, "correct": 0})
        self.assertEqual(len(view["native_field_issues"]), 3)

    def test_identical_names_are_ordered_one_to_one_without_price_optimisation(self):
        reference = label()
        first = reference["items"][0]
        reference["items"].append({**first, "id": "other-pears", "line_total": {"value": "3.00"}})
        _, result = audit(b'{"ocr_text":"x","line_items":[{"description":"Pears","total":3},{"description":"Pears","total":9.49}]}', reference)
        self.assertEqual([r["native_row_index"] for r in result["pair_review"]], [0, 1])
        self.assertEqual(result["native_field_equality"]["total"]["correct"], 0)

    def test_malformed_duplicate_nonfinite_and_unbounded_values_fail_closed(self):
        for wire in (b'{"total":1,"total":2}', b'{"total":NaN}', b'{"total":1e301}',
                     b'{"total":' + b'1' * 65 + b'}', b'[]', b'\xff', b' ' * 2_000_001):
            with self.subTest(wire=wire[:60]), self.assertRaises((ValueError, UnicodeError)):
                exact_json(wire)
        for record in ({}, {"line_items": [], "ocr_text": None},
                       {"line_items": [], "ocr_text": "x" * 60001},
                       {"line_items": [None] * 2001, "ocr_text": "x"}):
            with self.subTest(record=str(record)[:60]), self.assertRaises(ValueError):
                project(record)
        self.assertEqual(exact_json(b'{"total":0.1}')["total"], Decimal("0.1"))

    def test_cli_checks_six_scoped_responses_cleanup_and_immutable_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scripts = root / "receipt_training/scripts"
            scripts.mkdir(parents=True)
            for name in ("review_veryfi_screening.py", "score.py"):
                shutil.copyfile(Path(__file__).with_name(name), scripts / name)
            folder = root / "qa-artifacts/provider-review/veryfi-screening-crops-v2"
            run = folder / "run"
            (run / "source").mkdir(parents=True)
            sha = lambda raw: hashlib.sha256(raw).hexdigest()
            save = lambda path, value: path.write_text(json.dumps(value, separators=(",", ":")), encoding="utf-8")
            (run / "source/fixture.mjs").write_text("// synthetic protocol\n")
            manifest, source_review = {"fixture": True}, {"fixture": True}
            save(run / "manifest.json", manifest)
            save(run / "source-review.json", source_review)
            options = {"compute": False, "bounding_boxes": True, "confidence_details": True}
            cases, summary = [], []
            for index in range(6):
                name, external = f"case-{index + 1:02}", f"fixture-{index}"
                inputs, output = folder / name, run / name
                inputs.mkdir()
                output.mkdir()
                archive, crop = b"synthetic archive", b"synthetic pixels"
                (inputs / "receipt.zip").write_bytes(archive)
                (inputs / "receipt.png").write_bytes(crop)
                cases.append({"case": name, "receipt_id": "fixture", "archive_sha256": sha(archive), "crop_sha256": sha(crop)})
                response = {"id": index + 1, "external_id": external, "ocr_text": "Pears 9.49", "total": {"value": 7.49},
                            "line_items": [{"description": "Pears", "total": 9.49}]}
                save(output / "response.json", response)
                body = {"file_name": "receipt.zip", "file_data": base64.b64encode(archive).decode("ascii"), "external_id": external, **options}
                meta = {"external_id": external, "request_sha256": sha(json.dumps(body, separators=(",", ":")).encode()),
                        "response_sha256": sha((output / "response.json").read_bytes()), "processing_requests": 1,
                        "automatic_retries": 0, "processing_http_status": 201, "extraction_received": True,
                        "request_options": options, "test_document_id": str(index + 1), "deletion_requests": 1,
                        "deletion_http_status": 200, "deletion_status": "provider-reported-success", "elapsed_ms": 1}
                save(output / "metadata.json", meta)
                save(output / "consumed.json", {"external_id": external})
                summary.append(meta)
            plan = {"cases": cases, "extraction_options": options, "manifest_sha256": sha((run / "manifest.json").read_bytes()),
                    "source_review_sha256": sha((run / "source-review.json").read_bytes()),
                    "protocol_sha256": {"fixture.mjs": sha((run / "source/fixture.mjs").read_bytes())}}
            save(run / "plan.json", plan)
            evaluation = root / "receipt_training/evaluation"
            evaluation.mkdir(parents=True)
            shutil.copyfile(run / "plan.json", evaluation / "veryfi-screening-plan-v1.json")
            save(evaluation / "config.json", CONFIG)
            auth = {"plan_sha256": sha((run / "plan.json").read_bytes()), "approved_by_user": True, "free_quota_confirmed": True}
            save(folder / "authorization.json", auth)
            save(folder / "consumed.json", {"authorization": auth})
            save(run / "summary.json", summary)
            (folder / "screening-labels-v1.jsonl").write_text(json.dumps(label()) + "\n", encoding="utf-8")

            def execute(tag):
                return subprocess.run([sys.executable, str(scripts / "review_veryfi_screening.py"), "--out", tag],
                                      cwd=root, capture_output=True, text=True, timeout=15)

            result = execute("first")
            self.assertEqual(result.returncode, 0, result.stderr)
            evidence = folder / "first/comparison.json"
            before = evidence.read_bytes()
            self.assertEqual(json.loads(before)["external_requests_by_this_audit"], 0)
            self.assertEqual(len(json.loads(before)["cases"]), 6)
            self.assertNotEqual(execute("first").returncode, 0)
            self.assertEqual(evidence.read_bytes(), before)
            target = run / "case-01/metadata.json"
            original = target.read_bytes()
            metadata = json.loads(original)
            metadata["deletion_http_status"] = 403
            save(target, metadata)
            self.assertIn("Cleanup is not proven", execute("bad-cleanup").stderr)
            self.assertFalse((folder / "bad-cleanup").exists())
            target.write_bytes(original)
            (run / "case-01/response.json").write_text('{"line_items":[]}', encoding="utf-8")
            self.assertIn("Evidence changed", execute("bad-response").stderr)
            self.assertFalse((folder / "bad-response").exists())
            self.assertEqual(evidence.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
