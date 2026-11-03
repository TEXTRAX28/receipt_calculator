# Source-backed zero-price purchase proposals

3 November 2026. This improves interpretation of saved independent readings; it
is not a new OCR model, new extraction run or general receipt-accuracy guarantee.
The broad scanner upgrade remains active.

## Observed defect and bounded correction

The development image `cord-v2-train-020` visibly prints `PLASTIK SEDANG 0` in
the same price column as three paid products. The native reader copied it,
but the text parser omitted bare-zero rows. The saved independent vision draft
represented this row as a zero-valued fee rather than a purchase. Another free
row, `SENDOK BEBEK 0`, was already in its purchase list. The source does not
print quantities or unit prices for those rows; none are supplied by this fix.
The image and these source word boxes were inspected during development.

The new source helper requires line and contained-word scores of at least 0.98,
exact word/text coverage, a separately detected rightmost numeric word, and at
least two positive parsed purchase-price anchors on the same image section.
Their right edges must agree within 0.02 normalized units and their left edges
within 0.04. Candidates must follow the first paid purchase and precede summary
rows in both source order and geometry. Financial/payment metadata and leading
option/bullet rows are excluded. Work is bounded to 512 lines and 4,000 words.
Previously unparsed candidates require a literal bare `0`; existing parser-zero
rows can retain their already interpreted decimal form.

Temporary native candidates are sorted by source order before the existing
order-preserving alignment. A missing purchase is proposed only with resolved,
matching currency, no blocked scalar conflict, and two positive source anchors
whose amounts already agreed with the original independent vision response.
Copied/repaired prices do not supply that agreement. Unpaired model purchases,
claimed source rows and parent descriptions containing the candidate prevent
ambiguous additions. Separate source-only duplicate free rows stay separate.

One uniquely matching zero-valued fee may be proposed as a purchase. Its old fee
role is removed and retained in the comparison details, with mandatory receipt-
adjustment review. Nonzero amounts, other adjustment kinds and multiple matches
are left unchanged. Description and zero-price checks remain pending; quantity,
unit price and tax code are blank. This is a human-review proposal, not a claim
that geometry proves a row's commercial role.

Automatic computer comparison now notices a supported omitted bare-zero row
even when the paid items balance. A failed comparison retains the candidate's
source location and pending purchase-list check. Source-only additions receive
no raw-model item identity or independent financial-agreement credit. The
300-purchase limit preserves a coverage/source warning instead of hiding a
candidate it cannot append. Existing model item order is preserved.

Graph navigation, verified against current source: `readZeroPriceRows`,
`src/lib/zero-price-purchases.ts:L23`; `verifyIndependentReadings`,
`src/lib/verify-readings.ts:L166`; `extractComparedReceipt`,
`src/lib/compared-reader.ts:L21`. Generated graph files stay local.

## Frozen original-fifty replay

All 400 before/after views use the same retained native/vision readings,
original image hashes, frozen v5 reference labels and two currency modes.
There are no new model calls. The 362 shared input hashes match the preceding
original-fifty replay. Currency is supplied after extraction in context mode;
it is not successful automatic currency recognition.

| Hybrid, supplied currency | Before | After |
|---|---:|---:|
| Matched reference rows /145 | 143 | 144 |
| Exact normalized descriptions /145 | 132 | 133 |
| Correct known line totals /143 | 134 | 135 |
| Predicted purchase rows | 146 | 147 |
| Known quantities /120 | 119 | 119 |
| Copied final totals /49 | 41 | 41 |
| Trusted reconciliation /49 | 0 | 0 |

Only the development transaction above gains a purchase, its exact description
and its zero line price. All existing item facts, scalar fields and financial
calculation totals remain unchanged across 200 paired views. Its old zero-valued
fee is the sole adjustment-list change. The 38-case development subset improves
121/123 to 122/123 matched rows and 115/121 to 116/121 known prices. Every
aggregate count on the twelve held-out evaluation cases is unchanged; no
individual evaluation failure was used to design this correction.

Automatic-currency and primary-only scores stay unchanged. No scored regression
occurs. The remaining unmatched development reference is a printed zero-price
option, whose text is already retained in its parent purchase description; this
fix does not manufacture a standalone purchase to satisfy that annotation.
Partial labels do not make every unmatched prediction a proven false item.
All fifty drafts still require review. Strict whole-receipt accuracy remains
unscorable from the available original-fifty financial references.

## Validation and unsuccessful attempts

All 1,209 unit tests pass with zero failures or skips (1,171 preceding cases plus
38 new cases). The final full run takes 165.154 seconds within its existing
240-second outer allowance; the fifteen-second per-test timeout is unchanged.
The focused selection passes 130 cases. Its 38 new unit cases cover omission,
source-order alignment, existing/repeated free rows, fee-role conflicts,
currency/scalar/word/column/summary boundaries, the purchase cap, section joins,
and automatic comparison success/failure. Typecheck, isolated production build
and changed-file formatting pass. The final production source is unchanged
from the build and scored replay; subsequent edits only added two tests.

The initial 26-case regression selection has 22 passes and four failures on the
previous implementation. A first helper version exposes one geometric-summary
boundary failure (85 passes / one failure); it is fixed. The first full replay
has zero metric gain because appended native rows break source order. It is
retained separately, not replaced by the successful replay. An extended test
attempt also contains four invalid synthetic adjustment objects with an
unsupported `allocation` property; those fixture errors are corrected before
passing the valid role tests. All initial sources and outputs are retained.

A new built-browser case is prepared in desktop and Chrome phone emulation,
including 320/390px source viewing and blocked confirmation. Its first preflight
finds 2,234,646,528 available bytes against the unchanged 2,684,354,560 startup
reserve, so no browser is spawned and none of the fourteen planned cases runs.
This checkpoint does not verify that new phone journey. The earlier source-view
browser results remain historical evidence; they do not substitute for this
unexecuted case. User apps were left open and resource guards were not lowered.

No new receipt API request, private upload, quota probe, billing activation or
environment-file access occurs. Provider defaults, original references and the
protected baseline remain unchanged. The separate
[Tesseract float preparation](TESSERACT_FLOAT_READINESS.md) downloads one public
model but starts no inference; it is not part of these price-score gains.

The tracked `zero-price-purchases-v1.json` binds the exact local replay,
source/test snapshots, logs, guarded-browser refusal, Git protection checks and
report bytes. Artifacts are ignored local files; their continued availability
is required for reproduction. Exact archived bytes preserve superseded sources.
This targeted packet does not repair the thirteen previously reported missing
historical artifact declarations.

```powershell
python -X utf8 qa-artifacts/zero-price-purchase-v1/seal.py --check
```
