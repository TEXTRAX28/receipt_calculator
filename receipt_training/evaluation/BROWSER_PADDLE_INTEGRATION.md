# Enhanced on-device reader integration

This checkpoint implements the official browser candidate measured in
[BROWSER_PADDLE_COMPARISON.md](BROWSER_PADDLE_COMPARISON.md). It is an optional
experimental reader on the improvement branch, not whole-goal acceptance or a
new default. The existing basic reader and configured computer/cloud paths stay
available. Nothing was merged, pushed or deployed.

## Implementation

`@paddleocr/paddleocr-js` is pinned to 0.4.2; ONNX Runtime Web resolves to the
measured 1.31.1. Twenty-one packages were added without running dependency
lifecycle scripts; existing runtime versions were preserved. The optional setup
command downloads the same two official tiny weights and two configurations at
immutable revisions, verifies sizes/SHA256 and builds byte-identical deterministic
ustar archives. Normal startup/build preparation makes no model download.
Models/configurations total 6,299,683 bytes; served tars total 6,318,080 bytes.
The WASM module and loader are copied from the pinned installed runtime and
checksum-verified. These files are served locally; keys and receipts are never
setup inputs. No paid service is activated.

The provider implements the existing extraction interface. Heavy SDK/OpenCV
code runs entirely in a dedicated module worker. It uses one WASM thread, batches
of one, and detector maximum side 960. It decodes an already bounded prepared
image into an OffscreenCanvas, creates a real OpenCV matrix, and uses the SDK's
matrix-input path. This avoids its DOM-only photo converter inside a worker.
Matrices/bitmaps are freed on success and failure; termination releases pending
worker state on cancellation, error and the 120-second deadline. There are no
automatic model retries or automatic cloud fallback.

Only actual detected line fragments, polygons and scores become source regions.
The TypeScript adapter exactly matches the independently implemented Python
adapter on all **56 retained real image sections**, with no new inference in
that comparison. It does not invent character/word boxes or claim the SDK
supplied word hierarchy. Grouping is geometry-only; scores are not correctness
probabilities. The engine identity remains browser tiny WASM; the remote schema
cannot impersonate it. Receipt calculations and allocation code are unchanged.

The production page retains `script-src 'self' 'wasm-unsafe-eval'`; JavaScript
`unsafe-eval` was not added. The development dependency optimizer is restricted
to the application entry. The SDK is excluded from prebundling while shared
OpenCV/Clipper dependencies are included, avoiding duplicate OpenCV instances
and unrelated QA HTML scans. The normal `npm run dev` command was actually
tested, not inferred from a production build.

## Verified app behavior

- **900 unit tests pass**, including 26 new provider, protocol, geometry,
  cancellation, timeout, invalid-output and resource-cleanup cases.
- The full browser suite passes **195 tests with one existing skip**. Its first
  run found an existing Veryfi test that checked a request count before async
  image preparation finished. The test now awaits that request; application
  Veryfi behavior is unchanged, and the complete rerun passes.
- The production build and TypeScript/format checks pass. Vite still reports
  the existing main-chunk size warning and expected large optional model assets;
  OpenCV's unused Node imports are externalized. This is not a small download:
  the UI estimates about 50 MB of reader code/runtime/model files before host
  compression and caching. Model weights alone are not a deployment-size claim.
- Six dedicated production browser cases pass across desktop and Chromium phone
  emulation. A fixed real image, with actual model inference, reaches two correct
  purchases, GBP 6.00 and a checked **GBP 3.00 / 3.00** split, without numeric
  edits. Actual source highlights, worker closure, missing-asset recovery,
  cancellation and preserved uploads are tested. Source-check clicks are test
  actions against a known synthetic image, not independent human validation.
- The upload/review/summary fit a 320 CSS-pixel viewport. Screenshots were viewed.
  These are Chromium measurements, not physical handset or Safari evidence.
- A separate real `npm run dev -- --port 5189` smoke test reads the same image
  through the actual worker and closes it, with no mocked model, external
  requests or HTTP writes.

The first app attempt failed because the wrapper used the SDK's DOM converter
inside a worker. Both recovery/cancellation cases still passed. The corrected
matrix path reached correct scans; a second run then exposed an ambiguous test
selector for a warning displayed twice. Those failed artifacts are preserved.
The final six-case run passes without removing the review requirement.

## Original supplied Costco photos, actual production UI

The separate opt-in local test verifies original file hashes, uploads both
photos through the app, selects the enhanced reader and records the unedited
draft. It blocks external requests and all HTTP writes. The actual scan recovers:

| Complete UK development reference | Result |
|---|---:|
| Matched purchases | 18/18 |
| Exact quantities, unit prices, line prices and discounts | 18/18 each |
| Exact descriptions | 15/18 |
| Correct grouping | 16/18 |
| Printed subtotal / VAT / final total | 163.16 / 13.62 / 176.78 GBP |
| Predicted purchases | 20 |
| Extra overlap purchases / discrepancy | 2 / +1138 pence |
| Strict receipt / trusted reconciliation | 0/1 / 0/1 |

No financial field was edited and no check was confirmed. The confirmation
button remains blocked and source regions are visible. This familiar,
assistant-reviewed development case is not independent human validation.

Observed scan-to-review time was **10,319 ms**, including UI observation but
excluding upload preparation and server/browser startup. The guarded whole test
took 25,150 ms. Its sampled owned Node/Playwright/Vite/Chrome process-tree peak
was **1,755,017,216 bytes**, with minimum available system RAM **2,853,810,176**
bytes. Sampling can miss peaks or count shared pages more than once; GPU and
unrelated programs are excluded. This is not model-only or handset memory.
The observer was a sibling of the test root. The conservative 2.5-GiB startup,
1-GiB free-memory floor and five-minute whole-run bound were satisfied; only
owned processes could be stopped.

## Limits and next work

The original-fifty candidate benchmark remains **103/143** exact line prices
with supplied currency and **19/143** automatically, compared with paired
Tesseract **30/143** and **3/143**. Automatic quantities are still **11/120**.
The app geometry adapter preserves all 56 saved observations exactly, and the
new worker path was verified on the synthetic control and original UK photos.
The original fifty were not each rerun through the complete production UI.
Warm SDK benchmark p95 is not the fresh app or phone latency. All fifty strict
complete-receipt scores remain unscorable because truth is partial.

Conservative overlap recovery, generic currency/quantity extraction, physical
Android/iOS/Safari measurements and independently complete financial truth remain
open. The heavier computer-assisted approach remains more accurate on the known
reference fields. Public authentication/TLS, durable multi-user quotas/retention,
deployment notices and jurisdiction-specific privacy acceptance remain outside
this local checkpoint. The separate 8B trial still has not downloaded or run;
its existing disk/RAM gates are unchanged.

Run `npm run setup:enhanced`, then `npm run dev`, from this improvement worktree.
Select **Enhanced on-device**. `advanced-browser-paddle-integration-v1.json`
binds the measurements and protected Git state; its report builder verifies the
local evidence without calling a model or reading live environment files.
