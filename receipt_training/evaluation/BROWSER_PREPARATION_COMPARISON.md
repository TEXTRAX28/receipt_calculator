# Enhanced reader: genuine-photo preparation comparison

3 November 2026, parent `17fa9c8`. Seventeen new local receipt-section readings
completed through cached PaddleOCR.js 0.4.2 / PP-OCRv6 tiny WASM, plus one
synthetic check. **The results reject automatic crop/straighten selection with
the present overlap assembly.** No app code, cloud request or download changed.

## Fixed scope

Four familiar transactions / five photos reuse the exact original, suggested-crop
and manually straightened JPEGs from [the earlier study](GENUINE_CAPTURE_COMPARISON.md).
Preparation helpers still match the code that produced them. Source regions,
labels and financial references stay unchanged. One near-full-frame control
abstains on both corrections and reuses its original reading twice.

Plan `browser-paddle-preparation-plan-v2` was frozen before inference: ten fresh
receipt-option reads, seventeen sections, one attempt each, one WASM thread,
batch size one and maximum detection side 960. Only images enter recognition.
Current frozen app `paddlePanel`, assembly, parser and device-review functions
interpret saved readings. Automatic and supplied currency remain separate;
every source check stays pending. Preparation changes sampling, dimensions,
scaling and section count together, so this does not isolate homography effects.
It is not a new holdout, original-fifty rerun, physical-phone test or full UI journey.

## Results with supplied currency

IDR/GBP is provided after extraction. Restaurant and UK denominators remain
separate. Copying the final total does not prove the purchase list reconciles.

| Preparation | CORD matched rows /33 | CORD exact names /33 | CORD line prices /32 | CORD final totals /3 | UK predicted rows | UK matched prices /18 | UK exact names /18 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Original | 27 | 15 | 27 | 1 | 18 | 18 | 15 |
| Suggested crop | 28 | 15 | 28 | 2 | 27 | 18 | 15 |
| Manual straighten | 27 | 20 | 27 | 1 | 27 | 18 | 14 |

Crop recovers the fifth restaurant purchase, Gypsy Gelato Ice Tea at 39,000,
with an imperfect name. On the faint restaurant receipt, crop copies grand
total 1,591,600 instead of the 1,346,000 subtotal. Both photographs were visually
checked; existing labels were not edited. Crop retains one of 33 known restaurant
quantities; other options retain zero. Automatic-currency restaurant price
equality remains 0/32 for all options: these supplied-context gains are not
general automatic accuracy.

Original UK photos produce eighteen purchases and calculate GBP 176.78. Both
corrected variants preserve all eighteen matched prices, quantities and unit
prices, but add nine false purchases and calculate GBP 279.87, a GBP 103.09
discrepancy. Printed total remains 176.78. Both genuine rotisserie chickens
remain separate. Missing/misread tax codes and imperfect names persist. All UK
variants stay blocked and strict complete accuracy stays 0/1. Restaurant
references remain unscorable for complete accuracy. No field or check was edited.

## Overlap failure

Each corrected UK photo expands into two overlapping detail windows. Their SDK
readings differ enough to defeat the exact text suffix/prefix join in
`src/lib/receipt-layout.ts:L27`. The enhanced reader calls this assembly without
the preparation windows (`src/lib/paddle-browser.ts:L1`). A separate offline
diagnostic of existing `joinDeviceRows` (`src/lib/device-overlap.ts:L22`) joins
only 6/3 source rows in cropped first/second photos and 4/2 in straightened
photos. These are source rows, not recovered purchases. Partial joining does
not establish that description/amount relationships remain correct.

The next repair must join complete source-supported overlap sequences, preserve
conflicting readings and genuine repeated purchases, and keep original regions.
It needs these retained failures plus unchanged-cohort checks before integration.
No geometry threshold, text normalization, financial rule or automatic
correction was changed to fit this receipt.

## Resources and verification limits

The existing 2.5 GiB startup guard admitted the run at 3,100,024,832 available
bytes. Minimum available RAM was 1,789,009,920, above the unchanged 1 GiB runtime
floor. Sampled owned Node/browser peak was 2,309,775,360 bytes across twelve
observed processes, with no observer errors. Sampling can miss short-lived
processes and excludes GPU memory. This is not model-only or handset memory.
All twelve observed identities had exited; no user process was closed.

The run took 46.53 seconds. Warm UK prediction/decode took 5.90 / 9.42 / 9.85
seconds for original/crop/straighten. Initialization is separate; reused
preparation and offline interpretation are excluded. One small trial does not
establish p95 or a robust speed comparison.

Initial failures remain retained. Preparation v1 assumed an abstaining control
had a `frames` key; v2 accepts its existing omitted field. Offline replay v1
wrote nine unscored CORD variants before rejecting the UK's null currency.
A recorded correction uses the preceding study's explicit GB/GBP and ID/IDR
context and disables unrelated Vite dependency discovery. No image was reread;
frozen app code, references and scoring definitions did not change. The first
failure summary incorrectly said no case had been written; its separate
correction records all nine partial outputs.

Controller protocol checks, syntax/formatting, graph and diff checks pass. App
source/dependencies are byte-identical to `17fa9c8`; this study does not claim
a new app build or regression suite. That checkpoint retains 1,053 unit passes
and 27 selected browser passes. Medium plan v10 changes only two research-runner
hashes; models, cases, scoring, parameters and resource guards are unchanged.
Medium and 8B remain unexecuted.

`advanced-browser-preparation-v1.json` binds the plan/source, seventeen SDK
observations, twelve interpreted variants, twenty-four scored views, failures,
corrections, source review, memory and process-exit checks. Raw receipts/OCR stay
local and ignored. Stable/original Git state remains protected. No cloud scope,
provider or preparation is promoted. The full goal remains active.
