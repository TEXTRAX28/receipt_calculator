"""Wholly synthetic offline audit cases; no credentials, images or network."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

from review_veryfi_probe import compare, exact_json, project

CONFIG = json.loads((Path(__file__).resolve().parents[1] / "evaluation/config.json").read_text())


def truth(name="Pears", price="9.49", discount="-2.00"):
    return {"id": name, **{key: {"value": value} for key, value in {
        "description": name, "quantity": "1", "unit_price": price, "line_total": price,
        "discount": discount, "tax_code": "Z"}.items()}}


def label(items):
    return {"items": items, "grand_total": {"value": "7.49"}}


def audit(wire, items=None):
    view = project(exact_json(wire))
    return view, compare(label(items or [truth()]), view, CONFIG)


class FieldReviewTests(unittest.TestCase):
    def test_total_cannot_substitute_for_missing_items_and_coupons(self):
        _, result = audit(b'{"total":7.49,"line_items":[]}')
        self.assertTrue(result["document_field_equality"]["total"])
        self.assertEqual(result["matched_purchase_rows"], 0)
        self.assertEqual(result["nonzero_coupons_on_matched_purchase_rows"], {"correct": 0, "known": 1})
        self.assertIsNone(result["trusted_reconciliation"])

    def test_no_binary_float_or_rounding(self):
        view, result = audit(b'{"line_items":[{"description":"Pears","price":9.49,"total":9.490000000001,"quantity":1}]}')
        self.assertEqual(view["line_items"][0]["total"], "9.490000000001")
        self.assertEqual(result["native_field_equality"]["total"]["correct"], 0)
        self.assertEqual(result["native_field_equality"]["price"]["correct"], 1)
        # This value would already have lost one penny through a JS float.
        view = project(exact_json(b'{"total":90071992547409.91,"line_items":[]}'))
        self.assertEqual(view["document"]["total"], "90071992547409.91")

    def test_discount_price_is_not_deduction_or_pre_discount_total(self):
        view, result = audit(b'{"line_items":[{"description":"Pears","total":7.49,"gross_total":9.49,"discount_price":7.49,"discount":2,"price":9.49,"quantity":1}]}')
        self.assertEqual(view["line_items"][0]["discount_price"], "7.49")
        self.assertEqual(result["native_field_equality"]["total"]["correct"], 0)
        self.assertEqual(result["native_field_equality"]["gross_total"]["correct"], 1)
        self.assertEqual(result["nonzero_coupons_on_matched_purchase_rows"]["correct"], 1)

    def test_separate_negative_line_is_preserved_without_coupon_attachment(self):
        view, result = audit(b'{"line_items":[{"description":"Pears","price":9.49,"total":9.49},{"description":"IRC summer offer","total":-2}]}')
        self.assertEqual(len(view["line_items"]), 2)
        self.assertEqual(result["unmatched_native_row_indices"], [1])
        self.assertEqual(result["nonzero_coupons_on_matched_purchase_rows"]["correct"], 0)
        self.assertIsNone(result["purchase_precision"])

    def test_identical_names_are_one_to_one_and_prices_cannot_optimise_pairing(self):
        # Reversed money on identical names must not be sorted to make it pass.
        items = [truth("Pears", "1.00"), truth("Pears", "3.00")]
        _, result = audit(b'{"line_items":[{"description":"Pears","total":3},{"description":"Pears","total":1}]}', items)
        self.assertEqual(result["matched_purchase_rows"], 2)
        self.assertEqual([r["native_row_index"] for r in result["purchase_pair_review"]], [0, 1])
        self.assertEqual(result["native_field_equality"]["total"]["correct"], 0)

    def test_right_discount_on_wrong_purchase_fails_association(self):
        _, result = audit(b'{"line_items":[{"description":"Pears","discount":0},{"description":"Oranges","discount":2}]}',
                          [truth(), truth("Oranges", discount="0")])
        self.assertEqual(result["nonzero_coupons_on_matched_purchase_rows"]["correct"], 0)

    def test_missing_is_not_zero_and_malformed_row_is_not_dropped(self):
        view, result = audit(b'{"currency_code":"USD","line_items":[null,{"description":"Pears","price":"9.49","quantity":true}]}')
        self.assertEqual(result["native_rows"], 2)
        self.assertEqual(result["native_field_equality"]["price"]["correct"], 0)
        self.assertIsNone(view["line_items"][1]["discount"])
        self.assertEqual(len(view["native_field_issues"]), 3)
        self.assertEqual(view["returned_currency_not_scored"], "USD")
        self.assertNotIn("currency", result)

    def test_no_enriched_product_description_fallback(self):
        _, result = audit(b'{"line_items":[{"normalized_description":"Pears","product_details":[{"product_name":"Pears"}],"price":9.49}]}')
        self.assertEqual(result["matched_purchase_rows"], 0)

    def test_invalid_duplicate_nonfinite_and_unbounded_payloads_rejected(self):
        for wire in (b'{"line_items":[],"total":1,"total":2}', b'{"line_items":[{"price":NaN}]}',
                     b'{"line_items":[{"price":1e999999999}]}', b'[]', b'\xff', b' ' * (2 * 1024 * 1024 + 1)):
            with self.subTest(wire=wire[:60]), self.assertRaises((ValueError, UnicodeError)):
                exact_json(wire)
        for wire in (b'{}', b'{"line_items":[],"tax_lines":{}}'):
            with self.subTest(wire=wire), self.assertRaises(ValueError):
                project(exact_json(wire))

    def test_full_offline_review_requires_matching_sealed_evidence_and_preserves_history(self):
        # A copied harness and synthetic receipt exercise the actual CLI without
        # accessing the real private run, account configuration or image crops.
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            scripts = root / "receipt_training/scripts"
            scripts.mkdir(parents=True)
            for name in ("review_veryfi_probe.py", "test_review_veryfi_probe.py", "score.py"):
                shutil.copyfile(Path(__file__).with_name(name), scripts / name)
            prepared = root / "qa-artifacts/provider-review/veryfi-uk-v1"
            run = prepared / "run"
            (run / "source").mkdir(parents=True)
            (run / "source/fixture.mjs").write_text("// synthetic transport evidence\n")
            (root / "crop.jpg").write_bytes(b"synthetic-only-not-an-image")
            digest = lambda path: hashlib.sha256(path.read_bytes()).hexdigest()

            def save(path, value):
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_text(json.dumps(value), encoding="utf-8")

            save(run / "response.json", {"line_items": [{"description": "Pears", "price": 9.49,
                                                         "total": 9.49, "discount": 2, "quantity": 1}],
                                          "total": 7.49})
            save(run / "manifest.json", {"inputs": [{"source": "crop.jpg", "sha256": digest(root / "crop.jpg")}]})
            protocol = {"fixture.mjs": digest(run / "source/fixture.mjs")}
            metadata = {"provider": "Veryfi", "processing_http_status": 201, "extraction_received": True,
                        "processing_requests": 1, "automatic_retries": 0,
                        "response_sha256": digest(run / "response.json"), "manifest_sha256": digest(run / "manifest.json"),
                        "archive_sha256": "synthetic-archive", "protocol_source_sha256": protocol,
                        "elapsed_ms": 21, "deletion_status": "provider-reported-success", "actual_billing_verified": False}
            save(run / "metadata.json", metadata)
            save(root / "receipt_training/evaluation/veryfi-probe-plan-v1.json",
                 {"manifest_sha256": metadata["manifest_sha256"], "archive_sha256": "synthetic-archive", "protocol_sha256": protocol})
            save(root / "receipt_training/evaluation/config.json", CONFIG)
            sample = {**label([truth()]), "receipt_id": "supplement-user-uk-20261026-group",
                      "verification": {"checked_against_source": True}}
            save(root / "receipt_training/annotations/private/supplement-labels.jsonl", sample)
            execute = lambda: subprocess.run([sys.executable, str(scripts / "review_veryfi_probe.py")],
                                             cwd=root, capture_output=True, text=True, timeout=15)
            result = execute()
            self.assertEqual(result.returncode, 0, result.stderr)
            report = prepared / "offline-field-review-v1/comparison.json"
            before = report.read_bytes()
            review = json.loads(before)
            self.assertEqual(review["external_requests_by_this_offline_audit"], 0)
            self.assertEqual(review["metrics"]["matched_purchase_rows"], 1)
            self.assertNotEqual(execute().returncode, 0)
            self.assertEqual(report.read_bytes(), before)
            (run / "response.json").write_text('{"line_items":[]}')
            result = execute()
            self.assertNotEqual(result.returncode, 0)
            self.assertIn("Frozen evidence changed", result.stderr)
            self.assertEqual(report.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
