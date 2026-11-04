# Local LightOnOCR screen and browser follow-up

4 November 2026; improvement branch, parent `83c4bcc`.

**Keep the existing Paddle / optional independent Qwen reader.** The small
LightOnOCR candidate is executable on this computer with sufficient headroom,
but its five-crop financial results do not justify replacement. Separately,
all 22 previously pending browser protocol cases now pass after a test-only
coupon-review correction. Application implementation and financial gates are
unchanged. The twelve-phase goal remains active.

## Native experiment and retained failures

The candidate is `prithivMLmods/LightOnOCR-3-1B-GGUF`, revision
`ff5c331ec2cfee9de1c8054c21ccf88b8c5b0faa`, Q8_0 weights and Q8 projector,
1,088,895,872 bytes together. The two cached assets are verified against their
manifest before each native launch; nothing is downloaded again. The runtime
is llama.cpp b11960, commit `8642541b255bfb5dc39cd351a178be09013a55d6`.
The manifest and [earlier preparation](SMALL_LOCAL_OCR_READINESS.md) retain the
transfer failure, refused preflight and initial memory-stopped startup.

That first startup remains a failure: minimum available RAM 880,885,760 bytes,
zero output and no financial transcription. A later synthetic run preserves
every item, quantity, unit price, line price, discount sign and total. Only
verbose diagnostics were added; starting headroom increased from 1,669,300,224
to 2,356,654,080 bytes. It finishes in 17.105 seconds, with minimum available
RAM 1,143,369,728 bytes. This is compatibility evidence under different host
conditions, not a demonstrated memory optimization. `--no-repack` was researched
but never run.

Both real-input profiles use the same five development crops: Bristol Costco,
Taiwan Costco, Tesco and two CORD restaurant examples. The sixth screening crop
is held out and receives no new candidate call. Inputs, literal newline prompt,
4096 context, 2048 image-token limit, 1600 output-token limit, temperature zero,
seed, GPU settings and scorer are fixed. Each profile makes one attempt per
input, without retries. The model receives images, not OCR text or references.
Currency is supplied only to a separately labelled offline parser view.

