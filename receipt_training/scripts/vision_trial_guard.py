"""Windows research startup/runtime RAM guard; can stop only its Popen child."""
import os
import subprocess

from qwen8b_resources import available_memory, RAM_START_RESERVE

RUNTIME_RAM_FLOOR = 1024**3


class VisionMemoryGuard:
    def __init__(self, read_memory=available_memory):
        self.read_memory = read_memory
        self.samples = 0
        self.minimum_available = None
        self.initial_available = None

    def sample(self):
        total, available = self.read_memory()
        if not isinstance(total, int) or not isinstance(available, int) or not 0 <= available <= total or total <= 0:
            raise ValueError("Invalid physical-memory observation")
        self.samples += 1
        self.minimum_available = min(self.minimum_available if self.minimum_available is not None else available, available)
        return available

    def require_start(self):
        self.initial_available = self.sample()
        if self.initial_available < RAM_START_RESERVE:
            raise ValueError("At least four GiB physical RAM must be available before this guarded trial")

    def runtime_reason(self):
        try:
            available = self.sample()
        except (OSError, ValueError):
            return "system-memory-observation-unavailable"
        return "low-system-memory" if available < RUNTIME_RAM_FLOOR else None

    def summary(self):
        return {"startup_floor_bytes": RAM_START_RESERVE, "runtime_floor_bytes": RUNTIME_RAM_FLOOR,
                "initial_available_bytes": self.initial_available, "minimum_sampled_available_bytes": self.minimum_available,
                "samples": self.samples, "sampling_interval_ms": 250,
                "scope": "Conservative experimental guards, not vendor requirements or a guarantee that model/GPU memory will fit."}


def stop_owned_process(process):
    """No PID parameter: the caller must hold the exact child Popen object."""
    if not isinstance(process, subprocess.Popen):
        raise TypeError("An owned Popen process is required")
    if process.poll() is not None:
        return
    if os.name != "nt":
        raise ValueError("This process-tree stop is for Windows")
    try:
        result = subprocess.run(["taskkill.exe", "/PID", str(process.pid), "/T", "/F"],
                                capture_output=True, timeout=10, creationflags=subprocess.CREATE_NO_WINDOW)
        failed = result.returncode != 0
    except subprocess.TimeoutExpired:
        failed = True
    if failed and process.poll() is None:
        process.kill()
    process.wait(timeout=10)
