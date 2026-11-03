# Tesseract floating-weight comparison: prepared, not run

3 November 2026. This is preparation evidence, not a successful OCR benchmark.
The installed browser model, reader defaults and receipt results are unchanged.

The installed English asset comes from `4.0.0_best_int`, rather than the smaller
`tessdata_fast` network. A comparison must therefore describe its starting point
correctly. The official documentation distinguishes floating `tessdata_best`
weights from integerized best weights and the smaller fast network, and requires
the LSTM engine for best/fast data. These older models date from 2017; this is a
precision comparison within Tesseract, not a new vision-language model.
Sources: [official data-file overview](https://tesseract-ocr.github.io/tessdoc/Data-Files.html)
and [best-model details](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-tessdata_best.html).

The Apache-2.0 English floating file and its license were retrieved from the
official repository at commit `e12c65a915945e4c28e237a9b52bc4a8f39a0cec`.
The four public GETs are individually recorded in the ignored
`qa-artifacts/tesseract-best-float-v1/model-download.json`. The model is
15,400,601 bytes, SHA256
`8280aed0782fe27257a68ea10fe7ef324ca0f8d85bd2fd145d1c2b560bcb66ba`.
The installed compressed asset is 2,952,873 bytes / 5,199,098 raw bytes; its raw
SHA256 is `5dc5d8d640a212c9d6184921ba103b186f50e0fed9ee716c53e6b312b400d747`.
Binary-container inspection finds 24 components and the same declared English
version/network string in both files. This does not prove equal outputs or
compatibility with the installed runtime.

A synthetic compatibility probe is prepared for installed Tesseract.js 6.0.1 /
core 6.1.2: the same 900×650 image, OEM 1, PSM 6, local assets, no language cache,
and one owned worker at a time. Worker termination, model/input hashes and setup
versus recognition time would be recorded. It has not executed.

The Node network-denial preload was tested in the root and a worker thread.
Three deliberate fetch/connect attempts were denied, with zero actual
connections and zero model calls. This verifies those JavaScript hooks on that
self-test; it is not OS-level network isolation or an OCR result.

All three probe preflights refused before process creation:

| Preflight | Available RAM, bytes | Required RAM, bytes | Probe spawned |
|---|---:|---:|---|
| v1 | 2,604,089,344 | 2,684,354,560 | No |
| v2 | 2,569,236,480 | 2,684,354,560 | No |
| v3 | 2,625,007,616 | 2,684,354,560 | No |

The existing 2.5 GiB startup reserve, 1 GiB runtime floor and 300-second deadline
were retained. The model download preserved the 10 GiB disk reserve, leaving
11,292,061,696 bytes free at its completion. No user app was closed, no receipt
was read or uploaded for this preparation, no API credential or environment
file was accessed, and no receipt API request or billing activation occurred.

No compatibility, accuracy, receipt latency or model-promotion conclusion is
available. The synthetic probe must pass before a separately frozen paired
receipt protocol is executed. The installed asset must stay unchanged during
that comparison. Its unexecuted preparation does not displace the existing
Paddle/Qwen evidence or establish phone feasibility.

Exact local preparation artifacts and source versions are bound by
`tesseract-float-readiness-v1.json`. Verify the retained packet without running
OCR or accessing a provider:

```powershell
python -X utf8 qa-artifacts/tesseract-best-float-v1/seal_readiness.py --check
```
