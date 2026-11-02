# Genuine scanned PDFs: copied totals do not establish correct bills

2 November 2026. Three new image-only PDF inputs exercise the actual on-device
reader: two purchase invoices and a payment-only control. All import, use the
image path and reach review, with three genuine Tesseract readings and no
external or write requests. All three final totals are copied correctly.
**Neither purchase draft is financially usable without correction.**

The fully referenced cleaning invoice scores **0/1** on the unchanged strict
complete-receipt metric. It proposes an extra purchase, omits quantity/unit price
and misclassifies delivery. The payment-only input proposes no purchases and
stays blocked. This is a new regression baseline, not a scanner improvement,
provider comparison or replacement for the original fifty.

## Sources and reference boundaries

[Peacehaven Town Council's public P&F packet](https://www.peacehaventowncouncil.gov.uk/wp-content/uploads/2024/05/Public-PF-Papers-09072024.pdf)
contains the Western Towing invoice on page 22 and the cleaning-supplies invoice
on page 24. Its original SHA256 is
`8bc78e8bdd48eed5cdf119cb77de28f715d78c11376c6960cfbdf16f60bbc860`.
Page 9 of the already preserved
[Buckland and Chipping public invoice packet](https://www.bucklandandchipping-pc.gov.uk/media/Meetings/Files/331/meeting%20331%20merged%20invoices.pdf)
is a Prontaprint payment slip. Its original SHA256 is
`38558a66a4385bd1993e9476ced6c11dbb887d2adafc5bf368a5e2def2153ea7`.
Both packets were already downloaded; no new network download was needed here.
Publisher provenance does not independently verify the underlying purchases.

Each input retains a complete original page, including its existing rotation,
content stream and embedded image bytes. All three originals have zero native
text; these are genuine scans, not digital PDFs with text deliberately removed.
Original/extracted Poppler renders are pixel-identical. No price, glyph, image
or page geometry is edited. Raw PDFs, renders and detailed OCR/drafts stay local
and ignored; image redistribution rights have not been established.

[The minimal factual reference](public-scanned-reference-v1.json) contains no buyer,
address, payment identifier or bank detail. Its fields were transcribed from
original page renders and frozen at 09:38 UTC, before any new OCR reading. This
is assistant source review, not independent human verification or a blind holdout.
Candidate pages were selected by visible layout; discovered bank statements,
summaries and other unselected pages are not counted as additional receipt tests.

The cleaning invoice has one purchase, explicitly Qty 6, unit £15.20 and net
line £91.20. Its net carriage is £6.95, VAT £19.63 and total £117.78. The full
visible body establishes no discount or rounding row. Discount contributes zero
through verified absence; it is not labelled as a printed zero. Rounding stays
null with a separate absence flag. The numerical date `11/04/2024` remains
ambiguous in the reference. A generated label's initial tax-legend flag was
corrected in v2: a VAT amount does not establish a printed rate legend. No
numerical or description reference changed.

Western Towing prints two Qty-1 purchases, subtotal £20.07, carriage **£4.98
including VAT**, printed VAT £4.84 and total £29.06. It is a mixed-basis case.
Adding goods, gross carriage and all printed VAT would double-count some tax.
No unprinted net carriage or allocated carriage tax is inserted as literal truth.
It remains a diagnostic outside the strict complete-reference denominator.

The payment slip has total/payment/tender £52.00 and change £0.00, but no
underlying purchase list or VAT amount. It is not an empty basket or a
zero-purchase transaction. Its control checks that reference/payment numbers
do not become invented products or a confirmable bill.

## Actual unchanged-app observations

| Observation | Western Towing | Cleaning supplies | Payment-only control |
| --- | --- | --- | --- |
| Visible goods / returned rows | 2 / 2, contaminated descriptions | 1 / 2, delivery becomes a purchase | Purchase information absent / no proposed purchases |
| Printed quantities copied | 0/2 | 0/1 | Unscorable |
| Printed unit prices copied | 0/2 | 0/1 | Unscorable |
| Copied subtotal | £20.07, correct | Missing | £62.00; source is £52.00 |
| Copied VAT amount | Missing | Missing | Unknown in source |
| Copied final total | £29.06, correct | £117.78, correct | £52.00, correct |
| Initial calculated-minus-printed total | −£8.99 | −£19.63 | −£52.00; no purchase list |
| Confirmation enabled | No | No | No |
| Import through review | 2979 ms | 2807 ms | 2725 ms |

These are three serial 390px Chrome observations, not a p95, physical-phone
measurement or controlled model comparison. Every page selects image reading;
the PDF-text option is absent. The runner performs one UI read per document,
does not choose currency/context or edit a financial field, and observes existing
worker messages without changing pixels, requests or responses. Actual raw OCR,
word/block geometry, editable drafts, review text and screenshots are retained.
Browser storage omits raw OCR, as intended.

The cleaning OCR literally contains the Quantity/Unit Price/Net Amt header and
the row's 6, 15.20 and 91.20. It also contains the net delivery, VAT and final
total. The parser leaves quantity/unit price blank, mixes columns into the
description and turns delivery into another purchase. This identifies an
interpretation problem despite available text. Western's wrapped names and
second quantity also have recognition errors; not every failure is parsing.
The cleaning draft additionally chooses 2024-04-11 for the ambiguous numerical
date. The reference does not count that guess as a known date.

The unchanged scorer credits the cleaning line amount, currency and final total,
but fails exact name, quantity, unit, merchant, subtotal, tax, delivery, price
basis, reconciliation and complete receipt. Its extra delivery row remains an
extra purchase. No alias, source check or matching threshold is relaxed. The
original fifty still lack full truth and remain separately unscorable as complete
receipts; this one new eligible case does not rewrite their denominators.

## Resource and failed-attempt evidence

The first harness blocked all non-GET requests, inadvertently rejecting the
app's three local **HEAD** asset checks and recording them as posts. No OCR job
started. Its first timeout, screenshot and frozen source are retained. The
benchmark-owned process tree was stopped during the second case once the common
setup error was diagnosed. The corrected runner allows local GET/HEAD and still
blocks all writes and external requests. The three completed cases have nine
successful local HEAD checks, zero write requests and zero external requests.
There is no product fix or automatic retry behind this baseline.

A read-only observer sampled the successful benchmark's Node root and descendants
every 250 ms, beginning before Vite/Chrome launch. It recorded 50 samples and a
peak summed working set of **1,620,905,984 bytes** across Node/Vite, Chrome and
browser OCR workers. This is a sampled lower bound for this development workflow,
not model-only RAM, GPU memory or a phone requirement. The legacy observer's
scope sentence assumed a Python-root caller; the saved process list and explicit
caller note establish the actual broader scope here. That description is now
made neutral for future callers; the recorded observation is not rewritten.

The resource recheck at 09:25 UTC still failed the prepared 8B guards: about
12.0 GB free disk and 2.19 GB available physical RAM, with 4.52 GB additional
disk and 2.11 GB available RAM needed by the conservative protocol. An earlier
Paddle cohort recorded a 2.72 GB peak before browser overhead. No Paddle, docTR,
Qwen or other new native model is launched for this supplement. These are
resource observations, not published model minimums. No model is downloaded,
private receipt uploaded, quota consumed or paid service activated.

## Reproduction and next action

The current local inputs, frozen reference and first/second attempts are retained
under `qa-artifacts/public-scan-v1` and
`receipt_training/evaluation/runs/public-scans-on-device-v1` / `v2`.
Choose a new output name; the runner refuses to overwrite an earlier run:

```powershell
node receipt_training/scripts/benchmark_scanned_pdf.mjs public-scans-repro-v1
node receipt_training/scripts/check_scanned_pdf_finances.mjs public-scans-repro-v1
python -X utf8 receipt_training/scripts/build_public_scan_baseline.py --check
```

A clean checkout must prepare the three recorded original pages and the reference
freeze before the reader command; the machine packet records their paths, hashes
and source pages. The existing public-PDF baseline supplies the original-packet
download/hash procedure. Use the original image-only pages, never remove text
from digital pages to simulate scans. This checkpoint verifies the present local
inputs and actual run; it does not claim a clean-install reproduction was executed.

The next implementation target is source-backed OCR column/summary interpretation:
preserve quantity/unit/line roles and separate carriage and VAT from products,
while retaining mandatory source checks and abstaining on mixed tax bases.
Retained raw OCR permits a fair interpretation replay before another model call.
The app is unchanged from `5fa0d80`; its prior 853-unit/189-browser result, with
one existing skip, is prior software evidence rather than a newly run full suite.
Original sources, memberships, references, protected Git state and upload scopes
remain unchanged. Broader accuracy, stronger-model trials, handset/Safari and
public-release acceptance remain open. The full goal stays active.
