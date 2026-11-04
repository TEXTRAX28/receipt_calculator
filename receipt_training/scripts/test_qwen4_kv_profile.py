import copy
import json
from pathlib import Path
import unittest

from qwen4_kv_profile import PROFILE, Qwen4KVMemoryGuard, validate_profile
from vision_trial_guard import VisionMemoryGuard

GiB = 1024**3


class CacheProfileControls(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parents[2]
        self.manifest = json.loads((root / 'receipt_training/evaluation/vision-candidate-manifest.json').read_text(encoding='utf-8'))
        self.request = {'research_backend': PROFILE, 'context': 8192, 'max_tokens': 4000,
                        'image_tokens': 1536, 'gpu_layers': 'auto', 'require_clean_schema': True}

    def test_fixed_profile_accepts_only_original_assets(self):
        validate_profile(self.manifest, self.request)
        altered = copy.deepcopy(self.manifest)
        altered['files'][0]['sha256'] = '0' * 64
        with self.assertRaises(ValueError):
            validate_profile(altered, self.request)

    def test_budget_or_placement_cannot_drift(self):
        for key, value in [('context', 4096), ('max_tokens', 2000), ('image_tokens', 512), ('gpu_layers', 0), ('projector_gpu', False)]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_profile(self.manifest, {**self.request, key: value})

    def test_clean_structured_decoder_is_required(self):
        for key, value in [('require_clean_schema', False), ('constrain_schema', False), ('output_mode', 'text'), ('research_backend', 'unknown')]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                validate_profile(self.manifest, {**self.request, key: value})

    def test_selected_reader_startup_floor_and_legacy_floor(self):
        guard = Qwen4KVMemoryGuard(lambda: (8 * GiB, 3 * GiB))
        guard.require_start()
        self.assertEqual(guard.summary()['startup_floor_bytes'], 3 * GiB)
        with self.assertRaises(ValueError):
            Qwen4KVMemoryGuard(lambda: (8 * GiB, 3 * GiB - 1)).require_start()
        with self.assertRaises(ValueError):
            VisionMemoryGuard(lambda: (8 * GiB, 3 * GiB)).require_start()
        self.assertEqual(VisionMemoryGuard().summary()['startup_floor_bytes'], 4 * GiB)

    def test_runtime_and_invalid_observation_fail_closed(self):
        available = [3 * GiB]
        guard = Qwen4KVMemoryGuard(lambda: (8 * GiB, available[0]))
        guard.require_start()
        available[0] = GiB
        self.assertIsNone(guard.runtime_reason())
        available[0] -= 1
        self.assertEqual(guard.runtime_reason(), 'low-system-memory')
        bad = Qwen4KVMemoryGuard(lambda: (8 * GiB, -1))
        self.assertEqual(bad.runtime_reason(), 'system-memory-observation-unavailable')


if __name__ == '__main__':
    unittest.main()
