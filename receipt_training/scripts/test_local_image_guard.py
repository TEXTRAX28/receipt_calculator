"""Actual Pillow JPEG guard tests, entirely synthetic; no model inference."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / "server/local_image_guard.py"


class ImageGuardTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.addCleanup(self.temp.cleanup)

    def panel(self, size=(300, 700), format="JPEG"):
        path = self.root / "receipt.jpg"
        Image.new("RGB", size, "white").save(path, format=format)
        return {"path": str(path), "photo": 1, "part": 1,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}

    def check_request(self, request):
        result = subprocess.run([sys.executable, "-u", str(GUARD), str(self.root)],
                                input=json.dumps(request).encode(), capture_output=True,
                                timeout=10, check=True)
        self.assertEqual(result.stderr, b"")
        return json.loads(result.stdout)["valid"]

    def test_decodes_three_valid_sections(self):
        panel = self.panel()
        self.assertTrue(self.check_request({"panels": [{**panel, "photo": index + 1} for index in range(3)]}))

    def test_rejects_truncated_jpeg_pixels_even_when_the_header_exists(self):
        panel = self.panel()
        path = Path(panel["path"])
        path.write_bytes(path.read_bytes()[:-200])
        panel["sha256"] = hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertFalse(self.check_request({"panels": [panel]}))

    def test_rejects_oversized_dimensions_and_pixel_counts(self):
        for size in [(4001, 8), (2001, 2000), (7, 20)]:
            with self.subTest(size=size):
                self.assertFalse(self.check_request({"panels": [self.panel(size)]}))

    def test_rejects_a_png_disguised_as_jpeg(self):
        self.assertFalse(self.check_request({"panels": [self.panel(format="PNG")]}))

    def test_rejects_changed_bytes(self):
        panel = self.panel()
        panel["sha256"] = "0" * 64
        self.assertFalse(self.check_request({"panels": [panel]}))

    def test_rejects_files_outside_the_owned_root(self):
        panel = self.panel()
        with tempfile.TemporaryDirectory() as other:
            path = Path(other) / "receipt.jpg"
            path.write_bytes(Path(panel["path"]).read_bytes())
            panel["path"] = str(path)
            self.assertFalse(self.check_request({"panels": [panel]}))

    def test_rejects_extra_options_and_excess_sections(self):
        panel = self.panel()
        for request in [{"panels": [panel], "command": "anything"},
                        {"panels": [{**panel, "photo": index + 1} for index in range(4)]},
                        {"panels": [{**panel, "extra": True}]}]:
            self.assertFalse(self.check_request(request))

    def test_rejects_an_oversized_manifest(self):
        self.assertFalse(self.check_request({"padding": "x" * 17000}))


if __name__ == "__main__":
    unittest.main()
