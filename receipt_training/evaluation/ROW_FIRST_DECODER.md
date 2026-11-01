# Read the printed row amount before quantity and unit price

The canonical local decoder now generates each item's `lineTotal` immediately
after its description, followed by quantity and unit price. This reduces a
measured failure where the model multiplies an already-totalled row amount by
quantity a second time. The change alters only property/required-key order in
the native JSON grammar. It keeps the prompt, model, constraints, token limits,
seed and validation. The compact multi-photo representation is unchanged.

| Original fifty; known source fields | Retained control | Row-first candidate |
| --- | ---: | ---: |
| Matched purchases | 143/145 | 143/145 |
| Exact normalized descriptions | 132/145 | 132/145 |
| Purchased quantities | 119/120 | 119/120 |
| Unit prices | 22/31 | 22/31 |
| Line prices | 105/143 | 115/143 |
| Copied final totals | 33/49 | 33/49 |
| Known tax amounts | 13/22 | 13/22 |
| Known service/other fees | 4/8 | 4/8 |
| Signed rounding | 1/1 | 1/1 |

The same known-field counts apply with automatic or explicitly selected
post-extraction currency. Original membership remains 38 development and 12
evaluation transactions. Development prices improve 89/121 to 98/121; evaluation
prices improve 16/22 to 17/22. These transactions have been inspected before and
are not a fresh blind holdout. No known-field per-case regression, missing-row
increase or unmatched-row increase was observed.

Two pilot transactions used four fresh control/candidate calls. The extension
adds 48 fresh candidate calls and retains the two pilot candidates. Controls
retain the two pilot controls and 48 earlier successful original-cohort reads.
All pairs use identical prepared JPEG pixels, model/runtime, prompt and generation
settings except key order. Earlier successful controls used the previous wall
limit. This is a model-output comparison through the same frozen current verifier,
not fifty fresh browser workflows, a latency ratio or a new recognition sample.
There were no cloud calls, retries, hints or reference values in requests.

## What improved and what did not

Four long-receipt prices now copy 36,000 / 36,000 / 366,000 / 44,000 instead of
72,000 / 72,000 / 1,098,000 / 88,000. Five additional development prices and one
evaluation price stop repeating the same multiplication error. All ten gains
match existing source-derived labels; no totals-based repair changes output.

The long receipt still proposes unsupported unit prices. Correct row totals do
not make quantity-times-unit arithmetic valid. Other unlabelled proposals also
change: an incorrect Tesco 0.85 item discount, unprinted/derived unit amounts,
cash/change misclassification, a 50-percent modifier treated as a deduction and
zero rounding proposals. Every nonzero changed item unit/discount proposal has
a pending field check; changed receipt-adjustment vectors retain a pending
adjustment check in both contexts. These guesses are not credited as improvements.

Source review covered the changed printed-price rows and the affected unit,
reduced-price, modifier and tax-code layouts. Labels were not expanded from model
agreement. Complete financial accuracy remains unscorable on all original fifty;
all fifty still need review and no trusted payable result is certified.

A separate literal-OCR recovery prototype recovered four long-receipt prices
only when currency was explicitly supplied. It remains research-only. The
decoder-order change recovers ten known prices directly and avoids adding that
heuristic to the application's verifier.

## Actual app verification and a retained timeout

The first actual phone-emulated upload-to-review run returned vision HTTP 504
after roughly 195 seconds; OCR succeeded and the fallback retained a draft.
Its trace, screenshot and exact request/response bytes remain preserved. The
prepared image hash equals the same JPEG used in the successful model trial.
The failure is not removed from reliability evidence.

A separately instrumented actual preparation/OCR/vision pipeline completed with
HTTP 200/200 and native inference 143,100 ms. A second phone-emulated app run
completed in **172,187 ms** from scan to editable review. It contains 22 purchases,
shows all four targeted prices correctly at 390 CSS pixels without horizontal
overflow, keeps quantity/source and unsupported unit checks pending and blocks
confirmation. No financial values were edited. Both models ran through real
local HTTP endpoints with no external requests.

These are separate development observations, not a p95, throughput, speedup,
physical-phone result or proof that long scans always fit the time budget. Host
load and memory pressure remain material limitations. The successful later runs
do not establish the cause of the first timeout. Timeout limits were not raised
for this change.

The bridge test checks the actual generated schema's property order and every
unchanged constraint. Current validation has 506 unit passes, typecheck/build
and formatting success. Full browser validation and current Git/evidence
boundaries are recorded in the release checkpoint accompanying this change.

```powershell
python -X utf8 receipt_training/scripts/build_row_first_pilot_report.py --check
python -X utf8 receipt_training/scripts/build_row_first_cohort_report.py --check
```

The [pilot](advanced-row-first-pilot-v2.json) binds 125 files; the
[full original comparison](advanced-row-first-original50-v1.json) binds 1,043.
Evidence includes every case, raw outputs, frozen verifier source, prepared
images, execution records, scored denominators and all known-field regressions.
Local receipt artifacts remain private and ignored. Stable/original checkout
protection remains required. The full production-upgrade goal is still active.
