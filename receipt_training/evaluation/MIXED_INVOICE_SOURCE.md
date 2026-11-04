# Source-backed mixed-tax invoice proposal

4 November 2026, parent `cabd815`. Improvement branch only; the full goal remains
active.

Follow-up: [included-fee merger preservation](INCLUDED_FEE_MERGE.md) now carries
this primary-source rate through constructed vision success controls without
counting it as independent agreement. The actual local vision attempt is stopped
by the memory guard without a draft; its accuracy remains unverified. Counts and
observations below describe this earlier primary-reader checkpoint.

The selected computer reader now interprets the supplementary Western Towing
invoice's wrapped products, quantities, unit prices, VAT-inclusive carriage and
full printed VAT. On the **same new Paddle reading**, the calculated total
improves from **£20.07 to £29.06**, preserving all printed monetary strings.
Eight source checks remain pending. Built-interface replay passes at 320px and
390px and reaches an exact £14.54 / £14.52 item-wise split after automated review.
This is one familiar supplementary invoice, not a blind or complete-corpus win.

## What was actually read

The earlier Tesseract reading misses the purchase header and gives the carriage
price only 0.66 OCR confidence. Its missing quantity glyph cannot safely become
`1`. A fresh local **PaddleOCR PP-OCRv6 medium ONNX CPU** run uses the existing
selected adapter and six checksum-verified cached assets, four threads and the
existing prepared JPEG. It supplies 59 actual words/regions, including the full
header, two literal Qty-1 rows, carriage qualifier and VAT rate.

Input JPEG SHA256:
`6cb4149f39a705225f5a812db90cebe7db35f60c1569d70e510448148776371d`.
Original image-only PDF SHA256:
`e55d52936349eb57f31a8deaddf674a945f521ab056b77e84c64e8f4da7445b5`.
Historical encoded JPEG hashes were not recorded; current reconstruction does
not prove byte equality to the earlier Tesseract input. The before/after gain
below therefore uses this **one identical new Paddle output**, not a claimed
controlled Tesseract-versus-Paddle pixel comparison.

The model receives the image, never expected values, reference labels or old OCR
text. Initialization is 10.331 seconds and inference 5.031 seconds; the guarded
whole process takes 17.300 seconds. These are one computer observation, not p95,
phone speed or complete upload-to-split latency. Peak native working set is
1,068,339,200 bytes; minimum available system RAM is 1,778,208,768 bytes. API cost
is zero; local compute cost is unmeasured. Python socket connections are denied
by the wrapper before model initialization; the reused benchmark separately
records its own after-initialization denial. No model download or external
receipt request is made.

## Interpretation and its limits

`scalarSummary()` at `src/lib/invoice-columns.ts:L64` (graph community 10) reads
complete scalar invoice rows, including plain Subtotal/Total, an explicitly
printed VAT rate, and a fee's `(incl. VAT)` qualifier. `readInvoiceColumns()` at
`src/lib/invoice-columns.ts:L212` uses the shared source-position interpreter.
There is no retailer name, product code or target amount in production logic.

For the new mixed case, one page/table must have one contiguous four-row footer:
subtotal, explicitly VAT-inclusive fee, one rated VAT amount, total. The sole
printed VAT rate is **proposed** for that inclusive fee; the review details ask
the user to check its applicability. Missing/multiple rates, weak amounts,
conflicting currencies, unsupported rates and arithmetic mismatch cause
abstention. No rate is supplied from a country, default or tax letter. All
financial proposals retain the existing 0.90 invoice-word floor; the separate
financial-summary verifier's 0.98 floor is unchanged. Neither score is proof of
correctness.

The unchanged exact-arithmetic engine extracts the fee's embedded component
using its existing included-tax rule. Arithmetic rejects an inconsistent
interpretation; it never searches for a rate or alters an amount to balance.
The fee stays 4.98 and full VAT stays 4.84. Embedded fee VAT is 0.83, added VAT
4.01, and 20.07 + 4.98 + 4.01 = 29.06. This differs from the earlier
[manual-entry engine repair](INCLUDED_FEE_TAX.md), whose before total was 29.89.

A leading wrapped description can attach to the first numeric purchase only
when all actual cells belong to the description column and the existing 0.025
vertical-gap bound holds. Following description lines retain their source
indices. Codes and numeric columns stay separate; quantities are not inferred
from division or OCR lookalikes. The top strong OCR heading remains an editable,
source-checked merchant proposal. All eight receipt checks remain unconfirmed,
including products, basis, adjustments and printed tax.

| Field on the identical saved Paddle reading | Parent parser | New source proposal |
|---|---|---|
| Products | Two contaminated descriptions | Both printed wrapped names |
| Quantity / unit price | 0/2 / 0/2 | 2/2 / 2/2 |
| Line prices | 16.32 / 3.75 | Same strings |
| Subtotal / final printed total | 20.07 / 29.06 | Same strings |
| Carriage / full printed VAT | Missing / missing | 4.98 gross / 4.84 |
| Fee VAT rate | Missing | Printed 20%, pending applicability check |
| Calculated total / discrepancy | 20.07 / −8.99 | 29.06 / 0.00 |

