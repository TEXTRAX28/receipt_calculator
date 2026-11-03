# Published Costco refund: signed-product recovery

3 November 2026. A new public purchase/refund pair exposed a real classification
failure: both device readers copied the signed returned-product row, but the
parser proposed a receipt-wide discount and no product. An explicit refund
heading now supports a **pending signed-product proposal**. This improves one
published format; it does not establish a verified bill or general refund accuracy.

## Source and reference boundary

Thrifle publishes the pair as the author's own Costco transaction. The downloaded
WebP files are publisher-edited/redacted images, not independently authenticated
original camera captures. The purchase image visibly fades several other rows.
Both documents belong to one transaction family and remain outside the original
fifty. Rights remain with the publisher; images and detailed observations stay
local and ignored by Git. Residual payment/transaction identifiers prevent any
claim that the images are anonymous or cleared for third-party processing.
[Publisher and image provenance](https://thrifle.com/blog/costco-90-day-electronics-return-policy).

Both exact images were inspected and reference values recorded before the first
scanner invocation. Article financial claims had already been read. This is
assistant visual annotation, not an independent human transcription or blind
holdout. The reference pins both original hashes and leaves unprinted quantities,
unit prices and uncertain financial facts unknown. The purchase control covers
only the clear monitor row and printed summary, not every faded purchase.

## Measured change

The table uses USD explicitly supplied to postprocessing. No country/currency
hint, expected value or previous output reaches either OCR provider. Automatic
processing preserves the same strings but leaves the dollar currency unresolved.

| Refund draft | Proposed products | Correct signed target price /1 | Product misclassified as a discount | Copied subtotal | Copied tax | Copied final total |
| --- | ---: | ---: | ---: | --- | --- | --- |
| Basic, before | 0 | 0 | 1 | −499.99 | −4312, wrong | missing |
| Basic, after | 1 | 1 | 0 | −499.99 | −4312, wrong | missing |
| Enhanced, before | 0 | 0 | 1 | −499.99 | −43.12 | −543.11 |
| Enhanced, after | 1 | 1 | 0 | −499.99 | −43.12 | −543.11 |

The signed line price is **−499.99**. The basic reader's lost decimal points are
not repaired using the total. The enhanced reader already copied the summary
correctly before the fix; those copied totals did not prove correct item roles.
All four before/after provider/image pairs have identical prepared JPEG hashes
and literal OCR text. Only the parser library changes in this core comparison.
Sixteen processing views represent eight successful extraction observations of
two related documents, not sixteen receipts.

The purchase control is unchanged: enhanced retains the monitor's positive
499.99 line, while basic still misses that target. Other faded purchase rows are
outside this partial reference. Raw draft descriptions still contain the SKU;
the existing scorer's description normalization must not be mistaken for a raw
name-cleanup improvement.

## Implementation and source review

`parseReceiptWithSources()` at `src/lib/parser.ts:L57` recognizes narrowly
anchored refund/return/credit-document headings. It uses them only to resolve an
otherwise ambiguous, explicitly negative generic product row. It does not change
positive prices, invent quantity/unit price, reinterpret named coupons, change
tax rates or make an unreadable amount balance. Documents without such evidence
keep the existing ambiguous-discount check.

The new product retains both its price-row and refund-heading source indices.
Both readers provide actual rectangles for these two source rows. Its signed
line total receives a mandatory classification check. The production source
dialog shows both regions; opening/closing it does not confirm the check or
change the receipt. Original images and unknown quantities remain intact.

`reviewMessage()` at `src/lib/review-checks.ts:L98` now describes item-level
classification as checking the signed product and refund heading. Receipt-level
ambiguities retain their existing adjustment wording. Under the existing 460px
CSS rule, an item price with an error spans the available row and its calculated
cost moves below it. This avoids the narrow error column seen in the first
320px capture, without replacing the app's styling system or adding dependencies.

## Current validation

All **1,119 unit tests pass with zero skips**, including fifteen new regression
cases. Ninety-one focused tests, typecheck and isolated build also pass. This
supersedes the earlier parser-only 1,118-test checkpoint.

The final production phone journey performs a genuine enhanced-reader upload
and scan, opens the source dialog, and checks 320px/390px views of the same scan.
Both review and source screens fit without horizontal overflow. The price-error
text uses 230px/300px respectively and remains linked through `aria-describedby`.
Both actual source rectangles display. No field is edited or source checkbox
confirmed; receipt confirmation stays disabled, the receipt stays identical
after source inspection, and the owned reader worker closes. Screenshots were
inspected locally. This is emulated desktop Chrome, not physical Android/iOS.

The current original-fifty paired replay contains 400 views. Every before/after
scored count is identical; the same references and matcher remain in use. No new
inference or label revision is made for those fifty. All 200 paired field vectors,
warnings and pending checks are explicitly unchanged on the final libraries too.

Two failures remain visible. The first full-suite attempt hit an incorrectly
short 120-second outer deadline, below the previous run's 163 seconds; its
terminal result is retained before an unchanged-memory-limit rerun. A benchmark
dependency-discovery change then broke both enhanced worker starts in run v2.
The corrected v3 restores the required OpenCV/SDK handling; both providers
succeed and reproduce v1's exact reading text. These harness failures are not
silently removed or reclassified as bad receipt-recognition scores.

A full historical-manifest re-audit also exceeds its 120-second allowance and
produces no completed audit result. A targeted check verifies all 187 existing
evidence declarations naming the six changed tracked files, using exact archived
bytes where appropriate, with no gaps in that scope. The thirteen previously
disclosed legacy missing declarations remain unresolved; a fresh full-manifest
verification is not claimed.

The final phone scan-to-review observation is 4.706 seconds on this host.
Its sampled owned Node/browser process-tree peak is 1,347,682,304 bytes; the
earlier unbounded dependency scan made the baseline tree peak 2,158,137,344 bytes.
These include development/browser processes and exclude GPU/unrelated memory;
they are not model-only memory, handset requirements or latency distributions.
The existing 2.5 GiB browser startup and 1 GiB runtime reserve remain unchanged.
No model download, private external upload, provider API request or billing
activation occurs. The local downloader saves two public images totalling
93,712 bytes. A read-only Windows PID/creation-FILETIME check confirms all 71
observed study process identities have exited; no user process is terminated.

## Reproduction and remaining gaps

Private original images, the preread reference, native observations, exact
prepared panels and source snapshots are required in this populated checkout.
Keep historical run names intact. For a new local core observation:

```powershell
python -X utf8 receipt_training/scripts/guard_refund_receipts.py public-refund-costco-read-v4
python -X utf8 receipt_training/scripts/score_refund_receipts.py public-refund-costco-read-v4
python -X utf8 receipt_training/scripts/score_refund_receipts.py public-refund-costco-read-v3 --check
```

The core v3 comparison isolates the parser change. The scorer also permits the
known review-wording change used by the final phone build; other changed
libraries or different OCR text/assets require a new preserved comparison.
`--check` recomputes the saved scores without overwriting them. No historical
result is overwritten.

`qa-artifacts/public-refund-costco-v1` retains provenance/reference; the `read-v1`,
`read-v2` and `read-v3` folders retain every extraction attempt. `phone-v1` and
`phone-v2` retain both production UI observations. Resource controllers, logs,
memory observations and validation folders are bound by
`published-costco-refund-v1.json`. Original-fifty replays are separately retained
as `grouped-amounts-v16` and `grouped-amounts-v17`.

Neither document is eligible for strict complete-receipt scoring. The refund
still needs the dollar currency, unprinted purchased quantity, US date and tax
setup reviewed; its unknown Y rate is not replaced with a UK VAT assumption.
The enhanced draft retains a 43.12 discrepancy under supplied USD until those
tax conventions are resolved. The basic reader additionally loses tax/final
decimal points. No finalized refund split, trusted reconciliation, general
provider winner, physical-phone support or public-release readiness is claimed.
The broader twelve-phase goal remains active.
