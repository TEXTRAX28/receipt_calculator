# Smaller local projector: runnable, insufficient reading quality

4 November 2026. Research parent `06a3480d4e32ef0f3cb4e65a3a2bfcd33871a81b`.
The selected reader, application/test code and production memory limits remain
unchanged. OpenAI remains the user's last resort, with zero requests/spend.

## Outcome

A locally derived Q8 projector saves **306,708,480 bytes** and allows the 2B
candidate to complete two synthetic scans within the unchanged one-GiB runtime
memory floor. Both return structurally valid drafts but fail the frozen literal
qualification. The first omits one explicitly printed quantity; the amount-first
profile omits both. Both invent five unprinted document fields. **Do not promote
this configuration.** The planned five receipt calls and separate invoice call
remain unattempted; they are not counted as recognition failures or successes.

These results concern one familiar non-private synthetic image. There is no
new real-receipt accuracy score, current full-corpus replay, latency distribution,
physical-device result or public-release certification. The parent F16-projector
profiles never delivered a draft, so the quantity errors cannot be attributed
specifically to projector quantization.

## Derivation and provenance

The [pinned quantizer](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/tools/quantize/quantize.cpp)
supports Q8 and a bounded tensor conversion buffer. Its executable help and one
dry run were captured before conversion. Help exits 1 by design; the dry run
exits 0 and creates no asset. This uses the existing verified b11960 runtime,
without installation, replacement or new weight downloads. Three anonymous
public source-file GETs are separate from the zero provider extraction requests.

The source is the existing pinned 668,227,264-byte F16 projector, SHA256
`7035e9cb8d7c6a9681d07eef9a364783e86ea4cd73faab2eabb4f43a101830c7`.
One bounded local conversion uses the verified quantizer, four threads and:

```text
llama-quantize.exe --max-buffer-size 64 --pure <source-F16.gguf> <owned-output.gguf> Q8_0 4
```

The source and existing runtime stay intact. A separately owned partial output
is renamed to a new cache file after successful exit, size/header checks and
hashing. The derivative is **361,518,784 bytes**, SHA256
`3dc9c77a3323342e6a08b85cf715bf8d8d20704fb50723ba2458487703cb9c24`.
The pinned quantizer executable SHA256 is
`3c045bd055736deba6713cd577552917e556e90f4de8757beb42396891cb91d0`.

A bounded metadata-only GGUF inspection verifies all 298 names/shapes and tensor
offset bounds. Ninety-eight tensors convert to Q8; 198 remain F32 and two remain
F16. Metadata differs only in `general.file_type`. The exact recipe, source,
derivative and runtime identities are required by the separate research manifest
and validator. No numerical-equivalence or lossless-quantization claim is made.
The [runtime quantization documentation](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/tools/quantize/README.md)
explains why multimodal components commonly retain higher precision; practical
receipt quality still requires measurement.

## Two finite synthetic profiles

Both use context 8192, output limit 4000, image budget 1536, CPU-only placement,
128/32 batches, four threads, greedy decoding and the fixed seed. Each gets one
predeclared attempt, with a 180-second native and 210-second outer deadline.
Startup remains two GiB for this separate 2B candidate, with an additional
2.5-GiB initial preflight; runtime remains one GiB. The selected 4B three-GiB and
8B four-GiB guards are unchanged. No user app is closed or threshold lowered.

| Profile | Native elapsed | Native process working-set peak | Minimum sampled available RAM, native guard | Native delivery |
| --- | ---: | ---: | ---: | --- |
| Frozen original item order | 44.248 s | 2,061,172,736 bytes | 1,120,960,512 bytes | JSON, exit 0, clean decoder schema |
| Existing app amount-first item order | 44.000 s | 2,061,508,608 bytes | 1,355,694,080 bytes | JSON, exit 0, clean decoder schema |

Outer controller times are 47.124 and 46.615 seconds. Native times include fresh
CLI loading, image encoding and generation with existing filesystem/model caches;
they exclude preparation, the browser and financial interpretation. Sampled
process working set and global available RAM are not whole-app/GPU memory.
Starting headroom differs, so no isolated total-RAM savings or p95 is claimed.

The second profile changes only JSON item property/required order to the app's
existing `description, lineTotal, quantity, unitPrice, ...` order. The local graph
locates the module at `server/local-vision.mjs:L1`; source lines 47–66 were checked
directly. Prompts, image, constraints, assets and native settings stay identical.
This is a source-informed development control, not independent holdout evidence.
The original profile's remaining receipt calls stay stopped after its failure.

| Source-backed synthetic field | Original order | Amount-first order |
| --- | ---: | ---: |
| Correct distinct purchase names | 2/2 | 2/2 |
| Explicit purchased quantities | 1/2 | 0/2 |
| Unit prices | 2/2 | 2/2 |
| Line prices | 2/2 | 2/2 |
| Printed total, currency, receipt discount | all correct | all correct |

Both drafts also report `date="GBP"`, `subtotal="4.30"`, `printedTax="0.00"`,
`pricesIncludeTax=false` and `printedItemCount=2`. None of those document facts is
printed on the inspected source. These proposals are retained as unsupported;
the correct arithmetic total does not certify financial evidence. Strict
application wire-schema acceptance is recorded separately from source correctness.
No expected values, OCR text or currency context enters either native request.

## Verification and next action

Five guard controls pass on the current research source. Changed Python parses,
the exact derivative manifest validates and the local graph stays current.
All 220 application/test files still match the verified 1,339-case checkpoint;
there is no new application-unit, build, browser or full-corpus run. The retained
30-view five-crop baseline is reused only because its 71 interpretation files
are unchanged. Stable/original branches, the original dirty diff and saved root
handoff remain preserved. Seven targeted prior evidence-packet checks pass;
this is not a new full historical retention audit.

Machine evidence: [advanced-qwen35-q8-projector-v1.json](advanced-qwen35-q8-projector-v1.json).
Check it without loading models or credentials:

```powershell
python -X utf8 qa-artifacts/qwen35-projector-quant-v1/seal.py --check
```

Stop this candidate's qualification trials; do not relax the failed literal
criteria or promote it for fitting memory. Return to the selected 4B reader's
prepared independent invoice comparison when its actual three-GiB startup guard
qualifies, respecting the single remaining resume attempt. Broader financial
truth, mobile capture, latest native latency and public deployment/privacy work
remain incomplete. No private external upload or paid API activation occurred.
