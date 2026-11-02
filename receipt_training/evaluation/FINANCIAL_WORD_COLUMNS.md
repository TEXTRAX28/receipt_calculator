# Slanted financial summary columns

2 November 2026. Improvement parent: `b2d526181ea4166d980dc091e0b1474946557017`.

The original-fifty saved-reading replay improves supplied-currency tax-basis
matches from **5/9 to 6/9**, with no scored per-case regressions. One additional
draft balances, but trusted reconciliation remains **0/49**. This is a narrow
interpretation gain on a familiar development receipt, not new OCR inference,
blind validation or evidence that the application is ready for public release.

In `cord-v2-train-001`, the source words correctly read subtotal 503,000,
PB1 tax 52,815, service charge 25,150 and amount due 580,965. The slanted layout
placed the service amount on the OCR line containing the tax label. The hybrid
draft consequently retained a false PB1 discount and the wrong price basis.
The new proposal preserves the literal amounts, treats PB1 as tax, removes its
duplicate discount interpretation and proposes prices excluding tax. All 28
review checks remain unconfirmed; the draft still has 29 validation issues.

`financialColumns` in `src/lib/financial-basis.ts:75` follows the repository
graph's financial interpretation community. It requires 4–8 standalone summary
headings between a unique subtotal and recognized total, and an equally sized
column of literal amounts to their right. Both columns must retain vertical
order, separated row centres and a consistent offset. All words and contributing
lines require the existing 0.98 confidence threshold. Extra words or values,
missing cells, weak readings, ambiguous source mappings and source gaps reject
the proposal. Every original contiguous line must be reproduced exactly by its
assigned words. Optional work is bounded at 512 source lines and 4,000 words.

Pairing happens before monetary parsing. The existing complete-summary and
exact-arithmetic checks can only reject the interpretation. They cannot select
an alternate balancing value or invent a missing amount. Original OCR words
and lines remain unchanged, including the wrongly grouped PB1 line. Both
original regions remain available to review a reassigned row. These proposals
do not count as independent model agreement or clear mandatory review checks.

The pre-change protocol and 65 library files are frozen in
`qa-artifacts/grouped-amounts-v7`. The unchanged replay/scorer uses the original
50 transactions, 38-development/12-evaluation split and v5 financial references.
Version 8 is the final replay: primary/hybrid, automatic/supplied currency and
before/after produce 400 views, not 400 independent receipts. Version 7 is an
intermediate result differing only by a source comment. The two production
builds are byte-identical. The geometric prototype inspected 51 retained panels
without reading reference labels or selecting pairs by arithmetic.

| Hybrid measure, supplied currency | Before | After |
|---|---:|---:|
| Tax basis | 5/9 | 6/9 |
| Line prices | 133/143 | 133/143 |
| Quantities | 119/120 | 119/120 |
| Printed totals | 41/49 | 41/49 |
| Zero discrepancy, still untrusted | 22/49 | 23/49 |
| Trusted reconciliation | 0/49 | 0/49 |

Automatic-currency and primary-reader counts are unchanged. All fifty remain
unscorable for strict whole-receipt accuracy because the financial references
are incomplete. No product field improved in this change. Replay duration is
not extraction latency, and no new model-speed or model-memory claim is made.
There were no model calls, private uploads, downloads or API charges.

All **966 unit tests across 58 files** pass, including 22 new column/review
cases. Production build/typecheck and formatting pass. The first targeted run
had one assertion failure: the earlier scalar lookup retained subtotal context
alongside both recovered tax regions. The corrected test preserves that context;
the implementation was unchanged. The original test result is retained.

The browser review-to-split scenario is implemented but **not yet executed**.
Two guarded starts refused before launching a browser at approximately 2.02
and 2.48 GiB available RAM, below the unchanged 2.5 GiB startup floor. Thus the
new Chrome desktop/phone and host-WebKit workflows are pending; earlier passing
browser suites do not verify this change. The planned synthetic check draws
the actual fixture words, retains the wrong OCR grouping, checks every source
dialog and divides £21.00 into £10.50 shares. It is not a real-model benchmark.

The larger browser-model study is refreshed to
`browser-paddle-medium-paired-plan-v5`; only the financial interpreter hash
changed from v4. Models, images, limits, parameters and scoring are identical.
The latest resource check remains below its 3.62 GiB startup floor and the 8B
trial's disk reserve. No guard was reduced and no user app or tab was closed.
The stable branch and original checkout remain protected; no merge, push or
deployment is included. The full goal remains active.

The companion `advanced-financial-word-columns-v1.json` binds the exact evidence.
Verify it with:

```powershell
python -X utf8 receipt_training/scripts/build_financial_column_report.py --check
```
