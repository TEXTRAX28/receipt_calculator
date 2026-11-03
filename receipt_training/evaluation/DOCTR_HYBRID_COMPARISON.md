# docTR versus Paddle with the same vision drafts

3 November 2026. Application parent: `5a64111`.

Keep Paddle as the selected primary reader for the current hybrid. Substituting
docTR loses six known line prices with supplied currency, together with tax,
fee and price-basis matches. It gains two subtotals and improves one Bristol
Costco coupon/grouping. Those tradeoffs do not justify a default switch.

## Fair inputs and actual work

The comparison covers all original fifty familiar transactions, with the same
38/12 development/evaluation membership, saved row-first vision drafts,
68 frozen current library files, v5 partial references, matcher and financial
scorer. It is regression evidence, not a blind holdout. Only the primary OCR
observation changes; neither the vision prompt nor any financial value is edited.

The old docTR results match 45 of the current 51 prepared panels exactly.
Six earlier images are 1500×2667 instead of 1500×2666, with different JPEG hashes.
Those observations are not substituted for the current input. A preregistered
local run reads those six exact current JPEGs once each, using the existing
DB-ResNet50/PARSeq weights and docTR 1.1.0 CPU environment. All six succeed.
The other 45 panels are reused from their completed, hash-bound native runs.
The combined input therefore covers all fifty transactions on identical panel
bytes. Original images and reference annotations are unchanged.

The adapter changes only zero-based photo/panel indexes to the application's
one-based indexes. Word/line text, confidence and geometry are preserved exactly.
All fifty docTR observations pass the real recognition contract. Both primary
text parsers and both independent-verification paths run in automatic and
supplied-currency modes: 400 scored views, with zero replay failures.

The Paddle control reproduces every count in the previous current replay.
The source graph locates `verifyIndependentReadings` at
`src/lib/verify-readings.ts:165`; its matching, confidence, currency, source
recovery and mandatory-review rules are unchanged for both OCR choices.
Engine confidence calibration has not been established. This measures a direct
substitution in the current verifier, not each architecture's best possible
provider-specific implementation.

## Hybrid results on unchanged known references

| Field | Paddle primary + vision | docTR primary + same vision |
| --- | ---: | ---: |
| Matched purchases | 143/145 | 143/145 |
| Exact normalized names | 132/145 | 132/145 |
| Quantities | 119/120 | 119/120 |
| Line prices, automatic currency | 116/143 | 116/143 |
| Line prices, supplied currency | 134/143 | 128/143 |
| Unit prices, automatic currency | 22/31 | 23/31 |
| Unit prices, supplied currency | 26/31 | 26/31 |
| Subtotals, supplied currency | 27/34 | 29/34 |
| Printed tax, supplied currency | 16/22 | 15/22 |
| Final total, automatic currency | 34/49 | 34/49 |
| Final total, supplied currency | 41/49 | 41/49 |
| Fees, supplied currency | 7/8 | 5/8 |
| Receipt discounts, supplied currency | 3/4 | 2/4 |
| Item discounts, either mode | 5/7 | 6/7 |
| Price basis, supplied currency | 6/9 | 2/9 |
| Grouping, either mode | 11/14 | 12/14 |
| Trusted reconciliation, either mode | 0/49 | 0/49 |

Equal aggregate unit counts hide two gains and two losses with supplied
currency; the packet retains every per-case change. The docTR hybrid removes
one unmatched Bristol coupon purchase, reducing predictions from 146 to 145 and
unmatched predictions from three to two. It does not add a missing known line
price that the Paddle hybrid gets wrong. Six other known prices regress across
three CORD transactions. Subtotals improve on `cord-v2-train-011` and
`cord-v2-test-002`.

All fifty drafts still require review. Their complete-receipt accuracy remains
unscorable because the unchanged references are partial. The original supplied
two-photo UK transaction is outside this original-fifty comparison; no new
result is claimed for its eighteen purchases. A provider default is not selected
from an oracle that takes the correct field from each result afterward.

The primary text-parser diagnostics also favour Paddle on most fields:
supplied-currency prices are 120/143 versus 114/143, matched purchases 122/145
versus 116/145, and quantities 34/120 versus 21/120. docTR reads one additional
known final total, 31/49 versus 30/49. These diagnostics use the same plain-text
entry point as the paired control, not a new complete browser workflow.

## Resources, limits and verification

There are six new local OCR calls, no new vision-model calls, no model downloads
and no receipt/API uploads. The worker denies sockets before importing the
benchmark or loading models and receives a restricted environment. The two
cached weights retain their existing full SHA256 values. No environment file,
provider key, cloud allowance or billing setting is read or changed.

Fresh model initialization takes 25,921 ms; the six per-receipt inferences average
4,300 ms. The owned run takes 54,006 ms. This mixes six fresh observations with
older retained ones and cannot establish a full-cohort p95, phone latency or
end-to-end speed comparison. The sampled owned process-tree peak is
1,273,892,864 bytes; the model process's OS working-set peak is 1,317,687,296.
The former excludes the controller and unrelated apps, and 250 ms sampling can
miss brief peaks.

Startup available RAM is 3,785,551,872 bytes against the existing docTR rule of
the prior observed peak plus 1 GiB (2,616,025,088 bytes). The minimum observed
available RAM is 2,322,841,600, above the unchanged 1 GiB runtime floor. The
600-second bound, one attempt per selected case and all larger-model guards
remain intact. All three observed native process identities exit; replay/scorer
roots and children are also absent at the subsequent check.

Node syntax, graph, hash and original-checkout protection checks pass. Application
source and dependencies are unchanged, so the earlier 1,104-unit/typecheck/build
evidence is retained without counting it as a new run. No new browser or physical
phone workflow is claimed. Stable remains `ee725ba`; the original checkout and
its exact previous dirty diff remain protected. Nothing is pushed or merged.

`doctr-hybrid-comparison-v1.json` binds plans, native metadata, inputs, source
snapshots, observations, controls, all field changes and this report. Inspect
and reproduce the aggregate scores without inference or network access:

```powershell
python -X utf8 receipt_training/scripts/build_doctr_hybrid_report.py --check
```

This eliminates another direct replacement for the current pipeline. It does
not resolve the remaining invalid prices, missing purchases, uncertain totals,
larger-model resource limits or public-release requirements. The full goal
remains active.
