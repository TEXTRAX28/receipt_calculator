import unittest

from paddle_spotting import parse_spotting


def row(text="Milk 1 x 2.00 2.00", coordinates=(20, 30, 400, 30, 400, 80, 20, 80)):
    return text + "".join(f"<|LOC_{value}|>" for value in coordinates)


class SpottingTests(unittest.TestCase):
    def test_preserves_literals_signs_unicode_duplicates_and_generation_order(self):
        texts = ["-2,000 A", "牛奶 3.50", "Milk 1 x 2.00 2.00", "Milk 1 x 2.00 2.00"]
        rows = parse_spotting("\r\n".join(map(row, texts)) + "</s>\r\n")
        self.assertEqual([r["text"] for r in rows], texts)
        self.assertTrue(all(r["confidence"] is None for r in rows))
        self.assertEqual(rows[0]["box"], [0.02, 0.03, 0.4, 0.08])
        self.assertEqual(rows[0]["polygon_1000"], [[20, 30], [400, 30], [400, 80], [20, 80]])

    def test_fails_closed_on_hidden_or_partial_location_tokens(self):
        invalid = ["Milk 2.00", row() + "\nTax 0.00", "unlocated heading\n" + row(),
                   row().replace("<|LOC_80|>", "", 1), row() + row(),
                   row() + "</s></s>", row("<|unexpected|> Milk"), row("A\x00B"),
                   "", "x" * 60001, row() + "\nA"]
        for value in invalid:
            with self.subTest(value=value[:60]), self.assertRaises(ValueError):
                parse_spotting(value)

    def test_rejects_invalid_polygons_without_clamping_or_reconstructing_boxes(self):
        polygons = [(0, 0, 1001, 0, 1001, 20, 0, 20), (0, 0, 0, 0, 0, 0, 0, 0),
                    (0, 0, 50, 50, 0, 50, 50, 0), (0, 0, 50, 0, 20, 10, 0, 50)]
        for polygon in polygons:
            with self.subTest(polygon=polygon), self.assertRaises(ValueError):
                parse_spotting(row(coordinates=polygon))

    def test_keeps_a_rotated_valid_quadrilateral_as_the_model_returned_it(self):
        polygon = (100, 0, 200, 100, 100, 200, 0, 100)
        self.assertEqual(parse_spotting(row(coordinates=polygon))[0]["polygon_1000"], [[100, 0], [200, 100], [100, 200], [0, 100]])

    def test_bounds_row_count(self):
        with self.assertRaises(ValueError):
            parse_spotting((row("A") + "\n") * 1001)


if __name__ == "__main__":
    unittest.main()
