"""Check source revision boundaries and strict complete-receipt eligibility."""
from copy import deepcopy
import json
from pathlib import Path
import unittest

from record_financial_summary_review import BASE, DATA, SUPPLEMENT, SUMMARIES, ZERO_TAX_CONTROLS, revised, revised_supplement
from score_adjustments import score_with_adjustments


class FinancialSummaryTruth(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.labels = {row["receipt_id"]: row for row in map(json.loads, BASE.read_text(encoding="utf-8").splitlines())}
        cls.uk = json.loads(SUPPLEMENT.read_text(encoding="utf-8").splitlines()[0])
        cls.config = json.loads((DATA / "evaluation/config.json").read_text(encoding="utf-8"))

    def score(self, label):
        # Deliberately incorrect synthetic result: a matching total and no
        # engine issues must not turn new reference coverage into a success.
        prediction = {"elapsed_ms": 0, "receipt": {"currency": label["currency"]["value"], "items": [], "adjustments": [], "taxMode": "none", "pricesIncludeTax": True},
                      "calculation": {"total": "17678", "printed": "17678", "discrepancy": "0", "issues": []}}
        record = {"receipt_id": label["receipt_id"], "category": "costco/physical", "country": "GB", "split": "development"}
        return score_with_adjustments(record, label, prediction, self.config)["counts"]

    def test_all_source_prices_names_quantities_discounts_and_totals_are_preserved(self):
        for identity in (*SUMMARIES, "cord-v2-test-008"):
            base = self.labels[identity]
            before = deepcopy(base)
            new = revised(base)
            self.assertEqual(base, before)
            for field in ("merchant", "date", "currency", "items", "discounts", "fees", "subtotal", "tax", "grand_total"):
                self.assertEqual(new[field], base[field], (identity, field))
            self.assertIs(new["prices_include_tax"], False)
            self.assertFalse(new["coverage"]["financial_fields_complete"])

    def test_printed_zero_rounding_and_verified_absence_are_distinct(self):
        new = revised(self.labels["cord-v2-test-008"])
        self.assertEqual(new["rounding"], {"raw": "Rounding 0", "value": "0", "review_required": False})
        uk = revised_supplement(self.uk)
        self.assertIsNone(uk["rounding"]["value"])
        self.assertTrue(uk["rounding"]["review_required"])
        self.assertTrue(uk["coverage"]["rounding_absence_verified"])
        self.assertEqual(uk["fees"], [])

    def test_zero_tax_or_zero_change_does_not_prove_inclusion_or_rounding(self):
        for identity in ZERO_TAX_CONTROLS:
            new = revised(self.labels[identity])
            self.assertIsNone(new["prices_include_tax"])
            self.assertIsNone(new["rounding"]["value"])
            self.assertEqual(new, self.labels[identity])

    def test_payment_coupon_does_not_change_purchase_or_receipt_discounts(self):
        base = self.labels["cord-v2-train-005"]
        new = revised(base)
        self.assertEqual(new["discounts"], base["discounts"])
        self.assertEqual(new["grand_total"], base["grand_total"])
        self.assertEqual(new["payments"][-1], {"kind": "coupon_tender", "amount": {"raw": "Coupon 100,000", "value": "100000", "review_required": False}})

    def test_blurred_merchant_cannot_enable_strict_complete_receipt_scoring(self):
        for identity in (*SUMMARIES, "cord-v2-test-008"):
            new = revised(self.labels[identity])
            self.assertIsNone(new["merchant"]["value"])
            self.assertEqual(self.score(new)["complete_receipt_known"], 0)

    def test_new_uk_eligibility_is_not_a_matching_total_accuracy_success(self):
        before, after = self.score(self.uk), self.score(revised_supplement(self.uk))
        self.assertEqual(before["complete_receipt_known"], 0)
        self.assertEqual(after["complete_receipt_known"], 1)
        self.assertEqual(after["complete_receipt_correct"], 0)

    def test_unreviewed_records_and_supplement_amounts_are_unchanged(self):
        for identity, label in self.labels.items():
            if identity not in SUMMARIES and identity != "cord-v2-test-008":
                self.assertEqual(revised(label), label)
        new = revised_supplement(self.uk)
        for field in ("items", "discounts", "subtotal", "tax", "grand_total", "merchant", "currency", "rounding", "fees"):
            self.assertEqual(new[field], self.uk[field])

    def test_unexpected_existing_amount_is_rejected_instead_of_balancing_truth(self):
        altered = deepcopy(self.labels["cord-v2-train-000"])
        altered["grand_total"]["value"] = "999999"
        with self.assertRaises(AssertionError):
            revised(altered)


if __name__ == "__main__":
    unittest.main()
