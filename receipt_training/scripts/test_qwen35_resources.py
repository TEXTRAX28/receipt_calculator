import unittest

from qwen35_resources import Qwen35MemoryGuard
from vision_trial_guard import VisionMemoryGuard

GiB = 1024**3


class SmallCandidateGuardTests(unittest.TestCase):
    def test_distinct_candidate_boundary(self):
        guard = Qwen35MemoryGuard(lambda: (8 * GiB, 2 * GiB))
        guard.require_start()
        self.assertEqual(guard.summary()['startup_floor_bytes'], 2 * GiB)
        self.assertEqual(guard.summary()['runtime_floor_bytes'], GiB)
        with self.assertRaises(ValueError):
            Qwen35MemoryGuard(lambda: (8 * GiB, 2 * GiB - 1)).require_start()

    def test_existing_large_guard_stays_four_gib(self):
        guard = VisionMemoryGuard(lambda: (8 * GiB, 2 * GiB))
        with self.assertRaises(ValueError):
            guard.require_start()
        self.assertEqual(guard.summary()['startup_floor_bytes'], 4 * GiB)

    def test_rechecks_immediately_before_launch(self):
        available = [3 * GiB]
        guard = Qwen35MemoryGuard(lambda: (8 * GiB, available[0]))
        guard.require_start()
        available[0] = 2 * GiB - 1
        with self.assertRaises(ValueError):
            guard.require_start()

    def test_runtime_floor_not_lowered(self):
        available = [2 * GiB]
        guard = Qwen35MemoryGuard(lambda: (8 * GiB, available[0]))
        guard.require_start()
        available[0] = GiB
        self.assertIsNone(guard.runtime_reason())
        available[0] -= 1
        self.assertEqual(guard.runtime_reason(), 'low-system-memory')
        self.assertEqual(guard.summary()['minimum_sampled_available_bytes'], GiB - 1)

    def test_bad_observation_does_not_remove_guard(self):
        for observation in [(8 * GiB, -1), (8 * GiB, 9 * GiB), (8 * GiB, None)]:
            with self.subTest(observation=observation):
                guard = Qwen35MemoryGuard(lambda: observation)
                with self.assertRaises(ValueError):
                    guard.require_start()
                self.assertEqual(guard.runtime_reason(), 'system-memory-observation-unavailable')


if __name__ == '__main__':
    unittest.main()