The first profile uses the original benchmark. The second changes only native
`--jinja`, plus audit-only metadata recording the engine and native arguments.
The pinned runtime's [MTMD defaults](https://raw.githubusercontent.com/ggml-org/llama.cpp/8642541b255bfb5dc39cd351a178be09013a55d6/common/arg.cpp)
disable Jinja. The GGUF template is byte-identical to the
[upstream model template](https://huggingface.co/lightonai/LightOnOCR-3-1B/tree/23d544085c886bbdace647bcfab91203299417e2),
SHA256 `0942a43ee0ba48a608814e0b40ac9cb70bcc29ea72f19c84b1bf2597f05aa2bd`.
The second profile's verbose input confirms the template's empty system prefix
is now present. Its synthetic financial control also passes. This correction
does not improve the aggregate field counts below.

In **each** profile, four inputs return nonempty raw output and three pass the
frozen format adapter. Taiwan exits normally with an empty answer; the harness
correctly fails delivery. The second restaurant returns a narrative inside a
`figure` element instead of a reliable item transcription. The adapter rejects
it. Allowing that tag would not establish correct product/financial roles.
Both failures remain in all five-input denominators. The first profile's
coordinator stopped after Taiwan; its remaining three cases were subsequently
attempted once directly. That partial coordinator is not a successful batch.

## Same-input financial comparison

These are **partial source-reviewed development references**, not blind holdout
or complete-receipt accuracy. There are 24 known purchases, 23 known line prices,
14 quantities, 11 unit prices, three item discounts and five printed totals.
The frozen current baseline uses saved native readings, not newly timed runs.

| Method / offline currency context | Product matches /24 | Exact names /24 | Quantity /14 | Unit price /11 | Line price /23 | Item discount /3 | Printed total /5 | Proposed / unmatched rows |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Paddle text, automatic | 22 | 17 | 6 | 6 | 15 | 0 | 1 | 26 / 4 |
| Paddle text, supplied | 22 | 17 | 6 | 6 | 19 | 0 | 3 | 26 / 4 |
| Current hybrid, automatic | 24 | 23 | 14 | 10 | 22 | 0 | 3 | 28 / 4 |
| Current hybrid, supplied | 24 | 23 | 14 | 10 | 22 | 0 | 3 | 28 / 4 |
| LightOn original renderer, automatic | 18 | 15 | 9 | 9 | 15 | 2 | 2 | 23 / 5 |
| LightOn original renderer, supplied | 18 | 15 | 9 | 9 | 18 | 2 | 2 | 23 / 5 |
| LightOn Jinja, automatic | 18 | 15 | 9 | 9 | 15 | 2 | 2 | 23 / 5 |
| LightOn Jinja, supplied | 18 | 15 | 9 | 9 | 18 | 2 | 2 | 23 / 5 |

Paddle evidence views have the same listed counts as Paddle text. Empty-draft
controls preserve every known-price denominator: 30 baseline controls and ten
per candidate profile. All drafts remain untrusted; copied printed totals are
not arithmetic reconciliation. Complete-receipt accuracy is unscorable.
The candidate's two correct coupon fields do not outweigh missing purchases,
wrong prices, extra rows and delivery failures. No provider/default changes.

Native elapsed times include fresh CLI loading, image encoding and generation,
including empty/rejected deliveries. Original profile: 13.065, 5.286, 7.545,
5.034 and 6.289 seconds; mean 7.4438 seconds. Jinja: 11.305, 4.030, 6.787,
4.779 and 4.531 seconds; mean 6.2864 seconds. Nearest-rank p95 with only five
samples equals the maxima, 13.065 and 11.305 seconds. These are small diagnostic
samples with changing host/cache conditions, not a causal template speedup or
an end-to-end latency comparison with the baseline. Maximum native working sets
are 1,387,384,832 and 1,278,885,888 bytes; whole-app/GPU/handset memory is excluded.

## Literal formatting adapter

`receipt_training/scripts/normalize_document_text.py` is a research adapter,
not an application reader. It removes valid model-region framing, decodes HTML
entities and flattens supported HTML/Markdown table cells without changing
numeric punctuation, signs, duplicates or pack-size text. It rejects malformed,
merged/nested/truncated and unsupported markup. Model regions are proposals,
never actual OCR word boxes or confidence. It infers no currency or money.

The adapter policy was declared before private inference; the final source
hash was frozen after the first case ran but before its financial output was
inspected. SHA256
`1f62f3f2e24fe18c660dcfa5ee1d921a2c883726a7baee2643e7184bcaca8946`
remains unchanged across both profiles. Its **19 standard-library tests pass**,
covering financial literals, duplicate purchases, escaped pipes, bounds and
malformed/active markup. These are separate research controls, not a new run
or increase of the application's earlier 1,300-unit result.

## Browser checks now executed

The first actual run completes 20/22 cases. Both failures are the coupon test
waiting for a purchase-list checkbox this fixture does not require. The test
now confirms the first item's discount through its source dialog, verifies its
checks are confirmed, and verifies the second item's discount checks remain
unconfirmed. Purchase facts are unchanged and final confirmation stays blocked.
The source is graph-located at
`tests/e2e/costco-coupon-columns.spec.ts:L142` (`discountChecks`, community 5),
with the review component at `src/ReviewChecks.tsx:L1` (community 0).
No application gate is weakened.

The full same selection then passes **22/22**, no retries/skips/flaky cases,
in 43.736 seconds of Playwright time. Current typecheck passes. The original
application build is reused because all its inputs are unchanged; all 216
application/test files are covered by current typecheck/build witnesses, with
only this one E2E spec differing from the previous checkpoint. The browser
includes 320/390/1440-pixel manual included-fee correction/splitting and
source/coupon/fallback checks. A 320-pixel review screenshot is also inspected.
This verifies saved-response/manual financial protocol and Chrome phone
emulation, not new OCR, a physical phone, Safari or camera accuracy.

## Resources, privacy and reproduction

The existing guards remain: native 1.5 GiB startup / 1 GiB runtime, 180-second
inference / 210-second outer limit; browser 2.5 GiB startup / 1 GiB runtime /
300-second whole-run limit. Exact owned processes are stopped; user applications
are not closed. All new successful runs stay above the runtime floor. Windows
helpers are hidden and receive only finite OS settings; live `.env.local` is
not accessed. The earlier resource-stopped startup stays in the evidence.

This checkpoint makes **12 new local native calls**: two synthetic controls and
two five-input profiles. There are zero new held-out calls, external private
uploads, API requests, API charges or OpenAI requests. Local compute cost is
unmeasured. The user's OpenAI credits remain a last resort; earlier cloud upload
scopes remain consumed. No key setup, quota probe, billing activation or retry
is authorized by this report.

Exact raw requests, outputs, diagnostics, guards and saved parser/scorer results
are under `qa-artifacts/lighton-runtime-memory-v1/`,
`qa-artifacts/lighton-template-v2/` and their named `advanced-ocr` run folders.
Browser failures/successes remain separately under
`worker-shutdown-browser-v2` / `worker-shutdown-browser-v3`, with controller
and typecheck evidence. The new
`advanced-lighton-local-screen-v1.json` packet preserves those exact bytes and
sources. Its check verifies retained current/archive bindings, not a fresh
rehash of the large model weights. The prelaunch checks witness those weights.

For offline reproduction, run the archived parser then field scorer in either
profile folder; root Vite configuration and env loading are disabled. Native
reruns are new attempts and must use fresh output names and unchanged guards.
The Jinja research harness is the original benchmark plus one flag and two
audit fields; helper files are byte-identical. No reference-driven adapter fix
or inference retry is needed to reproduce the recorded scores.

Stable `ee725ba45e799bee8501d3de034e0302c0127afd` and the original dirty
checkout are preserved. No push, merge or deployment occurs. Broader genuine
capture/PDF coverage, automatic mixed-basis extraction, independent full truth,
physical-device evidence and public deployment controls remain open in the
[acceptance audit](GOAL_ACCEPTANCE_AUDIT.md). This study supplies a measured
rejection of one replacement candidate and closes the pending 22-case browser
check; it does not complete the wider goal.
