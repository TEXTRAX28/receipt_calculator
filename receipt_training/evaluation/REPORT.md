# Receipt pilot: recommendation and measured results

29 October 2026 · branch `codex/receipt-dataset-evaluation`

**Do not fine-tune yet.** The measured baseline exposes image-reading errors,
unsupported currency/number formats, missing totals and weak line association.
Parser and schema changes, a more representative UK set and a pretrained vision
comparison are the useful next steps. Training cannot recover an absent footer
or repair deterministic locale rules. This pilot is development/evaluation data.

Examples in a prompt guide a pretrained model during a request without changing
its weights. Evaluation compares predictions with separately sourced evidence.
Training/fine-tuning updates weights using labelled examples and requires its
own development and held-out transaction groups. No model was trained here.

## Collection and reference evidence

| Category | Financial receipts | Development | Held-out baseline |
|---|---:|---:|---:|
| Costco physical | 5 | 5 | 0 |
| Costco digital | 0 | 0 | 0 |
| Other retailer physical | 45 | 33 | 12 |
| Other retailer digital | 0 | 0 | 0 |
| **Total** | **50** | **38** | **12** |

One further photo-order acknowledgement is explicitly excluded. Geography is
44 Indonesian/IDR CORD receipts, four Taiwanese/TWD Costco financial receipts,
and two UK/GBP receipts (Bristol Costco and Tesco 1994). The four Taiwan examples
include three aggregate-only certificates; their zero item-label count is not
an empty basket. The other landscape invoice and Tesco still need full item
transcription. Item metrics therefore cover 44 CORD records and the Bristol
development photo, rather than all 50 receipts.

All 51 downloaded/working files decoded as real images and were opened for
origin/quality inspection. The original is unchanged and its classified alias
does not increase the count. Checks found 51 distinct image hashes and recorded
transaction groups, no cross-split group collisions and no dHash-distance ≤4
review candidates. This is a duplicate-screening result, not proof against all
possible near duplicates. Upstream CORD train/validation/test membership is
retained. See [sources and gaps](../SOURCES.md) for the actual image licences.

44 labels retain upstream CORD semantic annotations with raw text/word boxes
kept locally. Six are partial assistant visual transcriptions checked against
the source, explicitly model-generated and lacking independent human review;
their scores are exploratory development diagnostics. One control has no
financial transcription. The schema preserves original descriptions/numbers,
quantities, units/pack contents, prices, discount associations, totals, tax,
fees, rounding, payment amounts, raw codes and uncertainty separately. It uses
null plus review flags instead of guessed zeros. Validation checked 352 known
and 323 null monetary fields, including payment and control fields.

## Baseline and method

The existing on-device English Tesseract provider was run for every financial
receipt. The runner uses the real browser image preparation, detail panels,
OCR, parser and integer-money engine unchanged. Its Vite test page serves saved
source bytes; both runs have identical scanner-source hashes. No labels are
read by inference. Raw OCR/predictions and source snapshots remain private under
`evaluation/runs/`. Compact, shareable results are in `results.json` and
provenance is in `baseline-provenance.json`.

The initial knowledge graph did not cover this repository. A project-local
graph became available during the session and was checked against source. Its
nodes locate `prepareImage` at `src/lib/images.ts:L252`, `parseReceiptText` at
`src/lib/parser.ts:L36`, `calculateReceipt` at `src/lib/engine.ts:L31`, and
`money` at `src/lib/money.ts:L31`. Its image-preparation, OCR/parsing and money
communities and import edges connect OCR to images/parser and the engine to
money. The extraction runner follows those actual boundaries. No application
source was changed for this task; unrelated concurrent work was preserved.

Item detection is one-to-one description matching with a fixed 0.65 similarity
threshold, maximising match count and then description similarity. Prices are
excluded from matching. Repeated products remain separate. Counts refer to
CORD top-level menu groups, not exhaustive nested modifiers. Price, quantity
and discount accuracy include missed known items as failures; unknown labels
are omitted, with denominators shown. Monetary equality is exact in configured
currency minor units using Decimal/integer arithmetic. Dataset-context currency
labels are disclosed. A default currency flagged unknown is not credited as
recognition. The matcher tie-break was corrected after development review to
prefer an exact product name over a similar different product; the published
aggregate counts were unchanged. Scanner source and match threshold were not
tuned on held-out results.

