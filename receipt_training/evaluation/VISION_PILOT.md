# Local vision pilot — development evidence, not a selected production provider

The pinned candidate is Qwen3-VL-4B-Instruct, Q4_K_M language weights plus its Q8_0 vision projector, using llama.cpp Vulkan build b11960 referenced by release v0.8.0. The [official Qwen model](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF) declares Apache-2.0 and publishes these GGUF components. The [runtime documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/README.md) describes its multimodal encoder/projector architecture and warns that this area is under active development. The chosen CLI itself warns that it is experimental. No public serving or phone inference has been validated.

Seven cases were declared before real inference: the first two CORD development IDs, the first Taiwan Costco sample, Bristol Costco, historical Tesco, the supplied grouped UK receipt as a separate development supplement, and the original nonfinancial control. There are six financial receipts. No original evaluation-set ID was selected. Every vision image panel was hash-checked against the same frozen JPEG bytes used by the OCR candidates. The vision model saw images and a fixed extraction instruction/schema, without OCR text or labels. All inference was local; receipt API charges and external receipt uploads were zero. Hardware/hosting compute cost is unmeasured.

The original 50-receipt comparison remains separate. These small development results cannot replace it. Financial eligibility follows the sealed pilot's declared roles. The control was visually rechecked as a photo-order form with no purchase prices; its original broad `real_receipt=true` / `included_in_pilot=false` metadata remains unchanged. It is scored separately from the six financial cases.

| Six financial pilot receipts | Frozen Tesseract baseline | Current Paddle pipeline | Current docTR pipeline | Qwen v1 | Qwen v2 |
|---|---:|---:|---:|---:|---:|
| Matched products / 55 labels | 3 | 48 | 48 | 15 | 55 |
| Correct line prices / 54 known | 3 | 25 | 24 | 15 | 50 |
| Correct purchased quantities / 55 | 3 | 24 | 24 | 15 | 55 |
| Correct final totals / 6 | 0 | 2 | 3 | 4 | 6 |
| Trusted financial reconciliations / 6 | 0 | 1 | 0 | 0 | 0 |

Application-level failures count as failures, including correct-looking raw fields that could not pass the shared strict schema. On the separate nonfinancial control, the frozen Tesseract baseline proposed one spurious draft purchase; current Paddle, docTR and Qwen each proposed zero. CORD labels can omit modifiers; original manual labels are partial. The supplied transaction has source-checked financial transcription but has already influenced the parser/demo. Its strict description/complete-receipt limitations remain disclosed in the main report.

In v1, Qwen completed syntactically valid JSON for all seven cases, but strict application validation rejected two. The C++ JSON-schema converter explicitly logged that `\d` patterns were unsupported and had been relaxed to arbitrary strings. Tax-rate strings such as `20.00%` then failed the application's numeric contract. A negative adjustment on CORD also exposed a separate contract gap: the shared AI schema could not represent signed receipt rounding, although the manual exact-money engine supported it. These problems were not silently repaired to improve the v1 score; its requests and results remain preserved.

The long Costco output contained 22 proposed purchases against 18 in the images, including three coupon descriptions treated as purchases, and three erroneous summary adjustments. Its schema also failed. Fixing numeric decoder compatibility alone would not prove that its coupon/grouping semantics are correct. This exact model/quantization/prompt/decoder combination has not earned an automatic migration.

In v1, fresh CLI process loading, image encoding and generation averaged **26,319 ms** across all seven cases, with nearest-rank p95 **45,657 ms**. GPU shader caches were warm after synthetic checks. Peak process working set was about **3.43 GiB**; that excludes dedicated GPU memory. These timings include model startup, unlike the CPU-model inference-only measurements, and exclude the original browser preparation and final validation. No end-to-end speed advantage is claimed. Full counts, per-case metrics, source hashes and caveats are in [advanced-vision-pilot.json](advanced-vision-pilot.json).

## Version 2: numeric decoder compatibility and printed rounding

The positive numeric language is unchanged, but its regular expressions now use explicit ASCII digit and dot classes supported by the pinned decoder. A disjoint adjustment union permits a signed amount only for an explicitly printed rounding row. Ordinary prices, discounts and fees remain nonnegative; excessive currency precision and unreadable values still block financial confirmation. The source CORD image was checked for its actual printed negative rounding before adding this capability. The prompt forbids invented balancing adjustments. Both server and browser still enforce the full strict contract.

All seven original pilot cases were rerun with unchanged panel bytes, sample roles, model/runtime and decoding limits. No label or OCR text was supplied. The new harness rejects a decoder warning about relaxed constraints. All seven produced complete JSON, passed strict application formatting and compiled without that warning. Schema and prompt changed together, so their separate contributions are not isolated.

Across the same six financial cases, v2 matched **55/55 labelled products**, with **55/63 item precision**, **52/55 exact descriptions**, **50/54 correct line prices**, **55/55 quantities**, **27/27 unit prices**, **14/21 discounts**, **20/27 grouping relationships**, and **6/6 final totals**. Product labels exist for four of those receipts; the others have partial total-level truth. The photo-order control still produced zero purchases. The original full-corpus results remain separate.

