import unittest
from copy import deepcopy

from collect import field
from score import score_one
from score_adjustments import score_with_adjustments
import test_evaluation as baseline

CONFIG = baseline.CONFIG


class AdjustmentScoringTests(unittest.TestCase):
    def case(self):
        record, label, prediction = baseline.EvidenceTests().financial_case()
        label["rounding"] = field("0.00", "0.00")
        prediction["receipt"].update({"taxMode": "printed", "adjustments": [
            {"kind": "rounding", "amount": "0.00"}]})
        return record, label, prediction

    def test_balanced_unprinted_fee_and_offsetting_rounding_cannot_pass_complete_metric(self):
        record, label, prediction = self.case()
        prediction["receipt"]["adjustments"] = [{"kind": "fee", "amount": "1.00"},
                                                  {"kind": "rounding", "amount": "-1.00"}]
        self.assertEqual(score_one(record, label, prediction, CONFIG)["counts"]["complete_receipt_correct"], 1)
        counts = score_with_adjustments(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["fee_structure_correct"], 0)
        self.assertEqual(counts["rounding_correct"], 0)
        self.assertEqual(counts["complete_receipt_correct"], 0)

    def test_known_service_charge_must_be_a_charge_rather_than_tax(self):
        record, label, prediction = self.case()
        label["fees"] = [{"kind": "service_price", "amount": field("1.00", "1.00")}]
        prediction["receipt"]["adjustments"] = [{"kind": "tax", "amount": "1.00"}]
        counts = score_with_adjustments(record, label, prediction, CONFIG)["counts"]
        self.assertEqual((counts["receipt_fee_correct"], counts["receipt_fee_known"]), (0, 1))
        prediction["receipt"]["adjustments"] = [{"kind": "fee", "amount": "1.00"}]
        self.assertEqual(score_with_adjustments(record, label, prediction, CONFIG)["counts"]["receipt_fee_correct"], 1)

    def test_two_equal_fees_need_two_physical_proposals(self):
        record, label, prediction = self.case()
        label["fees"] = [{"kind": "fee", "amount": field("1.00", "1.00")} for _ in range(2)]
        prediction["receipt"]["adjustments"] = [{"kind": "fee", "amount": "1.00"}]
        counts = score_with_adjustments(record, label, prediction, CONFIG)["counts"]
        self.assertEqual((counts["receipt_fee_correct"], counts["receipt_fee_known"]), (1, 2))

    def test_signed_rounding_is_not_an_unsigned_deduction(self):
        record, label, prediction = self.case()
        label["rounding"] = field("-0.01", "-0.01")
        prediction["receipt"]["adjustments"] = [{"kind": "rounding", "amount": "0.01"}]
        self.assertEqual(score_with_adjustments(record, label, prediction, CONFIG)["counts"]["rounding_correct"], 0)
        prediction["receipt"]["adjustments"][0]["amount"] = "-0.01"
        self.assertEqual(score_with_adjustments(record, label, prediction, CONFIG)["counts"]["rounding_correct"], 1)

    def test_missing_rounding_truth_is_unscorable_and_is_not_inferred_as_zero(self):
        record, label, prediction = self.case()
        label["rounding"] = field(None, None)
        counts = score_with_adjustments(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["rounding_known"], 0)
        self.assertEqual(counts["complete_receipt_known"], 0)
        self.assertEqual(counts["complete_receipt_unscorable"], 1)
        label["coverage"]["rounding_absence_verified"] = True
        prediction["receipt"]["adjustments"] = []
        counts = score_with_adjustments(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["complete_receipt_known"], 1)

    def test_default_tax_boolean_with_unknown_mode_does_not_count_as_identified_basis(self):
        record, label, prediction = self.case()
        prediction["receipt"]["taxMode"] = "unknown"
        self.assertEqual(score_with_adjustments(record, label, prediction, CONFIG)["counts"]["price_basis_correct"], 0)

    def test_unknown_partial_fees_are_not_zero_or_an_automatic_extra_fee_error(self):
        record, label, prediction = self.case()
        label["coverage"]["financial_fields_complete"] = False
        label["fees"] = [{"kind": "service_price", "amount": field(None, None)}]
        prediction["receipt"]["adjustments"] = [{"kind": "fee", "amount": "99.00"}]
        counts = score_with_adjustments(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["receipt_fee_known"], 0)
        self.assertEqual(counts["fee_structure_known"], 0)

    def test_wrong_decimal_precision_is_not_rounded_into_a_correct_fee(self):
        record, label, prediction = self.case()
        label["fees"] = [{"kind": "fee", "amount": field("1.00", "1.00")}]
        prediction["receipt"]["adjustments"] = [{"kind": "fee", "amount": "1.001"}]
        before = deepcopy(prediction)
        self.assertEqual(score_with_adjustments(record, label, prediction, CONFIG)["counts"]["receipt_fee_correct"], 0)
        self.assertEqual(prediction, before)


if __name__ == "__main__":
    unittest.main()