## Actual results

Fractions are correct/matched counts over eligible known values, not estimates
of production reliability. D = development diagnostics; E = held-out baseline.
Every category with zero samples is **not evaluated**, rather than 0% accurate.

| Group | n | Item precision | Item recall | Item price, end to end | Price among matched | Quantity | Grand total |
|---|---:|---:|---:|---:|---:|---:|---:|
| D: Costco physical | 5 | 3/6 | 3/9 | 3/9 | 3/3 | 3/9 | 0/5 |
| D: Costco digital | 0 | — | — | — | — | — | — |
| D: other physical | 33 | 28/50 | 28/103 | 0/102 | 0/28 | 0/96 | 0/33 |
| D: other digital | 0 | — | — | — | — | — | — |
| E: Costco physical | 0 | — | — | — | — | — | — |
| E: Costco digital | 0 | — | — | — | — | — | — |
| E: other physical | 12 | 2/16 | 2/18 | 0/18 | 0/2 | 0/12 | 0/11 |
| E: other digital | 0 | — | — | — | — | — | — |

The Costco item denominators come from **one development receipt**, the original
Bristol photo. Other-physical development item denominators come from 32 CORD
receipts; Tesco's item transcription is incomplete. One held-out receipt has no
readable/available grand-total label, so it is omitted from total accuracy.

| Group | Item discounts | Receipt discount total | Currency value | Numeric discrepancies | Reconciliation unavailable | Manual review | Processing errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| D: Costco physical | 0/3 | — | 1/5 | 0 checks | 5/5 | 5/5 | 0/5 |
| D: other physical | 0/4 | 0/2 | 1/33 | 1/9 checks | 24/33 | 33/33 | 1/33 |
| E: other physical | — | 0/2 | 0/12 | 1/3 checks | 9/12 | 12/12 | 0/12 |

Both digital categories and held-out Costco physical have no samples for these
metrics. CORD currency truth uses dataset context for all 44 records. The two
UK currency values were correct; Taiwan and Indonesian currency values were
incorrect. These are output-value checks, not proof of reliable ISO-code reading.

**A zero discrepancy is not sufficient.** All 12 calculations with a numerical
comparison also had validation issues. Ten reported zero despite those issues;
they remain untrusted and require review. The other 38 receipts had no usable
printed-total comparison. No reconciliation success rate is claimed. See the
four source-specific exact arithmetic cases in `monetary-audit.json`: three
development checks balance, and the Bristol tax hypothesis differs by one penny.
Those checks validate arithmetic assumptions, not automatic extraction.

| Group | Measured median | Measured p95 (nearest rank) |
|---|---:|---:|
| D: Costco physical, n=5 | 2.404 s | 2.996 s |
| D: other physical, n=33 | 0.953 s | 4.141 s |
| E: other physical, n=12 | 0.794 s | 4.121 s |

All 50 processing intervals sum to 67.643 s; median 0.911 s, p95 4.121 s. Node
24.14.0 and headless Chrome 155.0.8059.80 were used. Timing includes browser
image preparation, a new OCR worker, parsing/reconciliation and RPC, excluding
browser/server startup. Browser caching and this computer affect these numbers.
There were zero external receipt requests or blocked external attempts; provider
API charges were $0. Electricity, CPU and hosting cost were not measured.

## Concrete errors and arithmetic findings

- **Bristol source:** six draft rows were returned in 2.451 s, but only paneer,
  Trolli and Panipuri matched their source descriptions and prices. Chocolate,
  backpack, Benylin, eggs and both cashew descriptions were missing/unreliable.
  The printed 74.57 total was missed. The scanner did see a 1.00 deduction on a
  malformed row, but no correct named-item/discount association was scored.
