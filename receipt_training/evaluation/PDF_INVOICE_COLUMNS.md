# Native PDF columns: source-supported financial drafts

2 November 2026. The two genuine public invoices in the
[preserved failure baseline](PUBLIC_DIGITAL_PDF_BASELINE.md) now retain their
printed purchase quantities, unit prices, line amounts, tax and final totals.
The £13.06 invoice completes the actual checked browser workflow with two
£6.53 shares and no financial edits. The £2,086.39 invoice remains blocked:
its printed rounded unit prices do not multiply to its printed line totals.
The validator preserves that discrepancy even though its overall total balances.

These are two familiar supplementary documents, not a blind holdout, a
whole-corpus improvement claim or evidence of unattended financial reliability.
The original fifty receipts and their scores are unchanged by this experiment.

## What changed

Native PDF text operators now retain their actual boxes and row ownership.
The invoice reader uses literal table headers and nearby inclusive/exclusive
qualifiers to distinguish description, quantity, unit price, line amount and
VAT columns. It requires matching price bases and one transaction currency
supported by financial rows, rather than selecting currency from an unrelated
corporate footer. Qualified payable summaries remain separate from VAT-table
totals. Multi-page joins require one repeated invoice ID within the same PDF.

This interpretation proposes editable values. Every purchase list, currency,
price basis and relevant financial summary still needs source review. The
reader preserves native source indices for the existing highlighted previews;
its coordinate confidence is provenance, not a calibrated probability.
Conflicting IDs, summaries, qualifiers or currencies, ambiguous three-place
quantity separators and unsupported monetary rows make this interpretation
abstain. Existing checked PDF parsing remains the fallback.

The reader selects a consistent printed gross pair where available, otherwise
a matching net pair. Unqualified columns require labelled net/tax/final
evidence and a complete matching net amount; values are never altered to obtain
a balance. A printed "Already Deducted" discount is retained as source evidence
without another reduction. Wrapped description overflow remains explicit in
the item's note; an over-budget description causes abstention. Optional dates
are canonicalized only when their order and calendar value are unambiguous.

Graph-backed source locations, verified against the current source:
`src/lib/pdf-text.ts:L31` / `L174`,
`src/lib/pdf-invoice-layout.ts:L46` / `L80` / `L191`, and
`src/lib/pdf-invoice.ts:L135`. These are in graph community 7. The exact-money
engine, provider models, prompts, dependencies and source documents are unchanged.

## Same documents, before and after

| Source-supported field | Before | Current |
| --- | ---: | ---: |
| Purchase rows retained | 6/6 | 6/6 |
| Quantities | 0/6 | 6/6 |
| Populated unit prices on the selected basis | 0/6 | 6/6 |
| Line amounts consistent with the selected price basis | 0/6 | 6/6 |
| Full description text, including explicit overflow note | 0/6 | 6/6 |
| Merchant | 1/2 | 2/2 |
| Transaction currency | 1/2 | 2/2 |
| Copied final total | 0/2 | 2/2 |
| Copied printed tax | 0/2 | 2/2 |

The old Amazon draft already copied four gross line numbers, but labelled its
prices net. The basis-consistent metric does not count that contradiction as a
correct interpretation. The current gross values are four distinct purchases
at £3.43 each, shipping £0.00 and promotion £0.66: £13.06. Its printed VAT stays
£2.16; it is not replaced by VAT recalculated from rounded net prices. The
printed net subtotal £10.90 remains in source-comparison details, rather than
being inserted into an optional subtotal field for gross prices. Pack of 100
remains packaging text, with each purchased quantity 1. The explicit invoice/
delivery date is retained as 2024-08-30, separately from the order date.

The Gopak draft retains quantities 6 and 12, unit prices £127.36 and £81.21,
and printed net lines £764.18 and £974.48. Net £1,738.66 plus printed tax
£347.73 equals £2,086.39. No second ten-percent discount is applied. The two
unit-to-line discrepancies remain independent blocking errors after all source
checkboxes are checked. Its ambiguous printed date is not guessed. No user
override, hidden extra precision or relaxed arithmetic tolerance was introduced.

