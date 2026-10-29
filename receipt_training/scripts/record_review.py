"""Recorded visual observations, not OCR/model-generated ground truth.

Every downloaded image was opened in four-image contact sheets. The original
and selected additions were also inspected at full resolution. These notes do
not claim an independent second annotator or complete field verification.
"""
import json

from collect import ROOT, empty_label, field, jsonl, save_json

TRAIN_NOTES = [
    "long receipt on woven background; low contrast; perspective; printed rounding -45",
    "short restaurant receipt; cool colour cast; subtotal, service and tax rows",
    "clear short receipt; multi-line product modifiers; quantities 2 to 4",
    "creases and shadow across middle; explicit discount, service and tax",
    "very faded print; large blank/logo area; dot thousands separators",
    "small printed body on long paper; subtotal, service, tax; coupon is a payment component",
    "faded receipt; dots and commas mixed as grouping; tax and cash/change",
    "short receipt on dark fabric; separate item count, tax and payment rows",
    "faded print and lower shadow; prices precede descriptions; explicit zero-priced item",
    "crumpled white paper; shadow at bottom; quantity two; @ unit price",
    "hand holds receipt on dark reflective background; submenu modifiers; curved paper",
    "very low contrast; creased; subtotal and restaurant tax; wide letter spacing",
    "paper held by hand; truncated description; explicit small rounding row",
    "crumpled/stapled paper; clear item body; bottom close to image edge",
    "curved paper; multiline bakery price/quantity layout; zero-priced bag",
    "short receipt on wood; one repeated-quantity purchase; service and tax",
    "ticket-like paper receipt; sparse body; product number; payment and subtotal",
    "clear short item list; bottom shadow; due, cash and change separate",
    "strongly faded printing; integer prices without punctuation; amount due",
    "long restaurant receipt; low contrast; quantity/unit/line columns; nested modifiers",
    "discount-heavy receipt; three negative item deduction amounts; free accessory rows",
    "hand-held wrinkled receipt; multiline unit prices; free bag; cash/change",
    "folded drink receipt; quantity and price above description; ambiguous printed item-count code",
    "clear drink receipt; @ unit price; sweetness percentage is a modifier, not discount",
]
VALID_NOTES = [
    "short receipt; three items; left shadow; cash/change separate",
    "one-item receipt on wood; fold; quantity between description and amount",
    "hand-held creased drink receipt; explicit tax-included legend; modifier percentage",
    "hand-held drink receipt; shadow and glare; zero tax and zero change",
    "hand-held bent paper; one item with size modifier; payment and change share line",
    "extremely faded one-item receipt; net/tax/total lines need review",
    "folded bakery receipt; quantities 1; total and card amount repeated",
    "faded receipt; quantity four; explicit negative loyalty discount; tax and payment",
]
TEST_NOTES = [
    "paper receipt; printed discount/tax/payment sections; footer clipped; identifier remains, local only",
    "small paper receipt on dark background; integer prices; low contrast",
    "paper photographed with large hand/phone shadow; lower edge cropped",
    "bent paper photographed on dark surface; short item body; clear total",
    "heavily crumpled and faded paper over handwriting; difficult contrast",
    "small paper receipt held by hand; clear short printed body",
    "paper with horizontal fold and slight fading; quantity column",
    "faded blue print; broad shadow; short purchase list",
    "clear paper receipt; zero-priced rows and rounding row; card payment separate",
    "paper receipt with green/purple colour cast; item body and change fields",
    "paper on reflective counter; long blank margin; unit-price row",
    "paper on glossy patterned background; large shadow; one-item body",
]
EXTRA_NOTES = {
    "costco-tw-20121104": "photograph of long narrow paper fiscal receipt; totals-only body; member identifier visible; local only",
    "costco-tw-20170303": "photograph/scan of perforated landscape paper invoice; one sale and negative rebate; private member/payment fields partly masked",
    "costco-tw-20151020": "photograph of printed Taiwan e-invoice certificate on wood; no itemised purchases; QR codes and total",
    "costco-tw-20180210": "sideways photograph of printed Taiwan e-invoice certificate on wood; no itemised purchases; QR codes and total",
    "costco-tw-photo-20130612": "photograph of photo-department order/collection acknowledgement; no purchase prices or payment total; excluded from financial pilot",
    "tesco-gb-1994": "scan of faded, creased paper receipt; reduced-price rows; historical 1994 UK layout; 500px Commons rendition",
    "user-costco-bristol-001": "paper photograph on carpet; horizontal fold; pen stroke; large vertical gap; membership obscured; footer cropped; masked card suffix remains",
}


