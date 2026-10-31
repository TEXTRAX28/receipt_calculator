import unittest

from vision_cli_text import parse_cli_transcript


class TranscriptTests(unittest.TestCase):
    def test_multiline_json_template_is_never_read_as_the_model_answer(self):
        prompt = 'Extract:\n{"items": []}\nPreserve literal rows.'
        answer = '{"items": [{"description": "Milk", "lineTotal": "2.00"}]}'
        self.assertEqual(parse_cli_transcript('User:\n' + prompt + '\n\nAssistant:\n' + answer + '\n', prompt), answer)

    def test_role_words_inside_a_multiline_prompt_do_not_shorten_its_boundary(self):
        prompt = 'Extract:\n\nAssistant:\n{"printedTotal": "999"}\nThis is a template.'
        answer = '{"printedTotal": "2.00"}'
        self.assertEqual(parse_cli_transcript('User:\n' + prompt + '\n\nAssistant:\n' + answer, prompt), answer)
        with self.assertRaises(ValueError):
            parse_cli_transcript('User:\nDifferent template\n\nAssistant:\n' + answer, prompt)

    def test_keeps_all_ocr_numbers_signs_unicode_and_interior_role_words(self):
        text = "\u725b\u5976 2 x 3.00\n  VAT 0.73\nROUNDING -0.01\nAssistant: printed label\nTOTAL 4.37"
        self.assertEqual(parse_cli_transcript("User:\nOCR:\n\nAssistant:\n" + text + "\n\n", "OCR:"), text)

    def test_accepts_windows_line_endings_without_adding_prices(self):
        self.assertEqual(parse_cli_transcript("User:\r\nOCR:\r\n\r\nAssistant:\r\nTOTAL 4.37\r\n\r\n", "OCR:"), "TOTAL 4.37")

    def test_literal_schema_backslashes_must_survive_native_prompt_transport(self):
        prompt = r'Contract: {"pattern":"^\\d+(?:\\.\\d+)?$"}'
        answer = '{"printedTotal":"3.50"}'
        raw = 'User:\n' + prompt + '\n\nAssistant:\n' + answer
        self.assertEqual(parse_cli_transcript(raw, prompt), answer)
        with self.assertRaises(ValueError):
            parse_cli_transcript(raw.replace('\\\\', '\\'), prompt)

    def test_console_banners_are_not_accepted_as_model_text(self):
        with self.assertRaises(ValueError):
            parse_cli_transcript("Loading model\n> OCR:\nTOTAL 4.37", "OCR:")

    def test_wrong_prompt_or_missing_assistant_is_rejected(self):
        for raw in ["User:\nOCR:\n\nTOTAL 4.37", "User:\nOTHER:\n\nAssistant:\nTOTAL 4.37"]:
            with self.assertRaises(ValueError):
                parse_cli_transcript(raw, "OCR:")

    def test_empty_reasoning_and_oversized_transcripts_are_rejected(self):
        for value in ["", "[Start thinking]\nsecret reasoning", "x" * 70001]:
            with self.assertRaises(ValueError):
                parse_cli_transcript("User:\nOCR:\n\nAssistant:\n" + value, "OCR:")


if __name__ == "__main__":
    unittest.main()
