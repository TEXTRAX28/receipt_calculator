"""Synthetic audit checks, not receipt recognition evidence or provider calls."""
import copy
import json
import unittest

from review_azure_screening import project_bytes


def response():
    return {"status": "succeeded", "analyzeResult": {"apiVersion": "2024-11-30",
        "modelId": "prebuilt-receipt", "content": "Product 2 4.50 9.00",
        "documents": [{"fields": {"Items": {"valueArray": [{"valueObject": {
            "Description": {"type": "string", "valueString": "Product"},
            "Quantity": {"type": "number", "valueNumber": 2},
            "Price": {"type": "currency", "valueCurrency": {"amount": 4.5, "currencyCode": "AUD"}},
            "TotalPrice": {"type": "currency", "valueCurrency": {"amount": 9, "currencyCode": "AUD"}},
        }}]}, "Total": {"type": "currency", "valueCurrency": {"amount": 9, "currencyCode": "AUD"}}}}]}}


def view(value):
    return project_bytes(json.dumps(value).encode())


class AzureProjectionTests(unittest.TestCase):
    def test_source_unit_and_row_totals_stay_distinct(self):
        row = view(response())["line_items"][0]
        self.assertEqual((row["quantity"], row["price"], row["total"]), ("2", "4.5", "9"))

    def test_missing_values_are_not_derived_from_other_fields(self):
        data = response()
        item = data["analyzeResult"]["documents"][0]["fields"]["Items"]["valueArray"][0]["valueObject"]
        del item["Quantity"]
        del item["TotalPrice"]
        row = view(data)["line_items"][0]
        self.assertIsNone(row["quantity"])
        self.assertIsNone(row["total"])

    def test_wrong_currency_is_retained_without_reference_override(self):
        self.assertEqual(view(response())["returned_currency_not_used_for_scoring"], "AUD")

    def test_signed_coupon_stays_a_separate_unclassified_row(self):
        data = response()
        array = data["analyzeResult"]["documents"][0]["fields"]["Items"]["valueArray"]
        coupon = copy.deepcopy(array[0])
        coupon["valueObject"]["TotalPrice"]["valueCurrency"]["amount"] = -2
        array.append(coupon)
        result = view(data)
        self.assertEqual(len(result["line_items"]), 2)
        self.assertEqual(result["line_items"][1]["total"], "-2")
        self.assertIsNone(result["line_items"][0]["discount"])

    def test_zero_is_present_and_null_remains_missing_despite_confidence(self):
        data = response()
        field = data["analyzeResult"]["documents"][0]["fields"]["Total"]
        field["valueCurrency"]["amount"] = 0
        self.assertEqual(view(data)["document"]["total"], "0")
        field["valueCurrency"]["amount"] = None
        field["confidence"] = 1
        self.assertIsNone(view(data)["document"]["total"])

    def test_exact_numeric_tokens_do_not_pass_through_binary_float(self):
        raw = json.dumps(response()).replace('"amount": 9,', '"amount": 0.123456789012,').encode()
        self.assertEqual(project_bytes(raw)["document"]["total"], "0.123456789012")
        excessive = json.dumps(response()).replace('"amount": 9,', '"amount": 0.10000000000000001,').encode()
        self.assertIsNone(project_bytes(excessive)["document"]["total"])

    def test_failure_wrong_version_and_multiple_documents_are_rejected(self):
        for change in ("status", "version", "documents"):
            data = response()
            if change == "status": data["status"] = "running"
            elif change == "version": data["analyzeResult"]["apiVersion"] = "different"
            else: data["analyzeResult"]["documents"] *= 2
            with self.assertRaises(ValueError): view(data)

    def test_duplicate_json_keys_are_rejected(self):
        raw = json.dumps(response()).replace('"status": "succeeded"', '"status": "succeeded", "status": "running"').encode()
        with self.assertRaises(ValueError): project_bytes(raw)


if __name__ == "__main__":
    unittest.main()
