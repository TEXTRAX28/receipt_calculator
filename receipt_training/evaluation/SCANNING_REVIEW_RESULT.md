# Receipt scanning and review improvements

7 November 2026. Branch: `improvement/receipt-scanning-and-review`.
Preserved baseline: `360c5c4b96cecef6082c03f1e0a8657cc35f8522`.
The [baseline record](SCANNING_REVIEW_BASELINE.md) was committed before changing
application code. The improvement branch is separate from the published baseline.

The implementation is ready for hands-on acceptance on its separate branch.
It has not been merged into the published baseline.

## What caused the reported errors

The restaurant header contains a nine-digit UK-format VAT registration identifier,
not a tax charge. No VAT rate, separate tax amount or currency symbol is printed
on the supplied photo. Its eight purchase rows add to the printed 110.70 total;
there are nine purchased units. GBP was explicitly supplied for the local tests.
The registration has not been checked against an external registry.

The old generic summary parser accepted the identifier as tax. A controlled
transcription reproduced this even without any image-recognition errors. The old
item parser also failed to recognise the receipt's `QtyDish / Amount` layout,
left leading counts in names, and left the ramen's printed unit price in its
description. `Total to pay` was not recognised as a final-total heading.

Recognition contributed separately: on the same uncropped photo, the baseline
regular reader produced four rows in the actual upload flow; the stronger reader
found all eight line amounts. Correct text alone cannot fix field-role parsing,
and better parsing cannot recover every character that OCR never recognised.

HMRC distinguishes a registration number, tax rates and the amount charged:
[VAT invoice records](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021).
Blank tax is not a claim that the purchase is zero-rated.

## Implemented changes

- Registration identifiers and explicitly printed rates are separate metadata.
  They never supply a missing tax amount. Wrapped registration details and
  conflicting identifiers are handled conservatively. Currency context prevents
  a nine-digit IDR tax amount from being treated as a UK registration number.
- Quantity-table headings establish the role of leading counts. An isolated
  `I`, `l` or `|` is proposed as one only with table context and at least two
  numeric peer counts; that repair requires checking against the source.
  Unlabelled brand/pack prefixes are preserved.
- Ramen maps to quantity **2**, unit price **18.60**, line total **37.20**.
  Unprinted unit prices use exact minor-unit division. Non-exact division stays
  blank; a contradictory printed unit price stays visible for correction.
  Explicit quantity corrections update calculated unit prices without pretending
  that a person confirmed the calculated field against the receipt.
  Choosing currency after scanning also fills exact calculated unit prices,
  while preserving outstanding quantity and source checks.
- Purchased quantities are visible without opening each item's details.
  Calculated unit prices are labelled. Continue validates before advancing,
  opens hidden fields, scrolls, focuses and highlights the first correction, and
  shows its message beside the input. Invalid inputs take priority over the
  downstream arithmetic mismatches they cause. Missing names, tax-code rates and
  incomplete shares receive specific targets too. Reduced motion is respected.
- There is one private default, **On-device scan**, and at most one configured
  **Assisted scan** option. Usable PDF text is automatic within the private flow.
  The stronger browser reader falls back to compatibility OCR only when it is
  unavailable before recognition, including initialization failure. Cancellation,
  invalid images and reading timeouts do not start another model. No failure
  automatically selects an external provider.

The owner can choose the single helper through `RECEIPT_ASSISTED_READER`.
Computer OCR is preferred when configured; among external helpers Azure precedes
Gemini and Veryfi in the default availability order. Local vision remains
optional and OpenAI credits remain the last resort. Configuring a preference
does not configure credentials or grant any uploads. Existing per-scan consent,
finite allowances and spending guards remain in force. Optional computer vision
verification is a server policy (`LOCAL_OCR_CHECK_MODE`), rather than another
normal scanning choice; it defaults to off to avoid a slow second reading.

## Actual restaurant photo

An owned desktop Chrome session at 390px used the real application upload and
default reader, with all external requests blocked. This is not physical iPhone
timing or a blind holdout.

| Result before corrections | Baseline regular OCR | Revised default |
|---|---:|---:|
| Scan to editable review | 1.412 s | 4.221 s |
| Returned purchase rows | 4 | 8 |
| Correct line amounts | Incomplete list | 8/8 |
| Correct purchased quantities | 0/8 | 7/8 |
| Printed final total | Missing | 110.70 |
| Registration identifier in tax amount | Yes | No |

Chocolate Tart's missing count stays blank. Continue moved to that input;
entering one calculated its 5.50 unit price. Two explicit source confirmations
were still required. A reference-assisted browser journey then finalised two
shares of **55.35**, without changing the recognised financial amounts.
One dish also has an OCR accent/spelling difference, so names still need review.
This is not a claim of complete semantic accuracy or measured human time saved.

Private photos, OCR text, registration values and screenshots remain in ignored
local QA artifacts. No external receipt uploads or API credits were used for
this investigation. Model assets came from the already installed, verified cache.

## Broader measured evidence and model choice

Both parsers were replayed on the same saved OCR observations for fifty familiar
receipts, using the unchanged v5 partial references and scorer. No new model
requests were needed. Across the scored vectors there was **no regression**
between the preserved baseline parser and these changes. The new restaurant
layout is development coverage; the fifty-receipt replay does not establish
general improvement for every quantity layout.

