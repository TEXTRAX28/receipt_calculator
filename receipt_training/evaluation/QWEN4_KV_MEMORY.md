# Selected 4B Q8 cache: allocation verified, runtime still does not fit

4 November 2026. Parent `f59713200d726962e92a0a71eb98f3549954fddb`.
No application/test source, default reader, production memory limit or existing
model asset changed. OpenAI credits remain unused and reserved as the last resort.

## Distinct experiment and result

The default invoice resume series remains exhausted at two native attempts.
This is a separate, predeclared profile with the same selected 4B weights,
projector and b11960 runtime, adding only:

```text
--cache-type-k q8_0 --cache-type-v q8_0 --flash-attn on
```

Diagnostic verbosity is also enabled. Each request keeps its original image,
prompt, schema/property order, context 8192, output limit 4000, image budget 1536,
256/128 batches, four threads, greedy decoding and fixed seed. The five planned
development requests preserve the older saved 4B schema order for comparison;
they are not a current production-reader rerun or a blind holdout. The separate
invoice request keeps its already frozen amount-first schema.

One non-private synthetic attempt passed the 3.5-GiB initial preflight and the
three-GiB immediate native guard, matching the selected reader's production
startup floor. Runtime remains one GiB with 250-ms checks. The native and outer
deadlines remain 180 and 210 seconds, and the ten-GiB disk reserve stays intact.
An explicitly requested legacy four-GiB guard is still honored. No guard is
lowered, user app closed, new weight downloaded or receipt uploaded.

The runtime allocates **612.00 MiB** of Q8 KV storage, with **306.00 MiB each
for K and V**, at 8192 cells and 36 layers. Flash Attention is enabled. Its logs
also show a 2375.91 MiB Vulkan model buffer, 304.28 MiB mapped CPU model storage,
98.77 MiB Vulkan compute buffer and 14.58 MiB host compute buffer. These diagnostic
allocations are not a measurement of whole-application or total physical RAM.

The outer controller begins with **3,980,161,024 available bytes** and observes
a minimum of **849,547,264 bytes**, below the unchanged 1,073,741,824-byte floor.
It stops the owned benchmark/native tree after **9.603 seconds**, during the
language-model empty-run warmup, before image encoding. Native stdout is empty;
there is no draft, completed native metadata, terminal native exit observation,
recognition score or successful latency measurement. Recorded PIDs are absent
afterward. The remaining five receipt calls and separate invoice call are
**unattempted**. This profile is stopped and is not promoted.

## Source checks and estimate

The [pinned KV cache implementation](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/src/llama-kv-cache.cpp)
allocates separate typed K/V tensors. The [Q8 block definition](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/ggml/src/ggml-common.h)
uses a 32-value block and a two-byte scale. The [pinned context implementation](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/src/llama-context.cpp)
requires Flash Attention for quantized V; the actual native allocation verifies
that this run accepted the requested cache types. It does not prove end-to-end
hardware compatibility after warmup.

The [official model configuration](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct/blob/ebb281ec70b05090aa6165b016eac8ec08e71b17/config.json)
has 36 layers, eight KV heads and head dimension 128. At one 8192-token context,
the analytical K+V storage is 1,207,959,552 bytes for F16 and 641,728,512 for Q8:
a **566,231,040-byte (540 MiB) theoretical difference**. The Q8 allocation matches
that estimate. There is no paired measured F16/total-RAM savings claim; weights,
vision, allocator/driver overhead and other resident buffers still need memory.
Six public source captures and their hashes are retained separately from zero
provider extraction calls.

## Current free-cloud preparation

The current [two-crop Gemini plan](GEMINI35_UK_MULTIPART_PLAN.md) is refreshed in a
new v3 directory with unchanged identifier-removed item and VAT-table JPEGs.
Its body/source proof is prepared offline, with no credentials loaded or upload.
The partly visible pound symbol in the clipped savings line is now described
accurately. The old v2 preparation remains historical and must not execute.

The research CLI now validates the exact approval/source proof **before asking
its credential callback for a key**. Ten offline transport controls pass,
including two new checks for that ordering. No live key is read in those tests.
Application provider consent and finite allowances remain unchanged.

Google documents [daily quota resets at midnight Pacific](https://aistudio.google.com/docs/rate-limits).
That does not prove the user's active quota or billing tier. A fresh exact-scope
upload approval and confirmation of one remaining Free request are required.
No Gemini, OpenAI or other provider extraction was made in this checkpoint.

Eight fresh offline views replay the unchanged same-crop Veryfi, Paddle and Qwen
readings through the v3 frozen current application. The unchanged scorer and
assistant source-checked reference preserve the financial comparison: with GBP
supplied after extraction, primary Paddle and Veryfi text produce 18 purchases,
four attached coupons and 176.78; Qwen alone proposes 23 rows/193.39, while the
hybrid proposes 20/181.25 with only three attached coupons. Financial score fields
are identical to the older eight views. Current primary Paddle interpretation
adds one pending item-count/list classification check in each context and one
blocking issue with supplied GBP; no check is cleared. This is an existing-source
review difference, not a new implementation or recognition gain. The new Gemini
result remains unmeasured.

## Verification and next action

Five new cache-profile controls pass: exact asset identity, unchanged budgets
and placement, clean structured decoding, three-GiB/legacy boundaries, and
runtime/invalid-memory refusal. All 220 application/test files remain identical
to the verified 1,339-case checkpoint; no new full app suite, build, browser,
phone or corpus run is claimed. Nine prior targeted evidence checks pass, with
exact earlier source retained in the evidence archive. Stable/original Git
state and the saved root handoff are preserved.

Machine evidence: [advanced-qwen4-kv-memory-v1.json](advanced-qwen4-kv-memory-v1.json).

```powershell
python -X utf8 qa-artifacts/qwen4-kv-q8-v1/seal.py --check
```

Do not repeat this stopped profile or shorten its receipt/context scope to make
it pass. The prepared Free-only Gemini test can proceed only after its explicit
approval/quota gate. While that is pending, primary-worker resource handling and
crash-safe job ownership/cleanup remain meaningful local work. Complete financial
truth, physical capture and public deployment/privacy requirements remain open.
