# Financial summary labels separated from their amounts

2 November 2026. Improvement parent: `69eaa3dfbfbc78a5075d6a32f54d7526a12076ed`.

The original-fifty replay now interprets one additional receipt's prices as
excluding tax. With currency supplied after extraction, known price-basis
matches rise from **4/9 to 5/9**. All other scored counts remain unchanged, with
no scored per-case regressions. This is a bounded interpretation improvement on
saved readings, not a new OCR/model comparison or evidence of public readiness.

## Observed problem and change

In the familiar development image `cord-v2-train-000`, OCR read the literal
`1,591,600` and `Grand Total` as separate entries. Their actual image rectangles
overlap vertically; the amount is to the right. The previous interpreter could
not use this otherwise complete financial section:

| Printed field | Literal value |
|---|---:|
| Sub-Total | 1,346,000 |
| Service | 100,950 |
| PB1 | 144,695 |
| Rounding | -45 |
| Grand Total | 1,591,600 |

The proposal now preserves net item prices and treats PB1 as the printed tax,
removing the duplicate fee interpretation. No numeric value is invented or
changed. The grand total and zero arithmetic discrepancy are unchanged. The
draft still has unresolved checks and cannot be accepted automatically.

The implementation follows graph community 6, verified against current source:
`financial-basis.ts:59` (`financialEntries`) associates fragments;
`financial-basis.ts:152` (`readFinancialSummary`) applies the existing complete
summary checks; `financial-roles.ts:20` (`recoverFinancialRoles`) retains both
original indices; and `verify-readings.ts:164` (`verifyIndependentReadings`)
supplies the original regions for the separate review checks. These locations
are relative to `src/lib/` and are recorded in the local graph evidence.

Association requires all of the following:

- A label-only entry and an amount-only entry, adjacent in the original list,
  from the same photo and panel. Null boundaries and intervening rows reject it.
- A unique geometric match in both directions. Even a weak or same-valued
  competing amount blocks recovery. Arithmetic never chooses between candidates.
- The amount is on the right, with at least half the shorter vertical span in
  common and at most two pixels of box-border overlap.
- Both fragments and their combined rectangle reproduce all actual words at
  the existing 0.98 line/word confidence threshold. Extra words reject recovery.
- The existing complete positive-tax summary, exact minor-unit arithmetic,
  one-subtotal/one-total and original-index span checks still pass.

The optional fragment search stops above 512 source entries. Existing complete
summary rows still work beyond that limit. Original OCR lines and words remain
unchanged. An already paired label/value is never reassigned to another value.
Both original regions remain available for scalar, tax-basis and adjustment
review; this association does not count as independent model agreement or
clear an unsupported/conflicting-field check.

Inspection of other known failures did not justify relaxing these checks:
train-001 already pairs PB1 with the wrong amount; train-011 has weak summary
readings; train-019 reads the total heading as `DU`; test-008 has weak or
unsupported tax text. Those cases remain unresolved.

## Reproducible measurement

The protocol and all 65 pre-change library files were frozen before this change.
`grouped-amounts-v6` is the final replay: 50 original transactions, the unchanged
38-development/12-evaluation split, primary/hybrid readers, automatic/supplied
currency and before/after variants produce 400 views. These are not 400 new
receipts. Original readings, v5 references and scorer are unchanged; no new
inference, private upload, model download or paid activation occurred.

| Hybrid field | Before | After |
|---|---:|---:|
| Tax basis, supplied currency | 4/9 | 5/9 |
| Tax basis, automatic currency | 0/9 | 0/9 |
| Line prices, supplied currency | 133/143 | 133/143 |
| Line prices, automatic currency | 116/143 | 116/143 |
| Quantities | 119/120 | 119/120 |
| Printed totals, supplied currency | 41/49 | 41/49 |
| Printed totals, automatic currency | 34/49 | 34/49 |
| Trusted reconciliation | 0/49 | 0/49 |
| Strict whole-receipt accuracy | Unscorable | Unscorable |

