# Uppercase purchase-count correction

3 November 2026. The existing leading-count rule recognised `1 x Product` but
left `1 X Product` in the name with a blank purchased quantity. A single
case-insensitive matching flag now treats both markers consistently.

The original CORD restaurant photograph was inspected locally. Its saved
medium-reader text includes `1 X Bbk Bengil Nasi 125,000`. With supplied IDR,
the parser now proposes quantity `1` and preserves line price `125000`, leaving
unit price blank. This is still an unconfirmed source proposal: a leading count
can describe pack contents. Reader agreement does not remove that check.

The graph locates `parseReceiptWithSources` at `src/lib/parser.ts:57`; the
changed expression is at line 648. Tests are in `tests/leading-quantity.test.ts:1`.
Existing whitespace, alphabetic-name, negative-row and trailing-expression
guards remain. Numeric measurements, product codes and bare leading numbers
are not newly interpreted as quantities. No retailer-specific exception or
inferred unit price was added.

## Measured effect

The pre-edit protocol and 68 frozen library files are in
`qa-artifacts/grouped-amounts-v15`. The original fifty saved readings are replayed
as 400 before/after, primary/hybrid, automatic/supplied-currency views, using the
same references, matcher and scorer. These are familiar development receipts,
not a blind validation set. The independent browser comparison reuses existing
tiny/medium outputs; it makes no new browser or model call.

| Known purchased quantities | Before | After |
| --- | ---: | ---: |
| Original 50, primary, automatic currency | 30/120 | 32/120 |
| Original 50, primary, supplied currency | 32/120 | 34/120 |
| Original 50, hybrid, either currency mode | 119/120 | 119/120 |
| Three completed CORD receipts, medium, either mode | 4/33 | 12/33 |
| Three completed CORD receipts, tiny, either mode | 0/33 | 0/33 |

The two original-cohort gains occur on `cord-v2-train-023` and
`cord-v2-validation-003`. No other scored field changes and no scored regression
occurs. Names lose the explicit quantity prefix, but the existing name scorer
already normalises that prefix, so exact-name scores do not improve.

Across all 416 replay views, changed quantities retain their mandatory source
checks. Item prices, unit prices, discounts, tax codes and printed summary
amounts are unchanged. Medium's incomplete two-photo UK delivery remains an
explicit failure with no partial draft credited. No missing image is retried.
Hybrid trusted reconciliation remains 0/49; complete-receipt accuracy remains
unscorable for the original fifty because their references are partial.

## Verification

The expanded leading-quantity tests first produce 21 passes and four failures
on the unchanged parser, including the saved restaurant row and the independent
reader review guard. After the fix, all 25 pass; the combined focused suite
passes 129/129 and the full unit suite passes 1,104/1,104 with zero skips.
Typechecking, an isolated production build, formatting, diff and graph checks
pass. The build retains the known OpenCV externalisation and large-chunk
warnings. Environment-file loading and provider credentials are excluded.

No new phone/browser execution is claimed for this parser-only change. The
previous phone source-review result remains evidence for its earlier build.
No cloud requests, model inference, downloads, quota probes or billing changes
occurred. Stable and original checkouts are preserved; nothing is pushed or
merged. This correction does not promote the medium reader or complete the
twelve-phase goal.

The hash-bound packet is `uppercase-purchase-counts-v1.json`. Local verification:

```powershell
python -X utf8 qa-artifacts/grouped-amounts-v15/seal.py --check
```

The retained protocol, frozen sources, raw predictions, scorer inputs and
before/after test results allow this offline comparison to be inspected without
consuming provider quota. Historical reports keep their original results.
