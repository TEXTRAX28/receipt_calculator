# Bounded model-cache verification and fresh baseline attempt

4 November 2026, parent `795a41195dc5d5db30ee727bbe9e52c1a96b4b44`.
The twelve-phase goal remains active. This implements a measured memory reduction
in cache verification. **It does not establish a new receipt-reading accuracy
gain or make the current local reader fit this laptop reliably.**

## Change and direct measurement

The current graph locates `verifiedModelCache()` at
`server/local-ocr.mjs:L36`. Verification previously read each model file into a
whole-file Buffer. On the existing six Paddle model assets, a dedicated process
retained 76,927,373 additional ArrayBuffer bytes after verification returned;
that allocation remained one second later. A diagnostic garbage collection
released it. This was an isolated cache check with no receipt or model startup.

Verification now reuses one 64 KiB buffer across files. It checks file size,
counts every byte and requires the same SHA256; short reads and the last partial
chunk are handled explicitly. Growth, early EOF and read errors fail closed.
Every opened descriptor closes in `finally`. The same assets still verify.
The matching diagnostic retains exactly 65,536 additional ArrayBuffer bytes.
Explicit garbage collection is used only in these before/after diagnostics;
neither production nor either recognition run uses it.

The production 1.5 GiB startup/private-input admission and 1 GiB runtime floors
are unchanged. No image, OCR model, parser, financial rule, prompt or provider
configuration changes. Nine native-filesystem/crypto controls exercise bounded
reads, short reads, tampering, wrong sizes, missing assets, unknown engines,
descriptor cleanup, early EOF and a growing file.

## Actual fresh-development attempts

All twelve new development sources were prepared before examining new model
outputs. Their original PNGs remain untouched. Research Pillow preparation
uses EXIF transpose, RGB JPEG quality 95 without chroma subsampling, and resizing
only to fit the existing 4000-side/four-megapixel native bounds. No crop,
enhancement, financial-region selection, labels or currency hints are used.
This is not a run of the browser's preparation pipeline.

Two frozen profiles use the **same twelve prepared JPEG hashes**, selected
Paddle assets, four CPU threads and production memory policy. The first is the
old verifier; the second includes the bounded verifier and a 180-second whole
batch cancellation deadline under the 210-second outer guard. Both stop on the
first failure, without retrying it or attempting the other eleven cases.

| Observation | Old verifier | Bounded verifier |
| --- | ---: | ---: |
| Planned receipts | 12 | 12 |
| Attempted requests | 1 | 1 |
| Returned receipt recognitions | 0 | 0 |
| Remaining receipts unattempted | 11 | 11 |
| Production manager error status | 503, memory check | 503, memory check |
| Outer process duration including release | 13.037 s | 6.515 s |
| Minimum sampled available RAM | 1,550,864,384 | 1,540,141,056 |
| Temporary runtime jobs after release | 0 | 0 |

These are direct production-manager invocations, not HTTP or browser journeys.
The durations describe refused requests, not successful inference latency or a
speed improvement. The outer guard did not stop either process; the reader
returned its own memory error. The exact check site and any
worker-side recognition-call count are not independently traced. Zero returned
recognitions is **not zero-percent accuracy**. No new field score is reported.

Both recorded workers close, both runtime directories are empty, and a filtered
process snapshot finds no active Node/Python process using either unique owned
profile path. No user application is closed. The memory-saving change is real,
but it does not resolve the full reader's observed memory refusal. These
profiles are retained; they are not to be blindly rerun under the same conditions.

## Validation and protected state

All **1,371 unit assertions across 76 files** pass through six disjoint batches,
including the prior 1,362 assertion multiset and nine added cases. Coverage
retains repeated formatted titles in parameterized tests. The 73 focused checks,
full 512 MiB-capped typecheck, formatting, isolated build and refreshed graph
checks pass. A temporary low-memory preflight prevented batch two from launching;
after observed recovery, the remaining five batches pass under new labels. The
first passed batch is retained, not counted twice.

All thirteen frontend artifacts exactly match the preceding phone-tested package,
including its explicit post-build copy of unchanged `public/favicon.svg`.
The large public OCR/PDF assets are outside both small artifact packages. This
is byte continuity, not a new browser or hardware-phone test. The current
browser preflight remains below its 2.5 GiB startup requirement.

All 48 fresh image/annotation artifacts reverify. The twelve reserved evaluation
receipts remain outside visual review and recognition. Original references,
scores and split membership remain intact. Stable, original dirty checkout,
detached old comparison worktree, saved handoff and all 84 prepared Gemini source
files remain protected. No private configuration is accessed, no provider upload
occurs, and no OpenAI credit is used by this work.

Local evidence is in `qa-artifacts/cache-hash-memory-v1` and
`qa-artifacts/fresh-primary-development-v1` / `v2`. Exact bindings are in
`advanced-cache-hash-memory-v1.json`. Superseded evidence-helper bytes and failed
logs are retained; coverage handling and the historical favicon-copy step were
corrected without changing test results or model outcomes.

QA temporarily took free disk below the ten-GiB reserve. Automatic review
rejected a recursive cleanup command before execution, returning only
"blocked by policy". No files were deleted. A data-preserving alternative used
[Windows NTFS compression](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/compact)
on the generated QA build and this study's isolated Arrow installation. Every
file hash matches before/after; free disk measured 10,786,426,880 bytes afterward,
restoring the reserve. Source, receipt and production-model environments remain
outside those targets. Large immutable frontend files retain both matching
packages; the seal avoids creating another full duplicate in the blob store.

## Next reader comparison

Primary documentation identifies [RapidOCR 3.10.0](https://pypi.org/project/rapidocr/3.10.0/)
as the current release checked today, with Apache-2.0 software licensing. Its
[release notes](https://github.com/RapidAI/RapidOCR/releases/tag/v3.10.0) describe
lazy model initialization. The [model list](https://rapidai.github.io/RapidOCRDocs/main/en/model_list/)
and [local-model guide](https://rapidai.github.io/RapidOCRDocs/main/en/install_usage/rapidocr/how_to_use_offline_model/)
document PP-OCRv6 routes and local model paths. A smaller runtime footprint is a
testable hypothesis, not a measured advantage here. Nothing is installed or run.

The existing PaddlePaddle exports and RapidOCR defaults require compatibility
review: published hashes differ, and the detector's declared normalization
differs from the [RapidOCR configuration](https://raw.githubusercontent.com/RapidAI/RapidOCR/v3.10.0/python/rapidocr/config.yaml).
Inspect export inputs, recognizer dictionary, preprocessing, thresholds and lazy
loading before reuse. Keep the working Paddle environment intact. The next
action is an isolated pinned-package inspection and non-private synthetic
resource screen under the same guards, followed by the fresh development
comparison only if feasible. Evaluation remains reserved until settings freeze.

Representative Costco photographs, visible financial references, feasible reader
comparison and public-release checks remain outstanding parts of the full goal.
