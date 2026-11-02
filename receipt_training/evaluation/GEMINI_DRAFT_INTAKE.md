# Gemini draft retention — 2 November 2026

Gemini now keeps a structurally valid draft when its monetary strings contain
bounded comma grouping. For example, `259,000` remains exactly `259,000` in the
editor. The app does not decide what the comma means. Invalid amounts block
receipt confirmation and final sharing, even after a currency is selected and
every source checkbox is ticked. Manually correcting each affected field uses
the existing review behavior.

This recovers useful editable output from two of the six previously approved
Flash-Lite responses. It does **not** improve their financial accuracy, and it
does not replace the selected reader or integrate a live Azure/Gemini combination.

## What changed

The server and browser share `geminiReceiptDraftSchema`. It accepts canonical
decimal strings plus bounded comma-grouped monetary literals. Quantity and tax
rate formats, strict keys/types, collection limits, source-photo ownership and
negative-adjustment ownership remain enforced. The canonical `aiReceiptSchema`
used by local vision and the JSON schema requested from providers are unchanged.

`receiptFromAi` retains the literals, adds pending checks and explains that
amount formatting needs correction. Tax and other adjustment roles survive.
Unknown currency and quantity fields remain unresolved. Existing exact money
validation continues to reject commas; no total is repaired to make it balance.

## Saved-response measurements

The six approved requests are already consumed. This work replays their saved
HTTP 200 responses through the actual Gemini decoder with a synthetic JPEG and
mock transport. It makes **zero new model requests or private uploads**. The
original benchmark's four canonical successes and two rejections remain frozen.

| Delivered field | Before | After |
| --- | ---: | ---: |
| Editable drafts | 4/6 | 6/6 |
| Canonical decimal drafts | 4/6 | 4/6 |
| Exact normalized product descriptions | 21/26 | 26/26 |
| Known quantities | 11/15 | 15/15 |
| Known unit prices | 10/11 | 10/11 |
| Known line prices | 17/25 | 17/25 |
| Known coupon attachments | 0/3 | 0/3 |
| VAT letters | 9/9 | 9/9 |
| Printed totals | 3/6 | 3/6 |

The matcher, six crop references and all-case denominators are unchanged.
Comma-formatted monetary strings are unavailable numeric fields in this
separate retention analysis. They receive no credit by interpreting separators.
All literals remain in the saved/app drafts. These familiar, partial crops do
not establish complete-receipt accuracy or a general provider ranking.

The original fifty-receipt replay produces 400 views with identical before/after
field counts and no scored per-case changes. Supplied-currency hybrid results
remain 133/143 known prices, 119/120 quantities and 41/49 printed totals.
Trusted reconciliation remains 0/49; all fifty lack complete financial truth
for strict whole-receipt scoring. No new OCR inference was used in this replay.

## Verification

- All **1,010 unit tests** pass, including real decoder boundary checks, malformed
  values, ownership limits and attempts to finalize unresolved amounts.
- Production build and TypeScript checks pass. The first build caught a missing
  abort signal in a new test fixture; that failed build is retained.
- All **27 browser cases** pass, with zero skips, retries or final failures,
  across desktop Chrome, phone-sized Chrome and host WebKit. These are synthetic
  mocked-provider journeys, not physical-phone or live-model accuracy tests.
- The new journey preserves four comma-formatted fields, proves checking them
  cannot enable sharing, corrects them manually, and splits GBP 1,000 into
  exactly two GBP 500 shares. Layout checks pass in the phone contexts.
- The run also completes previously pending slanted financial-column and
  reduced selling-price-role journeys. An initial run retained 12 passes,
  three test failures and 12 unrun cases. The corrected tests respect existing
  behavior: manual edits check their fields, and an unsupported printed total
  still needs its own explicit confirmation. No app safeguard was removed.
- The final guarded browser run started with 2,869,993,472 available RAM bytes;
  the minimum sampled available RAM was 1,673,482,240 bytes, above the unchanged
  1 GiB runtime floor. Only owned test processes were managed.

The pending tiny/medium browser model study is refreshed as version 7 with
identical models, images, parameters, limits, scoring and timing. Only the two
changed library inputs differ. Its 3,885,219,840-byte startup guard is still
above available memory. The separate 8B trial also lacks its existing memory
and disk reserve. No larger-model trial, download, app closure or file cleanup
was performed.

## Evidence and scope

The packet is `advanced-gemini-draft-intake-v1.json`; verify it with
`python -X utf8 receipt_training/scripts/build_gemini_draft_intake_report.py --check`.
It binds the pre-change plan, exact source snapshots, unchanged provider schema,
saved-response replay, retained failed attempts, original-fifty replay, final
tests/build, browser evidence and model-plan refresh. Outputs are exclusive;
historical evidence is never overwritten.

The work is on `feature/advanced-ocr-vision-ai`, based on `71c5027`.
`stable/receipt-verified` remains at `ee725ba`; the original checkout's head and
existing diff remain unchanged. Nothing is pushed, merged or deployed.
The full improvement goal remains active; public-release readiness and trusted
automatic financial acceptance have not been demonstrated.
