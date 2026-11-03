# Final totals across mixed OCR purchase rows

3 November 2026. This checkpoint corrects interpretation of saved independent
readings. There is no new OCR/VLM inference, API request or private upload.
The wider twelve-phase scanner goal remains active.

## Defect verified against the source

The Bristol Costco development image visibly contains two separate cashew
purchases at 11.49 and a final total of 74.57. The slanted printing places the
total amount above its heading. Native OCR grouped that amount with the last
SKU/quantity row, while grouping the last purchase's unit price with its title.
The primary draft consequently priced a numeric-SKU product at 74.57. The
independent vision draft retained both actual cashew purchases but added
`TOTAL (INCL VAT)` as another product.

The original photo was inspected locally. Its VAT legend is outside the image.
Neither rates nor a balancing amount can be inferred from the difference.

## Implementation and constraints

`readFinalTotalFragments` requires an explicit, complete final heading such as
`TOTAL (INCL VAT)`, `GRAND TOTAL` or `AMOUNT DUE`, with a unique printed decimal
amount to its right. Heading words, the amount word and both original source
lines must have scores of at least 0.98. The vertical centre difference is at
most the smaller heading/amount height and the absolute pixel slope at most
0.15. The amount must have a unique, exact original owner on the immediately
preceding or following OCR line, on the same photo/part. Existing
`alignedSourceWords` checks establish that ownership; its overprint protection
is unchanged. Source text, scores and rectangles must match actual panel data.
Conflicts, duplicate panels or ambiguous candidates cause abstention. Work is
bounded to 2,000 lines, 4,000 words and fifty candidate headings, with cached
line-ownership checks. Explicit SDK word ownership keeps its existing path.

Only a footer amount proven this way can be reserved from a nearby Costco
purchase interpretation. A closed pair of mixed source lines must admit exactly
one complete assignment of actual words to their reported text. Each word is
used once; words remain in source-text order within each original line. Search
is bounded to 32 words and 10,000 states. SKU, numeric quantity, unit price and
code-bearing total keep the preceding alignment/score guards. Product-name
words must lie above that numeric baseline. This handles the caption containing
words from two printed rows without weakening the existing single-row overprint
check. Every reconstructed purchase role stays pending for source review.

The primary draft retains both real purchases and proposes the printed final
total. Original indices are retained: the last purchase uses `[31,32]`, and the
footer uses `[32,33]`. Sharing an original region does not create a synthetic
OCR line or move a rectangle. Conflicting total candidates remain unresolved,
with both original regions available to review.

The independent comparison can exclude a uniquely matching summary product
only when it has no purchased quantity, unit price, tax code or pack size, a
zero discount, an identical normalized printed amount and heading, and exactly
the matching source photo. A native purchase match, multiple model summaries,
disabled recovery or a blocked total field prevents that proposal. A pending
purchase-list classification check records the removed row and its literal.
Unknown currency stays unknown; literal role comparison does not convert money.
No tax basis, subtotal, tax amount or tax-rate definition is replaced.

Graph nodes verified against current source:
`readFinalTotalFragments`, `src/lib/final-total-fragments.ts:L21`;
`readCostcoWordRows`, `src/lib/costco-word-rows.ts:L40`;
`parseReceiptWithSources`, `src/lib/parser.ts:L63`;
`verifyIndependentReadings`, `src/lib/verify-readings.ts:L167`.

## Frozen original-fifty comparison

The final replay is `grouped-amounts-v26`: 400 views / 200 before-after pairs,
38 development and twelve evaluation transactions, with unchanged v5 partial
references. Both primary variants receive the same full native geometry packet.
All four before-control count vectors reproduce the preceding checkpoint, and
all 362 shared input hashes match. No model is rerun.

Only Bristol's purchase facts and the primary Bristol printed-total field
change. All other 49 transactions' purchase/scalar facts, adjustments and money
totals remain unchanged. All evaluation aggregate counts are unchanged; no
scored regression occurs.

| Scoped measurement | Before | After |
|---|---:|---:|
| Hybrid unmatched scored predictions, either currency mode | 1 | 0 |
| Hybrid predicted rows, automatic currency | 144 | 143 |
| Hybrid predicted rows, supplied currency | 145 | 144 |
| Primary matched rows /145, supplied currency | 123 | 124 |
| Primary known line prices /143, supplied currency | 121 | 122 |
| Primary known quantities /120, supplied currency | 36 | 37 |
| Primary known unit prices /31, supplied currency | 18 | 19 |
| Primary copied final totals /49, supplied currency | 30 | 31 |

Hybrid matches, names, quantities, line prices, unit prices and discounts remain
unchanged; the false footer product is excluded. These denominators describe
fixed partial references, not complete-receipt precision or universal accuracy.
All fifty drafts still require review in every reader/mode combination. Trusted
reconciliation remains 0/49 and strict complete-receipt accuracy unscorable.

Both Bristol drafts now contain the nine actual purchases, including both
cashew rows and the previously corrected coupons. With GBP supplied, both
calculate 64.81 against printed 74.57, a discrepancy of -9.76. Automatic currency
remains unresolved, with no numeric reconciliation. The vision draft's
unsupported tax/subtotal assumptions remain marked for review. Correct product
separation is not a verified whole transaction.

## Failures retained and verification

The first replay, v24, also proposed a restaurant's bare `TOTAL` as final. Local
inspection of the CORD training image showed that this was a pre-tax amount,
followed by tax and `GRAND TOTAL`. The added proposal was wrong even though
aggregate scored accuracy did not fall. Bare `TOTAL` is now excluded from this
new fragment-recovery grammar. That failed attempt is retained, and no labels
or references were changed. The inspected CORD v2 development image is credited
to NAVER CLOVA / Park et al., CORD (2019), under its recorded CC-BY-4.0 licence;
it was not uploaded. The later v25 replay is also retained.

A synthetic conflict check additionally exposed missing viewing context when
an inline final total disagreed with a fragmented footer. Both source candidates
now remain highlighted with a pending difference check. The initial optional
source-conflict access error and intermediate source/test results remain
preserved. A formatting command intentionally changed source bytes; its exact
pre-format versions were retained or reconstructed from the recorded patch and
accepted only after matching the original controller hashes.

All 1,256 unit tests pass, with no failures or skips, including 25 new cases.
The 194-case focused selection, TypeScript check, isolated production build and
changed-source formatting pass. Full-unit execution keeps the existing
240-second outer guard and 15-second test timeouts. No source changed during
the final passes. No new built-browser or hardware-phone journey was executed;
the existing 2.5 GiB browser guard remains unchanged and subsequent CPU startup
observations have not shown qualifying available memory. User apps remain open.

The stable branch and original dirty checkout are verified unchanged. No push,
merge, deployment, provider/default change, quota probe, billing activation or
environment-file access occurs. The fifteen previously reported missing
historical declarations remain explicit; current evidence does not substitute
for them. This checkpoint introduces no additional historical gaps.

Three owned build copies were NTFS-compressed to reduce duplicate runtime
storage, with every file's content hash verified unchanged before/after. No
file was deleted. Observed free space rose from 10,565,808,128 to 10,710,122,496
bytes, still below the separate 10 GiB reserve required by larger-model trials.
No further model download or larger-model launch was attempted.

Exact local evidence is bound by `final-total-fragments-v1.json`. Ignored QA
artifacts must remain available for reproduction:

```powershell
python -X utf8 qa-artifacts/final-total-fragments-v1/seal.py --check
```