With receipt currency supplied after extraction:

| Known field | Regular English OCR | Stronger browser OCR |
|---|---:|---:|
| Line amounts | 30/143 | 105/143 |
| Purchased quantities | 1/120 | 16/120 |
| Unit prices | 1/31 | 14/31 |
| Copied final totals | 9/49 | 25/49 |

Non-Costco physical samples account for 97/134 known line prices with the
stronger reader, versus 30/134 with regular OCR. The Costco subset has 8/9 versus
0/9 known line prices, but neither browser reader recovers its five labelled
final totals. These references are incomplete; full-receipt accuracy is
unscorable. Automatic currency remains weak: stronger-reader line amounts score
20/143 without supplied context. A missing currency must still be chosen.

The separate retained computer-reader comparison reached 133/143 line amounts
and 119/120 quantities. Its setup and timing differ, so this is evidence for a
useful optional helper, not a controlled new speed comparison. The earlier
browser study's warm prediction/decode mean of 0.879 s excludes initialization,
preparation and parsing and must not be substituted for scan-to-review time.
See [browser measurements and limitations](BROWSER_PADDLE_COMPARISON.md).

Previous six-crop provider trials also do not support making a cloud model the
default. Azure's word/parser path recovered 25/25 known line prices with currency
supplied; Gemini 3.5 delivered 17/25 in schema-valid drafts. OpenAI delivered
25/25 and three known coupons, but four of its six returned currencies were
blank. Its recorded request/adapter mean was 12.802 s; its US$0.27582 ordinary
uncached six-request estimate was not a verified bill. These are familiar,
partial crops with differing encodings, not complete phone receipts or a fair
latency ranking. [Azure](AZURE_SIX_RESULT.md), [Gemini](GEMINI35_SIX_RESULT.md),
[OpenAI](OPENAI_SIX_RESULT.md).

The chosen default improves recognition without per-scan API charges or private
uploads. Its first-use assets are about 50 MB including runtime/code, and phone
CPU/memory and Wi-Fi still matter. The computer helper offers better measured
quantity extraction when installed. Preprocessing alone would not fix the
reproduced parsing failures; no unmeasured automatic sharpening or deskew change
was introduced. Targeted training is premature with incomplete labels and no
fresh blind validation. More diverse quantity-layout references are a better
next accuracy investment than assuming a new model will fix field mapping.

## Verification

Checks actually completed on this branch:

- **1,564 unit tests across 84 files passed**, including registration-versus-tax,
  quantity prefixes and repairs, exact unit-price calculations, currency selected
  after extraction, reader fallback and validation targeting.
- **TypeScript, Prettier and the production build passed.** The build retains
  existing OpenCV browser externalisation and large-chunk warnings. No dependencies
  were reinstalled and the existing live phone build was preserved.
- The broad Chromium run completed **279 passes, two failures and one intentional
  mobile duplicate skip**. Both failures were the same photo-guidance test setup
  still assuming that the computer helper selected itself. After correcting that
  setup, the final targeted run passed **24/24**, covering both desktop and mobile,
  photo guidance, the new currency-after-scan case and the review-to-split paths.
  An earlier focused regression run also passed **28/28**. These are separate runs,
  not a claim that a single complete browser run finished without failures.
- The actual supplied photo passed the local upload-to-review-to-finalisation
  journey described above, including the remaining manual count correction.
- Replaying saved OCR for fifty receipts produced no scored parser regression
  against the preserved baseline, using the same partial references.

Browser tests used one worker, no retries, and isolated local provider stubs.
They did not upload private receipts or make fresh provider-accuracy measurements.
Mobile cases preserve phone CSS dimensions, touch and user agent, but use device
pixel ratio 1 to keep screenshot buffers within the existing memory guard.
An earlier run was stopped when available memory fell below that guard; it was
not counted as a pass, and the threshold was not lowered. Host WebKit is not
installed; no Safari-engine result or physical iPhone acceptance is claimed.

The original checkout's HEAD and pre-existing edits were verified unchanged.
Private QA evidence and the pre-existing local handoff are excluded from the
implementation commit. API credits used by this investigation: **zero**.

## Before merging this improvement branch

The baseline was already preserved and published. Personally test the new branch
on the iPhone before merging it: desktop automation cannot establish camera
quality, Safari keyboard positioning, first-use download time or memory behaviour.

1. Scan the restaurant receipt with GBP selected. Check eight rows, ramen
   2 × 18.60 = 37.20, total 110.70 and blank Printed tax. Compare names too.
2. Clear a quantity and press Continue. The field should be highlighted, focused
   and visible above the phone keyboard. Enter the count and verify its unit price.
3. Test a long Costco receipt using overlapping photos. Confirm repeated purchases
   remain separate, coupons stay attached and the final total matches the paper.
4. Complete a split, refresh the draft and verify its figures persist. Check that
   the phone layout has no sideways scrolling. A second helper must require an
   explicit selection, and an external helper must require upload consent.

Remaining limits: wider quantity extraction is still weak on the partial corpus;
faint or missing text still needs correction; mandatory source review remains;
phone timing is unmeasured. The stronger assets need preparation on a new
checkout (`npm run setup:enhanced`); otherwise compatibility OCR is automatic.