- **`cord-v2-train-020`:** the source's 26,950 total became `26.950` in a GBP
  draft. Product values such as 26,000 became `26.000`. Discounts were missed.
  A reported zero discrepancy coexisted with validation errors. This exposes
  locale and schema failure, not evidence that model training is required.
- **`cord-v2-train-019`:** parsing stopped with `Unclear printed amount`.
  It is counted as a processing error and all its eligible known fields fail.
- **Tesco 1994:** overlapping detail-panel output repeated some purchase rows,
  misread small amounts and produced a cash-like row as an item; the 6.71 total
  was missed. There is no complete item-label transcription to score it yet.
- **Taiwan:** the English reader returned no reliable item rows from the four
  fiscal documents and did not recover their totals. Three show aggregate
  amounts without an item list; the landscape invoice still needs item labels.
- **Costco raw codes:** A, Z, -A and -Z are retained with amount context and
  position. The missing UK tax legend and absent authoritative code key prevent
  treating A/Z rates as verified. Assuming 20%/0% and VAT-exclusive purchase rows
  yields 74.58 against the photographed 74.57. That unresolved difference is
  preserved; no balancing fee or rounding was invented.
- **Tax already included:** `cord-v2-validation-002` explicitly prints
  `10% Tax Included`. Its 20,000 item/total is checked without adding its
  informational tax again. Cash and change are excluded from purchase totals.

The existing demo is a different 176.78 receipt. `costcoDemo` is graph-located at
`src/lib/demo.ts:L3`; its printed-total assignment is at line 16. The opt-in
real-photo correction exercise imports that demo (`tests/e2e/real-receipt.spec.ts:L1`)
and enters 176.78 at line 70. It demonstrates manual correction and is not the
ground truth for the supplied nine-purchase 74.57 photo.

## What did not run and what to do next

Gemini comparison was not run: no `.env`/`.env.local` provider configuration or
inherited `GEMINI_API_KEY` was available. No cloud latency, token usage or model
accuracy is claimed. Running it later requires an accessible configured model,
the server-side key and privacy-reviewed/redacted working images. No training,
synthetic real-receipt padding, deployment, upload or Git commit was performed.

1. Obtain complete current UK Costco receipts, including the tax legend, and
   permissioned genuine electronic receipts. Add contemporary non-Costco UK
   layouts, returns, weighed goods and matched physical/digital transactions.
   Independently check the target labels and reserve fresh untouched groups.
2. Fix deterministic extraction boundaries: preserve raw item numbers and code
   positions, represent uncertainty explicitly, require currency/country evidence,
   parse locale-aware numbers, and confirm tax inclusion/rates per receipt.
   A product containing “3x200g” must not set purchased quantity to three.
3. Improve page-region/line reading and overlapping-panel joins on development
   examples, retaining genuine repeated purchases. Compare a practical pretrained
   vision reader through the existing provider boundary once configured.
4. Re-evaluate the frozen candidates on the new target-format holdout, including
   item/price/quantity/discount/total accuracy, review burden, latency and cost.
   Fine-tuning becomes a candidate only if source-readable structured extraction
   errors recur after these fixes and a learning-curve experiment shows benefit.
   It would require substantially more independently verified target transactions,
   rights to use them and a separate untouched evaluation set; this convenience
   pilot supplies no evidence that tuning is the best next investment.

## Files and checks

This task added the `receipt_training/` manifest, classified local files,
evidence labels/schema, source/observation documents, collection/validation/OCR
and scoring scripts, reproducible configuration, aggregate results and monetary
audit. `.gitignore` gained receipt/private-output exclusions. Pre-existing and
concurrent changes elsewhere were preserved on the new branch and are not
claimed as part of this task.

Completed checks: all images decode and match SHA256; schema/nullable-money/
rights metadata and transaction-split validation pass; evaluation tests pass;
`npm run typecheck` passed and the project's then-current unit suite passed
105 tests. No application fix or extra browser UI suite was needed for the
dataset-only changes. See [exact PowerShell workflow](../README.md) for setup,
collection, validation, local extraction, scoring and arithmetic commands.
