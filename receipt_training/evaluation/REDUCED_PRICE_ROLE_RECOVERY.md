# Reduced selling prices misplaced as discounts

2 November 2026. Improvement parent: `9f8db67253d5d8b29a29965b061fdc99b9131d50`.

The independent-reading verifier can now propose a correction when a model
copies an explicit **REDUCED PRICE** into a purchase's discount field while
leaving both its unit and line price empty. The printed amount becomes the
line price and the erroneous deduction becomes zero. Both fields retain
mandatory source checks; quantity, unit price and all original evidence remain
unchanged. This implements a financial-role correction, not a new OCR model
or automatic approval of a bill.

## Measured effect

On the same six saved Azure/Gemini crops, with currency supplied after
extraction, the offline combination improves **22/25 to 24/25 known line
prices**. The two gains are Tesco's `4 TEACAKES` (£0.50) and `18 BROWN ROLLS`
(£0.85). The photograph explicitly places each amount on the next reduced-price
row. The first doughnut's unreadable amount remains unknown and its model-only
deduction remains disputed. No desired total selected or calculated a value.

| Saved-reading view | Before | After |
|---|---:|---:|
| Azure words alone, supplied-currency line prices | 25/25 | 25/25 |
| Azure/Gemini combination, supplied-currency line prices | 22/25 | 24/25 |
| Azure/Gemini combination, automatic line prices | 17/25 | 17/25 |
| Combination's correct coupon attachments | 0/3 | 0/3 |
| Accepted payable drafts | 0 | 0 |

Every other six-crop scored field is unchanged. The three Bristol coupon errors
and the Indonesian amount-scale error remain. Azure alone still has the better
financial result, so no default/provider switch or live Azure/Gemini integration
is added. Gemini's native 17/25 delivered-price result is unchanged: the new
gain comes from interpreting saved independent OCR evidence, not a better model
response. This is one familiar development receipt, not a blind holdout.

The unchanged original-fifty before/after replay covers primary/hybrid and
automatic/supplied currency (400 views). **All aggregate and scored per-case
fields are unchanged, with no regressions.** Supplied-currency hybrid prices
remain 133/143, quantities 119/120, copied totals 41/49 and tax basis 6/9.
Trusted reconciliation remains 0/49, and incomplete financial truth still makes
all fifty unscorable for strict complete-receipt accuracy. No new recognition,
model latency, phone performance or complete-bill accuracy is claimed.

## Evidence requirements and implementation

The repository graph locates `recoverReducedPriceRole` in
`src/lib/reduced-price-role.ts:8` and `verifyIndependentReadings` in
`src/lib/verify-readings.ts:165`. The rule runs only within the verifier's
existing consistent-currency/source-recovery gate and a forced, order-preserving
product match with an exact normalized description. It requires:

- Exactly two consecutive owned source lines: the product heading and its
  reduced selling price, in the same photo/section with separated vertical boxes.
- Exact word-to-line reconstruction and at least 0.98 confidence on every
  contributing word and line. Missing, duplicated, weak or overlapping evidence
  prevents the proposal.
- A positive literal selling price equal to the model's misplaced discount,
  no primary discount, matching tax-code fields and empty model unit/line prices.
- The existing literal-price recovery's source-token and currency checks.
  A conflicting valid price, unrelated discount, missing amount or disabled
  recovery is left unchanged; invalid negative model discounts fail the schema.

No purchase quantity or VAT rate is inferred. All source images, word geometry
and model responses remain immutable. The two recovered checks show the literal
selling price and previous vision deduction. Agreement counts do not treat
these copied proposals as independent agreement. The same source checks govern
the existing local independent-reader path; the cloud combination remains
offline research only.

## Verification and pending work

All **987 unit tests across 59 files** pass, including 21 new recovery,
abstention, source-immutability and checked-splitting cases. The first focused
run preserved one failed assertion: a negative discount was rejected by the
existing schema, rather than returned as a draft. The test now expects that
rejection; no schema was relaxed. Production build/typecheck and formatting
pass on the final source.

Playwright discovers 24 prepared cases across Chrome desktop/phone and host
WebKit phone: six financial scenarios, existing reduced-price editing and the
new correction-to-source-review-to-£0.25-per-person split. **None ran in this
checkpoint.** The controller refused before launch with 2,331,267,072 available
RAM bytes, below its unchanged 2,684,354,560-byte startup floor. The new scenario
and preceding slanted-column scenario remain pending; unit results and earlier
browser suites do not establish their browser behavior.

The pending tiny/medium model study is refreshed to
`browser-paddle-medium-paired-plan-v6`, binding the new helper and verifier.
Models, images, inference parameters, scoring and resource guards are unchanged.
There were no model calls, private uploads, downloads, billing changes or user
apps closed. Stable and original working-copy invariants remain protected.
The full goal remains active.

The [evidence packet](advanced-reduced-price-role-v1.json) binds the pre-change
protocol, both frozen replay variants, unchanged references, literal saved
provider outputs, test/build records and explicit browser refusal. Verify it:

```powershell
python -X utf8 receipt_training/scripts/build_reduced_price_role_report.py --check
```
