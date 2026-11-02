# Source-backed footer overlap recovery

2 November 2026. Improvement branch `feature/advanced-ocr-vision-ai`, following
`68654b2`. The full production-scanner goal remains active.

The supplied two-photo UK Costco receipt now produces **18 purchases and GBP
176.78**, without monetary edits, through the actual enhanced browser reader.
Both genuine rotisserie-chicken purchases and the cloth coupon remain. The
previous two extra footer purchases and 1138-pence discrepancy are gone.
This is a corrected draft, not a verified complete receipt: several names and
VAT-code readings still need source review, and confirmation remains blocked.

## What changed and why

The actual tiny reader omitted the cropped merchant name and used a full-width
colon in one transaction label. The independent saved docTR reading also added
trailing punctuation to that label and read an opening total-label parenthesis
as `C`. Those differences prevented the previous exact footer matcher from
running even though the repeated purchase rows agreed.

- `src/lib/receipt-layout.ts:L56` accepts ordinary/full-width label colons and
  trailing punctuation around the reference. The reference itself must remain
  an exact 10–24-digit sequence; ambiguous or conflicting references abstain.
- `src/lib/receipt-layout.ts:L113` uses that identity and the complete ordered
  purchase sequence, rather than requiring a recognized merchant heading. The
  rule can support another retailer with the same evidenced row structure.
  It still requires at least two distinct SKUs, one uniquely matching larger
  photo, an end-aligned sequence and a footer starting near the image's top.
  Descriptions, quantities, unit/line prices, tax codes and coupons must match.
- `src/lib/parser.ts:L33` recognizes the narrow `TOTALCINCL VAT)` /
  `TOTALCEXCL VAT)` label error only with a closing parenthesis. Original text,
  source coordinates and every monetary token remain unchanged. The subtotal
  and existing price-basis proposal use the same label recognition.

Source photographs and detected lines remain available. Only matched purchase
blocks leave the assembled purchase text; unmatched fragments are retained.
Incomplete numeric purchases, uncertain quantities, different money/coupons,
missing identities and ambiguous larger photos do not authorize a merge.
Within-photo repetitions are untouched. No amount is inferred from a target
total, no VAT rate/code is repaired, and no review check is auto-confirmed.

## Paired retained-reading comparison

`replay_footer_overlap.mjs` freezes the parent and current source independently
and processes the same 108 retained observations in automatic and separately
supplied-currency modes: original fifty with Tesseract and tiny Paddle, plus
four familiar photographed transactions with tiny Paddle and docTR. The 432
predictions use unchanged v5/UK-v2 references and `score.py` /
`score_adjustments.py`. The UK supplement has no supplied currency; its GBP is
read from the source in both modes. No new inference or upload occurs in replay.

Only the UK supplement changes financially; all original-fifty predictions and
all three CORD-photo predictions remain equal before/after.

| UK field | Tiny before → after | docTR before → after |
| --- | --- | --- |
| Predicted / expected purchases | 20/18 → 18/18 | 20/18 → 18/18 |
| Correct quantity, unit price, line price, discount | 18/18 → 18/18 each | 18/18 → 18/18 each |
| Exact names | 15/18 → 15/18 | 17/18 → 17/18 |
| Correct subtotal | 1/1 → 1/1 | 0/1 → 1/1 |
| Printed total | 176.78 → 176.78 | 176.78 → 176.78 |
| Calculated-minus-printed difference | +11.38 → 0.00 | +11.38 → 0.00 |
| Strict complete receipt | 0/1 → 0/1 | 0/1 → 0/1 |

These are familiar, assistant-reviewed development references, not independent
blind validation. Original-fifty full financial truth remains incomplete and
complete-receipt accuracy unscorable. Tiny original-fifty line prices remain
19/143 automatic and 103/143 with supplied currency; quantities remain 11/120.
Tesseract stays at 3/143 and 30/143 prices. The stronger computer hybrid has not
been replaced. This replay covers primary assembly/parser behavior, not new
native/VLM calls or the entire hybrid orchestration. A raw docTR parser draft
now has zero arithmetic issues, but app-level mandatory source checks are not
part of this replay and strict correctness still fails its name reference.

## Actual app verification

The opt-in production UI test performs fresh tiny-model inference on the two
original private photos, with every external-origin request and HTTP write
blocked. It verifies exactly 18 purchases, two chickens, the 1.50 cloth coupon,
the overlap warning, source highlights, worker closure and disabled confirmation.
Financial fields and source checks are untouched. The actual app scorer confirms
all eighteen quantities, prices and discounts, zero extra rows, zero discrepancy,
but strict 0/1 and trusted reconciliation 0/1 because source/VAT issues remain.

Observed scan-to-review time is **10,258 ms**, including UI observation overhead
and excluding upload/preparation plus server/browser startup. The sampled owned
Node/preview/browser tree peaks at **1,751,097,344 bytes**; startup available RAM
is 4,165,857,280 bytes and minimum observed available RAM is 2,865,541,120 bytes.
This is one local development transaction on desktop Chromium with phone
emulation, not handset memory, a model-only peak or a new latency benchmark.
Source-view screenshots were inspected; no horizontal overflow was detected.

Validation passes **912 unit tests, 195 browser tests and one separate actual
private-receipt UI test**, with one existing browser skip. Typecheck, formatting
and production build pass; the existing large-bundle warning remains.
Validation commands and their exact outputs are bound by
`advanced-footer-overlap-v1.json`. New tests cover missing merchant headings,
punctuation, preserved clipped fragments, altered references, generic merchant
structure, damaged total labels and genuine repeated purchases. Existing
negative overlap, money, allocation and provider tests remain in the suites.

The first new unit expectation incorrectly expected an app-level review check
from the raw parser; its source is archived and the assertion was corrected.
Two replay attempts stopped on absent supplement currency context before any
after predictions. Their files are preserved; the completed run supplies no
currency when the original protocol has none. One scoring attempt omitted the
required elapsed-time field; the corrected scorer explicitly uses null because
replay does not measure inference latency. These are harness/test failures,
not successful model runs, and are not silently replaced.

Reproduce the local comparison with a new unused tag:

```powershell
node receipt_training/scripts/replay_footer_overlap.mjs footer-overlap-new-run
python -X utf8 receipt_training/scripts/score_footer_overlap.py footer-overlap-new-run
python -X utf8 receipt_training/scripts/build_footer_overlap_report.py --check
```

Current local evidence includes the ignored private images and retained SDK
observations; those bytes are intentionally absent from Git. Model setup and
the browser test environment must be available for a fresh actual UI scan.

No new dependencies, model downloads, external receipt uploads, paid activation,
credentials, merge, push or deployment were needed. The baseline and original
working checkout remain protected. Generic quantity/currency recovery, better
VAT-code reading, real phone/Safari tests, independent complete financial truth
and public service controls remain open. This change does not complete the goal.
