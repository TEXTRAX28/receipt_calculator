# Source-checked visible purchase lists

Eight development receipts now have explicit coverage of every purchase in their
visible bodies: **57 existing rows**, with no changes to descriptions, quantities,
prices, discounts, fees, tax, totals or unknown fields. Complete-visible-item
reference coverage expands from **2 to 10 of the original fifty**. This improves
what can be measured; it is not an OCR improvement.

The original-resolution images were inspected before this paired rescore. CORD
train 000, 001, 003, 005, 011, 013, 015 and 019 contain respectively 22, 6, 3, 5,
5, 4, 4 and 8 purchase rows. These are familiar development images, not an unseen
holdout or independent human annotations.

Both zero-priced Free Ice Tea rows and both Tahu Telor Asin rows remain separate.
The first Tahu amount stays unknown. Cooking instructions, unpriced size modifiers
and continued descriptions stay with their existing purchases. The post-total
Coupon and BCA Card entries remain payment tenders. Unprinted unit prices are
not calculated from quantity and line total.

## Unchanged saved outputs

| Saved pipeline, eight reviewed receipts | Proposed rows | Matched reference rows /57 | Unmatched proposed rows | Missing reference matches |
| --- | ---: | ---: | ---: | ---: |
| Historical Tesseract baseline, automatic | 21 | 11 | 10 | 46 |
| Historical native Qwen full-v2, automatic | 57 | 57 | 0 | 0 |
| Current primary, automatic or supplied currency | 55 | 51 | 4 | 6 |
| Current hybrid, automatic or supplied currency | 57 | 57 | 0 | 0 |

All four unmatched primary rows occur on train-019: FOOD, BEVERAGES and OTHERS
are category subtotals and DU is the final amount, but the output proposes them
as products. It also misses the fish purchase. No parser was changed here.

Matches use the unchanged description-only matcher, not exact-name or financial
correctness. An unmatched prediction is not automatically a duplicate: a badly
read real name can fail matching. Historical pipelines and current saved-output
replays have different source vintages; this is not a fresh same-runtime model
or latency benchmark.

## Limits and reproduction

Blurred merchants remain unknown, and torn receipts gain no full-document
visibility flag. Complete financial coverage stays false; no absent fee,
discount or rounding becomes zero. **All fifty original receipts remain
unscorable under the unchanged strict whole-receipt metric.**

The old v5 labels remain intact. The new private v6 file changes eight
coverage/verification records and adds their source-review notes. All old field
scores and errors stay identical across **300 saved prediction views scored
against both versions (600 comparisons)**. Current hybrid known line prices
remain 116/143 automatically and 133/143 with supplied currency; copied totals
remain 34/49 and 41/49. Trusted reconciliation remains 0/49.

[The 25-file evidence packet](advanced-body-coverage-review-v1.json) binds the
eight images, old/new labels, observations, unchanged scorer/configuration,
original-fifty membership and retained predictions. Paired checks permit only
unmatched-row counts on newly complete visible lists to change. Python syntax
checks pass. No application source or model changed, so application tests were
not rerun; 940 unit and 223 browser passes plus one existing skip remain the
latest application validation.

```powershell
python -X utf8 receipt_training/scripts/record_body_coverage_review.py --check
```

The paired browser-model plan still uses its frozen v5 reference. There were
no new inference jobs, uploads, downloads or latency samples. Stronger-model
comparison, broader financial truth, physical-phone validation and public-service
readiness remain open; these references do not complete the twelve-phase goal.
