# Costco coupons across joined and fragmented OCR rows

3 November 2026. This corrects interpretation of existing native OCR words;
there is no new model, OCR run or receipt upload. The improvement is verified
on saved independent readings. The wider scanner goal remains active.

## Source defect and implementation

The original Bristol Costco development photo was inspected again. It prints
a £5 coupon below the backpack and a £1 coupon below the duck eggs. The native
reader retained their text, but grouped one coupon with its SKU/quantity/price
row and split the other coupon's final price/code from its SKU/unit-price row.
The independent vision draft treated both coupons as additional purchases and
left their owners' discounts at zero. The preceding
[field-warning audit](FIELD_UNCERTAINTY_AUDIT.md) identified these two failures.

The new `readCostcoWordRows` interpretation uses actual source words to identify
SKU, explicit numeric quantity, unit price and a decimal total with a printed
letter code. It requires unique left-to-right slots, scores of at least 0.75
on every participating word and source line, and bounded alignment along the
SKU/quantity baseline. The vertical residual is at most 0.45 of the smallest
participating word height; pixel slope is bounded by 0.3. Work is bounded to
4,000 words and 2,000 text lines. Duplicate candidates cause abstention.

The source lines must match their actual panel text, scores and rectangles.
Every selected word must belong to the combined original region(s), with exact
combined text/word coverage. A coupon requires an explicit negative-code total,
an `IRC` label, an adjacent positive owner on the same photo/part, matching tax
code and a shared description prefix of at least five normalized characters
and 35% of the shorter description. These are interpretation guards, not a
calibrated confidence probability or a universal retailer convention.

The parser retains the actual source indices instead of inventing a synthetic
OCR line or rectangle. Reconstructed quantity/price/code roles and coupon
ownership remain pending source checks. Basic text-only behavior stays intact;
an unowned collapsed coupon is retained as a receipt deduction. Unknown, weak,
conflicted or ambiguous geometry falls back to existing parsing. Explicit SDK
word/line ownership panels retain their existing parsing path; this regrouping
targets unowned line fragments such as the measured native Paddle output.

The independent comparison consumes that same source interpretation. It can
reclassify a matching vision coupon purchase only when quantity, unit price,
line total, code, source photo and owner evidence agree. Each changed discount
requires review. Distinct physical source identities support long-section
joining, including the joined coupon's single region and the split coupon's
two regions. Existing genuine repeated products remain distinct.

Graph nodes verified against current source: `readCostcoWordRows` at
`src/lib/costco-word-rows.ts:L39`, `parseReceiptWithSources` at
`src/lib/parser.ts:L59`, and `verifyIndependentReadings` at
`src/lib/verify-readings.ts:L166`.

## Frozen before/after evidence

Both variants use the same original fifty transactions, frozen v5 references,
native words/geometry and independent vision responses. The replay supplies the
full native geometry packet to the primary parser in both variants, matching
the actual application path. All four before-control count vectors reproduce
the preceding checkpoint exactly. All 362 shared input hashes match it.

The final replay contains 400 views / 200 pairs. Every changed transaction is
the Bristol development case. All item facts and financial totals on the other
49 transactions are unchanged, as are every receipt scalar field and all hybrid
receipt adjustments. Native Bristol moves two receipt deductions to their item
owners. No evaluation aggregate changes and no scored regressions occur.

| Same-fifty metric | Before | After |
|---|---:|---:|
| Hybrid known item discounts /7, either currency mode | 5 | 7 |
| Hybrid known grouping /14, either mode | 11 | 13 |
| Hybrid predicted purchases, automatic currency | 146 | 144 |
| Hybrid predicted purchases, supplied currency | 147 | 145 |
| Hybrid known line prices /143, supplied currency | 135 | 135 |
| Primary known quantities /120, automatic currency | 32 | 34 |
| Primary known quantities /120, supplied currency | 34 | 36 |
| Primary matched reference rows /145, supplied currency | 122 | 123 |
| Primary known line prices /143, supplied currency | 120 | 121 |
| Primary known unit prices /31, supplied currency | 16 | 18 |

For the hybrid, existing paid descriptions, quantities, unit/line prices and
codes stay unchanged; only the two discounts change and the two spurious coupon
purchases are removed. Both previously unmarked discount failures now have
mandatory recovered-value checks. Raw native text and recognition geometry stay
unchanged. These are interpretation gains, not new model-accuracy observations.

## The Bristol transaction is still not correct

The hybrid drops from twelve to ten proposed purchases, but still treats the
final-total label as a product. With GBP supplied its calculated amount changes
from £151.38 to £139.38, still differing from the printed £74.57 by £64.81.
The native draft drops from eleven rows to nine, but still has a numeric-SKU
row priced from the unrecognized footer; its £127.89 calculation is also wrong.
Its printed-total comparison remains unavailable. Neither is a complete-receipt
success. The source photo lacks the VAT legend; no rate or balancing amount is
invented. The separate footer-as-product error is a next development target.

Automatic currency is unresolved for this photo, so those numeric GBP
calculations must not be attributed to that mode. All 200 after-views still
have validation issues and require review. The original-fifty references remain
partial; strict whole-receipt accuracy stays unscorable.

## Verification and remaining execution gap

All 1,231 unit tests pass with no failures or skips: the preceding 1,209 cases
plus 22 new cases. The 174-case focused selection covers both coupon forms,
already-correct drafts, section overlap, wrong names/codes, absent minus signs,
weak scores, duplicate fragments and cross-photo/part ownership. Typecheck,
isolated production build and changed-source formatting pass.

The new source-view protocol draws the synthetic words at their recorded
positions and expects three original regions for the backpack and four for the
eggs, with pending discounts and blocked confirmation at 320/390px. Its combined
selection has sixteen desktop/phone cases, including the preceding automatic
checks. It is unexecuted: the unchanged 2.5 GiB guard refuses at 2,127,425,536
available bytes before spawning a browser. User apps were left open and guards
were not lowered. Current phone-source behavior is not claimed verified.

The original regression selection fails six of seventeen tests on the old
implementation. Early compiler checks expose a map-index type and a widened
fixture currency type; both are corrected before the final passes. Two analysis
assertions initially assume primary adjustments cannot move and unresolved
automatic currency has the supplied-currency calculation; those assumptions
are corrected against the retained outputs. Intermediate sources, failures and
both replay attempts remain preserved rather than overwritten.

No new OCR/VLM call, receipt API request, private upload, quota probe, billing
activation, environment-file access or provider/default change occurs. The
protected stable branch and original dirty checkout are verified unchanged.
The exact local packet is `costco-coupon-columns-v1.json`; ignored artifacts
must remain available for reproduction. Targeted archive checks do not repair
the thirteen previously reported missing historical declarations. They expose
two additional missing generated-graph declarations in the preceding zero-price
packet: `graphify-out/graph.json` and `graphify-out/GRAPH_REPORT.md` were replaced
without retaining those exact versions. Checked local copies do not match the
expected hashes. The current graph is preserved, but cannot establish the older
bytes. Fifteen historical declarations are now known missing; current coupon
source/test/replay evidence remains verified. `retention-gaps.json` in the local
packet records the two expected hashes and the unsuccessful recovery check.

```powershell
python -X utf8 qa-artifacts/costco-coupon-columns-v1/seal.py --check
```