The source-derived partial references are assistant-reviewed, not independently
human verified. This invoice's historical strict-reference eligibility is not
changed. No whole-receipt accuracy denominator is created. The independent
Qwen/hybrid reading of this new source has not been benchmarked; the provider,
automatic comparison policy and prompts remain unchanged.

## Regression and phone evidence

All **1,312 application unit tests**, **185 focused cases**, current typecheck,
formatting and isolated build pass. Twelve new cases cover the real OCR fixture,
literal monetary preservation, quantities, wrapped names, review/source links,
missing or wrong rates, multi-rate ambiguity, distant names, mixed currency,
weak money and exclusive-fee mismatch. The fixture keeps actual OCR geometry
and omits recipient/address blocks.

The original-fifty replay executes **400 views / 200 pairs**, with source geometry
now supplied to the primary parser as the app does. All four count vectors,
normalized facts, calculations, source links and review checks stay unchanged
before/after this implementation. All 362 shared original input hashes match.
A separate **106 views / 53 pairs** covers the fifty historical on-device readings
and three supplementary scans; all normalized outputs also stay unchanged.
The old Tesseract mixed invoice still abstains, and the payment-only case remains
without products. These are saved-reading regressions, not fresh full-cohort OCR.

An older text-only primary benchmark is a different protocol. With supplied
currency, its 3/9 correct price-basis proposals become 0/9 when source geometry
is supplied to **both parent and new code**; untrusted zero discrepancies change
18 to 15 and failed reconciliations 16 to 19. Other primary scored counts and
both hybrid vectors reproduce. These are protocol differences, not regressions
introduced by this change or new hybrid gains. Published historical counts keep
their original scope. Strict original-fifty complete accuracy remains unscorable.

The first detailed equality helper incorrectly treated transient removed-entity
UUIDs as facts. The retained diagnostics identify those exact differences.
The final comparison normalizes only generated entity identities, preserving
order, aliases, cross-references and every value. Five controls prove renaming
passes while changed money, source links or aliases fail. These research controls
are separate from the 1,312 application tests.

The new built UI uses the real prepared invoice JPEG and saved native response:
one intercepted local recognition POST per width, no new model call. Initial
confirmation is disabled; viewing at least three first-product source regions
does not mutate the receipt. All eight checks must be confirmed before advancing.
Automated checkbox interactions then exercise assignment/finalization and retain
£14.54 / £14.52, with no financial edits or horizontal overflow at 320px/390px.
The 320px final screenshot is visually inspected. This is Chrome phone emulation,
not independent human review, live model HTTP, a physical camera or Safari.

## Failed attempts, protection and reproduction

The initial source regression fails as expected. The first implementation also
rejects the leading name because it incorrectly requires its entire word box
inside the header label's band. Using the existing cell-ownership rule fixes that
without weakening numeric confidence. The initial typecheck exposes an overly
broad inferred string type; its explicit union annotation fixes it. Final full
tests and typecheck use that current source. The formatting child exits zero;
its read-only outer guard reports intentional source changes. Two unformatted
inputs are recovered exactly from the recorded patches and prior archived bytes,
matching their already-recorded hashes; no historical expectation is rewritten.

The first new browser preflight refuses at 2,578,534,400 bytes, below 2.5 GiB,
without starting a browser. A later qualifying observation permits the successful
run at 2,685,722,624 bytes; its runtime minimum is 2,234,699,776 bytes. The unchanged
browser limits are 2.5 GiB startup, 1 GiB runtime and 300 seconds. Native/CPU guards
retain 1.5 GiB startup and 1 GiB runtime; no user application is closed.

`advanced-mixed-invoice-source-v1.json` preserves current/archive source,
requests, outputs, failed/passing checks, replay and browser evidence. Local raw
work is under `qa-artifacts/mixed-invoice-reader-v1/` and the named run folders.
Offline replay disables Vite configuration/env loading and makes no new inference.
The source-aware original-fifty protocol adjustment is retained explicitly.
Model assets are checked before launch; packet checks verify retained witnesses
and do not silently rehash large caches. There is no live `.env.local` access,
external private upload, OpenAI request, key setup, quota probe or billing change.

Only the shared invoice interpreter and two new test/fixture files change in
application/test source. Stable `ee725ba45e799bee8501d3de034e0302c0127afd`, the
original checkout's three dirty files and its binary-diff hash remain intact.
No push, merge or deployment occurs. The next target is independent local vision
and merged-fee behavior on this same source, followed by broader genuine capture,
device and release evidence in the [acceptance audit](GOAL_ACCEPTANCE_AUDIT.md).
