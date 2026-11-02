# 8B trial controls: tested preparation, no model run

2 November 2026. The [six-request development comparison](QWEN8B_FEASIBILITY.md)
remains unrun. No 8B weights were downloaded, receipts inferred, APIs called or
provider promoted. This preparation leaves the application and its default model
unchanged. The full upgrade goal stays active.

The user said they would free resources. Read-only checks at 11:18 and 11:29 UTC
still fail both guards. At 11:29, free disk was 8,233,451,520 bytes and available
physical RAM was 3,251,400,704 bytes. The missing assets plus the existing 10 GiB
reserve need 16,517,492,768 bytes free: another 8,284,041,248 bytes. The 4 GiB RAM
startup guard needs another 1,043,566,592 bytes available. These are snapshots;
they do not establish which applications or files caused the pressure. No user
app, user file or model cache was removed to free resources.

## Implemented controls

`setup_qwen8b_candidate.py` is a separate Windows research installer. Its default
mode reports readiness without downloading. It accepts only the frozen official
revision, ordered model/projector files, exact sizes/SHA256 values and immutable
URLs, plus the pinned existing runtime. The smaller-model installer's original
four-billion-byte cap stays intact.

`--download` requires both startup guards before requests and each missing asset.
Each attempt enforces pinned size/checksum and HTTPS redirects, with a 30-second
network read timeout and a 30-minute monotonic deadline checked after each chunk.
Disk reserve is checked before starting and each chunk. Exclusive cache-local
partials prevent replacing an existing or concurrently created target. Failures
remove only their own partial, without retries. Setup reads no receipt or key
and performs no model inference.

`benchmark_vision_cli.py` automatically guards 8B manifests and verifies the pinned
model/runtime. `--memory-guard` applies the same controls to the paired 4B model;
both comparison candidates should use that flag. Startup requires 10 GiB free
disk and 4 GiB available physical RAM, checked again immediately before launch.
The harness samples physical available RAM every 250 ms while its own CLI runs.
It stops that owned process tree below 1 GiB, on unavailable memory observation,
or at the existing output/deadline bounds. The stop helper requires the exact
Popen child object and cannot accept an arbitrary PID. Dependency hashes, guard
settings and minimum sampled available RAM are retained with the run.

These thresholds are conservative research controls, not published requirements
or proof that model/GPU memory will fit. Sampling can miss rapid allocation. If
the Windows tree-stop utility times out, fallback kills the owned root; this is
not an OS-enforced descendant job limit. No live 8B low-memory condition or peak
model/VRAM usage has been measured.

## Actual verification

Twenty Python tests pass. Fake streams cover successful bounded installation,
truncation, excess bytes, checksum failure, disk pressure, deadline, insecure
redirect, path escape, existing/concurrent targets, manifest mutations and the
unchanged old installer cap. No test uses the network or real model files.
Simulated memory covers startup refusal, runtime floor and unavailable/invalid
observations. A real harmless Python process tree is stopped while a separate
test sentinel survives; root fallback is tested separately. Only test-owned
temporary files/processes are cleaned up.

The actual readiness command reports both gates false. A real harness preflight
using the prepared 8B request refuses the disk reserve before model validation,
receipt-image reads or native launch. This setup refusal consumes none of the
six prepared inference calls. Python compilation passes. No new frontend tests
were needed for this research-only change; the preceding app checkpoint has
874 unit and 189 browser passes, with one existing skip.

```powershell
python -X utf8 receipt_training/scripts/setup_qwen8b_candidate.py
python -X utf8 receipt_training/scripts/test_qwen8b_guards.py -v
```

After measured gates pass:

```powershell
python -X utf8 receipt_training/scripts/setup_qwen8b_candidate.py --download
python -X utf8 receipt_training/scripts/setup_qwen8b_candidate.py --check
```

Before inference, recheck resources, preserve the six-request plan and use the
guard for both candidates. Measure owned-process/GPU memory and preserve every
success, refusal or failure without retries. Source receipts stay local. Three
familiar development cases cannot justify changing the application model.
Resource setup does not authorize paid activation or private third-party uploads.
