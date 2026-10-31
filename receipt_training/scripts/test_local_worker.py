from pathlib import Path
import hashlib
import sys
import tempfile
import unittest

from PIL import Image

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PROJECT / "server"))
from local_ocr_worker import validate_panel


class LocalWorkerInputTests(unittest.TestCase):
    def setUp(self):
        base = PROJECT / "qa-artifacts" / "worker-validation"
        base.mkdir(parents=True, exist_ok=True)
        self.directory = tempfile.TemporaryDirectory(dir=base)
        self.root = Path(self.directory.name).resolve()
        self.root.relative_to(base.resolve())
        self.path = self.root / "receipt.jpg"
        Image.new("RGB", (32, 64), "white").save(self.path, format="JPEG")
        self.panel = {"path": str(self.path), "photo": 1, "part": 1, "sha256": hashlib.sha256(self.path.read_bytes()).hexdigest()}

    def tearDown(self):
        self.directory.cleanup()

    def test_accepts_verified_parent_owned_jpeg_and_rejects_changed_bytes(self):
        self.assertEqual(validate_panel(self.panel, self.root), self.path)
        self.path.write_bytes(b"not an image")
        with self.assertRaises(ValueError):
            validate_panel(self.panel, self.root)

    def test_rejects_outside_paths_and_spoofed_jpegs(self):
        outside = {**self.panel, "path": str(PROJECT / "package.json")}
        with self.assertRaises(ValueError):
            validate_panel(outside, self.root)
        self.path.write_bytes(b"\xff\xd8\xff\xe0invalid JPEG content")
        spoofed = {**self.panel, "sha256": hashlib.sha256(self.path.read_bytes()).hexdigest()}
        with self.assertRaises(Exception):
            validate_panel(spoofed, self.root)

    def test_bounds_decoded_pixels_and_protocol_fields(self):
        Image.new("RGB", (4000, 1001), "white").save(self.path, format="JPEG")
        oversized = {**self.panel, "sha256": hashlib.sha256(self.path.read_bytes()).hexdigest()}
        with self.assertRaises(ValueError):
            validate_panel(oversized, self.root)
        with self.assertRaises(ValueError):
            validate_panel({**self.panel, "photo": True}, self.root)


if __name__ == "__main__":
    unittest.main()
