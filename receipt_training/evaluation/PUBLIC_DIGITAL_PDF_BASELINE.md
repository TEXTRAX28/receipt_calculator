# Genuine public PDF invoices: import works, financial interpretation fails

2 November 2026. Two paid invoices from an official public council packet now
exercise the current PDF path with genuine documents. Both import and reach
review without OCR, external requests or uploads. **Neither automatic draft is
financially correct; both remain blocked.** This is a new supplementary baseline,
not an improvement claim or a replacement for the original fifty receipts.

## Source and preservation

[Buckland and Chipping Parish Council published the original 21-page packet](https://www.bucklandandchipping-pc.gov.uk/media/Meetings/Files/331/meeting%20331%20merged%20invoices.pdf).
Its pages 16-17 form one complete paid Amazon invoice; page 6 is a complete paid
Gopak invoice. Both contain embedded text and actual financial columns. This is
publisher provenance, not independent verification of the underlying purchases.
The Amazon page images are only its logo, not page-sized scans.

The original packet is preserved locally with SHA256
`38558a66a4385bd1993e9476ced6c11dbb887d2adafc5bf368a5e2def2153ea7`.
Two local test PDFs retain those complete original pages. Content streams and
extracted text match the originals, and Poppler renders of all three selected
pages are pixel-identical before/after page extraction. No amounts, words or
geometry were changed. Sources and derived PDFs remain ignored; redistribution
rights have not been established. No private or public receipt was uploaded to
an OCR/VLM provider.

A second public council packet was downloaded during discovery but was not
selected, imported or scored. Its acquisition record is retained separately.
It is not an additional test case.

## Actual unchanged-app result

The runner freezes current frontend source and dependency hashes, uses
`envDir:false`, launches a fresh 390px Chromium context for each document,
uploads the local PDF and clicks **Read PDF text on this device**. Provider
discovery is disabled; PDF parsing/rendering, text interpretation, review and
persistence use actual application code. Every non-GET or external request is
blocked and counted. Both runs make zero such requests. No labels, model output
or source-specific hints are given to the reader, and no financial fields are
edited by the runner.

| Observation                           | Amazon, two pages                                     | Gopak, one page                           |
| ------------------------------------- | ----------------------------------------------------- | ----------------------------------------- |
| Visible purchase rows / returned rows | 4 / 4                                                 | 2 / 2                                     |
| Correct quantities                    | 0/4                                                   | 0/2                                       |
| Correct populated unit prices         | 0/4                                                   | 0/2                                       |
| Currency                              | EUR; source is GBP                                    | GBP; correct                              |
| Copied final total                    | 2.16; source is 13.06                                 | Missing; source is 2086.39                |
| Line-price interpretation             | Copies four gross 3.43 values, but claims net pricing | Copies VAT rate 20.00 as both line totals |
| Complete financial extraction         | Incorrect                                             | Incorrect                                 |
| Receipt confirmation                  | Disabled                                              | Disabled                                  |
| Horizontal overflow at 390 px         | None                                                  | None                                      |
| Import-through-review timer           | 1519 ms                                               | 1082 ms                                   |

These are two local observations, not a p95 estimate, speed comparison or
physical-phone result. Browser/server startup is excluded. Source descriptions
are contaminated with other columns or incomplete; correct row counts do not
establish correct purchases. The Amazon currency comes from a non-transaction
EUR footer reference. Its VAT-summary amount is selected as the final total.
This is interpretation failure despite available native text.

The sources were visually inspected before the run. The written source reference
was recorded after inspecting the draft failures, using the rendered source
values. It is diagnostic truth, not a preregistered blind evaluation. Both net
and gross columns on the Amazon document are legitimate source values; an
interpretation must choose and apply a consistent basis.

## Financial cases the next implementation must preserve

The first invoice prints four distinct Qty-1 purchases of a product packaged in
100s. They must remain four purchases. It has separate net/gross price and
promotion columns, a zero shipping row, and a second-page VAT summary. Its
printed VAT must remain the source value rather than being replaced by a value
recomputed from rounded display prices.

The second invoice prints quantities 6 and 12, unit prices and net line totals,
an already-deducted discount, and separate subtotal/tax/gross summaries. The
displayed unit prices do not multiply exactly to the printed line totals.
Preserve and flag that discrepancy; do not invent extra precision, apply the
discount again or erase source values merely to obtain a balance.

The next step is to preserve native token geometry and use actual table headers
to distinguish description, quantity, unit price, line amount and VAT columns.
Explicit transaction summaries must outrank VAT-table totals and unrelated
currency metadata. All resulting proposals still need PDF source review.
This protocol does not implement that repair yet.

## Reproduce the reading

The recorded local inputs are already prepared in this worktree. Choose a new
output name; the runner never overwrites a prior browser run:

```powershell
node receipt_training/scripts/benchmark_public_pdf.mjs public-digital-repro-v1
```

From a clean checkout, first prepare the same two whole-page inputs with the
installed `pypdf` package. This bounded public download verifies the original
hash before extraction and refuses to overwrite existing files. It requires no
API key and sends no receipt data anywhere:

```powershell
@'
from pathlib import Path
from pypdf import PdfReader, PdfWriter
import hashlib, json, urllib.request
root = Path('.').resolve()
cache = root / 'receipt_training/.cache/public-digital-v1'
qa = root / 'qa-artifacts/public-digital-v1'
cache.mkdir(parents=True, exist_ok=True)
qa.mkdir(parents=True, exist_ok=True)
url = 'https://www.bucklandandchipping-pc.gov.uk/media/Meetings/Files/331/meeting%20331%20merged%20invoices.pdf'
with urllib.request.urlopen(url, timeout=45) as response:
    raw = response.read(2_000_001)
assert len(raw) <= 2_000_000
assert hashlib.sha256(raw).hexdigest() == '38558a66a4385bd1993e9476ced6c11dbb887d2adafc5bf368a5e2def2153ea7'
original = cache / 'buckland-original.pdf'
with original.open('xb') as output:
    output.write(raw)
source = PdfReader(original)
documents = []
for name, pages in [('amazon-public-invoice', [16, 17]), ('gopak-public-invoice', [6])]:
    writer = PdfWriter()
    for page in pages:
        writer.add_page(source.pages[page - 1])
    path = cache / (name + '.pdf')
    with path.open('xb') as output:
        writer.write(output)
    checked = PdfReader(path)
    for number, page in zip(pages, checked.pages, strict=True):
        assert source.pages[number - 1].get_contents().get_data() == page.get_contents().get_data()
        assert source.pages[number - 1].extract_text() == page.extract_text()
    documents.append(dict(id=name, path=path.relative_to(root).as_posix(), pages=len(pages), sha256=hashlib.sha256(path.read_bytes()).hexdigest(), external_processing_allowed=False))
with (qa / 'page-extraction.json').open('x', encoding='utf-8') as output:
    json.dump(dict(documents=documents), output, indent=2)
'@ | python -X utf8 -
```

The frozen first-run script and source hashes in the evidence packet establish
what was executed here. A later reading with changed application code is a new
experiment, not a reproduction of the old timing or result.

## Verification and limits

`qa-artifacts/public-digital-v1` retains acquisition, exact page extraction,
original/extracted renders, pixel comparisons, source reference, frozen app
source, actual browser results and screenshots. The source/frontend hashes
remain unchanged through both runs. The app remains at `ae7f2e0`; its preceding
820-unit/189-browser result is not presented as a new suite run here. This
read-only research change adds no app dependency or runtime behavior.

Original-fifty images, memberships and references are unchanged. No new heavy
OCR/VLM run was started: an earlier owned two-reader workflow sampled about
4.17 GB RAM, while the resource recheck found only about 1.82 GB available.
That observation motivated deferring the heavy run, not a published universal
minimum. The 8B resource gate and pending private Gemini approval also remain.
Genuine scan/screenshot/refund evidence, broader financial truth, physical-phone
validation and public readiness remain incomplete. The full goal stays active.
