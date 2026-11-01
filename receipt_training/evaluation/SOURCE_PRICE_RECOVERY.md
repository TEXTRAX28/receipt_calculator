# Literal source prices and Azure word-layout comparison

The local hybrid can now propose a literal OCR row price when the vision amount
is invalid for the resolved currency. It preserves the previous value and source
region, and adds an unconfirmed recovery check. A copied proposal is not counted
as independent agreement and cannot silently enable confirmation.

## Original fifty: isolated verification change

All fifty retained row-first model outputs and their independent current Paddle
readings were replayed through frozen before/after modules. Image bytes, model
outputs, reference labels and 38-development/12-evaluation membership stay fixed.
No model or provider calls occur in this replay.

| Known original-cohort fields | Before | After |
| --- | ---: | ---: |
| Line prices, explicit currency after extraction | 115/143 | 126/143 |
| Line prices, automatic currency | 115/143 | 115/143 |
| Matched purchases | 143/145 | 143/145 |
| Exact normalized descriptions | 132/145 | 132/145 |
| Purchased quantities | 119/120 | 119/120 |
| Unit prices | 22/31 | 22/31 |
| Copied final totals | 33/49 | 33/49 |

All eleven changes match existing known prices, without a scored per-case
regression. Currency, names, grouping, quantity, unit prices, discounts, headers,
tax and adjustments are unchanged. These gains require explicit currency context;
they are not automatic currency recognition or conversion. All fifty complete
financial results remain unscorable under the current truth, and require review.

The rule requires a forced order-preserving source match, matching names (or a
matching possible leading count), the same source photo, resolved matching
currency and a real monetary OCR word with confidence at least 0.98. It copies
the source token through the existing printed-number normalizer. It does not
multiply a unit price, divide a row total, choose an amount that balances the bill
or use a reference value. OCR confidence is supporting evidence, not calibrated
correctness or proof.

Valid conflicting prices and empty prices are preserved. Currency conflicts,
uncertain identity, ambiguous duplicate matches, sign changes, low monetary-word
confidence and visible unit-price-only headers prevent a proposal. Three-decimal
currencies retain their ordinary valid amounts. Genuine repeated purchases stay
separate. Quantity/source checks and other field uncertainty remain pending.
When long-receipt batches disagree on currency, recovery is disabled for the
joined draft; each original amount and the blocking currency check remain.

Implementation is in `src/lib/recover-invalid-price.ts` (`recoverInvalidPrice`,
L16), called by `src/lib/verify-readings.ts` (`verifyIndependentReadings`, L157).
The no-comparison/failure result in `src/lib/compared-reader.ts` (L19) correctly
reports no price recoveries. Source locations were checked against the local
graph and actual files.

## Real native phone workflow

One actual five-item development image was processed by installed Paddle and
Qwen through local HTTP and the phone-emulated browser. Explicit IDR was selected
before scanning but supplied only after extraction; both backend bodies contain
only prepared image panels. No financial values were edited.

The UI proposes 45,000 / 55,000 / 49,000 / 33,000 / 39,000 from the source, retaining
the vision readings `45.000` / `55.000` / `47.000` / `33.000` / `39.000` for review.
The wings example corrects a wrong digit as well as invalid amount formatting.
All five recovery checks remain unconfirmed. The original source view opens,
the layout fits 390 CSS pixels, and confirmation remains disabled.

The complete passing run reached editable review in **84,574 ms**. It is one
source-inspected development observation, not a p95, speedup, handset or complete
financial success. Unsupported unit prices and other receipt fields still need
correction. The first run reached the correct prices and source view but its
test close-button selector was ambiguous. That failed test and its trace are
preserved; a scoped-selector rerun passed. No application timeout, model retry or
extra external upload is attributed to that selector failure.

These actual native runs precede the final isolated batch-currency guard. The
final saved-reading replay verifies the ordinary path, and synthetic tests
verify matching and conflicting batch currencies. No further native run or real
multi-currency receipt result is claimed.

