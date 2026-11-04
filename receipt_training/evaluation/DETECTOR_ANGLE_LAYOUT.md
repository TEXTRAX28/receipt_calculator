# Detector-angle grouping: measured extraction gain and remaining browser limits

4 November 2026; parent `7fa8950d07000dd08921bfd4a32662e1986d36a0`.
The twelve-phase objective remains active. No provider default changes.

## What changed

Horizontal row grouping lost correctly recognized column fragments on a skewed
Costco crop. A coupon became a refund, SKU numbers became products, and the
final total joined a purchase. The detector's original quadrilaterals contained
usable text directions that the earlier bounding-box grouping discarded.

The browser Paddle adapter and native Paddle adapter now use those directions
to group fragments. Original word strings, scores and rectangles stay intact;
there is no pixel rotation, price repair, merchant guessing or tax-rate inference.
The algorithm is independent of receipt wording. It keeps repeated purchases.
Horizontal, insufficient-direction and unsupported-shape cases retain the
previous grouping. Direction estimates require wide, ordered quadrilaterals,
at least three usable observations, bounded skew and consistent orientation.
These constraints do not establish financial correctness or clear source checks.

## Paired development evidence

One bounded local batch captures seven previously inspected panels from six
development transactions, using the same pinned RapidOCR 3.10.0 small model and
configuration. It retains the actual detector polygons. Every original word and
the complete legacy recognition object exactly reproduce the preceding saved
readings. The only experimental change is grouping those identical observations.
No new holdout is used and no labels, prices or source images are changed.

| Known field, six familiar transactions | Earlier grouping | Angle grouping |
| --- | ---: | ---: |
| Matched purchases | 39/42 | 41/42 |
| Matched / predicted purchases | 39/43 | 41/41 |
| Quantities | 24/32 | 27/32 |
| Unit prices | 24/29 | 27/29 |
| Line prices, supplied currency | 37/41 | 39/41 |
| Item coupons and owners | 4/7 | 6/7 |
| Printed totals, supplied currency | 4/6 | 5/6 |

Automatic-currency line-price matches improve 34/41 to 36/41 and printed totals
2/6 to 3/6. Currency recognition itself is unchanged. Supplying currency is user
context, not an OCR success. There are no scored field regressions. All gains
come from the skewed Bristol transaction; six other panels keep identical lines.
Two currency contexts are not independent receipts.

Bristol improves from seven matched purchases among eleven proposals to all
nine purchases, prices, unit prices and quantities. Two of three coupon owners
are recovered. Both separate cashew purchases remain. The printed £74.57 total
is recovered, but calculated £64.81 still differs by £9.76: the crop omits the VAT
legend and one coupon's ownership remains unresolved. Every view still requires
review. Complete-receipt financial accuracy remains unscorable in these partial
assistant-reviewed references; no independent human verification is claimed.

The actual local batch completes in 14.289 seconds including bootstrap, public
wheel retrieval and retained diagnostics. Its minimum sampled available RAM is
1,954,127,872 bytes. One checksum-verified public wheel is read into RAM, then
networking is disabled before receipt access. No model or image files are
installed/written. This is not a processing-latency cohort or a mobile speedup.

## Verification and actual browser outcome

Both production implementations exactly match the frozen prototype's words and
lines on all seven captured SDK outputs. The native adapter's caller wiring is
also tested with a constructed SDK response; that control imports no model.
It is not a fresh selected-Paddle-medium inference result. Four new regressions
cover sloped printed columns, genuine repeats, unchanged unclear/negative money,
native/browser parity and the steep-angle fallback.

All **1,381 unit tests across 78 files** pass through six disjoint guarded
processes, with every file covered exactly once. The lowest sampled available
RAM across those runs is 1,575,215,104 bytes. This proves complete unit coverage,
not a single-process full-suite pass. Strict typecheck, formatting, isolated
compilation and graph refresh/check also pass on the same 225 source files.

A separate real enhanced on-device **tiny** scan runs in the current built UI at
a measured 390 × 844 viewport with GBP supplied. It returns all nine line prices
and quantities and two coupon attachments. It still reads one unit price as
£17.49 instead of £11.49, one Z marker as 2, and the total as `74A57`. The total
field remains blank and source/financial checks block confirmation. No financial
value is edited or confirmed. These are different model observations from the
Rapid comparison, not another proof of its measured gain.

The preview starts with 1,766,871,040 available RAM bytes, then its global guard
samples 971,010,048 bytes and stops the owned server after 48.013 seconds. The
whole-image UI result is retained, but this is **not a clean guarded browser
pass**. The subsequent single area-reread action fails the asset precheck because
the server is gone; no new area reading is delivered. Both failures are retained.
The viewport resets and owned tab 7 closes; the original user tab remains open.
No user application or tab is closed.

Exact evidence is in `qa-artifacts/rapidocr-polygon-layout-v1/` and
`qa-artifacts/polygon-current-qa-v1/`. The initial offline comparator's BigInt
serialization failure and scorer's missing-timing failure are retained alongside
their corrected helpers; predictions, reference bytes and scoring policy are
unchanged. No private provider upload, key provisioning, paid activation or
OpenAI call occurs. The Rapid model remains experimental and uninstalled.

Remaining work includes a frozen fresh evaluation of the geometry change,
selected-model runtime/whole-corpus confirmation, browser memory feasibility,
missing financial-source coverage, genuine capture and physical-device testing.
The new grouping closes specific extraction errors; it does not complete the
full objective or certify public release.
