"""Local protocol checks; no model loading, private inputs or provider requests."""
from contextlib import redirect_stdout
import hashlib
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import guard_browser_paddle_probe as guard

ROOT = Path(__file__).resolve().parents[2]
STUDY = "browser-paddle-medium-paired-plan-v2"


class StudyPlanTests(unittest.TestCase):
    def setUp(self):
        base = ROOT / "qa-artifacts"
        base.mkdir(exist_ok=True)
        self.temporary = tempfile.TemporaryDirectory(prefix="study-plan-test-", dir=base)
        self.root = Path(self.temporary.name).resolve()
        assert self.root.is_relative_to(base.resolve())
        self.addCleanup(self.temporary.cleanup)
        source = self.root / "receipt_training/scripts"
        source.mkdir(parents=True)
        for name in ("guard_browser_paddle_probe.py", "probe_browser_paddle.mjs", "observe_process_memory.py", "vision_trial_guard.py", "qwen8b_resources.py"):
            (source / name).write_bytes((ROOT / "receipt_training/scripts" / name).read_bytes())
        (self.root / "receipt_training/evaluation/runs").mkdir(parents=True)
        plan = self.root / "qa-artifacts" / STUDY
        plan.mkdir(parents=True)
        self.input = self.root / "fixed-input.txt"
        self.input.write_bytes(b"fixed test input")
        (plan / "study-plan.json").write_text(json.dumps({
            "study_id": STUDY.replace("-plan-", "-"),
            "input_sha256": {"fixed-input.txt": hashlib.sha256(self.input.read_bytes()).hexdigest()},
        }), encoding="utf-8")

    def invoke(self, study=STUDY):
        args = ["guard", "protocol-test", "model-plan", "--medium-study", study]
        with patch.object(guard, "ROOT", self.root), patch.object(guard.sys, "argv", args), \
                patch.object(guard, "available_memory", return_value=(16 * 1024**3, 0)), \
                patch.object(guard.subprocess, "Popen", side_effect=AssertionError("Unexpected process launch")) as launch, \
                redirect_stdout(io.StringIO()):
            try:
                guard.main()
            finally:
                launch.assert_not_called()

    def test_new_version_retains_the_existing_resource_guard(self):
        with self.assertRaises(SystemExit) as stopped:
            self.invoke()
        self.assertEqual(stopped.exception.code, 1)
        record = json.loads((self.root / "qa-artifacts/protocol-test-control/controller.json").read_text())
        self.assertFalse(record["spawned"])
        self.assertEqual(record["startup_required_ram"], 3885219840)
        self.assertEqual(record["runtime_ram_floor"], 1073741824)

    def test_changed_input_is_rejected_before_process_launch(self):
        self.input.write_bytes(b"changed after the plan was recorded")
        with self.assertRaisesRegex(AssertionError, "Frozen input changed"):
            self.invoke()
        self.assertFalse((self.root / "qa-artifacts/protocol-test-control").exists())

    def test_invalid_version_is_rejected_before_creating_output(self):
        for study in ("browser-paddle-medium-paired-plan-v0", "../outside", STUDY + "/../outside"):
            with self.subTest(study=study), self.assertRaises(AssertionError):
                self.invoke(study)
        self.assertFalse((self.root / "qa-artifacts/protocol-test-control").exists())


if __name__ == "__main__":
    unittest.main()