Financial reliability remains inadequate: **0/6 trusted reconciliations** and **0/1 strict complete receipt**. Three financial cases retained unresolved currency evidence. The supplied long Costco transaction still produced **22 purchases against 18 actual purchases**, with four extra rows and incorrect coupon associations. Original partial labels and CORD modifier omissions also limit interpretation of unmatched rows outside that fully checked supplement. Reading the final printed total correctly does not establish that the purchases add up correctly.

The seven CLI runs averaged **33,052 ms**, p95 **56,454 ms**, with maximum process working set about **3.43 GiB** excluding GPU memory. The same timing-scope caveats apply. The small development pilot supports further experiments with this candidate; it does not justify automatic replacement. Detailed counts and immutable source/output hashes are in [advanced-vision-pilot-v2.json](advanced-vision-pilot-v2.json).

A separately generated synthetic image tested fee, VAT and negative rounding. One actual Gemini 3.1 Flash-Lite request returned two correct purchases and independently reconciled **GBP 4.37**, with no private receipt data or paid activation. The local Qwen output passed formatting but also counted VAT as a fee, producing a **5.10** draft against **4.37**; an exact-engine regression now blocks that error. These are protocol checks, not real-receipt accuracy measurements. Actual billing was not independently verified.

## Reproduction on the tested Windows host

The profile is [vision-candidate-manifest.json](vision-candidate-manifest.json). Its three public artifacts total approximately 2.99 GB. Setup verifies official sizes/SHA256 values, extracts the runtime under the ignored model cache, checks archive paths/expansion bounds, and preserves at least 10 GiB free. It reads no receipts and installs nothing globally.

```powershell
python receipt_training/scripts/setup_vision_candidate.py
python receipt_training/scripts/setup_vision_candidate.py --check
```

The tested offline check verified all three assets and all 53 unpacked runtime files. The initial download/extraction was performed by the archived prototype with these same pinned files; a fresh-machine installation of the promoted script was not claimed as tested.

Every private raw run keeps its exact `request.json`, `harness.py`, model/runtime/request/image hashes, stdout/stderr and process time/memory metadata. Preserve the ignored source images and raw artifacts. Repeat one archived request with a **new** run name:

```powershell
python receipt_training/scripts/benchmark_vision_cli.py --request qa-artifacts/advanced-ocr/qwen-pilot-v1-cord-v2-train-001/request.json --run qwen-replay-new --deadline 240
```

The promoted harness was actually exercised on the synthetic fixture, followed by strict schema/financial assertions. This is a benchmark tool, not an HTTP upload service. It strips provider credentials, supplies fixed local model/image paths without a shell, limits context/image/output tokens, bounds logs and deadlines, and stops its owned process tree when necessary. It does not provide an OS sandbox. Requests/outputs remain private and ignored.

Import a sealed pilot for shared browser validation, without changing any financial value:

```powershell
python receipt_training/scripts/import_vision_cli.py --pilot qa-artifacts/advanced-ocr/qwen-predeclared-pilot.json --prefix qwen-pilot-v1 --run vision-import-new
node receipt_training/scripts/evaluate.mjs --split development --structured-run vision-import-new --run vision-validation-new --include-controls
```

The importer verifies declared requests, source panel bytes, raw streams and saved harnesses; it derives the model JSON again from the verified stream and rejects a changed parsed file. The browser applies the existing strict structured receipt and exact calculation code. Source-photo references must refer to supplied originals. It changes only Gemini-specific branding in the shared postprocessor's review messages, never amounts, quantities, source references or uncertainty. The supplied-photo supplement uses its separate manifest and labels, as in the other benchmark runs.

To validate and score the retained v2 outputs under new run names:

```powershell
python receipt_training/scripts/import_vision_cli.py --pilot qa-artifacts/advanced-ocr/qwen-numeric-rounding-v2.json --prefix qwen-pilot-v2 --run vision-v2-import-new
node receipt_training/scripts/evaluate.mjs --structured-run vision-v2-import-new --split development --include-controls --run vision-v2-original-new
node receipt_training/scripts/evaluate.mjs --structured-run vision-v2-import-new --manifest annotations/private/supplement-manifest.jsonl --split development --limit 1 --run vision-v2-supplement-new
python receipt_training/scripts/score.py vision-v2-original-new --output evaluation/runs/vision-v2-original-new/score.json
python receipt_training/scripts/score.py vision-v2-supplement-new --manifest annotations/private/supplement-manifest.jsonl --labels annotations/private/supplement-labels.jsonl --output evaluation/runs/vision-v2-supplement-new/score.json
```

To generate another protocol version, use `node receipt_training/scripts/prepare_vision_protocol.mjs --pilot qa-artifacts/advanced-ocr/qwen-predeclared-pilot.json --version protocol-replay-new`, then run every new plan request with the CLI harness before importing that plan and its matching output prefix. Keep the financial/control roles separate when aggregating results. A stronger candidate or measured independent recovery remains useful next work. Any real private cloud trial still requires the pending explicit upload approval. Paid service activation remains unapproved.
