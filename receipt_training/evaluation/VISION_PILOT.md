# Local vision pilot — development evidence, not a selected production provider

The pinned candidate is Qwen3-VL-4B-Instruct, Q4_K_M language weights plus its Q8_0 vision projector, using llama.cpp Vulkan build b11960 referenced by release v0.8.0. The [official Qwen model](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF) declares Apache-2.0 and publishes these GGUF components. The [runtime documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/README.md) describes its multimodal encoder/projector architecture and warns that this area is under active development. The chosen CLI itself warns that it is experimental. No public serving or phone inference has been validated.

Seven cases were declared before real inference: the first two CORD development IDs, the first Taiwan Costco sample, Bristol Costco, historical Tesco, the supplied grouped UK receipt as a separate development supplement, and the original nonfinancial control. There are six financial receipts. No original evaluation-set ID was selected. Every vision image panel was hash-checked against the same frozen JPEG bytes used by the OCR candidates. The vision model saw images and a fixed extraction instruction/schema, without OCR text or labels. All inference was local; receipt API charges and external receipt uploads were zero. Hardware/hosting compute cost is unmeasured.

The original 50-receipt comparison remains separate. These small development results cannot replace it.

| Six financial pilot receipts | Frozen Tesseract baseline | Current Paddle pipeline | Current docTR pipeline | This Qwen protocol |
|---|---:|---:|---:|---:|
| Matched products / 55 labels | 3 | 48 | 48 | 15 |
| Correct line prices / 54 known | 3 | 25 | 24 | 15 |
| Correct purchased quantities / 55 | 3 | 24 | 24 | 15 |
| Correct final totals / 6 | 0 | 2 | 3 | 4 |
| Trusted financial reconciliations / 6 | 0 | 1 | 0 | 0 |

Application-level failures count as failures, including correct-looking raw fields that could not pass the shared strict schema. All candidates returned zero purchases for the separate nonfinancial control. CORD labels can omit modifiers; original manual labels are partial. The supplied transaction has source-checked financial transcription but has already influenced the parser/demo. Its strict description/complete-receipt limitations remain disclosed in the main report.

Qwen completed syntactically valid JSON for all seven cases, but strict application validation rejected two. The C++ JSON-schema converter explicitly logged that `\d` patterns were unsupported and had been relaxed to arbitrary strings. Tax-rate strings such as `20.00%` then failed the application's numeric contract. A negative adjustment on CORD also exposed a separate contract gap: the shared AI schema cannot represent signed receipt rounding, although the manual exact-money engine supports it. These problems were not silently repaired to improve the score.

The long Costco output contained 22 proposed purchases against 18 in the images, including three coupon descriptions treated as purchases, and three erroneous summary adjustments. Its schema also failed. Fixing numeric decoder compatibility alone would not prove that its coupon/grouping semantics are correct. This exact model/quantization/prompt/decoder combination has not earned an automatic migration.

Fresh CLI process loading, image encoding and generation averaged **26,319 ms** across all seven cases, with nearest-rank p95 **45,657 ms**. GPU shader caches were warm after synthetic checks. Peak process working set was about **3.43 GiB**; that excludes dedicated GPU memory. These timings include model startup, unlike the CPU-model inference-only measurements, and exclude the original browser preparation and final validation. No end-to-end speed advantage is claimed. Full counts, per-case metrics, source hashes and caveats are in [advanced-vision-pilot.json](advanced-vision-pilot.json).

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

The next experiment should fix equivalent numeric-pattern compatibility and signed-rounding representation, then rerun the complete declared pilot before testing a stronger model or claiming an improvement. Any real private cloud trial still requires the pending explicit upload approval. Paid service activation remains unapproved.
