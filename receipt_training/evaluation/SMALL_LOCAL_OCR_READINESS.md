# Smaller local OCR: verified assets, guarded startup stopped

4 November 2026, continuation of the full OCR improvement goal. **Both
LightOnOCR-3 1B model files are installed and checksum-verified; its first
synthetic startup attempt is stopped by the runtime memory guard.** No
transcription is produced and no private receipt is passed to the candidate.
The failed full-file transfer, initial preflight refusal and successful
chunked transfer are all retained. No model is promoted and the application
reader configuration is unchanged. OpenAI remains the user's last resort.

The [checkpoint packet](advanced-small-local-ocr-readiness-v1.json) retains the
source, failures, controls, prepared requests and saved-output comparison.
Raw artifacts remain local in `qa-artifacts/lighton-compatibility-v1`.

## Candidate and source verification

Five anonymous public source requests succeeded: pinned llama.cpp source files,
LightOnOCR-2 upstream metadata, and two third-party LightOnOCR-3 GGUF inventories.
They require no account, credential, private upload or billing activation.
The downloaded pinned runtime source includes `PROJECTOR_TYPE_LIGHTONOCR` and
its image preprocessing path. The existing runtime archive and extracted files
pass their existing exact-byte verification. This establishes available code
and binary provenance, not successful inference with the candidate.