def item(index, description, number, price, code, discount=None, raw_quantity="1x"):
    return {
        "id": f"item-{index}", "description": field(description, description),
        "item_number": field(number, number), "quantity": field(raw_quantity, "1" if raw_quantity else None),
        "unit": field(None, None), "pack_size": field(None, None),
        "unit_price": field(price, price), "line_total": field(price, price),
        "discount": field(discount, discount), "tax_code": field(code, code),
        "line_total_basis": "before_separate_discount; tax inclusion unconfirmed",
        "raw": {"description": description, "item_number": number, "quantity": raw_quantity,
                "unit_price": price, "right_column": price + (" " + code if code else "")},
    }


def original_label():
    label = empty_label("user-costco-bristol-001")
    label["verification"] = {"status": "manual_visual_partial", "model_generated": True,
        "origin": "assistant_visual_transcription", "checked_against_source": True, "independent_human_verified": False,
        "visual_review": "opened_original_resolution", "notes": [
            "Assistant visual transcription checked against the original photo. Item body and total checked; missing footer prevents complete receipt/tax verification.",
            "Single reviewer (assistant); no independent human verification claimed.",
        ]}
    label["merchant"] = field("Costco Wholesale UK Limited / Bristol Warehouse", "Costco")
    label["country"] = field("UK / Bristol Warehouse", "GB")
    label["currency"] = field("inferred from UK warehouse, no visible ISO currency code", "GBP")
    label["currency"]["evidence"] = "merchant_country_inference"
    purchases = [
        ("M.CHOC B.PARTS 675", "664662", "9.99", "A", "7.00"),
        ("RIYAS PANEER 1KG", "447578", "6.99", "Z", None),
        ("MYTAGALONGS B/PACK", "2052553", "14.99", "A", "5.00"),
        ("TROLLI ALL IN ONE", "460598", "6.89", "A", None),
        ("PANIPURI 3X200G", "527362", "5.99", "Z", None),
        ("BENYLIN 300ML", "617693", "5.99", "A", None),
        ("SHEN DAN DUCK EGGS", "8523735", "3.99", "Z", "1.00"),
        ("KS SALTED CASHEWS", "1671933", "11.49", "A", None),
        ("KS SALTED CASHEWS", "1671933", "11.49", "A", None),
    ]
    label["items"] = [item(i + 1, *purchase) for i, purchase in enumerate(purchases)]
    deductions = [
        ("item-1", "GOOEY BODY PARTS", "687328", "7.00", "-A", "7.00-A"),
        ("item-3", "IRC MYTAGALONGS BA", "689100", "5.00", "-A", "5.00-A"),
        ("item-7", "IRC SHEN DAN BOILE", "689761", "1.00", "-Z", "1.00-Z"),
    ]
    for associated, description, number, amount, raw_code, right in deductions:
        label["discounts"].append({"item_id": associated, "description": description,
            "item_number": number, "quantity_raw": "1x", "unit_price_raw": amount,
            "amount": field(right, "-" + amount), "raw_code": raw_code,
            "association": "preceding purchase, supported by description and adjacent layout",
            "review_required": True, "interpretation_status": "layout supports deduction; code/rate legend absent"})
        label["raw_codes"].append({"text": raw_code, "nearby_amount_raw": right,
            "position": f"right amount column after {description}; minus between amount and letter",
            "meaning": None, "review_required": True})
    for purchase in label["items"]:
        label["raw_codes"].append({"text": purchase["tax_code"]["raw"],
            "nearby_amount_raw": purchase["raw"]["right_column"], "position": f"right of purchase {purchase['id']}",
            "meaning": None, "review_required": True})
    label["grand_total"] = field("**** TOTAL(INCL VAT) 74.57", "74.57")
    label["coverage"] = {"items_complete_for_visible_body": True, "item_metrics_eligible": True,
        "full_receipt_visible": False, "tax_legend_visible": False}
    label["review_flags"] = [
        "Date, subtotal and VAT legend are outside the cropped image; retain null.",
        "A/Z meanings and prices_include_tax are not proved by a printed legend or authoritative Costco key.",
        "Observed purchases 77.81 minus apparent deductions 13.00 = 64.81; this is computed, not a printed subtotal.",
        "Conditional A=20%, Z=0%, VAT-exclusive grouping gives 74.58, one penny above visible 74.57. Do not change labels or add balancing rounding.",
        "PANIPURI 3X200G is pack contents. Purchased quantity is the explicit 1x; pack_size remains null.",
        "Both cashew rows are genuine separate printed rows; preserve both.",
    ]
    return label


