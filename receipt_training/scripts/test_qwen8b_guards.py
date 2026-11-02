"""No network/models/receipts: bounded fake streams and owned harmless processes."""
from copy import deepcopy
import ctypes
from ctypes import wintypes
import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

import setup_qwen8b_candidate as setup
from vision_trial_guard import VisionMemoryGuard, stop_owned_process


class Response(io.BytesIO):
    def geturl(self):
        return "https://example.invalid/model.gguf"


class DownloadBounds(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="8b-guard-test-", dir=setup.CACHE)
        self.addCleanup(self.temp.cleanup)
        self.target = Path(self.temp.name) / "synthetic.gguf"
        self.payload = b"synthetic guard test, not a model\n" * 1024
        self.entry = {"bytes": len(self.payload), "sha256": hashlib.sha256(self.payload).hexdigest(), "url": "https://example.invalid/model.gguf"}
        self.calls = 0

    def opener(self, request, timeout):
        self.calls += 1
        self.assertEqual(timeout, 30)
        self.assertNotIn("Authorization", request.headers)
        return Response(self.payload)

    def run_download(self, **kwargs):
        return setup.stream_asset(self.entry, self.target, opener=self.opener, free_bytes=lambda: 10**15, **kwargs)

    def assert_no_artifact(self):
        self.assertFalse(self.target.exists())
        self.assertEqual(list(self.target.parent.glob("*.part")), [])

    def test_exact_verified_stream_installs_once(self):
        self.run_download()
        self.assertEqual(self.target.read_bytes(), self.payload)
        self.assertEqual(self.calls, 1)

    def test_existing_file_is_preserved_without_a_request(self):
        self.target.write_bytes(b"existing")
        with self.assertRaisesRegex(ValueError, "existing"):
            self.run_download()
        self.assertEqual(self.target.read_bytes(), b"existing")
        self.assertEqual(self.calls, 0)

    def test_target_escape_is_rejected_before_network(self):
        with self.assertRaises(ValueError):
            setup.stream_asset(self.entry, setup.ROOT / "outside-model-cache.gguf", opener=self.opener)
        self.assertEqual(self.calls, 0)

    def test_initial_disk_floor_prevents_network(self):
        with self.assertRaisesRegex(ValueError, "reserve"):
            setup.stream_asset(self.entry, self.target, opener=self.opener, free_bytes=lambda: 1)
        self.assertEqual(self.calls, 0)
        self.assert_no_artifact()

    def test_disk_fall_stops_and_removes_only_owned_partial(self):
        free = iter([10**15, 1])
        with self.assertRaisesRegex(ValueError, "reserve fell"):
            setup.stream_asset(self.entry, self.target, opener=self.opener, free_bytes=lambda: next(free))
        self.assertEqual(self.calls, 1)
        self.assert_no_artifact()

    def test_truncated_and_oversized_downloads_never_install(self):
        for data in (self.payload[:-1], self.payload + b"extra"):
            with self.subTest(bytes=len(data)):
                with self.assertRaises(ValueError):
                    setup.stream_asset(self.entry, self.target, opener=lambda *a, **k: Response(data), free_bytes=lambda: 10**15)
                self.assert_no_artifact()

    def test_wrong_checksum_never_installs(self):
        self.entry["sha256"] = "0" * 64
        with self.assertRaisesRegex(ValueError, "checksum"):
            self.run_download()
        self.assert_no_artifact()

    def test_wall_deadline_stops_without_retry(self):
        ticks = iter([0, 2000])
        with self.assertRaisesRegex(ValueError, "time budget"):
            self.run_download(clock=lambda: next(ticks))
        self.assertEqual(self.calls, 1)
        self.assert_no_artifact()

    def test_non_https_redirect_never_installs(self):
        class Insecure(Response):
            def geturl(self):
                return "http://example.invalid/model.gguf"
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            setup.stream_asset(self.entry, self.target, opener=lambda *a, **k: Insecure(self.payload), free_bytes=lambda: 10**15)
        self.assert_no_artifact()

    def test_target_race_does_not_replace_another_file(self):
        def opener(*args, **kwargs):
            self.target.write_bytes(b"new concurrent file")
            return Response(self.payload)
        with self.assertRaises(FileExistsError):
            setup.stream_asset(self.entry, self.target, opener=opener, free_bytes=lambda: 10**15)
        self.assertEqual(self.target.read_bytes(), b"new concurrent file")
        self.assertEqual(list(self.target.parent.glob("*.part")), [])

    def test_both_startup_resources_are_required(self):
        for disk, ram in [(False, False), (True, False), (False, True)]:
            with self.subTest(disk=disk, ram=ram), self.assertRaises(ValueError):
                setup.require_headroom({"download_headroom_ok": disk, "inference_start_headroom_ok": ram})
        setup.require_headroom({"download_headroom_ok": True, "inference_start_headroom_ok": True})

    def test_frozen_manifest_is_accepted_and_mutations_rejected(self):
        original = setup.manifest()
        self.assertEqual(sum(f["bytes"] for f in original["files"][:2]), 5780074528)
        for field in ("size", "checksum", "url", "order", "runtime"):
            value = deepcopy(original)
            if field == "order":
                value["files"][:2] = reversed(value["files"][:2])
            elif field == "runtime":
                value["files"][-1]["sha256"] = "0" * 64
            else:
                key = {"size": "bytes", "checksum": "sha256", "url": "url"}[field]
                value["files"][0][key] = 7_000_000_000 if field == "size" else "changed"
            path = self.target.parent / (field + ".json")
            path.write_text(json.dumps(value), encoding="utf-8")
            with self.subTest(field=field), patch.object(setup, "MANIFEST", path), self.assertRaises(ValueError):
                setup.manifest()

    def test_existing_smaller_installer_still_rejects_8b_budget(self):
        result = subprocess.run([sys.executable, "-X", "utf8", str(Path(setup.__file__).with_name("setup_vision_candidate.py")),
                                 "--check", "--manifest", "receipt_training/evaluation/qwen8b-candidate-manifest.json"],
                                capture_output=True, text=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Model assets exceed the planned download budget", result.stderr)


class MemoryBounds(unittest.TestCase):
    def test_startup_rejects_low_ram(self):
        with self.assertRaisesRegex(ValueError, "four GiB"):
            VisionMemoryGuard(lambda: (16 * 1024**3, 3 * 1024**3)).require_start()

    def test_runtime_floor_and_observation_summary(self):
        readings = iter([6 * 1024**3, 2 * 1024**3, 512 * 1024**2])
        guard = VisionMemoryGuard(lambda: (16 * 1024**3, next(readings)))
        guard.require_start()
        self.assertIsNone(guard.runtime_reason())
        self.assertEqual(guard.runtime_reason(), "low-system-memory")
        self.assertEqual(guard.summary()["samples"], 3)
        self.assertEqual(guard.summary()["minimum_sampled_available_bytes"], 512 * 1024**2)

    def test_unavailable_runtime_observation_cannot_continue(self):
        def unavailable():
            raise OSError("simulated unavailable memory status")
        self.assertEqual(VisionMemoryGuard(unavailable).runtime_reason(), "system-memory-observation-unavailable")

    def test_malformed_observations_cannot_continue(self):
        for available in (-1, 17 * 1024**3, "unknown"):
            with self.subTest(available=available):
                self.assertEqual(VisionMemoryGuard(lambda: (16 * 1024**3, available)).runtime_reason(), "system-memory-observation-unavailable")

    def test_stop_rejects_a_pid_instead_of_an_owned_process(self):
        with self.assertRaises(TypeError):
            stop_owned_process(1234)

    def test_stop_falls_back_to_owned_root_if_tree_tool_times_out(self):
        process = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"], creationflags=subprocess.CREATE_NO_WINDOW)
        try:
            with patch("vision_trial_guard.subprocess.run", side_effect=subprocess.TimeoutExpired("taskkill.exe", 10)):
                stop_owned_process(process)
            self.assertIsNotNone(process.returncode)
        finally:
            stop_owned_process(process)

    def test_real_owned_tree_stops_and_separate_sentinel_survives(self):
        child_script = "import time; time.sleep(30)"
        tree_script = ("import subprocess,sys,time; p=subprocess.Popen([sys.executable,'-c'," + repr(child_script) + "],creationflags=0x08000000); print(p.pid,flush=True); time.sleep(30)")
        sentinel = subprocess.Popen([sys.executable, "-c", child_script], creationflags=subprocess.CREATE_NO_WINDOW)
        owned = subprocess.Popen([sys.executable, "-c", tree_script], stdout=subprocess.PIPE, text=True, creationflags=subprocess.CREATE_NO_WINDOW)
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
        kernel.CloseHandle.argtypes = [wintypes.HANDLE]
        handle = None
        try:
            child_pid = int(owned.stdout.readline())
            handle = kernel.OpenProcess(0x00100000, False, child_pid)
            self.assertTrue(handle)
            guard = VisionMemoryGuard(lambda: (16 * 1024**3, 512 * 1024**2))
            self.assertEqual(guard.runtime_reason(), "low-system-memory")
            stop_owned_process(owned)
            self.assertIsNotNone(owned.returncode)
            self.assertEqual(kernel.WaitForSingleObject(handle, 5000), 0)
            self.assertIsNone(sentinel.poll())
            stop_owned_process(owned)  # An exited object cannot acquire a new PID.
        finally:
            if handle:
                kernel.CloseHandle(handle)
            stop_owned_process(owned)
            stop_owned_process(sentinel)
            owned.stdout.close()


if __name__ == "__main__":
    unittest.main()
