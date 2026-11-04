# RapidOCR Costco development check and parser regression

4 November 2026; parent `d3bb36755d23b7b45703c5ac99806d01cff04b87`.
The twelve-phase objective remains active. The candidate is still experimental.
This adds actual local readings of the familiar supplied Costco transaction,
and closes the previously pending typecheck of the parent parser checkpoint.

## Actual UK receipt result

The exact two previously prepared, identifier-reduced JPEGs were reused: the
485 × 1200 item crop and the 465 × 235 VAT-table crop. Their SHA256 values are
`1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68`
and `adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b`.
These are cropped reading panels, not an end-to-end scan of both original full
photographs. The merchant/date headings and payment identifiers are excluded.

The existing RapidOCR 3.10.0 PP-OCRv6 small settings and model checksums were
unchanged. The new readings were paired with the previously saved Paddle medium
response to those exact same JPEG bytes. Both used the same frozen application
assembler, parser, review checks and financial engine. No provider was called.

| Field | Saved Paddle medium | New Rapid small |
| --- | ---: | ---: |
| Purchases detected | 18/18 | 18/18 |
| Printed quantities | 18/18 | 18/18 |
| Printed unit prices | 18/18 | 18/18 |
| Printed line prices | 18/18 | 18/18 |
| Item coupons and owners | 4/4 | 4/4 |
| Tax-code/grouping checks | 18/18 | 18/18 |
| Exact strings matching the assistant-reviewed descriptions | 16/18 | 16/18 |
| Subtotal, VAT amount, grand total | 3/3 | 3/3 |

The literal amounts are net £163.16, VAT £13.62 and gross £176.78. With GBP
supplied as user context, both produce zero arithmetic discrepancy. This is
parity on one familiar transaction, not a new accuracy improvement over Paddle
or a representative Costco success rate. The eighteen purchase rows preserve
both separate rotisserie chickens. Pack text such as `6X340G` is not substituted
for the printed purchased quantity `1x`.

Both automatic readings leave currency unresolved; supplying GBP is not an OCR
currency success. Three mandatory source checks remain: the purchase-count
classification, the printed VAT-code roles/rates, and whether item prices
exclude VAT. The balanced amount does not clear these checks. Complete financial
receipt accuracy remains unscorable in this partial, assistant-reviewed
reference; no independent human verification is claimed.
The two description-string differences have not been independently adjudicated
as recognition errors.

The two Rapid frame calls took 2,750 ms and 812 ms, 3,562 ms in total. The first
receipt frame is cold. Historical comparable Paddle native timing is absent
from this saved artifact, so it is not reported as zero or used for a speedup
claim. Neither figure is a browser capture/upload-to-split measurement.

## Resource and protocol outcomes

Every actual native profile retains the original 1.5 GiB startup/each-input
and 1 GiB runtime floors, 250 ms outer sampling, 180-second native deadline and
210-second outer deadline. No user application or tab was closed.

| Profile | Actual outcome |
| --- | --- |
| v1, extra-headroom observer | No child launched; maximum observed available RAM 1,769,914,368 bytes. |
| v2, direct native bootstrap | One synthetic call reproduced the earlier control byte for byte, then the first receipt failed its RAM admission. Seven receipt panels unattempted. |
| v3, receipt-only direct bootstrap | Both UK JPEGs returned; the first PNG failed the copied JPEG-only research boundary before OCR. Five panels unattempted. |
| v4, strict research PNG boundary | Nine input controls and all five exact PNG validations pass. Model initialization then leaves too little RAM for the first PNG; zero image OCR calls. |
| later resource observer | No new native profile launched; maximum observed available RAM 1,826,197,504 bytes, below its 1.9 GB scheduling target. |

The v2 optional scheduling observer also stayed below its extra-headroom target.
It was not a native model outcome. The first direct capacity attempt then used
the original mandatory RAM policy; it made only the synthetic call. None of
the private PNG panels has been inferred, and no failed/unattempted reading is
reported as zero-percent accuracy.

The direct bootstrap removes one separate weight-carrier interpreter. It
downloads only the same fixed public wheel before input access, verifies the
full wheel and model checksums in memory, then disables Python networking before
OCR imports and receipt access. Model/wheel/image files are not saved. The
synthetic control hash is exactly
`c3ef4fd243368a9ff6e7ab60e9edd5cb218f0b775ebe7648ac01767eff441d99`,
matching the earlier thirteen-case run. This does not establish a measured
per-process memory saving; ambient RAM varied between runs.

