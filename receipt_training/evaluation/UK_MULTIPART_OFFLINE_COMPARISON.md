# Same two Costco crops: current offline comparison

3 November 2026. The user's Free API quota is exhausted. **No new provider
request was made.** The proposed Gemini 3.5 two-image trial remains unapproved
and unexecuted, with no automatic retry. Its scope and eight passing offline
transport tests are in [the prepared plan](GEMINI35_UK_MULTIPART_PLAN.md).

Historical Veryfi, Paddle and Qwen readings of the identical two JPEG crops
were replayed through frozen application source from `b44622c`. This separates
current postprocessing from model reading. The comparison is one familiar
development transaction with eight processing views, not eight test receipts.
The original-fifty evaluation corpus and app code are unchanged.

## Measured result

All methods match the 18 reference purchase descriptions under the unchanged
description-only matcher. Exact normalized descriptions and extra proposed
rows expose differences that recall alone would hide. The table uses **GBP
supplied to postprocessing**, separately from model output; no currency hint
was sent to any model in this replay.

| Saved reading + current processing | Proposed purchases | Exact descriptions / 18 | Matched quantities / 18 | Matched line prices / 18 | Attached coupons / 4 | Calculated total |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Veryfi literal OCR text + parser | 18 | 18 | 18 | 18 | 4 | £176.78 |
| Paddle primary + parser | 18 | 16 | 18 | 18 | 4 | £176.78 |
| Qwen alone | 23 | 17 | 18 | 18 | 0 | £193.39 |
| Paddle + Qwen verification | 20 | 17 | 18 | 18 | 3 | £181.25 |

Unit prices and purchase tax codes match 18/18 for all four views. The printed
subtotal £163.16, tax £13.62 and total £176.78 are copied correctly by all four.
Both VAT rates and the tax-exclusive price basis also match. Correct printed
totals and matched-item prices therefore do **not** establish a correct bill:
Qwen introduces extra purchases and mishandles discount ownership.

Without supplied currency, Veryfi's text still yields £176.78. Paddle preserves
the same items and financial strings but leaves currency unresolved, so the
calculator blocks calculation until it is chosen. Its empty accumulator is
reported as unavailable, not a zero-pound bill. Qwen and the combined reading
retain native GBP and the same incorrect totals as in the table.

The VAT crop's bottom savings line is clipped but retains a partly visible
pound symbol. Veryfi transcribed that symbol. The crops do not have the full
payment/currency line, merchant or date; do not equate this with an image that
contains no currency evidence at all.

## Remaining combined-reader error

The Qwen result duplicates `SPONTEX CLOTHS 24P` at £6.99 and proposes its £1.50
coupon SKU as another purchase. It also treats the £6.90 savings summary as a
separate discount. Current verification correctly recovers three other coupons
but cannot uniquely attach the cloths coupon while the duplicate purchase
remains ambiguous. Its result has two extra purchases and is £4.47 too high.

The source parser has the correct single cloths purchase and £1.50 deduction.
The verifier's refusal to choose between ambiguous repeated model rows is
intentional; changing values to force the printed balance would not establish
their identity. The two genuine rotisserie-chicken purchases must also remain
separate. No new row-deletion heuristic or provider/default change was made.

Veryfi has three pending source checks; combined verification has 23. The
primary and standalone-vision drafts have no additional field checks in this
core replay, but still require the normal receipt-review step. None of the
eight unreviewed states can finalize even after assigning every item to a
person. This is a core calculation check, not a browser upload-to-share test.

## Interpretation and limits

This result supports retaining a primary OCR option and testing any proposed
vision replacement on the complete transaction. Adding a second model can
make this draft worse despite improving some names. Veryfi performs best on
this particular pair; it is not established as a universal provider winner.
Gemini 3.5 has **no measured result** for these two images. Exhausted quota is
not an extraction failure or a zero accuracy score.

The reference has 18 purchases and four coupons, checked against both original
photos by the assistant on 31 October. It is not independently human-verified
or held out. Financial fields for the visible body are complete; the whole
receipt is not visible. The two crops do not overlap, so this is not an
overlap-deduplication test. Merchant/date, complete-receipt accuracy, physical
phone behavior and new processing latency remain unmeasured here.

No app source changed. The last full application validation remains 1,037
passing unit tests and the successful Azure-quantity build. Its browser rerun
was refused below the documented memory floor; this offline replay does not
replace it. No browser or larger-model memory guard was lowered.

## Reproduction and evidence

Inputs are pinned to historical response hashes and the two unchanged JPEGs:

- `user-uk-items.jpg`:
  `1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68`
- `user-uk-vat-totals.jpg`:
  `adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b`

`qa-artifacts/provider-review/uk-multipart-offline-v1` preserves the replay plan,
runner, predictions, comparison details, loaded source hashes and metadata.
The immutable source snapshot is shared with the prepared Gemini v2 protocol.
Vite environment loading is disabled and global fetch throws; reference labels
are read only by the separate scorer. No credentials, model inference, cloud
uploads, retries or billing activation occur. Source and inputs are checked
unchanged before and after replay.

The scorer reuses the existing `field_score` helper and description matcher
with their pinned hashes and unchanged reference/configuration. Its packet is
`advanced-uk-multipart-offline-v1.json`. Private images, responses and labels
remain in ignored local evidence; the committed packet contains only aggregate
metrics, diagnostic descriptions and hashes.

```powershell
# Use a fresh output directory; never overwrite the recorded v1 run.
node receipt_training/scripts/replay_uk_multipart_baseline.mjs qa-artifacts/provider-review/uk-multipart-offline-v2
python receipt_training/scripts/score_uk_multipart_baseline.py --check
```

The prepared cloud protocol must not be executed until the user confirms
available Free quota and gives fresh approval. The existing question was
answered “All is already at limit,” recorded as approval false and zero live
requests. No reminder, retry schedule or paid alternative was activated.
