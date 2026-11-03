"""One guarded synthetic-only WebGPU compatibility attempt; cached SDK/models only."""
from datetime import datetime, timezone
import hashlib
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
BASE_SHA = "1b3a29c7b8f1a4017d9a8c61835db7a7cf059247dcd5b21d0e42ba5083e27231"
STARTUP_FLOOR = 4 * 1024**3


def main():
    assert len(sys.argv) == 3
    tag, size = sys.argv[1:]
    assert re.fullmatch(r"browser-webgpu-[\w-]+", tag) and size in ("tiny", "medium")
    control = ROOT / "qa-artifacts" / (tag + "-control")
    control.mkdir()
    output = ROOT / "qa-artifacts" / tag
    assert not output.exists()
    hashes = {}

    def bind(path):
        path = path.resolve()
        name = path.relative_to(ROOT).as_posix()
        assert not path.name.startswith(".env")
        with path.open("rb") as file:
            hashes[name] = hashlib.file_digest(file, "sha256").hexdigest()
        return hashes[name]

    base = ROOT / "receipt_training/scripts/probe_browser_paddle.mjs"
    assert bind(base) == BASE_SHA, "Inspect a changed base runner before using it"
    source = base.read_text(encoding="utf-8")

    def replace_once(old, new):
        nonlocal source
        assert source.count(old) == 1, old
        source = source.replace(old, new)

    replace_once("const [tag, planTag] = process.argv.slice(2);", """const [tag, planTag] = process.argv.slice(2);
assert(process.argv.length === 5 && process.argv[4] === "--await-observer",
  "This probe permits only its synthetic canvas; no receipt/capture flags");""")
    replace_once("let server;", """settings.resolve.alias = [
  { find: /^onnxruntime-web$/, replacement: resolve(env, "onnxruntime-web/dist/ort.webgpu.bundle.min.mjs") },
  ...Object.entries(settings.resolve.alias).map(([find, replacement]) => ({ find, replacement })),
];
settings.server.headers = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};
let server;""")
    replace_once('            backend: "wasm",', '            backend: "webgpu",')
    replace_once("  const result = await page.evaluate(", """  const gpuInfo = await page.evaluate(async () => {
    if (!isSecureContext || !crossOriginIsolated || !navigator.gpu)
      throw new Error("WebGPU probe requires secure isolated context and navigator.gpu");
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error("No WebGPU adapter; no model attempt");
    return {
      vendor: adapter.info?.vendor ?? null,
      architecture: adapter.info?.architecture ?? null,
      device: adapter.info?.device ?? null,
      description: adapter.info?.description ?? null,
      isFallbackAdapter: adapter.info?.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null,
      features: [...adapter.features],
      crossOriginIsolated, isSecureContext,
    };
  });
  const result = await page.evaluate(""")
    replace_once('  await write("result.json", {\n    ...result,', '  await write("result.json", {\n    ...result,\n    gpu_adapter: gpuInfo,')
    replace_once("  if (result.error) process.exitCode = 1;", """  if (!result.error) {
    assert.equal(result.initialization.backend, "webgpu");
    assert.equal(result.initialization.detProvider, "webgpu");
    assert.equal(result.initialization.recProvider, "webgpu");
    assert.deepEqual(result.reading?.[0]?.items?.map((item) => item.text), [
      "BROWSER TEST MARKET", "Currency GBP", "Soup 2x 1.25 2.50",
      "Rice 1x 3.50 3.50", "TOTAL GBP 6.00", "PRICES INCLUDE TAX",
    ]);
    assert.equal(requests.external.length, 0);
    assert.equal(requests.writes.length, 0);
    assert.equal(errors.length, 0);
  }
  if (result.error) process.exitCode = 1;""")
    runner = control / "webgpu-probe.mjs"
    runner.write_text(source, encoding="utf-8", newline="\n")
    bind(runner)
    model_tag = "browser-paddle-" + size + "-plan-v1"
    model_plan = ROOT / "qa-artifacts" / model_tag / "plan.json"
    bind(model_plan)
    models = json.loads(model_plan.read_text(encoding="utf-8"))["models"]
    assert [m["name"] for m in models] == [f"PP-OCRv6_{size}_det", f"PP-OCRv6_{size}_rec"]
    for model in models:
        assert bind(ROOT / model["path"]) == model["sha256"]
    cache = ROOT / "receipt_training/.cache/browser-paddle-sdk-v1"
    bind(cache / "package-lock.json")
    for package, version in (("@paddleocr/paddleocr-js", "0.4.2"), ("onnxruntime-web", "1.31.1")):
        package_root = cache / "node_modules" / package
        manifest = package_root / "package.json"
        assert json.loads(manifest.read_text(encoding="utf-8"))["version"] == version
        bind(manifest)
        for path in (package_root / "dist").rglob("*"):
            if path.is_file() and path.suffix in (".mjs", ".wasm", ".js"):
                bind(path)
    for name in ("probe_browser_webgpu.py", "qwen8b_resources.py", "vision_trial_guard.py", "observe_process_memory.py"):
        path = ROOT / "receipt_training/scripts" / name
        bind(path)
        (control / name).write_bytes(path.read_bytes())
    plan = {"recorded_at": datetime.now(timezone.utc).isoformat(), "model_size": size,
            "input_sha256": hashes, "synthetic_image_calls_maximum": 1, "receipt_image_calls": 0,
            "startup_floor_bytes": STARTUP_FLOOR, "runtime_floor_bytes": RUNTIME_RAM_FLOOR,
            "deadline_seconds": 90, "downloads": 0, "external_uploads": 0, "retries": 0,
            "scope": "Strict WebGPU session selection, exact cached weights, same six-line synthetic canvas and one-thread/batch-one settings. ORT WebGPU entry alias and isolated-origin headers. No receipt flags, API/env loading or automatic WASM fallback. Selected provider does not prove every kernel runs on GPU; sampled working set excludes GPU memory. No hardware/accuracy/latency superiority claim before results."}
    (control / "plan.json").write_text(json.dumps(plan, indent=2) + "\n", encoding="utf-8")
    node = shutil.which("node.exe")
    assert node
    env = {k: v for k, v in os.environ.items() if k.lower() in {
        "systemroot", "windir", "path", "pathext", "temp", "tmp", "userprofile",
        "appdata", "localappdata", "programdata", "programfiles", "programfiles(x86)"}}
    syntax = subprocess.run([node, "--check", str(runner)], env=env, capture_output=True, text=True)
    (control / "syntax.json").write_text(json.dumps({"exit_code": syntax.returncode, "stdout": syntax.stdout, "stderr": syntax.stderr}, indent=2) + "\n", encoding="utf-8")
    assert syntax.returncode == 0
    initial = available_memory()[1]
    result = {"started_at": datetime.now(timezone.utc).isoformat(), "spawned": False,
              "initial_available_ram": initial, "startup_floor_bytes": STARTUP_FLOOR,
              "runtime_floor_bytes": RUNTIME_RAM_FLOOR, "deadline_seconds": 90,
              "receipt_uploads": 0, "model_downloads": 0}
    if initial < STARTUP_FLOOR:
        result["error"] = "insufficient-available-ram-before-start"
    else:
        observation = ROOT / "receipt_training/evaluation/runs" / tag
        observation.mkdir()
        with (control / "stdout.log").open("xb") as stdout, (control / "stderr.log").open("xb") as stderr:
            process = subprocess.Popen([node, str(runner), tag, model_tag, "--await-observer"],
                                       cwd=ROOT, env=env, stdout=stdout, stderr=stderr,
                                       stdin=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            observer = None
            started = time.monotonic()
            result.update(spawned=True, pid=process.pid, minimum_available_ram=initial, samples=0)
            try:
                while process.poll() is None:
                    if observer is None and (output / "starting.json").exists():
                        observer = subprocess.Popen([sys.executable, "-X", "utf8", "receipt_training/scripts/observe_process_memory.py",
                                                     "--pid", str(process.pid), "--output", str(observation / "owned-memory.json")],
                                                    cwd=ROOT, env=env, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                                    stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
                        (output / "observer-ready.json").write_text(json.dumps({"observer_pid": observer.pid, "root_pid": process.pid}), encoding="utf-8")
                    try:
                        available = available_memory()[1]
                    except OSError:
                        result["error"] = "memory-observation-unavailable"
                        break
                    result["samples"] += 1
                    result["minimum_available_ram"] = min(result["minimum_available_ram"], available)
                    if available < RUNTIME_RAM_FLOOR or time.monotonic() - started > 90:
                        result["error"] = "low-system-memory" if available < RUNTIME_RAM_FLOOR else "whole-run-deadline"
                        break
                    if sum((control / name).stat().st_size for name in ("stdout.log", "stderr.log")) > 2 * 1024**2:
                        result["error"] = "output-bound"
                        break
                    time.sleep(0.25)
            finally:
                stop_owned_process(process)
                if observer:
                    try:
                        observer.wait(timeout=15)
                        result["observer_exit_code"] = observer.returncode
                    except subprocess.TimeoutExpired:
                        stop_owned_process(observer)
                        result["observer_error"] = "observer-did-not-finish"
            result.update(exit_code=process.returncode, elapsed_ms=round((time.monotonic() - started) * 1000))
    with (control / "controller.json").open("x", encoding="utf-8") as file:
        file.write(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result))
    if result.get("error") or result.get("exit_code", 0) or result.get("observer_error"):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