The sole scored gain is train-000 in the development subset. This is not blind
validation. Partial references do not establish complete financial accuracy.
Replay execution time is not OCR latency; no new model speed or model-memory
claim is made. Cash costs for this local replay are zero API charges, excluding
hardware, electricity and engineering time.

Retained attempts include an initial scorer rejection: the protocol named an
older checkpoint which preceded payment-row exclusions. A separate baseline
amendment identifies `tender-roles-v1/scores.json`, which matches every pre-change
count. Predictions, sources, references, split and scorer were not changed to
make that comparison pass. Replay versions 3–5 are intermediate source versions
of these same readings, not additional accuracy samples.

## Application verification

The final source passes **940 unit tests across 57 files** and production
build/typecheck. The 28 added unit cases include geometric ambiguity, missing
boundaries, wrong panel, word mismatch, confidence, arithmetic, optional-work
bounds, preservation of raw conflicts and all original source links.

All ten focused browser cases pass on desktop and emulated phone Chrome. The
full suite passes **223 browser cases, with one existing skip**, in 7.3 minutes.
Formatting, graph and diff checks pass. The successful build's 187 source files
and 231 output files stayed unchanged throughout both final browser runs.
Browser verification is recorded separately in the accompanying evidence packet.
The synthetic scenarios exercise actual source dialogs, mandatory review,
320/390px overflow checks and a £21.00 receipt split into £10.50 each. They mock
primary and vision responses; passing them is not a real-model accuracy result
or independent human verification. Physical phones and Safari remain untested.

The focused browser process tree has a sampled peak working set of
1,518,120,960 bytes over 57 observed processes, with no observer error. The full
run's memory record retains its process-count sampling cap, so its reported
peak is an incomplete lower bound. Neither measurement describes a phone or a
model alone. Available system RAM stayed above the unchanged 1 GiB runtime
floor: minima were 2,283,831,296 bytes for the focused run and 1,913,507,840 bytes
for the full run. The startup guard remained 2.5 GiB.

Failed attempts are retained rather than overwritten:

1. An initial unit expectation assumed a role correction when the fixture's
   roles were already correct. The fixture was corrected to contain the actual
   misclassified tax, with numeric values unchanged.
2. The first browser attempt exposed missing scalar source context for split
   total/tax entries (6 passes, 4 failures).
3. An optional-array spread failed typechecking. A browser attempt launched
   against the older build was explicitly invalidated and its owned test tree
   stopped; it is not application verification.
4. The next valid build passed split-total but retained a pending adjustment
   check in split-tax (8 passes, 2 failures). The final change supplies the full
   original section for that check and keeps its confirmation mandatory.
5. One final-build browser attempt did not start because available RAM was
   below the unchanged 2.5 GiB startup guard. No result is claimed for that stop.

## Reproduction and remaining limits

The tracked report builder seals exact local inputs, frozen source versions,
predictions, scorer, test/build proofs, failed runs and source screenshots into
`advanced-financial-summary-fragments-v1.json`. Its check mode requires the
original bytes or their exact content-addressed archive; later results cannot
substitute for missing history. Thirteen older evidence declarations elsewhere
in the project remain unresolved and are not claimed repaired here.

```powershell
python -X utf8 receipt_training/scripts/build_financial_fragment_report.py --check
```

To repeat the interpretation study, choose a new unused `grouped-amounts-vN`
output name, use the retained before directory and unchanged payment checkpoint:

```powershell
node receipt_training/scripts/replay_grouped_amounts.mjs grouped-amounts-vN qa-artifacts/grouped-amounts-v3/before
python -X utf8 receipt_training/scripts/score_grouped_amounts.py grouped-amounts-vN qa-artifacts/tender-roles-v1/scores.json
```

The stable branch and original checkout remain protected. No merge, push or
deployment is part of this checkpoint. The larger model trial still requires
16,517,492,768 bytes of free disk and 4 GiB available RAM; the cached medium
comparison has its separate 3,885,219,840-byte RAM guard. Neither model guard is
relaxed. More complete source truth, stronger measured recognition, real phone
testing and public-service security/operations remain part of the active goal.
