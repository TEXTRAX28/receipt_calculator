# Financial-summary reference review

This checkpoint improves the reference evidence, not the scanner's extraction
score. Nine original receipts receive source-checked tax-basis labels, one gains
an explicitly printed rounding value of zero, and the supplied UK supplement
gains verified absence of a separate rounding/fee line. Every retained prediction,
original price, quantity, discount, fee, subtotal, tax and total stays unchanged.
Old labels and reports remain available alongside the new versions.

## Source observations

All eight original receipts with labelled service fees were inspected at original
resolution, along with the original Black Sakura receipt, two zero-tax controls
and both supplied UK photographs. The nine positive-tax receipts show the
purchase/subtotal section followed by separately charged tax in the displayed
total section. Their net-price basis is an interpretation of that printed
financial structure, not a literal printed boolean or an amount invented to
balance the bill. Source transcriptions and image hashes are retained.

The Black Sakura photograph explicitly prints `Rounding 0`, distinct from its
zero-priced options and `Card Payment 50,000`. The two zero-PB1 controls print
`CHANGE 0`; neither a zero tax nor zero change proves a rounding value or whether
the item price includes tax. Their unknown basis/rounding fields stay unknown.

On the five-item service-fee receipt, `Coupon 100,000` follows the total alongside
`BCA Card 161,333`. It is recorded as a payment tender, without changing purchase
discounts or the final amount. This added payment fact is not scored as a new
recognition success.

The UK photos show all eighteen purchases, four coupons, total and VAT table.
They contain no separate financial rounding or fee line. The numeric rounding
field remains null; absence evidence is separate from an explicitly printed
zero. The original tax amounts already reflect their own VAT rounding. The upper
merchant heading remains cropped, while the footer identifies Costco.

These are retrospective assistant observations after earlier scanner work, not
independent human verification or an unseen holdout. Merchant headers on the
nine reviewed CORD receipts remain publisher-blurred and unknown. No permission,
split membership, image bytes or original reference is overwritten.

## Same-prediction rescore

The unchanged strict scorer evaluates 306 saved prediction/context views twice,
once per reference version. Three hundred views cover all fifty original
transactions; six separate views repeat the UK supplement. Native Qwen full-v2
predates row-first decoding, the original-fifty primary/hybrid use the final
purchase-expression replay, and UK primary/hybrid use the earlier leading-count
snapshot. These are documented source vintages, not one fresh pipeline run.

| Original fifty, newly known fields | Net-price basis /9 | Printed rounding /2 | Known service fees /8 |
|---|---:|---:|---:|
| Tesseract baseline, automatic | 0 | 0 | 0 |
| Native Qwen full-v2, automatic | 0 | 2 | 4 |
| Current Paddle primary, automatic | 0 | 0 | 0 |
| Current Paddle primary, explicit currency | 0 | 0 | 1 |
| Current hybrid, automatic | 0 | 2 | 4 |
| Current hybrid, explicit currency | 0 | 2 | 4 |

All prior per-case known price, quantity, discount, fee and receipt-total counts
are preserved. The current hybrid still matches 116/143 line prices automatically
and 131/143 with explicit currency. The new denominators expose unresolved
financial interpretation; they are not an extraction improvement.

All nine selected-currency hybrid cases retain an unconfirmed tax-basis source
check. Their displayed inclusive-price boolean does not mean nine confidently
accepted bills: the source/model has not resolved the basis, and confirmation is
blocked. Source-guided tax, service and payment-role interpretation is therefore
a concrete remaining recovery task. No pending check is cleared by this review.

## Complete-receipt scope

All original fifty remain unscorable as complete receipts. After this review,
their references still have the following gaps; counts overlap:

| Missing reference evidence | Cases /50 |
|---|---:|
| Merchant name | 44 |
| Explicit complete financial coverage | 50 |
| Explicit complete item-coverage evidence | 48 |
| Tax-inclusion basis | 41 |
| Tax amount | 28 |
| Subtotal | 16 |
| Rounding value or verified absence | 48 |

Missing coverage flags do not prove missing purchases, and unknown labels are
not automatically OCR failures. Four fiscal certificates have no purchase list.
The [frozen per-case inventory](advanced-financial-summary-rescore-v1.json) links
the detailed local coverage audit; no hidden field is reconstructed from totals.

The UK supplement now qualifies for the unchanged strict complete-receipt metric;
each retained view scores 0/1. This is one transaction, not six independent
failures. The earlier primary reader has correct known prices, unit prices,
quantities, coupon assignments, subtotal, VAT and final amount, with zero
discrepancy and no calculator issues. Its exact descriptions match 16/18:
`BELVEDERE VOD.7OCL` versus printed `BELVEDERE VOD.70CL`, and `PLASTIC CONT 380Z`
versus printed `PLASTIC CONT 38OZ`. The strict metric correctly withholds success.
The compared reading also retains source-review issues; the earlier native Qwen
view has coupon errors. A copied or balanced total does not certify the receipt.

## Verification and remaining work

Eight source/scoring boundary tests pass. They cover unchanged amounts/items,
source immutability, printed zero versus absence, zero-tax/change controls,
payment-coupon classification, blurred headers and the failure of a deliberately
wrong synthetic reading despite its matching total. The first rescore attempts
mislocated a legacy partial source snapshot; failed logs/scripts remain local.
The successful rescore verifies both its three overridden files and the shared
unchanged base snapshot against their recorded hashes.

The [21-file source-reference packet](advanced-financial-truth-v1.json) and
[577-file paired-score packet](advanced-financial-summary-rescore-v1.json) bind
original inputs, both label versions, actual retained predictions, frozen scanner
source, matching configuration and scoring code. There are no new model calls,
cloud requests or latency samples. Application code matches `de24452`; its prior
615 unit and 173 browser passes, with one existing skip, are prior evidence for
that unchanged app, not freshly rerun tests in this reference-only checkpoint.
The stable branch and original dirty checkout remain protected.

```powershell
python -X utf8 receipt_training/scripts/test_financial_summary_truth.py -v
python -X utf8 receipt_training/scripts/record_financial_summary_review.py --check
python -X utf8 receipt_training/scripts/build_financial_summary_rescore.py --check
```

These checks are offline. Full source-grounded financial coverage, tax/fee/payment
recovery, genuine digital/PDF and handset evidence, and public-release acceptance
remain unfinished. The full twelve-phase goal remains active.
