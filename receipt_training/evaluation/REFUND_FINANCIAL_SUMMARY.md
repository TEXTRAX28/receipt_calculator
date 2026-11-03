# Separately printed tax on signed refunds

3 November 2026. Local development checkpoint, parent commit
`5e7d6b8ab8122119f9786b1355de86b0790caaf6`. This fixes interpretation of
readable financial rows; it does not improve the OCR model or establish a
complete, independently verified receipt.

The enhanced reader already copied the published Costco refund's subtotal
`499.99-`, tax `43.12-` and total `543.11-`. The draft nevertheless used
tax-inclusive item prices and item-code tax calculation with no known Y rate.
With USD supplied, it calculated −$499.99, leaving a $43.12 discrepancy.
The new source-backed proposal uses tax-exclusive item prices and the literal
−$43.12 printed tax once, calculating **−$543.11**. Tax convention, adjustment
roles and product classification remain pending. Quantity and unit price stay
empty; the printed Y code is preserved without inventing its rate.

## Source rules and implementation

The graph locates `readFinancialSummary()` at
`src/lib/financial-basis.ts:L311` and `strongWords()` at `L52`; those lines were
verified against current source. The complete bounded summary must have one
subtotal and one final-total heading, actual source geometry and exact word
coverage. Every financial label and amount word still requires confidence
at least 0.98. This is an extraction threshold, not a correctness probability.

Only separately recognized, standalone leading asterisk words can be omitted
from that word-confidence test. On the actual total row, `****` scores 0.825,
while `TOTAL` scores 0.9995 and `543.11-` scores 0.9880. A weak attached word,
label or amount still blocks the proposal; text, signs, source boxes and
original OCR output remain untouched. An undecorated weak line still blocks.

Signed subtotals, taxes, totals and fees must have compatible directions.
Printed rounding keeps its sign. Refund discounts remain unsupported because
their reversal convention is ambiguous. Arithmetic rejects an inconsistent
section; it never supplies a missing amount. Explicit informational footer
labels such as `TOTAL TAX` and `TOTAL NUMBER OF ITEMS SOLD` do not become
additional transaction totals. An unreadable or repeated real total still
blocks rather than selecting whichever section balances.

`recoverDeviceFinancialSummary()` is the graph node
`src/lib/device-review.ts:L16`. It works on a cloned parsed draft and provenance
maps before the existing source-review/evidence collection in `src/App.tsx`.
It requires resolved currency, matching existing scalar literals and source
indices, no source conflicts, no populated tax-code rate and no explicit
inclusive/exclusive wording. A negative summary also needs a sourced negative
product. Conflicting existing tax amounts block; unrelated adjustments survive.
It reuses `recoverFinancialRoles()` (`src/lib/financial-roles.ts:L20`) when roles
need changing, or changes only the basis when the correct printed tax already
exists. It does not mutate the input or duplicate tax on repeat application.

Every proposed basis/mode/adjustment interpretation receives an unconfirmed
review check and the complete summary's actual source indices. The individual
tax adjustment points to its printed tax row. There is no inferred source
rectangle, tax rate, product, amount or quantity. The independent deterministic
validator and exact splitting engine are unchanged.

## Measurements and verification

| Check | Observed result |
|---|---|
| Software regression suite | 1,162 passed; zero failures or skips. TypeScript and isolated production build pass. |
| New source/financial tests | 33 cases cover signed summaries, decorative words, weak money, conflicting totals/rates, unknown fields, immutability, source indices, duplicate tax and review limits. |
| Before-change summary tests | Four failures and thirteen passes on the original implementation; all four failed positive cases now pass. |
| Original fifty | 400 saved-output views / 200 before-after pairs; all product facts and printed subtotal/tax/total values unchanged. No scored regressions. |
| Original-fifty primary, supplied currency | Annotated price basis improves 0/9 to 3/9. Four proposals change basis; the fourth has unknown reference truth and receives no accuracy credit. |
| Original-fifty hybrid and automatic modes | All scored counts unchanged. The stored primary outputs are the existing native-reader cohort, not fifty fresh browser scans. |
| Published pair replay | 16 views / eight pairs, with original source outputs pinned to the preceding date packet. Only enhanced/refund/supplied-USD changes its financial interpretation: discrepancy 4,312 to zero USD cents. |
| Actual built phone workflow | One genuine enhanced local scan with USD selected before reading. UI shows −$43.12 added tax and −$543.11 calculated total; no extracted field edits or check confirmations. |
| Phone source/fit | Product plus refund heading: two regions. Financial summary: three regions. Review and both source dialogs fit 320/390px without horizontal overflow; receipt stays unchanged after opening sources. |
| Confirmation | Blocked. Unprinted quantity/unit price and required source checks remain unresolved; no finalized split claimed. |

The actual phone scan took 4.702 seconds from read-click to review on this laptop.
That is one development observation, not an average, p95, handset benchmark or
controlled speed comparison. The sampled owned Node/browser tree peaked at
1,334,407,168 bytes; the observer reports no errors and all twelve observed
PID/creation-time identities subsequently exited. Browser guards remain
2.5 GiB available at startup, 1 GiB during execution and 300 seconds overall.
The one OCR worker closed. Page routes record no external requests or writes.

The public purchase and refund are two related, publisher-edited transactions
from one family, with partial assistant-read references. They are familiar
development cases. The basic refund's misread decimal and missing total remain
unresolved, as does automatic dollar-currency detection. Neither the purchase's
faded products nor full-receipt accuracy improves here. No reference was changed
after observing these results.

## Reproduction and preservation

`refund-financial-summary-v1.json` binds the exact evidence. To verify retained
bytes without OCR or provider calls:

```powershell
python -X utf8 qa-artifacts/refund-financial-summary-v1/seal.py --check
```

The original-fifty source snapshots and runner are in
`qa-artifacts/grouped-amounts-v19/`; the public replay, source tests, controllers,
analysis and sealing script are in `qa-artifacts/refund-financial-summary-v1/`.
The actual built scan, state and screenshots are in
`qa-artifacts/public-refund-costco-phone-v4/`, with its guard/observer records
alongside. These remain local ignored artifacts; raw publisher receipt imagery
contains residual identifiers and was not uploaded.

Initial integration and test-fixture typing failures are retained. Intermediate
source versions were reconstructed from recorded changes and accepted only when
their complete SHA256 matched the original controller declaration. The final
full suite, typecheck and build use the final source. The earlier 1,162-test pass
also remains preserved; a second full run follows the fixture typing correction.
No failed run is substituted with newer evidence.

Stable remains `ee725ba45e799bee8501d3de034e0302c0127afd`; the original checkout's
HEAD and dirty-diff hash are unchanged. No merge, push, deployment, model download,
private upload, API request, quota probe, billing activation, `.env.local` access,
reference edit or reader-default change occurs. Existing quotas remain exhausted.
The thirteen previously disclosed legacy evidence gaps are not repaired or
reclassified by this checkpoint; no fresh global historical audit is claimed.

The wider goal remains active. Broader genuine-photo coverage and capture
calibration, physical-device/Safari evidence and public service operation remain
open. Human source review is intentional and is not an automatic-acceptance gate
invented for completing the project.