## Actual browser and financial verification

The final runner uploads the original whole-page derivatives, reads embedded
text, opens a highlighted source view for all six purchases and exercises the
source-review controls. It never edits a financial field. Amazon then proceeds
through adding people, assigning the whole receipt and finalizing £6.53/£6.53.
Gopak remains in review. Automatically ticking checkboxes tests the controls;
it is not independent human verification of the source.

Both initial confirmation controls are disabled. Review and final screens have
no horizontal overflow at 390 px. The two documents take 2930 ms and 1358 ms
from upload through initial review in the preceding v3 run, which overlapped
build/unit work. The final v5 run takes 1466 ms and 999 ms without that overlap;
these observations are not a controlled latency comparison, p95 estimate or physical-phone
result. All provider discovery is disabled and every non-GET or external
application request is blocked and counted: zero requests of either kind occur.
The unchanged deterministic engine separately replays the saved drafts and
records zero whole-total discrepancy for both, while retaining Gopak's two
unit-price errors.

The prior baseline retains the original 21-page public council packet, selected
whole invoice pages, unchanged content/text and three pixel-identical Poppler
render comparisons. This change uses those same hashes; it edits no receipt
amount, glyph, geometry or reference. Raw PDFs, rendered pages and detailed
drafts remain ignored and local. No OCR/VLM provider receives a document.
Redistribution rights and the underlying purchases are not independently verified.

## Reproduction and limits

Prepare the same public inputs using the preceding baseline's bounded download
and exact-hash instructions. Then choose a new output name:

```powershell
node receipt_training/scripts/benchmark_public_pdf.mjs pdf-columns-repro-v1 --review
node receipt_training/scripts/check_public_pdf_finances.mjs pdf-columns-repro-v1
python -X utf8 receipt_training/scripts/build_pdf_invoice_columns.py --check
```

The final protocol and frontend sources are frozen under
`qa-artifacts/pdf-columns-v5/browser`. Earlier v1/v2/v3 readings and geometry
diagnostics are retained separately. An initial probe launch failed because its
output parent directory did not exist; the runner now creates that parent while
still refusing to overwrite a prior run. That failure made no extraction call.

All 853 unit tests across 53 files pass, as do production build/typecheck and
formatting. The build retains the existing 500 kB chunk warning; the main
JavaScript bundle is now 558.40 kB. The first full browser run had 188 passes,
one skip and one failure: Chrome could not load the stylesheet because of
`net::ERR_NO_BUFFER_SPACE`, so the preview intercepted the Crop click before
OCR. Its trace is preserved. The unchanged four-case mobile edge recheck and a
serial full suite pass. After the additional tax-table currency guard and
rebuild, the final one-worker run passes all 189 browser cases with one existing
skip. No test tolerance, forced click or product change hides the host failure.
The final packet also preserves the exact pre-format runner bytes used by the
PDF reading; its subsequent formatting changes no behavior.

[The machine-readable evidence packet](advanced-pdf-invoice-columns-v1.json)
binds the readings, source references, software checks, failed-run trace and
protected Git invariants. The global audit still reports the same thirteen
disclosed legacy evidence gaps; later runs cannot recreate those missing bytes.

This is an English-header native-PDF path, not OCR for scanned pages, general
invoice understanding, refund extraction or image-subtype classification.
Missing or ambiguous dates may remain blank. Source text may omit image-only
purchases or differ from the visible page, so the complete-list check remains.
No new original-fifty OCR/VLM cohort or model latency estimate was produced.
The larger-model resource gate, pending private Gemini comparison, broader
financial truth, genuine scan/refund cases, handset/Safari testing and public
deployment requirements remain open. The full goal stays active.
