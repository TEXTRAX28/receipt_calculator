# Genuine-photo preparation comparison

2 November 2026. Research on `feature/advanced-ocr-vision-ai`; application behavior
is unchanged. The result **does not justify automatic crop/straighten selection**.
The full upgrade goal remains active.

Four familiar development transactions use five original photographs: three
CORD receipts (faint/tilted, coupon/card payment and a near-full-frame control)
and the supplied two-photo UK Costco transaction. Source appearance, frames,
input hashes and unchanged v5/UK-v2 reference hashes were frozen before new OCR.
The two chosen CORD frames enclose all 170 available visible upstream word boxes.
The UK envelopes are assistant source review, not independently verified corners.
Some paper extends out of frame or curves; a selected visible section does not
establish the physical paper's true proportions or recover clipped/blurred text.

The actual browser helpers prepare original, suggested rectangular crop and
manually selected straightened copies. They preserve original bytes and use the
actual bounded workers/panel plans. The control abstains for both corrections;
its saved original reading is reused without two additional inference calls.
There are ten fresh receipt-option reads and seventeen image sections per engine.
English Tesseract runs in 390px desktop Chrome; cached CPU docTR independently
reads the **exact same JPEG hashes** with Python socket connections denied even
during initialization. No labels or first-reader text enter either recognizer.

These are preparation-option comparisons, not isolated homography effects.
Cropping also changes contrast, scaling and panel planning. Straightening changes
sampling, dimensions and white margins. This harness invokes the real helpers
and computer-reader assembly/parser; it is not a full UI click journey, a new
holdout, physical-phone testing or a replacement for the original-fifty benchmark.

## Measured fields with supplied currency context

The three CORD receipts and the UK supplement stay in separate denominators.
Explicit currency is applied after extraction and is not recognized currency.
Automatic-mode counts are retained separately in the machine evidence.

| Reader / preparation | CORD matched rows /33 | CORD line prices /32 | CORD final totals /3 | UK line prices /18 | UK final total /1 | UK predicted rows |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Tesseract / original | 0 | 0 | 0 | 0 | 0 | 0 |
| Tesseract / crop | 1 | 0 | 0 | 0 | 0 | 1 |
| Tesseract / straighten | 4 | 3 | 0 | 5 | 0 | 17 |
| docTR / original | 29 | 29 | 2 | 18 | 1 | 20 |
| docTR / crop | 29 | 29 | 1 | 18 | 0 | 20 |
| docTR / straighten | 29 | 29 | 1 | 18 | 0 | 29 |

docTR copies all eighteen UK quantities and unit prices in each option. Exact
names remain 17/18. Its CORD exact names fall 21/33 → 19/33 after straightening;
quantities remain weak (0/33 original, 1/33 after either correction). Automatic
docTR CORD line-price equality is 0/32 for every option because currency remains
unresolved. Thus the supplied-currency table is not general automatic accuracy.

All variants stay blocked by validation; the UK strict complete score is 0/1
for every reader/option. The CORD labels remain incomplete for that metric.
No check was cleared and no merchant, product or monetary field was edited.
Original cohort labels, splits and permissions are unchanged.

The traces identify both recognition and assembly limitations. Some inclusive
total headings become `TOTALCINCL VAT`, and corrected copies can lose a total's
leading digit/decimal. Exact adjacent-window matching leaves repeated rows when
the overlap differs, while conservative cross-photo matching abstains when its
required footer evidence is not recognized. The known-window helper exists in
`src/lib/device-overlap.ts:L22`; computer recognition currently assembles through
`src/lib/receipt-layout.ts:L24` without those preparation-window mappings.
These graph/source-verified observations identify follow-up work; they are not
repairs in this checkpoint. Missing amounts must not be filled by balancing.

## Timing, resources and limits

Tesseract's UK options take 9.43 / 8.56 / 7.95 seconds including preparation,
reading and source checks. docTR's UK native inference alone takes
26.76 / 40.55 / 40.47 seconds; model initialization adds 23.18 seconds separately.
The scopes are different and these small development samples do not establish
p95, a controlled speed win or handset performance.

docTR startup required its previous measured peak plus one GiB reserve, rather
than the separate 8B trial's four-GiB guard. The native process reports an OS peak
of 1,379,475,456 bytes. Minimum sampled system-available RAM was 1,856,602,112
bytes, above the one-GiB stop floor. The controller's 4,304,896-byte counter is
only its Windows venv launcher, **not model or process-tree memory**; the explicit
scope correction preserves that observation. GPU/whole-app memory is unmeasured.

There are 34 fresh image-section inferences total, zero external receipt uploads,
zero new model files and no retries. Python socket denial is not an OS sandbox.
The 8B comparison remains unrun and gated on resources. No provider is promoted.
The latest app checks remain 874 unit and 189 browser passes, with one existing
skip; unchanged application code did not need another full suite for this study.

## Reproduce with retained local sources

```powershell
python -X utf8 receipt_training/scripts/prepare_capture_accuracy.py genuine-capture-plan-new
node receipt_training/scripts/benchmark_capture_accuracy.mjs genuine-capture-read-new genuine-capture-plan-new
python -X utf8 receipt_training/scripts/score_capture_accuracy.py genuine-capture-read-new
python -X utf8 receipt_training/scripts/benchmark_capture_doctr.py genuine-capture-read-new genuine-capture-doctr-new
node receipt_training/scripts/replay_capture_doctr.mjs genuine-capture-doctr-parsed-new genuine-capture-read-new genuine-capture-doctr-new
python -X utf8 receipt_training/scripts/score_capture_accuracy.py genuine-capture-doctr-parsed-new
```

Use fresh output names. Existing ignored originals, references, model environment
and pinned cached weights are prerequisites. A clean-install reproduction was
not performed. Raw images, OCR, frames, detailed scores and process logs remain
local/ignored. The original checkout and stable reference remain protected.
