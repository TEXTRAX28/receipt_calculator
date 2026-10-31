import json
import unittest
from copy import deepcopy

from collect import ROOT, cord_label, field, rupiah
from score import match_items, minor, score_one

CONFIG = json.loads((ROOT / "evaluation/config.json").read_text(encoding="utf-8"))


class EvidenceTests(unittest.TestCase):
    def financial_case(self):
        label = cord_label("test", {"gt_parse": {"menu": {"nm": "MILK", "price": "2,000", "cnt": "1"}, "total": {"total_price": "2,000"}}, "meta": {}})
        for key, value in {"merchant": "SHOP", "currency": "GBP", "subtotal": "2.00", "tax": "0.00", "grand_total": "2.00"}.items():
            label[key] = field(value, value)
        item = label["items"][0]
        for key, value in {"description": "MILK", "quantity": "1", "unit_price": "2.00", "line_total": "2.00", "discount": "0.00", "tax_code": "Z"}.items():
            item[key] = field(value, value)
        label["prices_include_tax"] = True
        label["coverage"] = {"item_metrics_eligible": True, "items_complete_for_visible_body": True, "financial_fields_complete": True}
        record = {"receipt_id": "test", "category": "non_costco/physical", "country": "GB", "split": "development"}
        prediction = {"elapsed_ms": 1, "receipt": {"merchant": "Shop", "currency": "GBP", "subtotal": "2.00", "printedTotal": "2.00", "printedTax": "0.00", "pricesIncludeTax": True, "items": [{"description": "MILK", "quantity": "1", "unitPrice": "2.00", "lineTotal": "2.00", "discount": "0.00", "taxCode": "Z"}]}, "calculation": {"discrepancy": "0", "total": "200", "issues": []}}
        return record, label, prediction

    def test_complete_metric_requires_explicit_complete_truth(self):
        record, label, prediction = self.financial_case()
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["complete_receipt_correct"], 1)
        del label["coverage"]["financial_fields_complete"]
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["complete_receipt_known"], 0)
        self.assertEqual(counts["complete_receipt_unscorable"], 1)

    def test_balanced_wrong_total_and_extra_purchase_fail(self):
        record, label, prediction = self.financial_case()
        prediction["calculation"]["total"] = "300"
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["trusted_reconciliation_correct"], 0)
        self.assertEqual(counts["complete_receipt_correct"], 0)
        prediction["calculation"]["total"] = "200"
        prediction["receipt"]["items"].append(deepcopy(prediction["receipt"]["items"][0]))
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["extra_items_on_complete_labels"], 1)
        self.assertEqual(counts["complete_receipt_correct"], 0)

    def test_fuzzy_detection_is_not_exact_description_accuracy(self):
        record, label, prediction = self.financial_case()
        prediction["receipt"]["items"][0]["description"] = "MILC"
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["matched_items"], 1)
        self.assertEqual(counts["description_correct"], 0)
        self.assertEqual(counts["complete_receipt_correct"], 0)

    def test_coupon_association_is_checked_on_the_purchase(self):
        record, label, prediction = self.financial_case()
        label["items"][0]["discount"] = field("-0.20", "-0.20")
        prediction["receipt"]["adjustments"] = [{"kind": "discount", "amount": "0.20"}]
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["grouping_correct"], 0)
        self.assertEqual(counts["item_discount_correct"], 0)

    def test_thousands_are_not_decimal_rupiah(self):
        self.assertEqual(rupiah("1,591,600"), "1591600")
        self.assertEqual(rupiah("43.636"), "43636")
        self.assertEqual(rupiah("Rp 0.000"), "0")

    def test_ambiguous_and_missing_amounts_stay_null(self):
        self.assertIsNone(rupiah("40,000."))
        self.assertIsNone(rupiah("not legible"))
        self.assertIsNone(rupiah(None))
        self.assertTrue(field(None, None)["review_required"])

    def test_currency_precision_and_exactness(self):
        self.assertEqual(minor("74.57", "GBP", CONFIG), 7457)
        self.assertEqual(minor("1000", "JPY", CONFIG), 1000)
        self.assertEqual(minor("1.234", "KWD", CONFIG), 1234)
        self.assertEqual(minor("36000", "IDR", CONFIG), 3600000)
        self.assertIsNone(minor("1.001", "GBP", CONFIG))
        self.assertIsNone(minor(None, "GBP", CONFIG))

    def test_discount_sign_survives_normalisation(self):
        self.assertEqual(rupiah("-7,800"), "-7800")
        self.assertIsNone(minor("7.00-A", "GBP", CONFIG))

    def test_repeated_purchases_are_not_collapsed(self):
        expected = [{"description": field("CASHEWS", "CASHEWS")}] * 2
        actual = [{"description": "CASHEWS", "lineTotal": "11.49"}]
        self.assertEqual(len(match_items(expected, actual, 0.65)), 1)

    def test_detection_does_not_match_using_price(self):
        expected = [{"description": field("MILK", "MILK")}]
        actual = [{"description": "UNRELATED PRODUCT", "lineTotal": "2.00"}]
        self.assertEqual(match_items(expected, actual, 0.65), {})

    def test_exact_description_wins_over_similar_other_product(self):
        expected = [{"description": field(text, text)} for text in ["TEH PANAS", "ES TEH MANIS"]]
        self.assertEqual(match_items(expected, [{"description": "1 ES TEH MANIS"}], 0.65), {1: 0})

    def test_pack_contents_do_not_invent_purchase_quantity(self):
        label = cord_label("test", {"gt_parse": {"menu": {"nm": "8-PACK CANS", "price": "25,000"}}, "meta": {}})
        self.assertIsNone(label["items"][0]["quantity"]["value"])
        self.assertIsNone(label["items"][0]["pack_size"]["value"])
        self.assertIsNone(label["items"][0]["discount"]["value"])

    def test_unchecked_model_labels_rejected(self):
        label = {"verification": {"model_generated": True, "status": "provisional_model"}}
        with self.assertRaises(ValueError):
            score_one({}, label, {}, CONFIG)

    def test_cash_is_not_grand_total(self):
        label = cord_label("test", {"gt_parse": {"menu": {"nm": "TEA", "price": "40,000"}, "total": {"total_price": "40,000", "cashprice": "100,000", "changeprice": "60,000"}}, "meta": {}})
        self.assertEqual(label["grand_total"]["value"], "40000")
        self.assertEqual(label["payments"][0]["amount"]["value"], "100000")

    def test_default_currency_and_invalid_zero_balance_do_not_establish_success(self):
        label = cord_label("test", {"gt_parse": {"menu": {"nm": "TEA", "price": "2,00"}, "total": {"total_price": "2,00"}}, "meta": {}})
        label["currency"] = field("GBP", "GBP")
        record = {"receipt_id": "test", "category": "non_costco/physical", "country": "GB", "split": "development"}
        prediction = {"elapsed_ms": 1, "receipt": {"currency": "GBP", "items": [], "printedTotal": "2.00", "warnings": ["Currency was not identified. Confirm the selected currency."]}, "calculation": {"discrepancy": "0", "issues": [{"path": "items", "message": "Invalid amounts"}]}}
        counts = score_one(record, label, prediction, CONFIG)["counts"]
        self.assertEqual(counts["currency_correct"], 0)
        self.assertEqual(counts["selected_currency_correct"], 1)
        self.assertEqual(counts["untrusted_zero_discrepancy"], 1)
        self.assertEqual(counts["requires_review"], 1)
        self.assertEqual(counts.get("item_discount_known", 0), 0)


if __name__ == "__main__":
    unittest.main()