## Azure geometry: a separate research path

The six previously approved Azure responses already contain genuine word text,
polygons and OCR confidence. A plain `content` replay read 0/25 known prices
because descriptions and columns are emitted on separate lines. Reusing the
existing horizontal row helper improves that to 19/25 with explicit currency.

A research-only local-baseline adapter then uses word-edge orientation and
font height to group sloping rows. It rejects overlapping word slots, preserves
rotated margin text as separate evidence and keeps every word, source box and
real repeated purchase. All image pixels stay unchanged. Original row boxes
enclose their actual source words; derived confidence is their minimum real
word confidence. The API's orientation/polygon convention was checked against
[Microsoft's REST schema](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/get-analyze-result?view=rest-aiservices-v4.0+%282024-11-30%29).

| Same six crops, explicit currency | Matched names /26 | Prices /25 | Coupons /3 | Copied totals /6 |
| --- | ---: | ---: | ---: | ---: |
| Current Paddle/parser | 24 | 21 | 0 | 3 |
| Azure horizontal word layout/parser | 21 | 19 | 0 | 3 |
| Azure oriented word layout/parser | 26 | 25 | 2 | 4 |
| Retained Qwen | 26 | 22 | 0 | 3 |
| Azure word layout plus retained Qwen | 26 | 22 | 0 | 3 |

The oriented primary path retains 9/15 known quantities and 9/11 known units;
the retained Qwen/hybrid keeps 15/15 and 10/11. Thus perfect known-price count does
not establish the best complete financial pipeline. The hybrid still withholds
three crop prices: the faint restaurant's polluted source name does not force a
match; a tea size conflicts with the vision reading, and the tea/add-on rows have
low source word confidence. The new recovery rule does not bypass those guards.

This is a tuned, source-informed six-crop screen, not unseen-document validation.
The retained cropped Qwen controls predate the row-first generation order; no
fresh current-model result on these six PNGs is claimed. The original fifty use
their separately retained row-first JPEG readings. Native Azure structured
fields remain the earlier 23/25-price result, including wrong currencies on four
cases; they are not used by the word-layout adapter. It uses no native amounts,
country/currency or document-field confidence, no labels and no new inference.

Azure keeps its own vendor identity in research. Its real panel geometry is
validated before the reusable assembly/verifier is called; no local-engine alias
or fabricated confidence is supplied. An Azure app reader is not registered,
and the default provider is unchanged. The previously approved Azure, Veryfi and
Gemini upload scopes remain consumed. This checkpoint makes zero external calls.

## Verification and remaining work

Current checks pass **520 unit tests**, **167 browser tests with one existing
skip**, typecheck/build, formatting and graph refresh. Fourteen new price tests
cover pending review, non-agreement, preserved valid/missing values, total
independence, currency conflicts, low confidence, unit-only columns, signs,
duplicates, source photos, three-decimal currency, retained quantity checks and
matching/conflicting currency across long-receipt batches.
Nine geometry tests cover sloping/repeated rows, local orientation, rotated
margins, confidence preservation, text-independent grouping, ignored native
fields, invalid geometry and rigid page rotations. These are synthetic invariant
checks, not new recognition samples.

The [873-file comparison checkpoint](advanced-source-price-recovery-v2.json)
binds the original-cohort and six-crop replays, source snapshots, exact inputs,
proposal evidence, detailed scores and both real phone attempts. Original frozen
outputs and truth are unchanged. Further work includes header/charge recovery,
quantity/unit roles, broader unseen geometry evaluation, an explicitly consented
optional Azure integration and the full production acceptance audit. No public
release, calibrated confidence or complete-financial-accuracy claim is made.

```powershell
python -X utf8 receipt_training/scripts/build_source_price_report.py --check
python -X utf8 receipt_training/scripts/test_azure_word_geometry.py -v
```

These checks are offline. The wider twelve-phase goal remains active.
