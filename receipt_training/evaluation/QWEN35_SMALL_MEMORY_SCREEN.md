# Qwen3.5 2B: local memory feasibility screen

4 November 2026. Research on improvement parent
`0da3cfbdbece49fda117433d1930e59b5a15820b`. No application, selected reader,
production model, prompt, memory limit or bill-splitting code changed.

## Result

The pinned 2B candidate is installed and verified, but **none of four distinct
synthetic profiles delivered a draft within the existing runtime memory floor**.
The planned five development receipt calls and separate public invoice call
remain **unattempted**, rather than scored as recognition failures. No candidate
was promoted. OpenAI remains the user's last resort, with zero requests/spend.

The four finite native attempts use one non-private synthetic image. There are
no private external receipt uploads, provider extraction requests or live
`.env.local` accesses. Public model/source downloads are recorded separately.
Only owned experiment process trees were stopped; user apps were not closed.

## Candidate and fair comparison preparation

The [upstream Qwen3.5-2B model](https://huggingface.co/Qwen/Qwen3.5-2B/tree/15852e8c16360a2fea060d615a32b45270f8a8fc)
and the [pinned third-party GGUF conversion](https://huggingface.co/unsloth/Qwen3.5-2B-GGUF/tree/f6d5376be1edb4d416d56da11e5397a961aca8ae)
are Apache-2.0. This screen uses the latter's Q4_K_M language weights
(1,280,835,840 bytes) and F16 projector (668,227,264 bytes). Both downloaded once
and matched the published SHA256 values. The combined new weights total
1,949,063,104 bytes. The existing checksum-verified llama.cpp b11960 runtime was
reused without re-extraction, replacement or a global installation.

The research manifest and installer are separate from the production model
configuration. The installer retains the ten-GiB free-disk reserve, bounded
downloads and refusal to overwrite an existing invalid cache file. Its asset
verification is not proof that inference fits physical memory.

Before inference, the study froze the same five prepared development crops used
in the LightOn comparison: Bristol Costco, Taiwan Costco, Tesco and two CORD
training receipts. The sixth, held-out CORD case remains excluded. Each request
preserves its corresponding saved 4B prompt, schema/property order and image.
The original profile uses context 8192, output 4000, image budget 1536, batch
256, physical batch 128, four threads, temperature zero and the fixed seed.
Clean-schema rejection is stricter without changing native inputs. Those saved
4B requests predate the current production row-first schema; this is not a fresh
latest-configuration 4B benchmark or a blind holdout.

A new current-source replay of the saved Paddle/4B readings produced 30 views:
five crops, three interpretation methods and two currency contexts. The
unchanged partial-reference scorer gives the following reusable baseline:

| Method/context | Matched purchases | Correct known line prices | Quantity | Unit price | Printed total |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paddle evidence, automatic | 22/24 | 15/23 | 6/14 | 6/11 | 1/5 |
| Paddle evidence, supplied currency | 22/24 | 19/23 | 6/14 | 6/11 | 3/5 |
| Current hybrid, automatic | 24/24 | 22/23 | 14/14 | 10/11 | 3/5 |
| Current hybrid, supplied currency | 24/24 | 22/23 | 14/14 | 10/11 | 3/5 |

Paddle proposes 26 rows and the hybrid 28; both have four unmatched proposals.
Neither method supplies the three known attached discounts correctly. These
partial fields are not complete-receipt accuracy. Supplied currency is offline
interpretation context, never model input. The first scorer invocation failed
because its old output-path restriction rejected the new study directory; an
unchanged scorer copy at the new location then passed. Both outcomes are kept.

## Finite native results

The 2B research guard requires two GiB immediately before native startup and
preserves the one-GiB runtime floor with 250 ms checks. This is a separate
candidate policy, not a reduction of the selected 4B production three-GiB floor
or the 8B research four-GiB floor. The three subsequent controls additionally
required 2.5 GiB at their initial preflight. No threshold was lowered after a
failed attempt. Each new profile had a frozen one-attempt plan and a specific
diagnostic reason; no unchanged request was retried.

| Synthetic profile | Initial available bytes, outer controller | Minimum sampled bytes | Outer elapsed | Result |
| --- | ---: | ---: | ---: | --- |
| Original automatic offloading, 256/128 batches | 2,387,140,608 | 1,007,427,584 | 6.150 s | Resource stop; no stdout/stderr |
| CPU weights/projector, 256/128 batches | 2,911,895,552 | 979,660,800 | 7.545 s | Resource stop; Vulkan operation buffer remains |
| Strict CPU, no operation offload/fit, 128/32 batches | 2,945,253,376 | 903,335,936 | 5.283 s | Resource stop during projector loading |
| Same strict CPU with weight repacking disabled | 3,088,314,368 | 1,039,376,384 | 5.549 s | Resource stop during image encoding |

The outer controller terminated each owned benchmark/native process tree before
the native harness could write completion metadata. Raw metadata therefore has
no native exit code, completed timestamp or final guard summary. These durations
are failed-attempt controller times, **not successful model inference latency**.
All four stdout files are empty; no model-output draft exists. Separate process
checks confirmed the recorded benchmark/native PIDs were absent afterward.

The second profile's diagnostics show a 523.10 MiB Vulkan language compute
buffer despite CPU weight/projector placement. The fixed strict CPU profile
adds `--device none --no-op-offload --fit off`, reduces batches to 128/32, and
measures a 32.31 MiB CPU language compute buffer. It also creates a 490.50 MiB
CPU_REPACK buffer. The final profile adds `--no-repack`; its logs show no
CPU_REPACK buffer and reach encoding of the 680-token synthetic image, with a
160.51 MiB vision compute buffer. These are specific diagnostic allocations,
not isolated measurements of total or peak application memory. Different
starting headroom prevents an end-to-end RAM savings claim.

The options are supported by the [pinned argument parser](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/common/arg.cpp)
and captured executable help. The [pinned multimodal CLI](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/tools/mtmd/mtmd-cli.cpp)
is an experimental tool; its compatibility does not establish production readiness.

## Verification and next action

Five standard-library guard controls pass: exact startup boundary, unchanged
four-GiB large-reader boundary, immediate recheck, unchanged runtime boundary and
invalid-observation refusal. All changed Python files parse, the manifest pins
validate, and the graph remains current. Application/test source hashes still
match all 220 files from the verified 1,339-case checkpoint; no new application
unit, build, browser, handset or whole-corpus run is claimed or needed for these
research-only changes. Stable/original branches, the original dirty diff and
the user's saved root handoff remain preserved. Prior targeted evidence-packet
checks retain their original exact source bytes through archived versions.

Reproduce the retained evidence check, without downloads/inference, with:

```powershell
python -X utf8 qa-artifacts/practical-vision-memory-v1/seal.py --check
```

The machine record is [advanced-qwen35-memory-screen-v1.json](advanced-qwen35-memory-screen-v1.json).
It binds the frozen plans, failed native outputs/controllers, current-source
baseline and research changes. Large cached weights are verified by the installer
and prelaunch witnesses, not read again by that evidence check.

Stop further F16-projector profiles in the current memory conditions. Before
another native trial, investigate whether the pinned runtime can produce a
smaller locally quantized projector with a reproducible provenance/checksum;
otherwise require genuinely higher headroom or a materially smaller candidate.
Do not repeat a stopped request or lower a guard. A future candidate still needs
synthetic delivery and a predeclared same-source receipt comparison, including
all failures and unmatched proposals, before any app configuration change.
The full twelve-phase objective remains incomplete.
