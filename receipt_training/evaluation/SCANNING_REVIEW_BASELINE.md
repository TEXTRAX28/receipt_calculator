# Receipt scanning and review baseline

Baseline: `360c5c4b96cecef6082c03f1e0a8657cc35f8522`, already published on
`receipt-dataset-evaluation` and `feature/advanced-ocr-vision-ai`.
Improvements start separately on `improvement/receipt-scanning-and-review`.
The frozen `stable/receipt-verified` branch remains at `ee725ba`.

## Checks before changing application code

- The baseline's last executed full suite passed **1,504 tests / 81 files**.
  TypeScript, formatting, local-only build and 20 saved-command HTTPS checks
  passed before publication. These are carried forward by source identity,
  rather than represented as a new run for this investigation.
- The user confirmed physical iPhone access and sign-in, then reported problems
  with regular OCR on a restaurant receipt. This is useful hands-on baseline
  evidence; it is not complete mobile camera/OCR acceptance.
- Working tree initially contained only the pre-existing untracked `HANDOFF.md`.
  The original checkout's three user edits and the baseline branch are preserved.

## Reproduced development case

The supplied photo shows eight purchase rows / nine purchased units, subtotal and
final total **110.70**, a VAT registration identifier, and a statement that
service charge is not included. No VAT rate or separate tax amount is printed.
GBP is explicitly supplied for the comparison; the image does not print a
currency symbol. The original photo and extracted private text stay in ignored
local QA artifacts, not in the repository or an external provider.

An isolated Chrome run at 390px used the actual baseline upload/preparation and
regular OCR flow on the complete, uncropped photo. Scanning to the review page
took **1,412 ms on this PC**. It produced four rows, blank quantities and unit
prices, a registration identifier in printed tax, no final total and a disabled
Continue action. This is desktop Chrome at mobile width, not an iPhone timing.
It does not contradict the user's better price results with their capture/crop.

A separate controlled transcription with correct amounts reproduces the parser
bugs independently of recognition: all eight quantities remain blank, count
prefixes stay in descriptions, a printed unit price stays in the ramen name,
the VAT identifier becomes tax, and `Total to pay` is not recognised. This
controlled text is a parser regression case, not an OCR-accuracy result.

The previous original-fifty comparison provides broader, partial evidence:
with supplied currency, the browser tiny Paddle candidate recovered 103/143
annotated line prices, versus 30/143 for its paired Tesseract replay. Quantities
were still weak (11/120 versus 1/120). The separately measured computer reader
was stronger. These are familiar partial references, not blind complete-receipt
accuracy or fresh handset benchmarks; see `BROWSER_PADDLE_COMPARISON.md`.

## Required improvements

Separate registration identifiers from tax rates and money; recognise supported
quantity-column layouts and guarded I/l/1 confusion; derive unit prices only
when exact and supported by a reliable count/line amount; make invalid Continue
actions reveal, focus and explain the first affected control; expose one private
scan flow with at most one clearly useful assistance option. Retain financial
review, arithmetic, provider-consent and spending gates.

HMRC distinguishes registration details, VAT rates and the amount charged:
[VAT invoice record keeping](https://www.gov.uk/guidance/record-keeping-for-vat-notice-70021).
The identifier has not been submitted to an external registration lookup, and
no VAT rate should be invented from its presence.

## Useful hands-on test before merging the improvement branch

1. On the iPhone, capture/upload this receipt and an overlapping long receipt.
2. Check the eight rows, ramen count 2, unit price 18.60, line total 37.20 and
   final total 110.70; the registration number must not become a tax charge.
3. Clear a required quantity and press Continue: the correct row must open,
   scroll into view, show a specific error and focus the input above the keyboard.
4. Correct it, complete the source checks, add people and confirm that shares
   sum to the checked total. Repeat a missing participant/assignment correction.
5. Check cancel/retry, photo retention and comfortable 320–390px scrolling.

Automated tests can cover parsing, exact money, rendering, focus/scroll and local
upload-to-split workflows. Physical Safari camera permissions, keyboard movement,
capture conditions and perceived correction effort still benefit from this test.
The baseline is already preserved; new changes remain on the separate branch
for that review. The wider twelve-phase objective remains incomplete.
