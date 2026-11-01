# Separate quantity, unit-price and total rows

The text parser now reads complete printed expressions such as `2 @20.000
40.000`, `1× 36.000 36.000` and `22.000 x1 22.000` when an adjacent product
name and the local ordering resolve their association. It preserves the actual
quantity, unit-price and total tokens; it never multiplies or divides to fill
a field. Pack notation inside a product name remains part of the name.

Names can precede or follow the price row. Repeated names remain separate
purchases, source indices preserve both rows and photo boundaries are respected.
Incomplete numeric rows can help establish ordering after a complete expression,
but cannot supply an invented quantity or unit price. Short and non-Latin names
are supported. Financial markers are not product titles; genuine titles such as
“Total repair kit,” “Tax free tea” and “Coupon book” remain products. The parser
and association pass share the final-total boundary predicate.

## Same-reading original-fifty comparison

The original fifty retained Paddle and row-first vision readings pass through
frozen before/after modules in two currency contexts. The four hundred views
are fifty transactions, not four hundred new recognition samples. Original image
bytes, model outputs, reference labels and 38-development/12-evaluation membership
are unchanged. This split has already been inspected and is not a blind holdout.

| Known field | Primary before | Primary after | Hybrid before | Hybrid after |
| --- | ---: | ---: | ---: | ---: |
| Matched purchases /145 | 113 | 121 | 143 | 143 |
| Exact normalized names /145 | 91 | 99 | 132 | 132 |
| Purchased quantities /120 | 22 | 30 | 119 | 119 |
| Unit prices, explicit currency /31 | 6 | 14 | 22 | 25 |
| Line prices, explicit currency /143 | 111 | 119 | 126 | 131 |
| Line prices, automatic currency /143 | 16 | 18 | 115 | 116 |
| Copied final totals, explicit currency /49 | 30 | 30 | 41 | 41 |

Hybrid automatic-currency unit prices remain 22/31; source-known primary units
improve 6/31 to 8/31 automatically. The hybrid's identity, quantity, discount,
receipt metadata, tax basis/codes and charge vectors are unchanged. Its nine
changed fields across both currency views each improve an existing known-field
score. The automatic and selected-currency versions of the same field are not
independent samples. No scored per-case regression occurs in either reader.
These gains occur in previously inspected development cases; evaluation counts
are preserved. All fifty complete financial results remain unscorable under
current truth.

## Independent unit-price proposals

For a nonempty invalid model unit price, the verifier can propose the actual
printed unit token in a complete separate expression or Costco SKU row. It
requires resolved matching currency, matching source identity/photo/quantity,
reliable source rows, exact word-to-row character alignment and at least 0.98
confidence on the OCR word that actually contains the unit token. A matching
quantity or row-total word cannot substitute for that word, even if their text
is identical. Copying a unit price never counts as independent agreement.

Valid conflicting amounts, empty values, sign changes, uncertain currency and
misaligned or low-confidence evidence stay unresolved. A row total is never
divided by quantity or copied as the unit price merely because quantity is one.
The previous model value remains visible with a pending recovery check. Product
association and quantity-role checks survive reader agreement. Unmatched
expressions retain a blocking coverage check and available source regions, even
when all proposed purchases happen to balance.

Two remaining source unit words score about 0.950 and 0.972, below the required
threshold; a currency conflict and unlabelled numeric columns also prevent other
recoveries. No threshold is relaxed to improve the reported count. OCR confidence
is supporting evidence, not calibrated correctness or proof of a payable bill.

Verified graph/source locations are `src/lib/purchase-expression.ts:L17`
(`matchPurchaseExpression`), `src/lib/purchase-expression.ts:L90`
(`separatePurchaseRows`), `src/lib/parser.ts:L41`
(`parseReceiptWithSources`), `src/lib/recover-invalid-price.ts:L17`
(`recoverInvalidPrice`) and `src/lib/verify-readings.ts:L158`
(`verifyIndependentReadings`).

## Actual local-model phone workflow

The three-item development photograph has source SHA256
`7316212ee8a682fddf14f7aecb084fd8cab3159b905326bffe9dd1aa84e6f996`.
The final code was tested with installed Paddle/Qwen, local HTTP and Chrome phone
emulation. Explicit IDR is supplied only after extraction; both backend bodies
contain image panels without currency, expected prices or reference hints.

Both paid products retain quantity 1 and line price 22000, and their model unit
readings `22.000` become pending proposals of `22000` from the actual printed unit
tokens. Previous values, quantity checks and source highlights remain available.
The unit-price source view opens, its confirmation stays unchecked, and the
layout fits 390 CSS pixels. No financial fields are edited. Remaining header,
bag-code, tax-basis and source-coverage issues keep bill confirmation disabled.

Scan to editable review took **60,217 ms** in the final observation. The earlier
passing observation took 59,367 ms before the financial-label/footer guards.
Both are repetitions of the same inspected receipt, not independent accuracy
samples, a physical handset, speed comparison or p95. Each used two local
extraction POSTs without retries or external receipt requests.

## Validation and remaining work

Forty-eight new financial/association tests cover print order, literal role
selection, repeated and free products, source indices, short/non-Latin titles,
photo and footer boundaries, financial markers, pack notation, missing/ambiguous
numbers, currency precision, unit-word confidence and alignment, independent
agreement, input immutability and unmatched coverage. The original role prototype
had four failing tests; a later label review reproduced ten failures. Exact
prototype sources and failed logs are retained with the corrected evidence.

The full unit suite passes 585 tests, and the desktop/mobile browser suite passes
167 tests with one existing skip. The production build/typecheck, formatting and
graph checks pass. Browser artifacts and protected source/Git state are sealed
separately in the [validation packet](advanced-purchase-expressions-validation-v1.json).
The build reports a main-chunk size warning; this change makes no load-time or
production sizing claim.

The [683-file comparison packet](advanced-purchase-expressions-v3.json) binds
both readers, exact retained inputs, frozen sources actually loaded, original
labels, detailed scores, failed prototypes and both native phone observations.
Unlabelled tables, other unit formats, charge/tax roles, broader image geometry,
genuine missing document types, calibration and public release acceptance remain
open. Models, prompts, default provider, upload allowances and billing are unchanged.

```powershell
python -X utf8 receipt_training/scripts/build_purchase_expression_report.py --check
node receipt_training/scripts/capture_source_price_validation.mjs --expressions --check
```

These checks are offline. The full twelve-phase goal remains active.
