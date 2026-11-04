"""Separate operating policy for the pinned 2B research candidate."""
from vision_trial_guard import VisionMemoryGuard

STARTUP_RAM_FLOOR = 2 * 1024**3


class Qwen35MemoryGuard(VisionMemoryGuard):
    def require_start(self):
        self.initial_available = self.sample()
        if self.initial_available < STARTUP_RAM_FLOOR:
            raise ValueError('At least two GiB physical RAM must be available before this 2B trial')

    def summary(self):
        result = super().summary()
        result['startup_floor_bytes'] = STARTUP_RAM_FLOOR
        result['profile'] = 'qwen35-2b-q4-f16-research'
        return result