The selected package is
[prithivMLmods/LightOnOCR-3-1B-GGUF](https://huggingface.co/prithivMLmods/LightOnOCR-3-1B-GGUF),
revision `ff5c331ec2cfee9de1c8054c21ccf88b8c5b0faa`. Its publisher metadata declares
Apache-2.0 and identifies `lightonai/LightOnOCR-3-1B` as the base. The separately
retained upstream revision is `23d544085c886bbdace647bcfab91203299417e2`.

| File | Expected bytes | Published SHA256 |
| --- | ---: | --- |
| `LightOnOCR-3-1B.Q8_0.gguf` | 639,443,584 | `2cf9771aaf236a1c25f389a344510c9ad4daa863e5fdd82651cf7d7834fede1c` |
| `LightOnOCR-3-1B.mmproj-q8_0.gguf` | 449,452,288 | `7bbf40e6f3e91626843fdcbba67c7fe774821f3f0c537dcc8c769026a528839a` |

Combined weight storage is **1,088,895,872 bytes**, excluding the already cached
runtime. Both complete files now match these published sizes and hashes. This
verifies downloaded bytes, not model accuracy. The bounded GGUF prefix declares
the `qwen3` decoder architecture; that prefix is separate from full-file checks.
The alternative 0.8B package's inspected inventory has no projector, so that
package is not a complete image-reader candidate as inspected. Its missing
license metadata is not silently replaced with an upstream declaration.

The upstream 1B model keeps the older architecture and documents image-only
transcription with an empty prompt, or a separate `grounding` mode. The frozen
transcription requests use a newline only to trigger the existing CLI's
single-turn transport, which inserts its own media marker. They contain no
receipt JSON prompt, decoder schema, OCR text, references or currency hints.
No unsupported financial prompt or invented word boxes are added.
[Upstream prompt modes](https://huggingface.co/lightonai/LightOnOCR-3-1B).

## Actual setup outcomes

The first preparation run stops on an assertion matching the guard's reporting
field. Its source, traceback and already prepared bytes are retained. The
correction resumes only byte-identical existing outputs and completes setup;
no inference occurs in either run. The native guard differs from the existing
CPU guard only in its reporting field: it makes no false zero-model-call claim
when supervising an inference child. Its resource and cleanup behavior is
unchanged.

The first full-file attempt takes **300,484 ms** and records `ValueError`; the
parent completes at 301,704 ms without a resource stop. No complete model file
is installed, and its owned partial is removed. A separate HEAD diagnostic sees
the public CDN redirect, without retaining its signed query parameters.

A subsequent **32,768-byte** range probe receives HTTP 206 with the exact
`Content-Range`, GGUF magic and bounded body in **804 ms**. This supports trying
chunked transport; it is not a whole-file transfer or model benchmark. The new
transport uses at most two simultaneous 16 MiB ranges, exact range validation,
full final checksum, the same ten-GiB disk reserve, per-range 30-second and
per-asset 300-second time checks, and no automatic range retries. Its first
launch observes **1,076,838,400 bytes**, below the unchanged
**1,610,612,736-byte** CPU floor, and refuses before creating its child or
making requests. That refused output tag remains consumed.

After an independently qualifying memory observation, a fresh transfer tag
completes. The language file takes 39 range requests / 126,733 ms and the
projector 27 requests / 99,203 ms. Both complete hashes pass. The parent records
**227,534 ms**, 1,896,206,336 initial available bytes, 1,797,652,480 minimum
sampled available bytes, no resource stop and unchanged application sources.
The 66 range requests are one new transport strategy after the retained
full-file failure; they are not disguised as a first successful attempt.

The synthetic criteria are frozen before launch. The native guard then starts
at **1,669,300,224 available bytes**, but samples **880,885,760 bytes**, below
the existing 1,073,741,824-byte runtime floor. It stops its exact owned process
tree after **3,923 ms**. Native stdout is empty; child metadata is an unfinished
startup record, not a successful exit with an absent error. The exact native
PID is subsequently missing, confirming this attempt is terminal. There is
one attempted native startup and zero completed transcriptions. Available
memory is a host observation, not a measured model RAM requirement or an
accuracy result. No development receipt is read by this candidate.

The native runtime floor remains 1 GiB. The separate 8B trial's four-GiB startup
guard and browser's 2.5-GiB startup guard remain unchanged. No user app, tab or
process is closed. No receipt is uploaded or passed to a new model. No API key
or live environment file is opened. Local source bytes and prepared crop bytes
are read only where explicitly needed for comparison preparation.

## Fixed same-image development baseline

The pilot freezes the first five existing identifier-reduced PNG crops:
Bristol Costco, Taiwan Costco, Tesco and two CORD development receipts. The
sixth crop belongs to the evaluation split and is excluded. All image hashes
match the existing Paddle and independent Qwen native readings. No new
candidate has received any of them. The generated synthetic receipt has not
passed the compatibility/resource test; its expected total is a generated
control, not newly annotated real-receipt truth.

The saved readings are replayed through the current parser and verifier with
root Vite configuration and environment-file loading disabled. Thirty views
cover five cases, three methods, and automatic/supplied-currency variants.
The existing strict field scorer uses the unchanged source-reviewed crop
references and matching configuration. Thirty empty-draft controls retain the
known price denominator and score zero matched purchases/prices.

| Method / context | Proposed rows | Matched names / 24 | Known quantities / 14 | Known line totals / 23 | Printed totals / 5 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Paddle text, automatic | 26 | 22 | 6 | 15 | 1 |
| Paddle with source evidence, automatic | 26 | 22 | 6 | 15 | 1 |
| Current hybrid, automatic | 28 | 24 | 14 | 22 | 3 |
| Paddle text, supplied currency | 26 | 22 | 6 | 19 | 3 |
| Paddle with source evidence, supplied currency | 26 | 22 | 6 | 19 | 3 |
| Current hybrid, supplied currency | 28 | 24 | 14 | 22 | 3 |

The hybrid still proposes four unmatched rows and does not attach the three
known coupon fields as item discounts. Correct matched fields therefore do not
establish a correct basket. All drafts remain untrusted. These are current
saved-output results on five partial development crops, not new native latency,
whole-receipt accuracy, the original-fifty result or held-out evidence.
Supplying currency is disclosed user context, not model recognition.

## Continuation

Do not download these assets again. The prepared request and complete files
remain available. Investigate supported runtime memory settings or wait for
more headroom before a fresh synthetic attempt; the existing startup floor
alone did not guarantee sufficient runtime memory. Do not reduce the runtime
floor or repeatedly relaunch into the same resource condition. Any new
configuration must be explicit and retain the failed attempt; use fresh guard
and native output names, keeping the existing 180-second native deadline.
Inspect the complete output and resource result before the five-case screen.
Preserve every failed or incomplete delivery in subsequent reporting.
Keep raw transcription and parsed-field accuracy distinct, particularly if the
model emits Markdown tables. A later grounding comparison must validate model
regions separately and must not manufacture Paddle-style word confidence.

No browser or private-receipt candidate inference occurs in this checkpoint;
the one synthetic native startup attempt is recorded above. The 22 pending
browser cases, broader recognition/capture/mobile evidence and public-release
limitations remain open. Existing application hashes match the previous
1,300-test source; the application suite is not rerun for this research-only
addition. The frozen 119-report historical audit remains a separate scope with
fifteen known gaps. No missing historical bytes are repaired here.
