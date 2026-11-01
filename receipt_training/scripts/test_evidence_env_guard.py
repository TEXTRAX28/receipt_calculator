"""Exercise the evidence auditor with public templates and forbidden live configs."""
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import audit_evidence_integrity as audit


class EnvEvidenceGuard(unittest.TestCase):
    def run_fixture(self, filename):
        with tempfile.TemporaryDirectory(prefix="gather-evidence-env-") as directory:
            root = Path(directory).resolve()
            root.relative_to(Path(tempfile.gettempdir()).resolve())
            data = b"SYNTHETIC_KEY=\n"
            (root / filename).write_bytes(data)
            reports = root / "receipt_training/evaluation"
            reports.mkdir(parents=True)
            (reports / "synthetic.json").write_text(json.dumps({"evidence_sha256": {filename: hashlib.sha256(data).hexdigest()}}), encoding="utf-8")
            with patch.object(audit, "ROOT", root), patch.object(audit, "QA", root / "qa-artifacts"), patch.object(audit, "BLOBS", root / "qa-artifacts/evidence-blobs"), patch("sys.argv", ["audit", "--run", "synthetic-env-guard"]), redirect_stdout(io.StringIO()):
                audit.main()
            result = json.loads((root / "qa-artifacts/evidence-audits/synthetic-env-guard.json").read_text(encoding="utf-8"))
            self.assertEqual(result["unique_paths_checked"], 1)
            self.assertEqual(result["unresolved_declared_hashes"], 0)
            self.assertEqual(result["network_requests"], 0)

    def test_public_blank_key_template_is_verifiable(self):
        self.run_fixture(".env.example")

    def test_live_local_configuration_is_forbidden(self):
        with self.assertRaisesRegex(ValueError, "Invalid evidence declaration"):
            self.run_fixture(".env.local")

    def test_live_default_configuration_is_forbidden(self):
        with self.assertRaisesRegex(ValueError, "Invalid evidence declaration"):
            self.run_fixture(".env")

    def test_similarly_named_live_configuration_is_forbidden(self):
        with self.assertRaisesRegex(ValueError, "Invalid evidence declaration"):
            self.run_fixture(".env.example.local")


if __name__ == "__main__":
    unittest.main()
