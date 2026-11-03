"""Run the local refund baseline under the existing browser resource guards."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time

from qwen8b_resources import available_memory
from vision_trial_guard import stop_owned_process, RUNTIME_RAM_FLOOR

ROOT = Path(__file__).resolve().parents[2]


def main():
    tag = sys.argv[1]
    assert re.fullmatch(r"[\w-]+", tag)
    assert sys.argv[2:] in ([], ["--phone"]) or (len(sys.argv) in (4, 6) and sys.argv[2] == "--phone" and re.fullmatch(r"(?:refund-document-validation|receipt-date-parser|refund-financial-summary)-v[1-9]\d*", sys.argv[3]) and (len(sys.argv) == 4 or sys.argv[4:] == ["--currency", "USD"]))
    script = "verify_refund_phone.mjs" if sys.argv[2:] else "benchmark_refund_receipts.mjs"
    control = ROOT / "qa-artifacts" / (tag + "-control")
    control.mkdir()
    observation = ROOT / "receipt_training/evaluation/runs" / tag
    observation.mkdir()
    initial = available_memory()[1]
    result = {"started_at": datetime.now(timezone.utc).isoformat(), "startup_available_ram": initial,
              "startup_required_ram": 2684354560, "runtime_ram_floor": RUNTIME_RAM_FLOOR,
              "whole_run_deadline_seconds": 300, "scope": "Existing 2.5 GiB browser startup/1 GiB runtime reserve. Owned Node/browser development tree; not handset or model-only memory.",
              "spawned": False, "private_uploads": 0, "model_downloads": 0}
    if initial < result["startup_required_ram"]:
        result["error"] = "insufficient-available-ram-before-start"
    else:
        env = {k: v for k, v in os.environ.items() if k.lower() in {"systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile", "appdata", "localappdata", "programdata", "programfiles", "programfiles(x86)"}}
        node = shutil.which("node.exe")
        assert node
        arguments = [node, "receipt_training/scripts/" + script, tag, "--await-observer"]
        if len(sys.argv) >= 4:
            arguments.append(sys.argv[3])
        if len(sys.argv) == 6:
            arguments.append(sys.argv[5])
        with (control / "stdout.log").open("xb") as output, (control / "stderr.log").open("xb") as errors:
            process = subprocess.Popen(arguments, cwd=ROOT, env=env, stdout=output, stderr=errors,
                                       stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            observer = None
            started = time.monotonic()
            result.update(spawned=True, pid=process.pid, minimum_available_ram=initial, samples=0)
            try:
                while process.poll() is None:
                    folder = ROOT / "qa-artifacts" / tag
                    if observer is None and (folder / "starting.json").exists():
                        observer = subprocess.Popen([sys.executable, "-X", "utf8", "receipt_training/scripts/observe_process_memory.py", "--pid", str(process.pid), "--output", str(observation / "owned-memory.json")],
                                                    cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                        with (folder / "observer-ready.json").open("x", encoding="utf-8") as file:
                            json.dump({"root_pid": process.pid, "observer_pid": observer.pid}, file)
                    available = available_memory()[1]
                    result["samples"] += 1
                    result["minimum_available_ram"] = min(result["minimum_available_ram"], available)
                    if available < RUNTIME_RAM_FLOOR or time.monotonic() - started > 300:
                        result["error"] = "low-system-memory" if available < RUNTIME_RAM_FLOOR else "whole-run-deadline"
                        break
                    if (control / "stdout.log").stat().st_size + (control / "stderr.log").stat().st_size > 2 * 1024**2:
                        result["error"] = "output-bound"
                        break
                    time.sleep(0.25)
            finally:
                stop_owned_process(process)
                if observer:
                    try:
                        observer.wait(timeout=15)
                    except subprocess.TimeoutExpired:
                        stop_owned_process(observer)
                        result["observer_error"] = "observer-did-not-finish"
            result.update(exit_code=process.returncode, elapsed_ms=round((time.monotonic() - started) * 1000),
                          memory_observation=str((observation / "owned-memory.json").relative_to(ROOT)))
    with (control / "controller.json").open("x", encoding="utf-8") as file:
        json.dump(result, file, indent=2)
        file.write("\n")
    print(json.dumps(result))
    if result.get("error") or result.get("exit_code", 0):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
