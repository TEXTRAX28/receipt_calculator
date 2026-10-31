"""Windows local-only vision CLI benchmark; no labels, OCR text, cloud APIs or tools.

Run setup_vision_candidate.py first. --request is an archived request.json from
a predeclared raw run. Preserve its images/prompt/schema; outputs stay ignored.
"""
import argparse
import ctypes
from ctypes import wintypes
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / "qa-artifacts/advanced-ocr"
parser = argparse.ArgumentParser()
parser.add_argument("--request", required=True)
parser.add_argument("--run", required=True)
parser.add_argument("--deadline", type=int, default=180)
args = parser.parse_args()
if not re.fullmatch(r"[\w-]+", args.run) or not 10 <= args.deadline <= 600:
    raise ValueError("Invalid bounded experiment arguments")
request_path = (ROOT / args.request).resolve()
request_path.relative_to(ROOT)
if os.name != "nt" or request_path.stat().st_size > 256 * 1024:
    raise ValueError("This pinned benchmark uses Windows and a bounded request file")
request = json.loads(request_path.read_text(encoding="utf-8"))
if not 512 <= request.get("context", 4096) <= 16384 or not 1 <= request.get("max_tokens", 1800) <= 6000 or not 64 <= request.get("image_tokens", 1024) <= 2048:
    raise ValueError("Context, output or vision-token budget exceeds the experiment limits")
if not isinstance(request.get("prompt"), str) or not 1 <= len(request["prompt"]) <= 12000:
    raise ValueError("Invalid bounded prompt")
if request.get("gpu_layers", "auto") != "auto" and not isinstance(request.get("gpu_layers"), int):
    raise ValueError("Use automatic offloading or a bounded layer count")
if isinstance(request.get("gpu_layers"), int) and not 0 <= request["gpu_layers"] <= 99:
    raise ValueError("Invalid layer count")
out = HERE / args.run
out.mkdir(exist_ok=False)
manifest_path = ROOT / "receipt_training/evaluation/vision-candidate-manifest.json"
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
(out / "model-manifest.json").write_bytes(manifest_path.read_bytes())
cache = ROOT / "receipt_training/.cache/vision-experiment"
cli = cache / f"runtime-{manifest['runtime_build']}/llama-mtmd-cli.exe"
model, projector = [cache / entry["path"] for entry in manifest["files"][:2]]
def sha(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "sha256").hexdigest()
for entry, path in zip(manifest["files"][:2], [model, projector]):
    if path.stat().st_size != entry["bytes"] or sha(path) != entry["sha256"]:
        raise ValueError("Model asset changed after verification")
images = [(ROOT / path).resolve() for path in request["images"]]
if not 1 <= len(images) <= 3:
    raise ValueError("Use one to three fixed local images for the pilot")
for path in images:
    path.relative_to(ROOT)
    if not path.is_file() or path.stat().st_size > 12 * 1024**2:
        raise ValueError("Invalid local pilot image")
(out / "request.json").write_bytes(request_path.read_bytes())
(out / "harness.py").write_bytes(Path(__file__).read_bytes())
(out / "schema.json").write_text(json.dumps(request["schema"]), encoding="utf-8")
command = [str(cli), "-m", str(model), "--mmproj", str(projector),
           "--image", ",".join(str(path) for path in images), "-p", request["prompt"],
           "--json-schema-file", str(out / "schema.json"), "--ctx-size", str(request.get("context", 4096)),
           "--n-predict", str(request.get("max_tokens", 1800)), "--image-max-tokens", str(request.get("image_tokens", 1024)),
           "--gpu-layers", str(request.get("gpu_layers", "auto")), "--batch-size", "256", "--ubatch-size", "128",
           "--threads", "4", "--threads-batch", "4", "--temp", "0", "--seed", "20261031"]
