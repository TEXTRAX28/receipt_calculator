"""Literal monetary, duplicate-row and malformed document-format controls."""
import unittest

from normalize_document_text import normalize_document_text


class DocumentTextControls(unittest.TestCase):
    def test_synthetic_table_preserves_quantities_prices_discount_and_total(self):
        raw = "![table](0,0,1000,1000) <table><tr><td>APPLE</td><td>2 x 1.25</td><td>2.50</td></tr><tr><td>DISCOUNT</td><td></td><td>-0.30</td></tr><tr><td>TOTAL</td><td></td><td>4.00</td></tr></table>"
        result = normalize_document_text(raw)
        self.assertEqual(result["text"], "APPLE\t2 x 1.25\t2.50\nDISCOUNT\t\t-0.30\nTOTAL\t\t4.00")
        self.assertEqual(result["regions"][0]["kind"], "model-proposed-region")
        self.assertNotIn("confidence", result["regions"][0])

    def test_duplicate_purchases_remain_two_rows(self):
        row = "<tr><td>MILK</td><td>1</td><td>2.50</td></tr>"
        result = normalize_document_text("<table>" + row * 2 + "</table>")
        self.assertEqual(result["text"].splitlines(), ["MILK\t1\t2.50", "MILK\t1\t2.50"])

    def test_literal_grouping_tax_letters_and_negative_suffix_are_unchanged(self):
        text = "SPAM 6X340G\t18.000\t7.00-A\nFEE\t1,234.50\t0.00 Z"
        self.assertEqual(normalize_document_text(text)["text"], text)

    def test_html_entities_decode_without_rewriting_numeric_punctuation(self):
        raw = "<table><tr><td>A &amp; B</td><td>&minus;1&nbsp;234,50</td></tr></table>"
        self.assertEqual(normalize_document_text(raw)["text"], "A & B\t−1\u00a0234,50")

    def test_headings_and_regions_do_not_become_product_or_price_lines(self):
        raw = "![title](1,2,400,50) SHOP\n![text](1,60,400,100) GBP\nAPPLE 2.50"
        self.assertEqual(normalize_document_text(raw)["text"], "SHOP\nGBP\nAPPLE 2.50")

    def test_markdown_tables_keep_literal_values_and_order(self):
        raw = "| Item | Amount |\n| :--- | ---: |\n| APPLE | 2.50 |\n| TOTAL | 4.00 |"
        self.assertEqual(normalize_document_text(raw)["text"], "Item\tAmount\nAPPLE\t2.50\nTOTAL\t4.00")

    def test_ordinary_pipe_text_is_not_reclassified_as_a_table(self):
        raw = "A | B 2.50\nTOTAL 2.50"
        self.assertEqual(normalize_document_text(raw)["text"], raw)

    def test_escaped_pipe_in_a_product_name_stays_in_its_cell(self):
        raw = "| Item | Amount |\n| --- | --- |\n| A \\| B | 2.50 |"
        self.assertEqual(normalize_document_text(raw)["text"], "Item\tAmount\nA | B\t2.50")

    def test_a_complete_format_fence_is_removed_without_dropping_content(self):
        self.assertEqual(normalize_document_text("```text\nTOTAL -2.50\n```")["text"], "TOTAL -2.50")

    def test_nested_inline_formatting_keeps_literal_money(self):
        self.assertEqual(normalize_document_text("<p>TOTAL <b>-2.50</b></p>")["text"], "TOTAL -2.50")

    def test_invalid_region_is_rejected_instead_of_clamped(self):
        for coordinates in ["-1,0,20,30", "0,0,1001,30", "20,0,1,30", "0,0,0,30", "0.5,0,20,30"]:
            with self.subTest(coordinates=coordinates), self.assertRaises(ValueError):
                normalize_document_text(f"![table]({coordinates}) TOTAL 2.50")

    def test_truncated_table_is_not_silently_accepted(self):
        with self.assertRaises(ValueError):
            normalize_document_text("<table><tr><td>APPLE</td><td>2.50</td></tr>")

    def test_nested_tables_are_rejected(self):
        with self.assertRaises(ValueError):
            normalize_document_text("<table><tr><td><table></table></td></tr></table>")

    def test_merged_cells_are_not_filled_by_guessing(self):
        with self.assertRaises(ValueError):
            normalize_document_text('<table><tr><td rowspan="2">APPLE</td><td>2.50</td></tr></table>')

    def test_markup_cannot_hide_price_text_in_a_comment(self):
        with self.assertRaises(ValueError):
            normalize_document_text("APPLE 2.50<!-- TOTAL 999.99 -->")

    def test_active_markup_is_rejected_and_never_executed(self):
        with self.assertRaises(ValueError):
            normalize_document_text('<script>throw new Error("should not execute")</script>TOTAL 2.50')

    def test_malformed_markdown_columns_are_rejected(self):
        with self.assertRaises(ValueError):
            normalize_document_text("| Item | Amount |\n| --- | --- |\n| APPLE | 1 | 2.50 |")

    def test_empty_and_oversized_outputs_are_not_receipts(self):
        for text in ["", "  ", "A" * 60001]:
            with self.subTest(length=len(text)), self.assertRaises(ValueError):
                normalize_document_text(text)

    def test_unit_pack_text_does_not_create_inferred_quantity_or_currency(self):
        result = normalize_document_text("SPAM 6X340G 14.99 Z")
        self.assertEqual(result["text"], "SPAM 6X340G 14.99 Z")
        self.assertEqual(result["regions"], [])
        self.assertNotIn("currency", result)


if __name__ == "__main__":
    unittest.main(verbosity=2)
