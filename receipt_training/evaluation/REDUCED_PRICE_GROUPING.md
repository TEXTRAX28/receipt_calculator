# Reduced-price grouping after the Veryfi screen

The [six-case comparison](VERYFI_SIX_RESULT.md) exposed a parser failure:
multiline supermarket products were being named `REDUCED PRICE`, leaving the
real product names disconnected from their selling prices. The parser now
associates an immediately adjacent product title with its following reduced
selling-price row, independently of merchant identity.

| Saved Veryfi OCR text | Matched descriptions / 26 | Known line prices / 25 |
| --- | ---: | ---: |
| Before, automatic currency | 22 | 16 |
| After, automatic currency | 26 | 19 |
| Before, selected currency after extraction | 22 | 22 |
| After, selected currency after extraction | 26 | 25 |

This is the same six cropped inputs and saved provider outputs, replayed without
new model/API calls. Only the parser changed. Only the two Tesco context variants
change; all other provider-text drafts remain semantically identical. The
selected-currency result is not successful automatic currency recognition.

The unreadable first Tesco price remains empty even though the printed total
is available. Its description is retained so the missing purchase is visible.
Pack counts such as `6 JAM DOUGHNTS` stay in the name; purchased quantity and
unit price remain unknown. A reduced selling price is used once, rather than
being subtracted again as an additional discount.

Every recovered price association gets a source-review check. An unpriced
product stays blocked by the arithmetic validator. Orphan labels and labels
separated from a product by a photo boundary or unrelated line do not create
guessed purchases. Signed reductions keep separate classification review.

Replaying the original 38 development and 12 evaluation receipts preserves
every extracted financial value and calculated monetary amount in the frozen
independent hybrid. Tesco's source grouping changes its verification checks;
its existing bad quantities/unit prices and discrepancy remain blocked. The
paired UK supplement is also unchanged. Two additional existing individual
photo outputs were replayed and recorded separately, without matched prior
controls or claims of regression improvement.

The new test covers the actual text-to-review workflow on desktop and phone
emulation: missing price, unknown quantities, repeated names, explicit manual
correction, persistence, source checks and arithmetic blocking. A human edit
records a verified correction under the existing interface contract; it does
not bypass the independent calculation. Source verification can be revoked.

The [frozen result](advanced-reduced-price-grouping-v1.json) binds the original
comparison, saved before/after outputs, actually loaded code, source references,
regressions and validation artifacts. Implementation is in
[`parseReceiptWithSources`, line 40](../../src/lib/parser.ts#L40), as recorded in
the local graph and checked against the source.

Validation passed: 377 unit tests, 143 browser tests with one existing skip,
the production build/type check, formatting and current-graph checks. The two
focused desktop/mobile tests also pass. Three initial test-expectation failures
were corrected without changing application behavior; their exact sources,
traces and logs remain preserved. The 795-file checkpoint also records the
unchanged set of thirteen historical evidence gaps; those older gaps are not
claimed as repaired.

These six source-informed crops still do not establish complete-receipt
financial accuracy or justify a default-provider switch. Restaurant tax errors,
coupon ownership, missing quantities and incomplete final-total recovery remain.
Phone emulation verifies layout and behavior, not physical-camera quality or
real handset performance. The original fifty-receipt labels and splits are
preserved, and the consumed cloud permission has not been reused.

```powershell
python -X utf8 receipt_training/scripts/build_reduced_price_report.py --check
```