environment = {k:v for k,v in os.environ.items() if k.lower() in {"systemroot","windir","path","pathext","temp","tmp","userprofile","appdata","localappdata","programdata","programfiles","programfiles(x86)"}}
environment["HF_HUB_OFFLINE"] = "1"
metadata = {"model": manifest["model"], "revision": manifest["revision"], "runtime": manifest["runtime_build"],
            "started_at":datetime.now(timezone.utc).isoformat(),
            "manifest_sha256":sha(manifest_path), "cli_sha256":sha(cli), "harness_sha256":sha(Path(__file__)),
            "request_sha256":sha(request_path), "schema_sha256":sha(out / "schema.json"),
            "images":[{"path":str(p.relative_to(ROOT)),"sha256":sha(p)} for p in images],
            "external_api_requests":0,"external_receipt_uploads":0,"api_cost_usd":"0","compute_cost_usd":None,
            "label_files_read":False,"input_ocr_text":False,"deadline_seconds":args.deadline,
            "settings":{k:request.get(k) for k in ["context","max_tokens","image_tokens","gpu_layers"]},
            "timing_scope":"Fresh CLI model loading, image encoding and constrained generation; excludes verified download/setup, browser preprocessing and deterministic financial validation"}
class Memory(ctypes.Structure):
    _fields_=[("cb",wintypes.DWORD),("PageFaultCount",wintypes.DWORD)]+[(name,ctypes.c_size_t) for name in ["PeakWorkingSetSize","WorkingSetSize","QuotaPeakPagedPoolUsage","QuotaPagedPoolUsage","QuotaPeakNonPagedPoolUsage","QuotaNonPagedPoolUsage","PagefileUsage","PeakPagefileUsage"]]
memory_fn=ctypes.WinDLL("psapi").GetProcessMemoryInfo
memory_fn.argtypes=[wintypes.HANDLE,ctypes.POINTER(Memory),wintypes.DWORD]
memory_fn.restype=wintypes.BOOL
stdout=out / "stdout.txt"
stderr=out / "stderr.txt"
started=time.perf_counter()
peak=None
with stdout.open("wb") as output, stderr.open("wb") as errors:
    process=subprocess.Popen(command,cwd=ROOT,env=environment,stdin=subprocess.DEVNULL,stdout=output,stderr=errors,creationflags=subprocess.CREATE_NO_WINDOW)
    metadata["pid"]=process.pid
    (out / "metadata.json").write_text(json.dumps(metadata,indent=2),encoding="utf-8")
    while process.poll() is None:
        usage=Memory(); usage.cb=ctypes.sizeof(Memory)
        if memory_fn(int(process._handle),ctypes.byref(usage),ctypes.sizeof(usage)):
            peak=max(peak or 0,usage.PeakWorkingSetSize)
        if time.perf_counter()-started > args.deadline or max(stdout.stat().st_size,stderr.stat().st_size)>1024**2:
            metadata["error"]="deadline-or-output-bound"
            subprocess.run(["taskkill.exe","/PID",str(process.pid),"/T","/F"],capture_output=True,timeout=10,creationflags=subprocess.CREATE_NO_WINDOW)
            process.wait(timeout=10)
            break
        time.sleep(.25)
metadata.update({"elapsed_ms":round((time.perf_counter()-started)*1000),"exit_code":process.returncode,"peak_process_working_set_bytes":peak,"stdout_sha256":sha(stdout),"stderr_sha256":sha(stderr)})
metadata["completed_at"]=datetime.now(timezone.utc).isoformat()
text=re.sub(r"\x1b\[[0-9;]*m","",stdout.read_text(encoding="utf-8",errors="replace"))
try:
    start=text.index("{")
    value,_=json.JSONDecoder().raw_decode(text[start:])
    (out / "model-output.json").write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
    metadata["parsed_json"]=True
except (ValueError,json.JSONDecodeError):
    metadata["parsed_json"]=False
(out / "metadata.json").write_text(json.dumps(metadata,indent=2),encoding="utf-8")
print(json.dumps({k:metadata.get(k) for k in ["model","runtime","elapsed_ms","exit_code","peak_process_working_set_bytes","parsed_json","error"]}),flush=True)
if process.returncode or not metadata["parsed_json"]:
    raise SystemExit(1)
