"""Historical archives must never substitute for live provider inputs."""
import hashlib
from pathlib import Path
import tempfile
import unittest

from prepare_azure_screening import execution_inputs_current, verify_historical_evidence


class EvidenceAuthorityTests(unittest.TestCase):
    def test_current_bytes_are_verified_without_an_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "input.bin").write_bytes(b"reviewed")
            expected = hashlib.sha256(b"reviewed").hexdigest()
            self.assertEqual(verify_historical_evidence(root, {"input.bin": expected})[0]["kind"], "current")

    def test_exact_old_bytes_can_prove_history_but_not_replace_live_crops(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            expected = hashlib.sha256(b"reviewed").hexdigest()
            archive = root / "qa-artifacts/evidence-blobs"
            archive.mkdir(parents=True)
            (archive / expected).write_bytes(b"reviewed")
            (root / "crop.png").write_bytes(b"changed")
            self.assertEqual(verify_historical_evidence(root, {"crop.png": expected})[0]["kind"], "exact_archive")
            plan = {"protocol_sha256": {}, "review_sha256": {}, "cases": [{"image": "crop.png", "image_sha256": expected}]}
            self.assertFalse(execution_inputs_current(root, plan))
            (root / "crop.png").write_bytes(b"reviewed")
            self.assertTrue(execution_inputs_current(root, plan))

    def test_missing_or_corrupt_archive_cannot_verify_history(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            expected = hashlib.sha256(b"reviewed").hexdigest()
            with self.assertRaises(AssertionError):
                verify_historical_evidence(root, {"missing": expected})
            archive = root / "qa-artifacts/evidence-blobs"
            archive.mkdir(parents=True)
            (archive / expected).write_bytes(b"different")
            with self.assertRaises(AssertionError):
                verify_historical_evidence(root, {"missing": expected})

    def test_outside_paths_and_secret_declarations_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            expected = hashlib.sha256(b"reviewed").hexdigest()
            for name in ("../outside", ".env.local"):
                with self.assertRaises((ValueError, AssertionError)):
                    verify_historical_evidence(root, {name: expected})

    def test_changed_protocol_and_review_records_are_not_blessed_by_archives(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            expected = hashlib.sha256(b"reviewed").hexdigest()
            for group in ("protocol_sha256", "review_sha256"):
                plan = {"protocol_sha256": {}, "review_sha256": {}, "cases": []}
                plan[group]["live.mjs"] = expected
                (root / "live.mjs").write_bytes(b"changed")
                self.assertFalse(execution_inputs_current(root, plan))


if __name__ == "__main__":
    unittest.main()
