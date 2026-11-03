# Mixed net goods and gross fees: financial checks pass, broader validation incomplete

3 November 2026. This financial implementation has focused, native calculation,
type and build evidence. **Full regression and browser validation are incomplete.**
It is not an OCR improvement or a completed twelve-phase acceptance checkpoint.
The preceding source with a complete passing unit run remains
`0b68d8dda63b34e4774d8e303aad11831c4f74b4`.

## Observed baseline

The separate public Western Towing invoice visibly prints net goods of 16.32
and 3.75, subtotal 20.07, carriage 4.98 including VAT, full VAT at 20% of 4.84,
and final total 29.06. These values were manually transcribed from the source;
this is not a new extraction or an independent human annotation.

The native baseline calculation actually ran on the unchanged parent source.
It produced **29.89**, an **83p discrepancy**, while preserving the input strings.
Its guarded process completed in 1,759 ms with 2,063,417,344 bytes available at
startup and a 2,035,146,752-byte minimum. No receipt/model request or environment
file access occurred. The retained baseline JSON includes the source-image hash.

## Implemented and locally checked financial behavior

An optional `includedTaxRate` on a fee records an explicitly supplied rate;
there is no default rate or automatic inference from a country or tax letter.
The fee keeps its full printed amount. Embedded tax is derived as
`gross fee × rate / (100 + rate)`, using exact integer arithmetic and the existing
nearest-minor-unit rounding. This fraction follows the
[HMRC VAT guide](https://www.gov.uk/guidance/vat-guide-notice-700).
Supplier rounding can differ; a discrepancy must remain visible rather than
changing a printed amount to make the receipt balance.

For net goods and one full printed tax adjustment, the fee component is
subtracted once from **added** tax. The executed example has 0.83 already in
carriage, 4.01 added tax, and 20.07 + 4.98 + 4.01 = 29.06. The source still says
4.98 carriage and 4.84 VAT. With item tax codes, the goods' added tax is unchanged
and the printed VAT check includes embedded fee tax. With gross goods, tax is
not added again. The derived fee component is informational in the summary.

The draft rejects missing/invalid explicit rates, fee metadata on other
adjustment kinds, ambiguous multiple printed-tax rows, and incompatible tax
directions. Focused cases also cover explicit codes, gross goods, signed refunds,
several currencies/rates, persistence, review invalidation and split conservation.
Ordinary adjustments without this optional field retain their prior calculation
path in the executed legacy control.

The UI adds a labelled fee checkbox and rate input using the existing form
components. Changing its type clears the rate. The confirmation text includes
the rate, and the existing adjustment/receipt fingerprints include the field.
Phone layout has **not** been verified for these new controls.

## Verification status and next action

The [retained evidence packet](included-fee-tax-v1.json) binds the source,
successful checks and incomplete/failed attempts separately.

The first attempted test startup was refused before process creation at
462,942,208 available bytes. After a qualifying memory change, the first actual
run passed 39/40: the failed assertion incorrectly demanded even person totals
from two separately rounded odd-penny refund items. The corrected expectation
retains the existing stable allocation rule. That failure is preserved.

The final **80 focused cases pass**, including all 40 new fee cases. Typecheck,
formatting and the isolated build complete. The native after-probe uses the exact
same receipt as the baseline and verifies 29.06, no source-value mutation, 0.83
embedded fee tax, 4.01 added tax, and whole-receipt shares of 14.53/14.53. Item-wise
equal shares are 14.54/14.52 because both odd-penny item residuals go to the first
person under the existing stable rule.

The full unit run reaches its unchanged 240-second deadline without a complete
result. An isolated process-reader run records test and cleanup-hook timeouts,
then is stopped at 106,042 ms when available RAM falls to 1,068,097,536 bytes,
below the 1 GiB runtime floor. The reader, its fixture and its test source match
the previous verified bytes. **This does not establish the cause of the earlier
timeouts or a full regression pass.** The remaining 68-file batch is held at
startup (1,455,017,984 available bytes); the vision batch is unexecuted. No test
timeout or resource threshold is increased to obtain a pass.

The frozen original-fifty replay executes **400 saved-reading views** with no
new inference. Scoring is subsequently held before startup at 1,465,495,552
available bytes; its count comparison and the prepared paired analysis are
unexecuted. No new accuracy or no-regression claim is made from that replay.
The original references and historical scores are not edited.

The three prepared built-browser manual-entry cases cover 320/390/1440px,
explicit-rate validation, type-change reset, persistence, split and overflow.
Their unchanged 2.5 GiB startup guard refuses at 2,341,171,200 bytes; no browser
is spawned. They are not executed phone evidence. The code graph is refreshed
locally to 232 files, 899 nodes and 1,602 links, with no LLM call.

Next diagnose the protocol-worker timeouts without changing the guards, finish
the remaining unit batches, score/analyze `grouped-amounts-v27`, and run the
prepared browser cases only after a qualifying memory observation. The older
1,256-test pass must not be represented as a result for this source. Do not close
user apps or change reference truth to bypass an incomplete check.

Automatic extraction of this mixed-basis invoice remains unresolved. This draft
does not change its historical strict-reference eligibility or claim a correctly
scanned transaction. No source invoice, receipt crop, credential or API request
was sent anywhere.
