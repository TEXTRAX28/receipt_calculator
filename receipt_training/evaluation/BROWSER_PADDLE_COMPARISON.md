# Official PaddleOCR.js: real browser comparison

Measured on 2 November 2026, on the improvement branch. This adds an actual
browser-only candidate to the comparison; it does not change the app's reader,
dependencies, parsing, validation, image preparation or bill splitting.

## What ran

The official `@paddleocr/paddleocr-js` **0.4.2** SDK ran in its browser worker,
using ONNX Runtime Web **1.31.1**, WASM, one thread, batches of one and detector
maximum side 960. WebGPU was detected but never selected. The SDK warns that
document preprocessing and text-line orientation are unsupported and ignored;
this experiment does not provide those capabilities.

Two official Apache-2.0 model pairs were checked on the same six-line synthetic
receipt. Cached medium weights worked, but their development-process memory
left little reserve, so no private photos were submitted to that pair. The
official tiny detector and recognizer were then fetched anonymously from pinned
public revisions, checksum-verified, and packaged without modifying weights or
configuration. This was two public model downloads/four public file GETs,
**6,299,683 bytes** including configuration; local tar assets total 6,318,080
bytes. No receipt was sent to a provider and no API key was used.

The npm SDK was installed separately under an ignored experiment cache, with
lifecycle scripts disabled. Installed dependencies occupy 194,551,178 bytes;
that is not a production download size. SDK, worker, OpenCV and WASM overhead
must be considered in addition to the tiny weights. Root package files were
unchanged for these measurements.

Primary documentation:

