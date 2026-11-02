# OCR invoice columns: measured interpretation repair

2 November 2026. Improvement branch only. The full twelve-phase goal stays active.

The on-device reader now proposes invoice quantities, unit prices, line totals,
delivery and printed tax from literal column headers and actual OCR word/row
ownership. The preceding [genuine scanned-PDF baseline](PUBLIC_SCANNED_PDF_BASELINE.md)
retains the failure. This change shares the existing native-PDF column interpreter;
it does not replace Tesseract, alter its pixels/prompt, promote a provider or use
an LLM to make totals balance.

## What changed

`devicePanel()` in `src/lib/device-evidence.ts:L50` retains the SDK's actual
word-to-line indices as browser-only metadata. `alignedSourceWords()` in
`src/lib/source-words.ts:L6` uses that ownership when reported row rectangles
overlap, rejecting conflicting owners and bounding work. Remote recognition
schemas cannot claim this local SDK metadata. The existing path without those
indices remains available.

`readOcrInvoice()` in `src/lib/ocr-invoice.ts:L10` requires complete source
alignment and a literal purchase header. It sends actual OCR words to the shared
`readInvoiceColumns()` in `src/lib/invoice-columns.ts:L161`; `readPdfInvoice()`
in `src/lib/pdf-invoice.ts:L7` supplies native PDF words to the same interpreter.
These source locations were verified against the rebuilt local graph and files.
No labels or document-specific numerical values enter production parsing.

The shared interpreter recognizes explicit net/gross amount headers and scalar
fees with a matching printed basis. Numeric cells and summary words need at least
0.90 OCR confidence; that engineering threshold is not a calibrated probability.
A weak standalone currency glyph cannot erase stronger numeric evidence, but
currency remains unresolved without strong supporting currency text. Unknown
money rows, conflicting summaries, unsupported mixed fee bases and incomplete
geometry cause abstention. It never substitutes a digit for an OCR `i`, divides
amounts to invent units, repairs company spellings or loosens arithmetic checks.
Proposed purchase lists and financial roles require source checks before sharing.
Ambiguous invoice dates remain blank. Ordinary receipt parsing is the fallback.

## Same saved readings, then actual phone-width UI

Three supplementary public image-only pages retain the original source streams,
page geometry and pixels. References were frozen before the baseline OCR. The
two purchase invoices and payment-only control remain separate from the original
fifty and are familiar development cases, not a blind holdout. Source references
were reviewed by the assistant, not independently verified by a human.

For the compatible cleaning-supplies invoice:

| Field | Before | After, untouched initial draft |
| --- | --- | --- |
| Goods rows | One goods row plus delivery as a false product | One goods row |
| Product description | Contaminated by numeric columns | Exact printed description |
| Purchased quantity / unit | Missing / missing | 6 / £15.20 |
| Net goods / subtotal | £91.20 line / missing subtotal | £91.20 / £91.20 |
| Delivery / printed VAT | Missing / missing | £6.95 net fee / £19.63 |
| Price basis | Incorrect included default | Explicit net columns |
| Printed total | £117.78 | £117.78 |
| Calculated difference | −£19.63 | £0.00 |
| Automatic strict complete score | 0/1 | **0/1** |

The merchant remains `Commercial & Industrial [leaning Supplies Ltd`, preserving
the OCR spelling error. Arithmetic balance does not prove that name correct or
clear pending checks. One explicit source-supported merchant correction, followed
by automated interactions with the review controls, produces a reviewed strict
score of 1/1 and an actual **£58.89 / £58.89** equal split. No financial or product
values were edited. Automated checkbox actions exercise the UI; they are not
independent human verification or an automatic recognition score.

The Western Towing invoice retains two imperfect product rows and missing
quantity/unit fields. Its mixed net goods and VAT-inclusive carriage are not
silently forced into one price basis; the draft stays blocked. The payment-only
slip produces zero proposed products and stays blocked, with its misread subtotal
preserved. Absence of purchase information is not evidence of zero purchases.

A fresh real on-device run at 390 × 844 completed all three documents. OCR text,
blocks, layout blocks, confidence, PSM, OEM, version and rotation exactly match
the preceding baseline for each document. This supports an interpretation gain
on unchanged readings. Historical prepared-JPEG hashes were not recorded; current
reconstructed frame hashes do not establish those missing historical byte hashes.
All initial confirmations were disabled, no horizontal overflow was observed,
and source overlays were exercised for the successful invoice. Initial read times
were 2,997 / 2,906 / 2,762 ms, including PDF preparation and review persistence,
excluding server/browser startup and subsequent review. Three development-laptop
observations do not establish p95, mobile-hardware speed or controlled latency
improvement. There were three local OCR jobs, zero external receipt requests and
zero model API calls. Current native-process memory was not remeasured.

## Regression evidence

The same original-fifty v5 truth and scorers show **zero count changes across
500 saved-reading views**: 400 primary/hybrid before/after views with automatic
and supplied-currency modes, plus 100 original on-device views. The latter retain
historical source metadata without the newly retained SDK ownership indices;
this is not fifty fresh calls through the new browser adapter. No original-fifty
complete-receipt denominator was added. Hybrid supplied-currency line prices
remain 133/143, quantities 119/120, units 26/31, fees 7/8, tax 16/22 and copied
totals 41/49. Trusted reconciliation remains 0/49.

Two actual native-PDF UI regressions preserve all six quantities and amounts.
The £13.06 invoice still completes review and £6.53/£6.53 sharing without financial
edits; the £2,086.39 invoice stays blocked by printed unit/line inconsistencies.
Both initially require review. Their source inputs and previous evidence remain
unchanged. All 874 unit tests and 189 browser cases pass, with one existing skip.
Build, typecheck, formatting and graph checks pass. The existing 500 kB chunk
warning remains; the main script is 563.42 kB. The associated evidence packet
records these checks separately from receipt accuracy.

## Reproduce with retained local evidence

```powershell
node receipt_training/scripts/replay_grouped_amounts.mjs ocr-invoice-original50-new qa-artifacts/ocr-invoice-v1/before
node receipt_training/scripts/benchmark_scanned_pdf.mjs public-scans-columns-new --review-plan qa-artifacts/ocr-invoice-v1/review-plan.json
node receipt_training/scripts/replay_ocr_invoice.mjs ocr-invoice-retained-new public-scans-columns-new
python -X utf8 receipt_training/scripts/score_ocr_invoice.py ocr-invoice-retained-new ocr-invoice-original50-new
node receipt_training/scripts/benchmark_public_pdf.mjs ocr-invoice-native-pdf-new --review
```

Every run needs a new output name. Raw PDFs, OCR, source snapshots, screenshots
and original-fifty private evidence remain ignored/local. The prepared sources
and frozen before snapshot are prerequisites; a clean-checkout reproduction was
not executed. Baseline source/render hashes and known missing legacy evidence
remain explicit. The packet's `--check` operation verifies exact bytes using
archived historical versions when current source has changed.

Remaining work includes broader unfamiliar invoices, poor photo coverage,
unsupported mixed bases, OCR spelling and weak text, larger-model feasibility,
unconsumed service approvals and public-deployment privacy/operations gates.
The user's 8B resource reply states intent to free resources, not confirmation
they are ready. It does not bypass resource checks or authorize another provider
upload. The stable branch and original dirty checkout are protected.
