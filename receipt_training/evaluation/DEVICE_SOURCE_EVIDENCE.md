# On-device source evidence and conservative overlap review

The browser reader now requests actual Tesseract.js 6 English word and line
geometry alongside the same plain-text recognition. Valid words and rows supply
source highlights; missing or malformed evidence never supplies a guessed box.
The remote recognition schema still accepts only its existing server engines.

The final paired original-fifty comparison preserves prepared-image hashes,
assembled OCR text and parsed financial values on all fifty receipts. It supplies
source areas for 81 of 82 parsed purchases. The remaining purchase has no invented
highlight and requires review. These are parsed purchases, not 82 verified correct
purchases. Raw English OCR remains weak on this multilingual corpus.

| Same original fifty, existing v5 partial reference | Before | After |
| --- | ---: | ---: |
| Matched descriptions | 37/145 | 37/145 |
| Exact normalized descriptions | 24/145 | 24/145 |
| Known line prices | 3/143 | 3/143 |
| Known purchased quantities | 1/120 | 1/120 |
| Known unit prices | 1/31 | 1/31 |
| Copied final totals | 1/49 | 1/49 |
| Trusted reconciliation | 0/49 | 0/49 |

The previous October-vintage Tesseract and stronger local-hybrid scores are
separate checkpoints. This is a contemporary paired fallback comparison, with no
reference currency supplied to the parser. It does not improve those price
scores or establish a new best provider. Complete original receipts remain
unscorable under the existing strict reference-coverage rules.

## What changes for review

Words below the existing 0.75 heuristic and purchases without usable source
evidence require explicit checks or edits. A high line average cannot hide a low
word score. Available source views draw the literal uncertain word boxes as well
as the purchase rows. Scores are SDK measurements, not calibrated correctness
probabilities; agreeing sections are still the same engine.

Subtotal, tax, final total, code legends and adjustment roles retain actual
parser line indices. Code meanings and charge roles require review. A total
labelled including tax does not establish that item prices include tax; the
device reader requires a separate convention check unless a single strong,
explicit item-price statement supports the proposed convention. Neither this
provenance nor the review helper repairs a financial amount.

One malformed SDK row withholds that row's geometry while preserving other
validated rows. An unrelated missing source slot no longer discards every
highlight on the receipt. Ambiguous repeated text stays unhighlighted unless the
actual ordered SDK sequence establishes its position. These rules keep both
genuine identical purchases visible.

## Long-receipt joining and rejected trials

A controlled native 40-row receipt with two separate Milk purchases originally
produced 43 parsed rows because exact text differed in overlapping sections.
The unchanged fixture now produces 40 rows, preserves both Milk purchases and
opens actual source areas from the first and last sections in desktop Chrome
and iPhone-sized Chromium. This is one synthetic fixture, not a physical-phone
or general genuine-photo accuracy result.

Preparation now records its own crop/corrected-image section windows, including
white outside margins. A join requires a unique one-to-one match between actual
row rectangles in the shared interior of sections from the same photograph.
All four mapped edges must agree within two reading-grid pixels. Positions in
one section and different photographs are not matched. Clipped, ambiguous or
unavailable geometry cannot authorize spatial removal.

Differing names can share a literal quantity/unit/line-total suffix. A differing
financial reading, sign or code makes the entire photograph keep its previous
text assembly. No first/best-confidence amount is selected. Both actual regions
remain available, and conflicting fields plus the purchase list stay pending.
Raw SDK section text is retained in transient extraction evidence and the local
benchmark; it is not added to persisted receipt drafts.

The first two paired runs are retained. The second implementation discarded two
matched Tesco purchases and one known correct price when it spliced partial
overlap rows. That version is rejected. The final rule restores all fifty text
outputs and all scored per-case outcomes, with zero known-field regressions.
The fourth run verifies signed-quantity, Unicode-minus and code safeguards on
the final source. Unit cases separately cover those conflicts.

## Verification and reproduction

All 763 unit tests and 187 browser cases pass, with one existing browser skip.
The final full browser results, build, typecheck,
formatting, graph and protected-branch checks are bound in
[the evidence packet](advanced-device-source-evidence-v1.json).
The native correction-to-split workflow still has one explicit name edit and
human source checks before its exact GBP 2.75/2.75 split. Human actions are not
counted as automatic recognition gains.

The first full browser attempt overlapped a rebuild and was interrupted after
case 151. The next attempt exposed a test selector waiting for “Edit details”
on an automatically expanded “Hide details” row. Both partial logs remain and
are excluded from final verification. The fixed native geometry journeys pass
in both contexts; a separate full run uses a completed unchanged build.

The local benchmark freezes both libraries, alternates before/after order,
verifies original input and prepared-panel hashes, and blocks external requests:

```powershell
node receipt_training/scripts/benchmark_device_evidence.mjs --run fresh-device-source-comparison
python receipt_training/scripts/build_device_evidence_report.py --check
```

Choose a new run name. Inference never loads labels or keys. Scoring uses the
unchanged v5 partial references afterwards. The 38 development / 12 evaluation
membership and every `external_processing_allowed: false` flag remain unchanged.
Reused evaluation images provide compatibility evidence, not a new blind study;
no recognition or numeric parsing rule was tuned to their reference values.

Four native paired runs mean 400 local provider invocations and 408 actual
section recognition calls. There were zero external extraction requests,
private uploads or paid activations. Timings include preparation, fresh workers
and after-only metadata/review work, with a shared browser asset cache. They are
not pure-model timings, a throughput test, or physical-phone measurements.
In the final run, mean latency is 1.177 seconds before and 1.202 seconds after;
nearest-rank p95 is 3.645 and 3.824 seconds respectively. This single-machine
paired observation establishes no speedup or latency guarantee.

The main production chunk is 542.30 kB and retains the existing 500 kB warning.
No dependency, model, prompt or default provider changes. Peak mobile memory,
worst-case overlap work, Safari/camera acceptance, general genuine-photo gains,
complete original reference coverage and public deployment remain open. The
stable branch and original checkout are protected. Thirteen previously known
historical artifact gaps remain; the full goal is active.

Graph-backed implementation locations, verified against current source:
`src/lib/device-evidence.ts:L40`, `src/lib/device-overlap.ts:L22`,
`src/lib/device-review.ts:L11`, `src/lib/images.ts:L142`,
`src/lib/receipt-evidence.ts:L44` and `src/ReceiptSource.tsx:L12`.
