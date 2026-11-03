# Field error visibility in frozen receipt drafts

3 November 2026, application checkpoint
`147533e1b54c395c7352df40f60db424db91d845`. This is an executed diagnostic of
existing readings, source evidence and review checks. It changes no application
behavior, reference, threshold, model or accuracy score.

## What the audit establishes

With supplied currency, the hybrid has 56 incorrect populated fields among the
twelve audited field types. Specific pending checks or validation issues mark
51; five lack an individual field warning. Those five are two missed item
discounts and three merchant names. Every affected draft still has a pending
purchase-list check and is blocked by the validator. Generic receipt review
must not be counted as if it identified the incorrect field.

All seven incorrect populated line prices are marked, including six syntactically
valid but wrong values and one invalid monetary string. One additional referenced
price belongs to an unmatched purchase/option row and is reported separately.
These counts describe saved, unreviewed drafts, not successful human correction
or whole-receipt accuracy.

The two discount failures are development examples from the same Bristol Costco
receipt. The OCR text retains a joined `IRC` coupon row and a fragmented coupon
row, while the item discounts remain zero. This identifies a concrete next
development target: preserve the deduction's source and resolve its ownership
without guessing. No individual evaluation failure was inspected to choose it.

## Protocol and scope

The version-two plan is fixed before feature extraction. It uses the same fifty
transactions and frozen v5 references as the preceding price replay: 38
development and twelve evaluation cases, primary/hybrid readers and automatic/
supplied-currency modes. Only the `after` records are selected, giving 200 views
and 2,324 known-field observations. The same transactions occur in multiple
modes; these are not 200 independent receipts or 2,324 independent experiments.

Item fields are description, quantity, unit price, line price, discount and tax
code. Receipt fields are merchant, date, subtotal, tax amount, final total and
whether prices include tax. Receipt-level discount/fee structure and rate-table
correctness are outside this diagnostic. Unknown reference fields are excluded;
missing purchases, empty fields and incorrect populated values are distinct.

The first stage reads predictions and frozen application modules without
loading expected fields. Its read helper rejects annotation, manifest and score
inputs. Expected values enter only in the subsequent Python scorer. Matching
reuses the frozen description-only Hungarian implementation at 0.65. Amounts
use exact minor units with no rounding; discount signs follow the existing
deduction-magnitude convention. Dates use the already normalized ISO strings.
Every overlapping published numerator and denominator reproduces exactly.

The actual `checkIsApplicable` and `checkIsPending` functions determine pending
field checks. `pendingReviewIssues` separates those checks from numeric
validation returned by `calculateReceipt`. A generic purchase-list check,
warnings, unresolved currency and receipt discrepancy are recorded separately.
Their existence does not create a field-level flag. These functions are verified
at `src/lib/review-checks.ts:L71`, `:L91`, `:L131` and
`src/lib/engine.ts:L55` through the local graph and current source.

This does not audit automatic routing: saved primary records already include
source review, whereas orchestration decides before that review. It also does
not infer independent field agreement from an absent warning or copied final
values. The earlier version-one plan remains unexecuted and deferred; its
source-mapping defect was fixed before this updated study.

## Supplied-currency results

There are 581 known-field observations per reader in this mode.

| Outcome | Primary | Hybrid |
|---|---:|---:|
| Correct fields | 353 | 520 |
| Incorrect populated fields | 43 | 56 |
| Incorrect populated fields individually marked | 14 | 51 |
| Incorrect populated fields without an individual mark | 29 | 5 |
| Empty predicted fields | 115 | 2 |
| Known fields on unmatched purchases | 70 | 3 |
| Correct populated fields still individually marked | 88 | 331 |

The hybrid fills more fields, so its larger count of populated errors is not
evidence that it is less accurate. Correct fields still needing review are a
measure of review work, not automatically unnecessary or false alarms: matching
the reference does not establish reliable source support. For example, 113 of
119 correct quantities and 61 of 135 correct line prices remain marked.

| Hybrid field | Known | Correct | Incorrect populated | Individually marked errors |
|---|---:|---:|---:|---:|
| Description | 145 | 133 | 11 | 11 |
| Quantity | 120 | 119 | 0 | 0 |
| Unit price | 31 | 26 | 5 | 5 |
| Line price | 143 | 135 | 7 | 7 |
| Item discount | 7 | 5 | 2 | 0 |
| Item tax code | 10 | 9 | 1 | 1 |
| Merchant | 6 | 1 | 5 | 2 |
| Date | 5 | 2 | 3 | 3 |
| Subtotal | 34 | 27 | 7 | 7 |
| Tax amount | 22 | 16 | 4 | 4 |
| Final total | 49 | 41 | 8 | 8 |
| Prices include tax | 9 | 6 | 3 | 3 |

In development, 39/44 incorrect populated hybrid fields are marked; in evaluation,
12/12 are marked. The evaluation split has no known item-discount references,
so it cannot establish discount-warning quality. Aggregate evaluation results
are retained separately; no thresholds or code were tuned against their errors.
Automatic-mode results and every split/field denominator remain in the packet.

## OCR scores do not establish field correctness

The diagnostic takes the minimum score over every associated line and contained
word. Every line must have one source panel and exact whitespace-compacted
word/text coverage. Otherwise its associated-source score is unavailable.
It covers whole associated regions; it is not character confidence for the
particular field and is not a probability of receipt correctness.

| Associated-source score, hybrid line prices with supplied currency | Populated fields | Incorrect |
|---|---:|---:|
| Unavailable | 48 | 5 |
| Below 0.75 | 6 | 0 |
| 0.75 to below 0.98 | 28 | 1 |
| At least 0.98 | 60 | 1 |

The high-score error is marked. These outcomes mix recognition, parsing and
model-draft interpretation; they are not an OCR-only error rate. The small,
convenience-selected corpus cannot calibrate a confidence probability, justify
auto-confirming values or justify lowering review requirements.

## Verification and limits

Twelve synthetic feature controls and ten independent scoring controls pass,
including exact word coverage, duplicate/missing geometry, generic-versus-field
checks, zero/false values, abstentions and exact monetary precision. Independent
accounting reproduces all observation totals. An initial summary attempt fails
on an absent evaluation-discount group; it is corrected to preserve the zero
denominator rather than invent observations. Its failure record is retained.

All application/test hashes still match the preceding 1,209-unit/typecheck/build
checkpoint; those unchanged tests were not rerun for a read-only diagnostic.
No new OCR/VLM inference, receipt API request, private upload, quota probe,
billing activation, environment-file access or browser run occurs. The preceding
phone journey remains unverified behind its unchanged RAM guard. The protected
baseline and original dirty checkout are verified unchanged.

Source-derived references remain partial and CORD dominates this cohort. Complete
financial truth, calibrated capture advice, physical-phone evidence and public
release readiness remain incomplete. This study supplies uncertainty-quality
evidence, not completion of the wider goal.

`field-uncertainty-audit-v2.json` binds the exact local plan, features, source
snapshots, scorers, observations, controls, reports and Git checks. The ignored
artifacts must remain available for reproduction. This targeted audit does not
repair the thirteen previously reported missing historical declarations.

```powershell
python -X utf8 qa-artifacts/field-uncertainty-audit-v2/seal.py --check
```
