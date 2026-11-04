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
import shutil
import subprocess
import time
from vision_cli_text import parse_cli_transcript
from vision_cli_json import decode_structured_reply
from vision_trial_guard import VisionMemoryGuard, stop_owned_process

ROOT = Path(__file__).resolve().parents[2]
HERE = ROOT / "qa-artifacts/advanced-ocr"
parser = argparse.ArgumentParser()
parser.add_argument("--request", required=True)
parser.add_argument("--run", required=True)
parser.add_argument("--deadline", type=int, default=180)
parser.add_argument("--memory-guard", action="store_true", help="Require disk/RAM startup headroom and stop only this owned process on low system RAM")
args = parser.parse_args()
if not re.fullmatch(r"[\w-]+", args.run) or not 10 <= args.deadline <= 600:
    raise ValueError("Invalid bounded experiment arguments")
request_path = (ROOT / args.request).resolve()
request_path.relative_to(ROOT)
if os.name != "nt" or request_path.stat().st_size > 256 * 1024:
    raise ValueError("This pinned benchmark uses Windows and a bounded request file")
request = json.loads(request_path.read_text(encoding="utf-8"))
output_mode = request.get("output_mode", "structured-receipt")
if output_mode not in ["structured-receipt", "text"]:
    raise ValueError("Choose a supported experiment output mode")
if not isinstance(request.get("special_tokens", False), bool):
    raise ValueError("The special-token output setting must be an explicit boolean")
if request.get("special_tokens", False) and output_mode != "text":
    raise ValueError("Special-token output is restricted to literal-text experiments")
if not isinstance(request.get("constrain_schema", True), bool):
    raise ValueError("The decoder-constraint setting must be an explicit boolean")
if not isinstance(request.get("normalize_numeric_json", False), bool):
    raise ValueError("The typed JSON adapter setting must be an explicit boolean")
template_kwargs = request.get("chat_template_kwargs")
if template_kwargs is not None and (not isinstance(template_kwargs, dict) or set(template_kwargs) != {"enable_thinking"} or not isinstance(template_kwargs["enable_thinking"], bool)):
    raise ValueError("Only an explicit enable_thinking boolean is supported")
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
manifest_path = (ROOT / request.get("model_manifest", "receipt_training/evaluation/vision-candidate-manifest.json")).resolve()
manifest_path.relative_to((ROOT / "receipt_training/evaluation").resolve())
manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
small_candidate = manifest["model"] == "unsloth/Qwen3.5-2B-GGUF"
research_backend = request.get("research_backend")
strict_cpu = research_backend in ["cpu-small-batch-v1", "cpu-small-batch-no-repack-v1"]
if research_backend is not None and (not small_candidate or not strict_cpu):
    raise ValueError("Only the pinned 2B research CPU profile is supported")
if strict_cpu and (request.get("gpu_layers") != 0 or request.get("projector_gpu") is not False):
    raise ValueError("The CPU research profile requires explicit CPU model and projector placement")
if small_candidate:
    from qwen35_resources import Qwen35MemoryGuard
    from setup_qwen35_candidate import manifest as pinned_small_manifest
    if manifest != pinned_small_manifest():
        raise ValueError("The 2B trial requires the exact pinned research manifest")
    guard = Qwen35MemoryGuard()
else:
    guard = VisionMemoryGuard() if args.memory_guard or manifest["model"] == "Qwen/Qwen3-VL-8B-Instruct-GGUF" else None
if guard:
    from setup_qwen8b_candidate import manifest as pinned_8b_manifest, verify_runtime
    if manifest["model"] == "Qwen/Qwen3-VL-8B-Instruct-GGUF" and manifest != pinned_8b_manifest():
        raise ValueError("An 8B trial requires the exact pinned research manifest")
    if shutil.disk_usage(ROOT).free < 10 * 1024**3:
        raise ValueError("Keep ten GiB disk free before a guarded native trial")
    guard.require_start()
    verify_runtime(manifest)
(out / "model-manifest.json").write_bytes(manifest_path.read_bytes())
cache = ROOT / "receipt_training/.cache/vision-experiment"
executable = manifest.get("runtime_executable", "llama-mtmd-cli.exe")
if executable not in ["llama-mtmd-cli.exe", "llama-cli.exe"]:
    raise ValueError("Use a verified pinned multimodal CLI executable")
cli = cache / f"runtime-{manifest['runtime_build']}" / executable
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
if output_mode == "text" and len(images) != 1:
    raise ValueError("Text recognition runs one attributable source panel at a time")
for path in images:
    path.relative_to(ROOT)
    if not path.is_file() or path.stat().st_size > 12 * 1024**2:
        raise ValueError("Invalid local pilot image")