def main():
    reviews = {}
    for split, notes in [("train", TRAIN_NOTES), ("validation", VALID_NOTES), ("test", TEST_NOTES)]:
        for index, note in enumerate(notes):
            reviews[f"cord-v2-{split}-{index:03}"] = {"status": "opened_contact_sheet_origin_quality_checked",
                "quality_notes": [note, "publisher-blurred header/footer; no complete new privacy clearance"],
                "notes": ["Origin/quality inspected visually; upstream semantic annotations retained. Not a complete field-by-field reannotation."]}
    for receipt_id, note in EXTRA_NOTES.items():
        reviews[receipt_id] = {"status": "opened_contact_sheet_origin_quality_checked", "quality_notes": [note]}
    reviews["user-costco-bristol-001"]["status"] = "opened_original_resolution"
    save_json(ROOT / "annotations/visual-review.json", reviews)
    path = ROOT / "annotations/manual-labels.jsonl"
    labels = {record["receipt_id"]: record for record in map(json.loads, path.read_text(encoding="utf-8").splitlines())}
    labels["user-costco-bristol-001"] = original_label()
    # Only fields legible in the actual images are transcribed. No purchase rows
    # are invented for certificates that show totals without an item list.
    for receipt_id, date_raw, date, total_raw, total in [
        ("costco-tw-20121104", "12/11/04 13:48", "2012-11-04", "總計 1891 元", "1891"),
        ("costco-tw-20170303", "106 年 3 月 3 日", "2017-03-03", "總計 1,158", "1158"),
        ("costco-tw-20151020", "2015-10-20 15:01:14", "2015-10-20", "總計:1186", "1186"),
        ("costco-tw-20180210", "2018-02-10 14:16:21", "2018-02-10", "總計:877", "877"),
        ("tesco-gb-1994", "19/04/94 19:04", "1994-04-19", "TOTAL 6.71", "6.71"),
    ]:
        label = labels[receipt_id]
        label["verification"]["status"] = "manual_visual_partial"
        label["verification"].update({"model_generated": True, "origin": "assistant_visual_transcription", "checked_against_source": True, "independent_human_verified": False})
        label["verification"]["notes"] = ["Merchant, date and total transcribed visually. Not independently double-checked; item completeness specified separately."]
        label["date"] = field(date_raw, date)
        label["grand_total"] = field(total_raw, total)
        label["currency"]["review_required"] = False
        label["currency"]["evidence"] = "merchant_country_inference"
        label["coverage"] = {"item_metrics_eligible": False, "items_complete_for_visible_body": False}
        label["review_flags"] = ["No complete checked item transcription yet. Exclude item metrics, not an empty basket."]
    for receipt_id in ["costco-tw-20121104", "costco-tw-20151020", "costco-tw-20180210"]:
        labels[receipt_id]["coverage"]["reason"] = "Fiscal certificate shows aggregate amounts, not purchased item descriptions. No item ground truth available."
    labels["costco-tw-photo-20130612"]["review_flags"] = ["Photo-order acknowledgement has no financial amounts; excluded from financial receipt counts and baseline."]
    def mark_missing(value):
        if isinstance(value, dict):
            if "raw" in value and "value" in value and value["value"] is None:
                value["review_required"] = True
            for child in value.values():
                mark_missing(child)
        elif isinstance(value, list):
            for child in value:
                mark_missing(child)
    mark_missing(list(labels.values()))
    jsonl(path, list(labels.values()))


if __name__ == "__main__":
    main()