- [Official browser SDK](https://github.com/PaddlePaddle/PaddleOCR/blob/main/paddleocr-js/packages/core/README.md)
- [Official browser deployment](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/cross_platform/browser.en.md)
- [Official tiny detector](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_det_onnx)
- [Official tiny recognizer](https://huggingface.co/PaddlePaddle/PP-OCRv6_tiny_rec_onnx)
- [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html)

## Fair original-fifty comparison

All original fifty receipts retain their existing splits and v5 partial
financial annotations. The current app prepared all images; every resulting
encoded JPEG hash matches the saved Tesseract v4 paired run. Six older native
model panels had rounded height 2667 instead of current 2666, slightly exceeding
four million pixels. Those older panels were not substituted and no size limit
was weakened. The new preparation has 51 sections for fifty receipts.

The fixed tiny profile was recorded before this full run. All 51 real sections
completed, with zero extraction errors, external browser requests or HTTP
writes. Saved Tesseract observations and new tiny observations were interpreted
by the same frozen current parser, followed by the unchanged scorer and exact
money engine. No values were edited and no checks were confirmed. Country
currency is supplied only after extraction in the explicitly separate context
mode; it is never supplied to the recognizer. These are familiar datasets,
including an already used evaluation split, not a new blind validation set.

| Original fifty, same parser | Tesseract automatic | Tiny automatic | Tesseract supplied currency | Tiny supplied currency |
|---|---:|---:|---:|---:|
| Matched annotated purchases / 145 | 37 | 107 | 37 | 107 |
| All predicted purchases | 82 | 131 | 82 | 131 |
| Exact descriptions / 145 | 24 | 72 | 24 | 72 |
| Exact quantities / 120 | 1 | 11 | 1 | 11 |
| Exact unit prices / 31 | 1 | 9 | 1 | 11 |
| Exact line prices / 143 | 3 | 19 | 30 | 103 |
| Exact final totals / 49 | 1 | 2 | 9 | 25 |
| Exact tax amounts / 22 | 0 | 1 | 2 | 10 |
| Trusted reconciliations / 49 | 0 | 0 | 0 | 0 |

Detection precision is 107/131 and reference recall 107/145 for tiny, versus
37/82 and 37/145 for this paired Tesseract replay. Complete-receipt accuracy is
**unscorable for all fifty** because full financial truth is incomplete. Do not
report fifty perfect receipts or a verified financial accuracy percentage.

With supplied currency, tiny line prices are 92/121 on 38 development receipts
and 11/22 on twelve evaluation receipts. Tesseract gives 27/121 and 3/22. The
five Costco receipts have only nine annotated line prices: tiny recovers 7/9
and no final totals, versus Tesseract 0/9 and no final totals. This small partial
Costco denominator does not establish retailer-wide accuracy. The 45 other
receipts give 96/134 tiny line prices versus 30/134 Tesseract.

These results support integration testing as an optional device reader. They do
not beat the existing heavier computer-assisted approach: its separately
measured current replay reaches 133/143 prices and 119/120 quantities with
currency context. The browser candidate still needs better quantity/role and
currency handling, source review, cancellation/failure tests and real mobile
measurement. No default or production provider was promoted here.

## Separate real-photo development study

The same original prepared JPEGs from the genuine-capture study were also read:
three CORD transactions and the supplied two-photo UK Costco transaction. These
denominators remain separate from the original fifty above.

On the three CORD receipts, tiny matches 27/33 purchases and 27/32 known line
prices with supplied currency; original docTR matches 29/33 and 29/32, while
original Tesseract matches no purchases. Tiny finds one of three totals;
docTR finds two and Tesseract none. Automatic currency remains unresolved for
these CORD cases, so their automatic exact-money counts remain zero.

On the supplied UK Costco transaction, tiny recovers all **18 annotated
quantities, unit prices, line prices and discounts**, plus printed total
**GBP 176.78**, VAT **13.62** and subtotal **163.16**. It predicts twenty
purchases: the parser conservatively retains two purchases duplicated in the
overlapping second photo. The discrepancy is **+1138 pence**. Exact descriptions
are 15/18, grouping 16/18, and strict receipt accuracy remains **0/1**. All drafts
remain blocked. Good OCR does not authorize ignoring an overlap discrepancy.

SDK detections are actual text-line fragments with actual polygons and scores.
Their axis-aligned envelopes are normalized; the existing native reader's
geometry-only `reading_lines` groups adjacent fragments. No artificial word or
character boxes are created, no prices are repaired, and the engine remains
`paddle-ppocrv6-tiny-browser-wasm`, distinct from native medium Paddle. The shared
panel shape is validated without impersonating an accepted remote engine.

## Timing, resources and failures

The full fifty used one warm worker after a synthetic compatibility gate.
Mean prediction/decode time was **878.68 ms** per receipt, median **692.35 ms**
and nearest-rank p95 **2439.40 ms**. These exclude model initialization,
preparation and offline parsing. Import/SDK initialization was **5042.10 ms**.
Do not compare these figures directly to historical fresh-worker Tesseract
end-to-end times or native CPU-only times.

The guarded full run completed in 53,501 ms; minimum available system RAM was
2,303,045,632 bytes. Its sampled owned Node/Vite/Chrome process-tree peak was
2,408,321,024 bytes. This includes development tools, can count shared pages
more than once, excludes unrelated processes/GPU memory and can miss brief
peaks. It is not model-only memory or a measured phone requirement. The guard
required 2.5 GiB available at startup and stopped only its owned tree if free
RAM fell below 1 GiB or the 300-second deadline/output bound was exceeded. It
did not stop a user app. It is a research guard, not a vendor requirement.

The first preparation-only attempt processed 49 receipts, then correctly failed
the app's MIME/signature check because the harness declared Bristol's WebP file
as JPEG. That attempt made no OCR calls. The MIME selection was corrected in
the harness; a separate v2 preparation completed with all fifty hashes verified.
The failed artifacts remain; its explanatory note is explicitly retrospective.

The medium and tiny synthetic controls each recovered all six lines. Medium
took 16.36 seconds including import/startup/prediction, tiny 5.99 seconds, with
different development-process peaks. These controls show compatibility only.
There were **56 fresh real image-section inferences and four synthetic
inferences** across this experiment. No third-party receipt uploads, paid
activation or automatic retries occurred. Local API cost is zero; actual compute
cost and energy were not measured.

The separate 8B trial remains unstarted. The latest check required 16,517,492,768
free disk bytes before its missing assets and existing reserve could fit; disk
was below that threshold. The browser experiment does not relax that guard.

## Reproduction and next action

Scripts under `receipt_training/scripts` prepare pinned public models, run the
guarded browser probe, preserve SDK observations, adapt actual geometry, replay
the frozen parser and score using unchanged labels. Exclusive output directories
and source snapshots preserve old runs. `advanced-browser-paddle-v1.json` binds
the local results, input/source hashes, pinned model metadata, resources and
protected Git references; run `build_browser_paddle_report.py --check` to verify.

The next action is bounded app integration and production-bundle testing of this
optional reader, preserving Tesseract fallback and all source/financial review.
Physical Android/iOS, Safari, broader long-photo coverage and independently
complete financial truth remain required before a mobile/default claim.