(out / "request.json").write_bytes(request_path.read_bytes())
(out / "harness.py").write_bytes(Path(__file__).read_bytes())
(out / "vision_cli_text.py").write_bytes(Path(__file__).with_name("vision_cli_text.py").read_bytes())
for helper in ["vision_trial_guard.py", "qwen8b_resources.py", "setup_vision_candidate.py", "setup_qwen8b_candidate.py"]:
    (out / helper).write_bytes(Path(__file__).with_name(helper).read_bytes())
if small_candidate:
    for helper in ["qwen35_resources.py", "setup_qwen35_candidate.py"]:
        (out / helper).write_bytes(Path(__file__).with_name(helper).read_bytes())
if request.get("normalize_numeric_json", False):
    (out / "vision_cli_json.py").write_bytes(Path(__file__).with_name("vision_cli_json.py").read_bytes())
if output_mode == "structured-receipt":
    (out / "schema.json").write_text(json.dumps(request["schema"]), encoding="utf-8")
batch, ubatch = (128, 32) if strict_cpu else (256, 128)
placement_flags = ["--device", "none", "--no-op-offload", "--fit", "off"] if strict_cpu else []
if research_backend == "cpu-small-batch-no-repack-v1":
    placement_flags.append("--no-repack")
command = [str(cli), "-m", str(model), "--mmproj", str(projector),
           "--image", ",".join(str(path) for path in images), "-p", request["prompt"],
           "--ctx-size", str(request.get("context", 4096)),
           "--n-predict", str(request.get("max_tokens", 1800)), "--image-max-tokens", str(request.get("image_tokens", 1024)),
           "--gpu-layers", str(request.get("gpu_layers", "auto")), "--batch-size", str(batch), "--ubatch-size", str(ubatch),
           "--threads", "4", "--threads-batch", "4", "--temp", "0", "--seed", "20261031"]
command.extend(placement_flags)
if output_mode == "structured-receipt" and request.get("constrain_schema", True):
    command.extend(["--json-schema-file", str(out / "schema.json")])
if executable == "llama-cli.exe":
    # JSON schemas contain literal backslashes. The CLI defaults to interpreting
    # escapes, which changes the prompt before inference and its saved framing.
    command.extend(["--no-escape", "--single-turn", "--no-display-prompt", "--simple-io", "--output", str(out / "transcript.txt")])
if request.get("special_tokens", False):
    if executable != "llama-cli.exe":
        raise ValueError("Special-token output requires the pinned standard CLI")
    command.append("--special")
if template_kwargs is not None:
    if executable != "llama-cli.exe":
        raise ValueError("The pinned template-kwargs profile requires llama-cli")
    command.extend(["--chat-template-kwargs", json.dumps(template_kwargs)])
if request.get("projector_gpu", True) is False:
    command.append("--no-mmproj-offload")
if request.get("verbose", False) is True:
    command.append("--verbose")
environment = {k:v for k,v in os.environ.items() if k.lower() in {"systemroot","windir","path","pathext","temp","tmp","userprofile","appdata","localappdata","programdata","programfiles","programfiles(x86)"}}
environment["HF_HUB_OFFLINE"] = "1"
metadata = {"model": manifest["model"], "revision": manifest["revision"], "runtime": manifest["runtime_build"],
            "started_at":datetime.now(timezone.utc).isoformat(),
            "manifest_sha256":sha(manifest_path), "cli_sha256":sha(cli), "harness_sha256":sha(Path(__file__)),
            "runtime_executable":executable,
            "prompt_escape_sequences_processed": False if executable == "llama-cli.exe" else None,
            "text_helper_sha256":sha(out / "vision_cli_text.py"),
            "json_adapter_sha256":sha(out / "vision_cli_json.py") if request.get("normalize_numeric_json", False) else None,
            "request_sha256":sha(request_path), "schema_sha256":sha(out / "schema.json") if output_mode == "structured-receipt" else None,
            "output_mode":output_mode,
            "decoder_schema_enforced": output_mode == "structured-receipt" and request.get("constrain_schema", True),
            "images":[{"path":str(p.relative_to(ROOT)),"sha256":sha(p)} for p in images],
            "external_api_requests":0,"external_receipt_uploads":0,"api_cost_usd":"0","compute_cost_usd":None,
            "label_files_read":False,"input_ocr_text":False,"deadline_seconds":args.deadline,
            "require_clean_schema":request.get("require_clean_schema", False),
            "memory_guard": guard.summary() if guard else None,
            "resource_control_sha256": {name:sha(out / name) for name in ["vision_trial_guard.py", "qwen8b_resources.py", "setup_vision_candidate.py", "setup_qwen8b_candidate.py"]},
            "settings":{k:request.get(k) for k in ["context","max_tokens","image_tokens","gpu_layers","projector_gpu","verbose","constrain_schema","normalize_numeric_json","chat_template_kwargs","special_tokens"]},
            "timing_scope":"Fresh CLI model loading, image encoding and generation; decoder-constraint setting recorded separately. Excludes verified download/setup, browser preprocessing and deterministic financial validation"}
