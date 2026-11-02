"""Own one local browser probe and sibling memory observer; no user process stop."""
from datetime import datetime, timezone
import hashlib
import json
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
    tag, plan = sys.argv[1:3]
    assert all(re.fullmatch(r"[\w-]+", s) for s in [tag, plan])
    extra = sys.argv[3:]
    app_ui = extra == ["--app-uk"]
    medium_study = (len(extra) == 2 and extra[0] == "--medium-study"
                    and bool(re.fullmatch(r"browser-paddle-medium-paired-plan-v[1-9]\d*", extra[1])))
    assert (extra in ([], ["--production"], ["--app-uk"], ["--capture-study", "genuine-capture-read-v1"])
            or medium_study
            or (len(extra) == 2 and extra[0] == "--cohort-plan" and re.fullmatch(r"[\w-]+", extra[1])))
    if medium_study:
        study_path = ROOT / "qa-artifacts" / extra[1] / "study-plan.json"
        study = json.loads(study_path.read_text(encoding="utf-8"))
        assert study["study_id"] == extra[1].replace("-plan-", "-")
        for name, expected in study["input_sha256"].items():
            path = (ROOT / name).resolve()
            path.relative_to(ROOT)
            assert not path.name.startswith(".env")
            with path.open("rb") as source:
                assert hashlib.file_digest(source, "sha256").hexdigest() == expected, "Frozen input changed: " + name
    control = ROOT / "qa-artifacts" / (tag + "-control")
    control.mkdir()
    sources = {}
    for name in ("guard_browser_paddle_probe.py", "probe_browser_paddle.mjs", "observe_process_memory.py", "vision_trial_guard.py", "qwen8b_resources.py"):
        source = ROOT / "receipt_training/scripts" / name
        raw = source.read_bytes()
        (control / name).write_bytes(raw)
        sources[str(source.relative_to(ROOT)).replace("\\", "/")] = hashlib.sha256(raw).hexdigest()
    if app_ui:
        (ROOT / "qa-artifacts" / tag).mkdir()
        for name in ("tests/e2e/enhanced-reader-real.spec.ts", "playwright.config.ts", "src/App.tsx", "src/ReceiptAreaReader.tsx", "src/ReceiptSource.tsx", "src/lib/images.ts", "src/ImageCropper.tsx", "src/lib/paddle-browser.ts", "src/lib/paddle.worker.ts", "src/lib/paddle-layout.ts", "src/lib/parser.ts", "src/lib/receipt-layout.ts", "src/lib/engine.ts", "scripts/enhanced-ocr-assets.json", "package-lock.json"):
            raw = (ROOT / name).read_bytes()
            destination = control / "source" / name
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(raw)
            sources[name] = hashlib.sha256(raw).hexdigest()
    observation = ROOT / "receipt_training/evaluation/runs" / tag
    observation.mkdir()
    initial = available_memory()[1]
    result = {"started_at": datetime.now(timezone.utc).isoformat(), "startup_available_ram": initial,
              "startup_required_ram": 2811478016 + RUNTIME_RAM_FLOOR if medium_study else 2684354560, "runtime_ram_floor": RUNTIME_RAM_FLOOR,
              "startup_guard_basis": "Prior sampled medium browser tree peak plus 1 GiB reserve, identical for both study arms" if medium_study else "Existing 2.5 GiB browser trial guard",
              "scope": "Experimental single-browser resource guard, not a vendor requirement or guarantee of peak memory fit. Local synthetic input plus optional fixed receipt cohort. Observer is a sibling, process tree contains development tools and browser, not model-only memory or a phone measurement.",
              "source_sha256": sources, "capture_study": app_ui or medium_study or "--capture-study" in extra or "--cohort-plan" in extra,
              "medium_study": medium_study,
              "production_bundle": "--production" in extra, "production_app_ui": app_ui,
              "spawned": False, "model_downloads": 0, "private_receipt_uploads": 0}
    if initial < result["startup_required_ram"]:
        result["error"] = "insufficient-available-ram-before-start"
    else:
        node = shutil.which("node.exe")
        assert node
        env = {k:v for k,v in __import__("os").environ.items() if k.lower() in {"systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile", "appdata", "localappdata", "programdata", "programfiles", "programfiles(x86)"}}
        arguments = [node, "receipt_training/scripts/probe_browser_paddle.mjs", tag, plan, "--await-observer", *extra]
        if app_ui:
            env.update(GATHER_ENHANCED_PRIVATE_TEST="1", GATHER_ENHANCED_RUN_TAG=tag)
            arguments = [node, "node_modules/@playwright/test/cli.js", "test", "tests/e2e/enhanced-reader-real.spec.ts", "--project=mobile", "--workers=1", "--trace=off"]
        with (control / "stdout.log").open("xb") as output, (control / "stderr.log").open("xb") as errors:
            process = subprocess.Popen(arguments,
                                       cwd=ROOT, env=env, stdout=output, stderr=errors, stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            observer = None
            started = time.monotonic()
            result.update(spawned=True, pid=process.pid, minimum_available_ram=initial, samples=0)
            try:
                while process.poll() is None:
                    if observer is None and (app_ui or (ROOT / "qa-artifacts" / tag / "starting.json").exists()):
                        # Observer is a sibling of Node, never one of its descendants.
                        observer = subprocess.Popen([sys.executable, "-X", "utf8", "receipt_training/scripts/observe_process_memory.py", "--pid", str(process.pid),
                                                     "--output", str(observation / "owned-memory.json")], cwd=ROOT, env=env, stdin=subprocess.DEVNULL,
                                                    stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                        (ROOT / "qa-artifacts" / tag / "observer-ready.json").write_text(json.dumps({"observer_pid":observer.pid,"root_pid":process.pid}), encoding="utf-8")
                    try:
                        available = available_memory()[1]
                    except OSError:
                        result["error"] = "memory-observation-unavailable"
                        break
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
                        result["observer_error"] = "observer-did-not-finish-after-probe"
            result.update(exit_code=process.returncode, elapsed_ms=round((time.monotonic() - started) * 1000), memory_observation=str((observation / "owned-memory.json").relative_to(ROOT)))
    with (control / "controller.json").open("x", encoding="utf-8") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    if result.get("error") or result.get("exit_code", 0):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
