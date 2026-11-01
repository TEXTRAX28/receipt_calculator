"""Literal offline Azure projection; keeps negative rows and wrong currencies."""
from decimal import Decimal

from review_veryfi_screening import exact_json, sha


def project(record):
    if record.get("status") != "succeeded":
        raise ValueError("Successful complete analysis required")
    analysis = record.get("analyzeResult", {})
    if analysis.get("apiVersion") != "2024-11-30" or analysis.get("modelId") != "prebuilt-receipt":
        raise ValueError("Unexpected model/API version")
    documents = analysis.get("documents")
    if not isinstance(documents, list) or len(documents) != 1:
        raise ValueError("Exactly one analyzed document required")
    fields = documents[0].get("fields", {})
    issues, provenance = [], []

    def field(obj, key):
        value = obj.get(key, {})
        if not isinstance(value, dict):
            raise ValueError("Invalid field object")
        return value

    def numeric(obj, key):
        value = field(obj, key)
        amount = value.get("valueCurrency", {}).get("amount") if value.get("type") == "currency" else value.get("valueNumber")
        if amount is None:
            return None
        if not isinstance(amount, Decimal) or not amount.is_finite() or amount.adjusted() > 18 or abs(amount.as_tuple().exponent) > 12:
            issues.append(key + ": invalid normalized number")
            return None
        return format(amount, "f")

    def text(obj, key):
        value = field(obj, key).get("valueString")
        if value is not None and (not isinstance(value, str) or len(value) > 4000):
            raise ValueError("Invalid text field")
        return value

    rows = field(fields, "Items").get("valueArray", [])
    if not isinstance(rows, list) or len(rows) > 2000:
        raise ValueError("Bounded item array required")
    projected = []
    for index, item in enumerate(rows):
        obj = item.get("valueObject")
        if not isinstance(obj, dict):
            raise ValueError("Item object required")
        projected.append({"row_index": index, "description": text(obj, "Description"),
            "sku": text(obj, "ProductCode"), "quantity": numeric(obj, "Quantity"),
            "price": numeric(obj, "Price"), "total": numeric(obj, "TotalPrice"),
            "discount": None, "tax_code": None})
        # Boxes and content are observed evidence, never manufactured geometry.
        provenance.append({"row_index": index, "fields": {key: {
            "content": value.get("content"), "boundingRegions": value.get("boundingRegions", []),
            "returned_currency": value.get("valueCurrency", {}).get("currencyCode"),
        } for key, value in obj.items() if isinstance(value, dict)}})
    content = analysis.get("content")
    if not isinstance(content, str) or not content or len(content) > 60000:
        raise ValueError("Bounded literal OCR content required")
    currency = field(fields, "Total").get("valueCurrency", {}).get("currencyCode")
    if currency is not None and not isinstance(currency, str):
        raise ValueError("Invalid currency field")
    return {"line_items": projected,
        "document": {"subtotal": numeric(fields, "Subtotal"), "total": numeric(fields, "Total"),
                     "tax": numeric(fields, "TotalTax"), "tip": numeric(fields, "Tip"), "discount": None},
        "returned_currency_not_used_for_scoring": currency,
        "literal_ocr_text_sha256": sha(content.encode("utf-8")), "native_field_issues": issues,
        "provenance": provenance}


def project_bytes(raw):
    return project(exact_json(raw))
