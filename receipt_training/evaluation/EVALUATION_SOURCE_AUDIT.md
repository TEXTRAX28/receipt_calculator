# Fixed evaluation cohort: visible-source audit

4 November 2026, parent `7987d73df01cb934615ab0f773fd9bced29147f5`.
The twelve-phase goal remains active. This adds source evidence and saved-reading
diagnostics, with **no scanner change, new inference, provider upload or OpenAI
use**. It does not claim a new recognition gain.

## What was checked

All twelve original evaluation images, `cord-v2-test-000` through `011`, were
selected in their existing order before examining predictions for this audit.
Each original was opened at its preserved hash. Five recorded crops replicate
original pixels with nearest-neighbor zoom; they add no reconstructed text or
contrast change. Originals, original labels, train/evaluation membership and
all historical scores remain unchanged in the frozen comparison worktree.

The first assistant visual draft was frozen before opening those old reference
values or model predictions. A subsequent reference cross-check identified six
field corrections: an uncertain numeric-column role, an ambiguous currency
glyph, an expanded spelling, a fold-obscured character, and the description/
quantity treatment of a trailing numeral. Original and corrected drafts are
both retained. The corrected version was frozen before opening predictions.
This is source-informed assistant annotation of familiar data, without an
independent human transcription or new blind holdout.

The scope is the readable financial regions. All twelve have publisher-redacted
headers or other regions; none is asserted to be a complete unredacted original.
Unreadable, unprinted and ambiguous fields have separate states and null values.
No missing amount, quantity or unit is supplied by arithmetic. Complete-receipt
accuracy remains unscorable; zero complete source images is not a model score.

| Visible source fact | Count |
| --- | ---: |
| Priced components, including a paid modifier | 22 |
| Fully readable complete descriptions | 21 |
| Partly readable descriptions | 1 |
| Readable purchased quantities | 14 |
| Explicit unit-price values | 3 |
| Line amounts | 22 |
| Explicit zero-priced components | 2 |
| Subtotals / taxes / final totals | 9 / 4 / 11 |
| Discount amounts / rounding amounts | 2 / 1 |
| Tenders / readable change amounts | 12 / 5 |
| Printed item-count summaries | 4 |
| Direct ISO or unambiguous currency markers | 2 |

The ticket's dollar glyph does not establish an ISO currency. A printed zero
discount rate with a masked amount does not establish a printed zero amount.
The missing final-total line stays unknown even where payment minus change
agrees with subtotal. A summary count does not silently become a per-row
purchased quantity. All nine readable subtotals agree with their visible line
amount sums; three observed subtotal-plus-tax relationships reconcile. These
equations are recorded separately from literal facts and do not fill tax basis
or other missing fields.

All **85 shared readable canonical facts** agree with the existing reference:
21 descriptions, 14 quantities, three units, 22 line amounts, nine subtotals,
four taxes, one rounding and eleven final totals. The audit adds source coverage,
role/visibility evidence and uncertainty distinctions; it does not rewrite those
old values or retroactively change their metrics.

## What the saved scanner outputs show

The same saved original-50 replay contributes all four views of each of these
twelve images: primary/hybrid, automatic/supplied currency. Its prediction hash
is `3ae7e7bc0405bcca6d21100478422d1ec40501c8a8bb946552a3d7302539e4e0`.
All **71 interpretation files** exactly match current source. There is no new
OCR, VLM, browser execution or inference-latency observation. Component alignment
uses the unchanged price-blind maximum-cardinality matcher and existing 0.65
similarity threshold. Visible fragments align the partial name; that row is
excluded from full-name accuracy. These are components, not an asserted count
of independently purchased products.

| Saved interpretation | Matched components | Exact normalized readable names | Correct readable quantities |
| --- | ---: | ---: | ---: |
| Primary, automatic currency | 14/22 | 9/21 | 1/14 |
| Primary, supplied currency | 14/22 | 9/21 | 1/14 |
| Hybrid, automatic currency | 22/22 | 20/21 | 14/14 |
| Hybrid, supplied currency | 22/22 | 20/21 | 14/14 |

Each hybrid view also proposes eight quantities and nineteen units without
directly readable corresponding source fields. These are **unverified proposals,
not nineteen proven wrong units or eight proven wrong quantities**. The audit
does not turn plausible or derived values into printed ground truth. Grouped
price accuracy is not rescored under a new money interpretation.

Two concrete role failures remain visible. The primary proposes an unmatched
card-tender heading as a product on test-000 in both currency views. The hybrid
proposes the readable change as `printedTotal` on test-009 in both views, while
that source has no readable final-total line. Its printed-total source check is
pending. **All 48 views retain blocking validation issues.** This supports the
review gates; it does not excuse the extraction errors or prove a finalized bill.
Detailed annotations and diagnostics omit copied masked payment identifiers and
stay local/ignored by Git.
The current graph locates `calculateSplit()` at `src/lib/engine.ts:L540`;
verified source copies receipt issues and requires an empty issue list before
finalization. The saved issue observations are not a new browser interaction.

## Validation and evaluation boundary

Seven reference-integrity controls pass: unknown quantity changed to zero,
ambiguous currency asserted as USD, wrong source hash, moved split, non-finite
price and self-linked modifier are rejected; both genuine zero-priced components
are preserved. Four role-diagnostic controls distinguish the actual candidate
from abstention, an invalid token and a declared legitimate final total.
An initial diagnostic attempt used the wrong configuration key, produced no
report and is retained; the corrected run uses the actual frozen matcher key.

`audit_evaluation_source.py` and `compare_evaluation_source.py` are standalone
read-only research helpers. They do not import the app, load env files or call
models/providers. Final source recording, audit and diagnostics run with finite
OS environments, 1.5 GiB startup/1 GiB runtime guards and bounded deadlines.
No TypeScript/runtime file changes, so the application/test bytes remain those
verified by the preceding 1,362-case checkpoint. That suite/build is not rerun
or represented as new inference evidence here. The local graph remains current;
the new research helpers/data are outside its indexed application corpus.

The original configuration prohibits scanner tuning on held-out results and
requires fresh evaluation data for later tuning. **No scanner is tuned from this
audit.** The original twelve remain fixed regression evidence. Before using
these diagnostics to guide scanner changes, prepare separate development
examples and a genuinely uninspected project evaluation set, preserving source/
transaction deduplication and all original scores. Do not call familiar CORD data
a new blind provider comparison.

The pending one-request Gemini 3.5 Flash-Lite scope is unchanged and unconsumed in
the detached `receipt-ocr-baseline` worktree; execution still needs its existing
pending approval plus Free-quota confirmation. Do not send these twelve images
under that two-crop approval. Old provider scopes and the default selected-4B
invoice resume are consumed. OpenAI remains unused as the user's last resort.
No new chat, context reset, merge, push, deployment, user-app closure or goal
completion occurs.

Machine checkpoint: `advanced-evaluation-source-audit-v1.json`. Raw references:
`receipt_training/annotations/private/evaluation-visible-source-v1.jsonl` and
`evaluation-visible-source-v2.jsonl`. Local evidence and continuation checks:
`qa-artifacts/evaluation-source-review-v1/`. Originals, installed model caches and
historical runs remain in the detached comparison worktree. Check this packet
with `python -X utf8 qa-artifacts/evaluation-source-review-v1/seal.py --check`.
