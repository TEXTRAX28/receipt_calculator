# Gemini 3.5 Flash-Lite: six-crop result and offline combination

2 November 2026. Parent application commit: `a4a5b8889a7a29ae7043fab34d7b7544d5213e06`.

**Keep the existing readers.** Gemini 3.5 Flash-Lite returned six HTTP 200
responses, but only four passed the application's strict receipt schema. It
delivered 17 of 25 known line prices in usable drafts and attached none of the
three known coupons. Combining the saved Gemini drafts with Azure's word
evidence also regressed financial fields relative to the existing Azure word
reader. Neither result justifies changing the default or enabling a new live
two-provider path.

## Actual requests and scope

After one non-private synthetic availability check, the user approved the
[prepared six-crop scope](GEMINI35_SCREENING_PLAN.md) and confirmed Free quota.
The batch ran from 22:12:52.855 to 22:15:31.346 UTC: six uploads, one attempt
each, starts at least 31 seconds apart, no retries or other-provider calls.
There was no billing activation. The new six-attempt authorization is consumed.
The earlier 3.8 approval was not reused.

Each call used the existing Interactions adapter, `gemini-3.5-flash-lite`,
`store:false`, low thinking, the existing schema/instructions and a 24,000-token
output ceiling. Inputs were exactly the six JPEGs from the earlier Gemini 3.8
batch; no reference labels, old readings or currency hints went to the model.
These familiar development crops have the same framing as Azure/Veryfi's PNGs,
but the encodings are not pixel-identical. They are not a blind holdout or
complete long-receipt trial.

| Crop | Adapter result | Request time |
|---|---|---:|
| Bristol Costco | Valid draft | 3.457 s |
| Taiwan Costco | Valid draft | 1.883 s |
| Tesco | Valid draft | 2.631 s |
| Restaurant train-003 | Rejected monetary formats | 1.734 s |
| Restaurant train-004 | Valid draft, incorrect monetary scale | 2.123 s |
| Restaurant test-002 | Rejected monetary formats | 3.464 s |

Mean request time was **2.549 seconds**, including the two rejected drafts.
This is network/extraction/parsing time for six small crops; it is not full
receipt latency, robust p95, handset performance or a like-for-like timing
comparison with earlier local/provider runs. Batch wall time includes spacing.

The provider reported 9,973 input and 3,237 output tokens. At the published
standard paid rates, these would cost approximately **US$0.0111 for all six**
(about $0.00185 per crop). This is an estimate from usage, not an invoice: the
user confirmed Free quota, no billing was activated and account billing was not
inspected. [Google pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite).

## Native-field comparison

The unchanged matcher/reference includes 26 purchases, 25 readable line prices,
15 known quantities, 11 unit prices and three coupon attachments. Failed Gemini
cases remain in the all-case delivered-field denominator. All known prices on
usable Gemini drafts match **17/20**; that conditional result excludes the two
failed cases and must not replace the **17/25** coverage figure below.

| Known field delivered | Azure native | Veryfi native | Gemini 3.5 native |
|---|---:|---:|---:|
| Matched purchase names /26 | 26 | 22 | 21 |
| Exact normalized descriptions /26 | 23 | 20 | 21 |
| Quantities /15 | 15 | 15 | 11 |
| Unit prices /11 | 11 | 8 | 10 |
| Line prices /25 | 23 | 18 | 17 |
| Attached coupons /3 | 0 | 0 | 0 |
| VAT letters /9 | 0 | 0 | 9 |
| Copied final totals /6 | 5 | 3 | 3 |

Native-field projections differ from each provider's later source-word/parser
path. For example, the existing Azure word reader already retains all nine VAT
letters and, with currency supplied after extraction, all 25 known line prices.
The native comparison must not be presented as Azure's complete app behavior.
Gemini returned three correct reference currencies out of six; its empty
currencies remain unknown. Monetary equality is scored with the frozen reference
currency, while returned currency is reported separately, as in prior screens.

The Bristol draft correctly copied all nine purchase names/prices/quantities
and VAT letters, but proposed the three coupon rows as **positive purchases**.
The Tesco draft put two known purchase prices into discount fields and left
their line totals empty. Two restaurant drafts copied comma-grouped values
such as `259,000`, which the strict decimal-string schema rejected. The other
restaurant returned `43.636` for a thousands-grouped amount, passing the schema
while retaining the wrong scale. Schema validity therefore cannot establish
financial correctness. No rejected amount was normalized or repaired for scoring.

## Existing verifier tested offline

The existing Azure word adapter and independent-reading verifier were replayed
from frozen source against these exact saved outputs. Azure-only drafts form
the control. The candidate combines Azure words with each valid Gemini draft,
falling back to Azure alone for the two rejected drafts. It sends no requests,
uses no labels during interpretation and does not tune or repair model output.
Six crops × two methods × automatic/supplied currency give 24 views.

| Supplied-currency field | Azure words alone | Existing verifier + Gemini, with fallback |
|---|---:|---:|
| Matched purchases /26 | 26 | 26 |
| Proposed rows | 26 | 29 |
| Exact normalized descriptions /26 | 18 | 22 |
| Quantities /15 | 9 | 11 |
| Unit prices /11 | 9 | 10 |
| Line prices /25 | 25 | 22 |
| Attached coupons /3 | 2 | 0 |
| VAT letters /9 | 9 | 9 |
| Copied final totals /6 | 4 | 4 |

Automatic line prices also regress, 18/25 to 17/25. Every draft remains blocked
by source/validation checks; none is an accepted payable receipt. Names and
quantities improve on this small sample, but those gains do not justify lost
prices and coupon ownership. This is an offline falsification of the existing
combination, not a new live app integration or combined-latency measurement.
Verified graph/source entry points are `src/lib/azure-layout.mjs:17`,
`src/lib/azure.ts:17` and `src/lib/verify-readings.ts:164`.

## Reproducibility and limits

Four offline transport/limit tests and five scoring tests pass. The network
runner bound the exact model, endpoint, image bytes, source files and approval;
strict one-shot output directories prevent resumption/retry. The native report
preserves raw provider responses and all failures. The replay preserves original
readings, frozen library modules, loaded-module hashes and pending checks.

The initial offline scoring attempt mistakenly decoded a PNG while verifying
its hash. Correcting the verifier to read bytes did not change predictions,
references or model outputs; the failed scorer and error note are retained.
Vite's optional dependency scan warned about an unrelated historical QA entry;
the frozen SSR replay completed with every source/immutability assertion passing.

No application source or default changed. The prior 966-unit/build result remains
valid for the unchanged app; the financial-column browser scenario still awaits
sufficient RAM. The larger local-model resource guards remain unchanged.
Original-fifty scores, strict complete-receipt eligibility and protected Git
references are unchanged. Full-goal and public-release acceptance remain open.

The [machine-readable evidence packet](advanced-gemini35-comparison-v2.json)
binds the approved scope, literal responses, frozen source, offline comparison,
tests and protected-checkout proof. It makes no new external requests.
The initial packet is retained. Four research scripts were normalized to the
repository's LF line endings after preserving their exact measured bytes.
The native report checker now accepts only an exact archived version when a
current file differs; missing or corrupt archives fail. The transport tests
initially refused the normalized runner because the consumed live proof binds
its exact old bytes. That failure is retained. The mock tests now prepare their
own temporary scope; live approval/source guards are unchanged. Scoring logic is
unchanged, and the nine offline tests pass again on the checkout-ready files.

```powershell
python -X utf8 receipt_training/scripts/review_gemini35_screening.py --check
python -X utf8 receipt_training/scripts/build_gemini35_comparison_report.py --check
```
