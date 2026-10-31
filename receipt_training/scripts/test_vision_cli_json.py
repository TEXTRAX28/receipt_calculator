import json
import unittest
from vision_cli_json import decode_structured_reply


def receipt():
    return {"merchant": "Test Shop", "subtotal": 3.5, "printedTotal": 3.5, "printedTax": 0,
            "printedItemCount": 1, "pricesIncludeTax": None,
            "items": [{"quantity": 1, "unitPrice": 2.0, "lineTotal": 2.0, "discount": "", "sourcePhotos": [1]},
                      {"quantity": 1, "unitPrice": 1.5, "lineTotal": 1.5, "discount": "", "sourcePhotos": [1]}],
            "taxCodes": [{"code": "", "rate": ""}], "adjustments": []}


class TypedJsonTests(unittest.TestCase):
    def test_removes_only_one_complete_fence_and_preserves_money_values_and_an_incorrect_count(self):
        output = decode_structured_reply("```json\n" + json.dumps(receipt()) + "\n```")
        self.assertEqual(output["printedTotal"], "3.5")
        self.assertEqual(output["items"][0]["lineTotal"], "2.0")
        self.assertEqual(output["items"][0]["sourcePhotos"], [1])
        self.assertEqual(output["printedItemCount"], 1)  # Do not repair the model's invented count.
        self.assertEqual(output["items"][0]["discount"], "")
        self.assertEqual(output["taxCodes"], [{"code": "", "rate": ""}])
        self.assertIsNone(output["pricesIncludeTax"])

    def test_decimal_numbers_are_not_parsed_through_binary_floats_or_rounded(self):
        raw = json.dumps(receipt()).replace('"printedTotal": 3.5', '"printedTotal": 123456789012.123456')
        self.assertEqual(decode_structured_reply(raw)["printedTotal"], "123456789012.123456")
        value = receipt(); value["adjustments"] = [{"amount": -0.01}]
        self.assertEqual(decode_structured_reply(json.dumps(value))["adjustments"][0]["amount"], "-0.01")

    def test_does_not_invent_or_deduplicate_purchases(self):
        value = receipt(); value["items"][1] = value["items"][0].copy()
        output = decode_structured_reply(json.dumps(value))
        self.assertEqual(len(output["items"]), 2)
        self.assertEqual(output["items"][0], output["items"][1])

    def test_never_rescales_an_ambiguous_locale_string_or_removes_fractional_zeros(self):
        value = receipt(); value["printedTotal"] = "12.000"
        self.assertEqual(decode_structured_reply(json.dumps(value))["printedTotal"], "12.000")
        raw = json.dumps(receipt()).replace('"printedTotal": 3.5', '"printedTotal": 42.000')
        self.assertEqual(decode_structured_reply(raw)["printedTotal"], "42.000")

    def test_conflicting_duplicate_keys_extra_objects_and_narration_are_rejected(self):
        raw = json.dumps(receipt())
        for text in [raw + raw, "Another reading: " + raw, raw + "\nExplanation", raw[:-1] + ',"printedTotal":9}', "```json\n" + raw + "\n```\nOther text"]:
            with self.assertRaises(ValueError): decode_structured_reply(text)

    def test_rejects_nonfinite_numbers_exponent_bombs_and_unsupported_precision(self):
        raw = json.dumps(receipt())
        for number in ["NaN", "Infinity", "1e999999999", "1e9999999999999999999999999", "0.1234567", "1000000000000"]:
            with self.assertRaises(ValueError): decode_structured_reply(raw.replace('"printedTotal": 3.5', '"printedTotal": ' + number))

    def test_photo_and_array_bounds_do_not_silently_drop_evidence(self):
        for photos in [[0], [13], [1.5], [True], [], [1] * 13]:
            value = receipt(); value["items"][0]["sourcePhotos"] = photos
            with self.assertRaises(ValueError): decode_structured_reply(json.dumps(value))
        value = receipt(); value["items"] *= 151
        with self.assertRaises(ValueError): decode_structured_reply(json.dumps(value))

    def test_unknown_numeric_fields_and_nonobject_or_oversized_responses_are_rejected(self):
        value = receipt(); value["unexpected"] = 4
        for text in [json.dumps(value), "[]", "x" * 60001, "[" * 2000 + "0" + "]" * 2000]:
            with self.assertRaises(ValueError): decode_structured_reply(text)


if __name__ == "__main__":
    unittest.main()
