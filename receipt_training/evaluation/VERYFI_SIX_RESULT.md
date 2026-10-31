# Six-receipt Veryfi result

**Later local fix:** [reduced-price grouping](REDUCED_PRICE_GROUPING.md) raises
the text/parser path to 26/26 matched descriptions and 25/25 readable line prices
with selected currency, using these saved outputs and zero further uploads.
The table below preserves the comparison before that isolated parser change.

The approved comparison is complete: six extraction requests succeeded, and
Veryfi reported deleting all six matching new test records. There were no
retries, Gemini uploads or paid activation. The six-receipt permission is now
consumed. Deletion success does not establish zero retention or exclusion from
provider model improvement; the account invoice was not inspected.

The wider screen does **not** justify changing the default reader. Veryfi's
native structured fields are weaker here than the local vision reader. Its
literal OCR text is useful, but the current parser loses some of that text's
information. Matching aggregate price counts conceal different failures.

| Path on the same six crops | Matched names / 26 | Known line prices / 25 | Attached coupons / 3 | Copied final totals / 6 |
| --- | ---: | ---: | ---: | ---: |
| Veryfi native structured fields | 22 | 18 | 0 | 3 |
| Veryfi OCR text → current parser, automatic currency | 22 | 16 | 2 | 1 |
| Veryfi OCR text → current parser, selected currency | 22 | 22 | 2 | 3 |
| Paddle → current parser, automatic currency | 20 | 13 | 0 | 1 |
| Paddle → current parser, selected currency | 20 | 19 | 0 | 3 |
| Local Qwen vision reader | 26 | 22 | 0 | 3 |
| Independent Paddle + Qwen verifier | 26 | 22 | 0 | 3 |

Selected currency means the predeclared currency supplied **after** extraction,
as a simulated user selection. It was never sent to any provider/model. Qwen
and the independent verifier have the same field counts with either context.
Name matching uses the frozen description-only, one-to-one matcher; exact
normalized descriptions are 20/26 for native Veryfi, 19/26 for its text/parser
path, and 25/26 for Qwen/verifier. A matched name is not an exact transcription.

Native Veryfi matches 15/15 known quantities and 8/11 known unit prices, while
its text/parser path matches 9/15 and 9/11. Unknown quantities, pack counts and
unit prices are excluded. None of these counts verifies a complete receipt.

The results reveal specific limits:

- Bristol: native fields misassociate several product prices and attach none
  of three coupons. OCR text plus the parser gets all nine purchase prices and
  two coupon associations. It preserves both genuine repeated cashews. The
  prepared crop cuts through the bottom total label; OCR returns
  `OTAL(INCL VAT)`, and final-total recovery fails. This input limitation
  prevents attributing the failure solely to the provider.
- Taiwan: native currency is HKD although the receipt prints New Taiwan Dollar.
  Native total 1158 is correct; the separate negative redemption's financial
  type/ownership remains unresolved. Its value is not silently attached to the
  membership fee as a discount.
- Tesco: both native fields and text/parser match six of ten descriptions and
  six of nine readable prices. The raw text contains the other readable price
  tokens, but multiline `REDUCED PRICE` rows are grouped incorrectly. The first
  faded price is still unknown, with no total-based reconstruction. Qwen gets
  all nine known prices on this case.
- Restaurants: selected-currency parsing handles three dot-grouped prices that
  Qwen returned as invalid canonical decimals. However, native Veryfi tax on
  the faint receipt is 4.36 instead of the printed `4.364` (4364 IDR); its raw
  text ends that amount with `A`. Neither is repaired from the reference.

No path establishes a source-verified payable result. A correct copied final
total is not a reconciled calculation. Artificial research coverage checks
remain, alongside real missing fields, grouping errors, tax-basis uncertainty
and discrepancies. Purchase precision and complete-receipt financial accuracy
remain unscorable rather than being inferred from matching totals.

The request used the exact six lossless PNG crops and frozen options
`compute=false`, `bounding_boxes=true`, `confidence_details=true`. These options
differ from the earlier successful one-receipt default-options probe, so this
is not a clean before/after experiment on those settings. No merchant/country/
currency hint, reference label or earlier OCR was sent. Scored native fields
include real boxes, but grouping errors still occur. Combined OCR text has no
complete word geometry; no made-up boxes/confidence are supplied to the verifier.

Observed request-plus-cleanup times were 4068, 5221, 2675, 2597, 2608 and 2698 ms.
Those include network and deletion. They cannot be ranked against warm Paddle
inference or Qwen's fresh CLI loading/encoding/generation. No p95, billed cost
or speed ratio is claimed from six calls.

The [599-file checkpoint](advanced-veryfi-screening-result-v1.json) preserves
exact input/request/response hashes, approval/consumption, matching cleanup,
native field audits, frozen parser code and 48 offline variants: twelve from
Veryfi text and 36 existing local controls. Eight new synthetic audit tests
pass, covering null confidence-wrapped values, exact decimals, wrong currencies,
negative-line ownership, immutable outputs and changed/mismatched evidence.
The previously sealed fifteen transport/batch safety tests also passed.

The local controls precede the [unknown-tax review fix](UNKNOWN_TAX_REVIEW.md).
Its separately preserved replay adds required review checks without changing
extracted values. This comparison changes no application source or provider.
Original fifty-receipt labels, split membership, permissions and stable branch
remain preserved. These six source-informed crops are assistant-reviewed
development evidence, not independent human truth or a new blind holdout.

Next, use the saved independent outputs to test complementary recovery locally.
Do not select between conflicting prices by choosing the one that balances the
bill. Broader genuine digital receipts, phone capture and complete financial
annotations remain necessary before public-release claims.

```powershell
python -X utf8 receipt_training/scripts/build_veryfi_screening_result.py --check
python -X utf8 receipt_training/scripts/test_review_veryfi_screening.py -v
```

The check commands make no external requests. Live extraction must not be
repeated with the consumed authorization.

The tracked comparison contains derived per-case amounts and error counts.
Receipt images, full provider responses and credentials remain in ignored local
artifacts; checking their hashes requires those private bytes.
