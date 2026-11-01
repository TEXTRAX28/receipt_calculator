"""Guard the scoring boundary between printed prices and inferred missing fields."""
from copy import deepcopy
import json
import unittest

from record_tesco_full_review import BASE, DATA, revised_tesco
from score import score_one


class TescoTruthTests(unittest.TestCase):
    def setUp(self):
        self.base = next(json.loads(line) for line in BASE.read_text(encoding="utf-8").splitlines()
                         if json.loads(line)["receipt_id"] == "tesco-gb-1994")

    def test_unknown_first_price_is_independent_of_printed_total(self):
        altered = deepcopy(self.base)
        altered["grand_total"]["value"] = "999.99"
        self.assertEqual(revised_tesco(altered)["items"], revised_tesco(self.base)["items"])
        self.assertIsNone(revised_tesco(self.base)["items"][0]["line_total"]["value"])

    def test_repeated_products_stay_distinct_and_source_is_not_mutated(self):
        before = deepcopy(self.base)
        revised = revised_tesco(self.base)
        self.assertEqual(self.base, before)
        self.assertEqual(len(revised["items"]), 10)
        self.assertEqual(len({item["id"] for item in revised["items"]}), 10)
        self.assertEqual(revised["items"][0]["description"], revised["items"][1]["description"])

    def test_pack_wording_does_not_create_quantity_unit_or_discount_truth(self):
        revised = revised_tesco(self.base)
        for item in revised["items"]:
            for name in ("quantity", "unit_price", "pack_size", "discount", "tax_code"):
                self.assertIsNone(item[name]["value"])
                self.assertTrue(item[name]["review_required"])

    def test_partial_known_prices_never_enable_complete_receipt_metric(self):
        revised = revised_tesco(self.base)
        config = json.loads((DATA / "evaluation/config.json").read_text(encoding="utf-8"))
        prediction = {"elapsed_ms": None, "receipt": {"currency": "GBP", "items": [
            {"description": item["description"]["value"], "lineTotal": item["line_total"]["value"] or "123.45"}
            for item in revised["items"]]}}
        record = {"receipt_id": "tesco-gb-1994", "category": "non_costco/physical", "country": "GB", "split": "development"}
        counts = score_one(record, revised, prediction, config)["counts"]
        self.assertEqual((counts["item_price_correct"], counts["item_price_known"]), (9, 9))
        self.assertEqual(counts.get("quantity_known", 0), 0)
        self.assertEqual(counts["complete_receipt_known"], 0)
        self.assertFalse(revised["verification"]["independent_human_verified"])


if __name__ == "__main__":
    unittest.main()