The copied production validator at `server/local_ocr_worker.py:L23` accepts
JPEG. The research PNG helper preserves its path containment, exact SHA, six-MiB
file bound, 4000-side and four-megapixel bounds, and adds single-frame RGB/L PNG
checks. It changes no pixels and does not widen the production upload boundary.
The five remaining sources are Bristol Costco, Taiwan Costco, Tesco, and CORD
development train 003/004. The old evaluation crop test 002 was excluded.

All native child handles are recorded closed. A tagged-process inventory found
only the diagnostic shell at observation time, not an owned lingering study
worker. The laptop reports approximately 16 GiB physical memory. Idle/admission
snapshots varied; later available RAM fell below 1.3 GiB. PowerShell itself had a roughly
100-MiB working set; trying the lighter command shell did not guarantee enough
headroom. This work does not attribute global RAM/disk changes solely to a model.
The ten-GiB persistent-model installation reserve remains unmet.

## Full typecheck and original-50 regression

The full parent TypeScript program passes with the same strict configuration:

```powershell
node --jitless --max-old-space-size=512 node_modules/typescript/bin/tsc --noEmit --extendedDiagnostics
```

It completes in 43.604 seconds under the unchanged RAM guard, with minimum
sampled available RAM 1,167,347,712 bytes. TypeScript reports 468,689 KiB used.
Node's installed option help describes `--jitless` as disabling runtime
allocation of executable memory. This is a compiler-process flag, not an
application runtime change or a reduced checking scope. The earlier 448-MiB
attempt exhausted V8's heap; those logs remain. The parent's full 1,376 tests
across 77 files remain the previously verified test run, not a new rerun here.

The original fifty receipts were replayed using their frozen actual primary
OCR and independent model drafts: 38 development and 12 original evaluation
receipts. No new model inference, image display, label reads or source tuning
used that evaluation set. The separate twelve newly reserved evaluation receipts
remain outside visual review and recognition.

The corrected protocol produces 400 views: two parser snapshots × primary/hybrid
× automatic/known-currency contexts. All 200 before-change views reproduce the
verified historical output after generated IDs are canonicalized. Of the 200
before/after comparisons, 196 full objects are unchanged. Four views of one old
case now retain the explicit preceding count and `@` unit price, with mandatory
source checks. Across all 200 comparisons, description/line-price/discount/tax
code literals, subtotal, tax, tax mode and printed total are unchanged. The
affected views remain blocked by validation; no application tuning followed
these old evaluation results.

The first replay dropped source geometry in its primary path, producing two
historical mismatches. Inspection of the hash-verified historical runner showed
that it passed `{ ...assembleRecognition(evidence), recognition: evidence }`.
The checked-in research helper now preserves that packet too. The corrected
run has zero historical mismatches. Original failed-helper bytes, first outputs
and the correction journal are retained; model outputs/references were not edited.

## Review wording and current verification

The successful UK reading exposed a message bug: a receipt-level purchase-count
classification check was described as a possible negative discount/refund.
The review-message branch now uses the purchase-list check's own explanation,
with a generic purchase-list fallback. Refund-specific branches are unchanged.
The check remains mandatory and its confirmation fingerprint is unchanged.

A real positive-receipt regression checks that the count explanation appears,
balanced arithmetic does not clear the check, and explicit confirmation clears
that check. The current wording change passes all **60 focused assertions**
across parser, printed-item terms and review-check tests, plus formatting.
Its full-suite/typecheck/build/graph follow-ups remain pending resource admission
until recorded otherwise. The successful parent typecheck above must not be
represented as verification of later edits.

Local evidence is retained under `qa-artifacts/rapidocr-costco-v1` through `v4`,
`rapidocr-costco-uk-quality-v1`/`v2`, `printed-terms-original50-v1`/`v2` and
`costco-review-validation-v1`. The original datasets/references, stable branch,
original dirty checkout, frozen old worktree/handoff and pending Gemini source
proof remain protected. No receipt was uploaded externally, no private
configuration was accessed, and no OpenAI credit was used.
The immutable checkpoint is `advanced-rapidocr-costco-development-v1.json`;
it distinguishes the fully typechecked parent from the later focused-tested
wording edit and does not promote the experimental model.

Next: finish the wording checks, freeze the resulting source snapshot, then
resume only the five never-inferred PNG panels after a verified larger RAM
window. Rebase their source proof onto that current snapshot; do not blindly
rerun a stale profile. Broader paired results and a real modular provider/API
integration remain necessary before promoting the smaller reader. Original full
photo, phone and public-deployment verification remain separate outstanding work.
