# Browser medium reader: field gains and the cost of incomplete delivery

3 November 2026. Offline scoring of the retained browser trial shows a real
conditional accuracy gain: on the three completed restaurant receipts, medium
matches **27/33 exact descriptions**, compared with tiny's **15/33**. With IDR
explicitly supplied, line prices improve **27/32 to 28/32**. One subtotal
regresses. Medium still fails to deliver the complete two-photo Costco
transaction within the original five-minute bound. No app reader is promoted.

These results support checking the prepared GPU configuration when resources
permit. They do not establish that GPU execution works, runs faster, preserves
these outputs or is suitable for a phone. The prior
[WASM trial and resource measurements](BROWSER_PADDLE_MEDIUM_RESULT.md) remain
unchanged; [GPU compatibility](BROWSER_WEBGPU_READINESS.md) is still unexecuted.

## Conditional field comparison on the three completed CORD receipts

| Field | Tiny | Medium |
|---|---:|---:|
| Matched purchases | 27/33 | 28/33 |
| Exact descriptions | 15/33 | 27/33 |
| Purchased quantities | 0/33 | 4/33 |
| Line prices, automatic currency | 0/32 | 0/32 |
| Line prices, supplied IDR | 27/32 | 28/32 |
| Subtotals, supplied IDR | 3/3 | 2/3 |
| Printed tax, supplied IDR | 1/3 | 2/3 |
| Printed final totals, supplied IDR | 1/3 | 1/3 |
| Receipt fees, supplied IDR | 1/3 | 1/3 |
| Printed rounding, supplied IDR | 1/1 | 1/1 |
| Trusted reconciliation | 0/3 | 0/3 |

Both readers have zero unmatched predicted purchases in these three cases.
The references contain 33 purchase rows but only 32 known line amounts; unknown
prices are not invented. No unit-price reference is available for these cases.
Automatic currency remains unresolved for all three, so the zero automatic
price scores are not a claim that every numeric glyph was misrecognized.
Supplied IDR is separate context, not successful currency recognition. All three
complete-receipt financial accuracy values remain unscorable because the
existing references are partial. These are familiar development cases, not a
blind comparison.

## All four planned transactions, including the failed delivery

The primary delivery comparison keeps the full original four-transaction
denominator. An incomplete transaction receives no correct-field credit; its
known reference fields remain in the denominator. The partial medium Costco
photo is retained but never parsed as a substitute for the two-photo delivery.

| Delivered outcome | Tiny | Medium |
|---|---:|---:|
| Complete image-input deliveries | 4/4 | 3/4 |
| Matched purchases | 45/51 | 28/51 |
| Exact descriptions | 30/51 | 27/51 |
| Purchased quantities | 18/51 | 4/51 |
| Line prices, automatic currency | 18/50 | 0/50 |
| Line prices, context mode | 45/50 | 28/50 |
| Subtotals, context mode | 4/4 | 2/4 |
| Printed tax, context mode | 2/4 | 2/4 |
| Printed final totals, context mode | 2/4 | 1/4 |
| Trusted reconciliation | 0/4 | 0/4 |
| Complete financial receipt, eligible reference | 0/1 | 0/1 |

These are delivery-weighted field matches, not intrinsic model accuracy on
successful images. The three CORD cases above remain unscorable as complete
financial receipts; they are not three additional complete-receipt failures.
Context mode supplies IDR to those three. The UK case uses its printed currency
evidence in both modes, as in the frozen original plan.

Tiny delivers all eighteen UK prices, quantities and unit prices, but only
15/18 exact descriptions and 16/18 item-group associations. It still requires
source review. The failed medium UK transaction contributes zero delivered
matches for all eighteen purchases. No conclusion about its missing footer's
recognition quality can be drawn.

Separately, both readers recover both selected VAT-legend rates and both
selected product descriptions. Tiny gets one of the two selected item tax
codes correct; medium gets both. In the chicken-skewer crop, the observed code
changes from `7` to `Z`. These failure-selected crops are diagnostics, not three
extra transactions or independent accuracy samples.

## Protocol and checks

This is a post-inference analysis. A new protocol was written before the new
financial replay, declaring the missing input, failure treatment, scope and
exact input hashes. It reuses the original v14 plan's source snapshots,
references, matcher and financial scorer. Original images, model observations,
annotation values and original-fifty results are unchanged.

The original geometry adapter exactly reproduces the new analysis adapter's
eight tiny panels across seven case records. The parser replay uses the same
frozen `assembleRecognition` (`src/lib/receipt-layout.ts:L142`),
`parseReceiptWithSources` (`src/lib/parser.ts:L57`) and `calculateReceipt`
(`src/lib/engine.ts:L55`), located through the current graph and verified in
source. An explicit delivery-error branch emits no receipt or calculated
financial values for the incomplete medium transaction. Every known reference
denominator survives. Completed-case scores are unchanged by the delivery
aggregation; failed-delivery correct counts, including absence-only matches,
are zero. Both the original scorer output and this separate aggregate survive.

Sixteen views were scored: two readers, four planned transactions and two
currency modes. No check was confirmed and no financial value was edited.
This does not run the app's complete mandatory-review workflow or permit
automatic financial acceptance.

Only small saved JSON and parser code ran. The offline Node replay took 1.504
seconds with 2,279,866,368 bytes initially available and a minimum observed
2,206,216,192 bytes. Its separate 1.5 GiB startup / 1 GiB runtime guard applies
to JSON/parser analysis only; all browser/model guards remain unchanged.
There was no browser, image decoding, model loading, inference, provider call,
download or API-quota probe. These replay times are not scanner latency.
Medium's missing final network ledger is still missing; no replacement is
fabricated. Application code, dependencies and tests are unchanged, so the
existing 1,095-unit pass and frontend build remain prior validation evidence.

`browser-paddle-delivery-analysis-v1.json` binds the protocol, frozen inputs,
geometry parity, replay/scorer outputs, resource record and protected Git
state. Raw receipt evidence remains in ignored local artifacts. Verify it
without inference:

```powershell
python -X utf8 qa-artifacts/browser-paddle-delivery-v1-control/seal.py --check
```

The improvement branch remains separate from stable and the original dirty
checkout. There is no merge, push, deployment or cloud permission change.
The full goal remains active: these conditional field gains do not resolve
the incomplete delivery, weak quantities, physical-device, capture calibration,
financial-truth or public-release gaps.