if small_candidate:
    metadata["research_profile"] = f"qwen35-2b-q4-f16-{research_backend}" if strict_cpu else "qwen35-2b-q4-f16-canonical-greedy-v1"
    metadata["research_backend"] = research_backend
    metadata["effective_batches"] = {"batch": batch, "ubatch": ubatch}
    metadata["native_placement_flags"] = placement_flags
    metadata["small_candidate_helpers_sha256"] = {name: sha(out / name) for name in ["qwen35_resources.py", "setup_qwen35_candidate.py"]}
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
    if guard:
        if shutil.disk_usage(ROOT).free < 10 * 1024**3:
            raise ValueError("Keep ten GiB disk free immediately before native launch")
        guard.require_start()
    process=subprocess.Popen(command,cwd=ROOT,env=environment,stdin=subprocess.DEVNULL,stdout=output,stderr=errors,creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        metadata["pid"]=process.pid
        (out / "metadata.json").write_text(json.dumps(metadata,indent=2),encoding="utf-8")
        while process.poll() is None:
            usage=Memory(); usage.cb=ctypes.sizeof(Memory)
            if memory_fn(int(process._handle),ctypes.byref(usage),ctypes.sizeof(usage)):
                peak=max(peak or 0,usage.PeakWorkingSetSize)
            transcript_file = out / "transcript.txt"
            reason = guard.runtime_reason() if guard else None
            if reason or time.perf_counter()-started > args.deadline or max(stdout.stat().st_size,stderr.stat().st_size,transcript_file.stat().st_size if transcript_file.exists() else 0)>1024**2:
                metadata["error"]=reason or "deadline-or-output-bound"
                stop_owned_process(process)
                break
            time.sleep(.25)
    finally:
        stop_owned_process(process)
        if guard:
            metadata["memory_guard"] = guard.summary()
metadata.update({"elapsed_ms":round((time.perf_counter()-started)*1000),"exit_code":process.returncode,"peak_process_working_set_bytes":peak,"stdout_sha256":sha(stdout),"stderr_sha256":sha(stderr)})
metadata["completed_at"]=datetime.now(timezone.utc).isoformat()
diagnostics=stderr.read_text(encoding="utf-8",errors="replace")
metadata["decoder_schema_warning"]=("JSON schema conversion was incomplete" in diagnostics or "accepting any string" in diagnostics)
if metadata["require_clean_schema"] and metadata["decoder_schema_warning"]:
    metadata["error"]="decoder-schema-warning"
text=re.sub(r"\x1b\[[0-9;]*m","",stdout.read_text(encoding="utf-8",errors="replace"))
if executable == "llama-cli.exe" and (out / "transcript.txt").exists():
    metadata["transcript_sha256"] = sha(out / "transcript.txt")
    try:
        text = parse_cli_transcript((out / "transcript.txt").read_text(encoding="utf-8"), request["prompt"])
    except (ValueError, UnicodeError):
        metadata["error"] = "invalid-native-transcript"
        text = ""
elif executable == "llama-cli.exe":
    metadata["error"] = "missing-native-transcript"
    text = ""
if output_mode == "text":
    metadata["parsed_text"] = bool(text.strip()) and len(text) <= 60000
    if metadata["parsed_text"]:
        (out / "model-output.txt").write_text(text.strip(), encoding="utf-8")
else:
    try:
        if request.get("normalize_numeric_json", False):
            value=decode_structured_reply(text)
        else:
            start=text.index("{")
            value,end=json.JSONDecoder().raw_decode(text[start:])
            if executable == "llama-cli.exe" and (text[:start].strip() or text[start + end:].strip()):
                raise ValueError("The model returned additional content outside its JSON receipt")
        (out / "model-output.json").write_text(json.dumps(value,ensure_ascii=False,indent=2),encoding="utf-8")
        metadata["parsed_json"]=True
    except (ValueError,json.JSONDecodeError):
        metadata["parsed_json"]=False
(out / "metadata.json").write_text(json.dumps(metadata,indent=2),encoding="utf-8")
print(json.dumps({k:metadata.get(k) for k in ["model","runtime","output_mode","elapsed_ms","exit_code","peak_process_working_set_bytes","parsed_json","parsed_text","error"]}),flush=True)
if process.returncode or not metadata.get("parsed_json", metadata.get("parsed_text", False)) or metadata.get("error"):
    raise SystemExit(1)
