"""Offline scoring safeguards; synthetic records are not recognition evidence."""
import copy
import json
from pathlib import Path
import unittest

from review_gemini35_screening import aggregate, compare, empty_view, project, response_receipt


def receipt():
    return {"currency": "AUD", "subtotal": "", "printedTotal": "0.123456", "printedTax": "0",
            "pricesIncludeTax": None, "adjustments": [{"label": "Coupon", "kind": "discount", "amount": "2"}],
            "items": [{"description": "Product", "quantity": "", "unitPrice": "4.50",
                       "lineTotal": "", "discount": "", "taxCode": ""}]}


class GeminiReviewTests(unittest.TestCase):
    def test_missing_money_quantity_and_coupon_ownership_are_not_invented(self):
        view = project(receipt())
        row = view["line_items"][0]
        self.assertIsNone(row["quantity"])
        self.assertIsNone(row["total"])
        self.assertIsNone(row["discount"])
        self.assertEqual(view["native_adjustments_not_attached"][0]["amount"], "2")
        self.assertEqual(view["document"], {"subtotal": None, "total": "0.123456", "tax": "0"})
        self.assertEqual(view["returned_currency_not_used_for_scoring"], "AUD")

    def test_repeated_and_signed_rows_remain_separate(self):
        data = receipt()
        data["items"] *= 2
        coupon = copy.deepcopy(data["items"][0])
        coupon.update(description="Coupon", lineTotal="-2")
        data["items"].append(coupon)
        view = project(data)
        self.assertEqual(len(view["line_items"]), 3)
        self.assertEqual(view["line_items"][2]["total"], "-2")
        self.assertIsNone(view["line_items"][0]["discount"])

    def test_amounts_are_literal_strings_not_floats_or_locale_guesses(self):
        for invalid in (4.5, "NaN", "1,234", "1e3", "0.1234567"):
            data = receipt()
            data["printedTotal"] = invalid
            with self.assertRaises(ValueError):
                project(data)

    def test_only_completed_model_output_is_parsed(self):
        data = {"status": "completed", "steps": [
            {"type": "thought", "content": [{"type": "text", "text": "not a receipt"}]},
            {"type": "model_output", "content": [{"type": "text", "text": json.dumps(receipt())}]}]}
        self.assertEqual(response_receipt(data), receipt())
        data["status"] = "in_progress"
        with self.assertRaises(ValueError):
            response_receipt(data)
        data["status"] = "completed"
        data["steps"][1]["content"][0]["text"] = '{"currency":"GBP","currency":"AUD"}'
        with self.assertRaises(ValueError):
            response_receipt(data)

    def test_failures_keep_all_known_reference_values_in_denominator(self):
        root = Path(__file__).resolve().parents[2]
        labels = [json.loads(line) for line in (root / "qa-artifacts/provider-review/veryfi-screening-crops-v2/screening-labels-v1.jsonl").read_text(encoding="utf-8").splitlines()]
        config = json.loads((root / "receipt_training/evaluation/config.json").read_text())
        totals = aggregate([compare(label, empty_view(), config) for label in labels])
        self.assertEqual(totals["expected_priced_rows"], 26)
        self.assertEqual(totals["matched_reference_names"], 0)
        self.assertEqual((totals["total_correct"], totals["total_known"]), (0, 25))
        self.assertEqual((totals["total_document_correct"], totals["total_document_known"]), (0, 6))


if __name__ == "__main__":
    unittest.main()
