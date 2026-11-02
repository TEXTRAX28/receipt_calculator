from copy import deepcopy
import unittest

from paddle_spotting_layout import join_spotted_columns


def region(text, box):
    return {"text": text, "box": box, "confidence": None}


class SpottingLayoutTests(unittest.TestCase):
    def test_joins_literal_columns_by_position_without_computing_a_missing_price(self):
        data = [region("4.00", [.7, .10, .9, .14]), region("Meal", [.1, .10, .4, .14]),
                region("2 x 2.00", [.4, .10, .6, .14]), region("Bread", [.1, .20, .4, .24])]
        before = deepcopy(data)
        output = join_spotted_columns(data)
        self.assertEqual([row["text"] for row in output], ["Meal 2 x 2.00 4.00", "Bread"])
        self.assertEqual(output[0]["source_region_indices"], [1, 2, 0])
        self.assertEqual(data, before)
        self.assertTrue(all(row["confidence"] is None for row in output))

    def test_preserves_genuine_repeats_and_overlapping_detections(self):
        output = join_spotted_columns([region("Milk", [.1, .1, .4, .14]), region("Milk", [.1, .2, .4, .24])])
        self.assertEqual([row["text"] for row in output], ["Milk", "Milk"])
        overlap = join_spotted_columns([region("Milk", [.1, .1, .4, .14])] * 2)
        self.assertEqual(overlap[0]["text"], "Milk Milk")

    def test_nearby_small_lines_are_not_pulled_into_a_tall_neighbour(self):
        output = join_spotted_columns([region("Heading", [.1, .1, .4, .3]), region("Tax 1.00", [.6, .27, .9, .29])])
        self.assertEqual(len(output), 2)

    def test_copies_signed_locale_tokens_without_normalizing_them(self):
        output = join_spotted_columns([region("Rounding", [.1, .1, .4, .14]), region("-1,000", [.6, .1, .9, .14])])
        self.assertEqual(output[0]["text"], "Rounding -1,000")


if __name__ == "__main__":
    unittest.main()
