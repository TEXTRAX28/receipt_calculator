"""Decode one model JSON reply and normalize numeric types, never financial values.

Optional single code fence and typed numeric fields are format differences.
No missing values, deductions, currencies, counts or arithmetic are inferred.
"""
from decimal import Decimal, InvalidOperation
import json
import re


def decode_structured_reply(text):
    if not isinstance(text, str) or len(text) > 60000:
        raise ValueError("Oversized model reply")
    text = text.strip()
    if text.startswith("```"):
        match = re.fullmatch(r"```(?:json)?\s*\n([\s\S]*?)\n```", text)
        if not match:
            raise ValueError("Expected one complete JSON envelope")
        text = match[1]

    def unique(pairs):
        value = {}
        for key, field in pairs:
            if key in value:
                raise ValueError("Duplicate JSON field")
            value[key] = field
        return value

    def invalid_constant(_):
        raise ValueError("Non-finite model number")

    try:
        value = json.loads(text, parse_int=Decimal, parse_float=Decimal,
                           parse_constant=invalid_constant, object_pairs_hook=unique)
    except (RecursionError, OverflowError, InvalidOperation) as error:
        raise ValueError("Model JSON nesting or number exceeds bounds") from error
    if not isinstance(value, dict):
        raise ValueError("A structured receipt must be an object")

    def number_fields(obj, fields):
        if not isinstance(obj, dict):
            raise ValueError("Invalid structured receipt entry")
        for field in fields:
            number = obj.get(field)
            if isinstance(number, Decimal):
                if not number.is_finite() or number.adjusted() > 11 or not -6 <= number.as_tuple().exponent <= 12:
                    raise ValueError("Model number exceeds decimal/size bounds")
                obj[field] = format(number, "f")

    number_fields(value, ["subtotal", "printedTotal", "printedTax"])
    for array, fields, limit in [("items", ["quantity", "unitPrice", "lineTotal", "discount"], 300), ("taxCodes", ["rate"], 20), ("adjustments", ["amount"], 30)]:
        entries = value.get(array)
        if not isinstance(entries, list) or len(entries) > limit:
            raise ValueError("Invalid bounded receipt array")
        for entry in entries:
            number_fields(entry, fields)

    def ordinal(number, minimum, maximum):
        if not isinstance(number, Decimal) or number != number.to_integral_value() or not minimum <= number <= maximum:
            raise ValueError("Invalid count or photo reference")
        return int(number)

    if isinstance(value.get("printedItemCount"), Decimal):
        value["printedItemCount"] = ordinal(value["printedItemCount"], 0, 300)
    for item in value["items"]:
        photos = item.get("sourcePhotos")
        if not isinstance(photos, list) or not 1 <= len(photos) <= 12:
            raise ValueError("Invalid photo references")
        item["sourcePhotos"] = [ordinal(number, 1, 12) for number in photos]
    # A remaining numeric field is outside this adapter's explicit contract.
    # Reject it instead of coercing unknown metadata or losing decimal precision.
    pending = [value]
    while pending:
        obj = pending.pop()
        if isinstance(obj, Decimal):
            raise ValueError("Unexpected numeric field")
        if isinstance(obj, dict):
            pending.extend(obj.values())
        if isinstance(obj, list):
            pending.extend(obj)
    return value
