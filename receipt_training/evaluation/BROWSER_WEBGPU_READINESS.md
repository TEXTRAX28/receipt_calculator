# WebGPU compatibility check prepared, not executed

3 November 2026. The [medium WASM trial](BROWSER_PADDLE_MEDIUM_RESULT.md) missed
its five-minute completion limit. GPU execution is a separate candidate; no
speed or accuracy improvement has been measured for it on this laptop.

The installed official PaddleOCR.js 0.4.2 SDK supports explicit `webgpu`
selection and reports the detection/recognition session providers. Its generic
ONNX Runtime import needs the GPU build: the [ONNX Runtime WebGPU
instructions](https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html) specify
the WebGPU import and explicit provider. The [official SDK
README](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)
also assigns isolated-origin headers and runtime hosting to the caller.
Both primary sources were checked on 3 November. Cached package source and
exports were inspected; no package upgrade or download was needed.

`receipt_training/scripts/probe_browser_webgpu.py` prepares one isolated,
synthetic-only attempt from the exact existing browser runner. It selects the
cached ONNX Runtime 1.31.1 WebGPU entry, serves same-origin cached model/WASM
assets, adds COOP/COEP headers and explicitly requests WebGPU without automatic
WASM fallback. It requires both selected session providers and all six expected
synthetic text lines. Adapter details, raw output and failures are retained.
Selected providers alone do not prove every kernel executes on hardware GPU.

The probe accepts no receipt/capture flags. It permits at most one synthetic
prediction, no retries, no model downloads and no receipt/API requests. The
existing external-origin/non-read request block and environment-file isolation
remain. Only its owned process tree can be stopped. A 90-second deadline and
1 GiB runtime available-memory floor bound execution. The conservative startup
floor is 4 GiB, above the observed medium browser process-tree peak plus 1 GiB;
it is a trial guard, not a vendor minimum or guarantee of GPU-memory fit.
The existing observer does not measure GPU allocations.

The first tiny preparation has valid generated JavaScript syntax, but startup
was refused with **1,903,120,384 bytes available**, below **4,294,967,296** required.
No browser/model process or image inference started. The small Node syntax
check did run. The immutable plan, generated runner, exact dependency/model
hashes, controller source and refusal are retained under
`qa-artifacts/browser-webgpu-tiny-v1-control/`, with declared bindings in
`browser-webgpu-readiness-v1.json`. The model initialization, result checks and
shutdown paths of this new wrapper remain unexecuted.

When resources genuinely permit, start with an unused name:

```powershell
python -X utf8 receipt_training/scripts/probe_browser_webgpu.py browser-webgpu-tiny-v2 tiny
```

Inspect the actual provider metadata, six-line result, request/error ledger,
resource record and exact process-exit state before considering the medium
synthetic check. Do not retry a started prediction or claim receipt suitability
from a synthetic pass. A later genuine comparison needs a separate frozen
protocol. No app/default change, provider upload, quota probe, billing activation
or request to close user applications occurred. The full goal remains active.
