# Literal source proposals for invalid receipt totals

The independent local verifier now proposes a literal OCR subtotal, final total
or printed tax when the vision amount is nonempty but invalid for the resolved
currency. It keeps the previous value, highlights the labelled source and adds a
pending review check. Copied source evidence never counts as independent model
agreement and never confirms the bill automatically.

## Same-reading original-fifty comparison

All fifty retained row-first vision drafts and independent current Paddle
readings pass through frozen before/after verifier modules. Images, model
outputs, original labels and split membership are unchanged. This isolates
verification from model recognition. No inference or external request occurs in
the replay.

| Known field | Before | After |
| --- | ---: | ---: |
| Copied final totals, automatic currency | 33/49 | 34/49 |
| Copied final totals, explicit currency after extraction | 33/49 | 41/49 |
| Subtotals, explicit currency after extraction | 25/34 | 27/34 |
| Line prices, explicit currency after extraction | 126/143 | 126/143 |
| Purchased quantities | 119/120 | 119/120 |
| Known unit prices | 22/31 | 22/31 |
| Known printed tax | 13/22 | 13/22 |

The eleven proposals across the two currency views match existing known labels,
with no scored per-case regression. The same automatic-currency case occurs in
both views, so these are not eleven independent receipt samples. Eight receipts
gain a final total with selected currency, two of them also gain a subtotal;
one of those eight also gains its total automatically from printed currency.

All purchase fields, currency, merchant/date, tax basis/codes and adjustments are
unchanged. The two subtotal changes do not infer quantities, unit prices, charges
or tax. Complete financial truth remains insufficient for all fifty; these
copied-field improvements do not establish correct payable bills. The original
38-development/12-evaluation split is unchanged, already inspected and not a
blind holdout.

## Evidence and refusal rules

The rule reuses the existing literal amount helper. Currency must be resolved
and match in both readers; an original conflicting model currency or conflicting
long-receipt batches prevent recovery. The model amount must be invalid, not
merely different from the source. Every matching source row must be reliable,
with its financial label at the start. The parser's amount must match the unique
literal candidate and its actual monetary word must score at least 0.98.

Valid conflicts, empty values, changed signs, multiple labelled totals, weak
labels/amount words, absent word geometry, product/tender/subtotal confusion and
embedded instructions do not yield a final-total proposal. Multiple equal totals
also remain unresolved. A legible `TOTAL` followed by a different `GRAND TOTAL`
is deliberately withheld; this checkpoint does not infer which role the first
line has. No purchase sum, balancing equation, payment amount, reference label or
model self-confidence selects a value. OCR confidence is advisory, not calibrated
proof.

Separate model batches can also disagree on one header while agreeing on
currency. Recovery is disabled for that header, preserving the provisional
reading and blocking conflict check. Other item-price proposals remain available.
Three focused pre-guard tests reproduced this defect; their failures and the
earlier verifier/join sources are retained with the corrected result.

Verified graph/source locations are `src/lib/verify-readings.ts:L157`
(`verifyIndependentReadings`), `src/lib/recover-invalid-price.ts:L16`
(`recoverInvalidPrice`) and `src/ReviewChecks.tsx:L49`. The last component now
labels detail lists “Source comparison” so both proposals and removed entries
can be described accurately. The fallback in `src/lib/compared-reader.ts:L19`
reports no receipt-level recovery when the independent comparison fails.

## Actual local-model phone workflow

The existing five-item development photograph was freshly processed by installed
Paddle/Qwen through local HTTP and Chrome phone emulation. The original image SHA
is `893039ec50d04a6d8d151ebfa47a98528f4e8cb5abfc0097183b64dafbd10895`.
Explicit IDR is supplied only after image extraction; both backend request bodies
contain prepared image panels without a currency or expected-value hint.

The UI proposes `221000` from the printed `SUBTOTAL 221,000`, retaining the model's
invalid `221.000`, and `261333` from `TOTAL 261,333`, retaining `261.333`. It also
retains all five correct purchase-price proposals. Both header checks remain
unconfirmed. The total's source view opens with the highlight, literal OCR text,
previous reading and unchecked confirmation. The phone layout fits 390 CSS pixels;
bill confirmation stays disabled because units, charge roles and other fields
still need review. No financial fields are edited.

Scan to editable review took **96,898 ms** in this one observation. There were
two local extraction POSTs, no retries and no external receipt requests. This is
not a physical handset, p95, speed comparison, unseen-document trial or complete
financial success.

This single-batch native observation precedes the isolated final header-conflict
guard. The final frozen fifty-receipt replay verifies the ordinary path, and
three synthetic per-field batch cases verify the guard. No additional native or
real multi-batch-conflict receipt result is claimed.

## Validation and limits

Seventeen new financially meaningful tests cover all three fields, input
immutability, pending review, non-agreement, valid/empty values, currency precision
and conflicts, repeated totals, weak/missing evidence, row roles and embedded
instructions, signs, independence from item sums and matching/conflicting
multi-batch currencies and per-header conflicts. The standard unit suite passes
537 tests. All 167 standard desktop/mobile browser checks pass with one existing
skip. The production build/typecheck, formatting and graph checks pass. The
[source/build/validation packet](advanced-scalar-validation-v1.json) also verifies
that the stable branch and original checkout's three dirty files are unchanged.

The [584-file comparison packet](advanced-scalar-recovery-v2.json) binds exact
inputs, frozen sources actually loaded, unchanged truth, detailed field scores
and the actual native workflow. Current header inference still misses some
labels/layouts and valid wrong model amounts are preserved for review. Unit
prices, taxes/charges, broader image quality/overlap support and the full public
release acceptance requirements remain open. No cloud provider, default reader,
billing or upload authorization changes.

```powershell
python -X utf8 receipt_training/scripts/build_scalar_recovery_report.py --check
node receipt_training/scripts/capture_source_price_validation.mjs --scalars --check
```

The twelve-phase goal remains active.
