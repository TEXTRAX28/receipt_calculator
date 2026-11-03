# Azure quantities tied to original purchase words

Checkpoint: 3 November 2026, improvement branch on parent `8240338`.

The optional Azure reader now retains five quantities that its word-only draft
previously left blank. On the same six saved, previously approved responses,
known quantity matches improve **9/15 to 14/15**. Every new value remains a
proposal requiring a check against the original. There are no new model calls,
private uploads, changes to provider defaults or allowance increases.

## What changed

Azure's native `Quantity` field can identify a printed number's role when the
ordinary row parser cannot. The adapter accepts that role only when the literal
quantity agrees with its original word, exact content spans and source geometry.
Description, quantity and price words must be distinct and all belong to exactly
one parsed purchase. Conflicts, duplicate proposals, shared source ownership,
missing fields and weak words cause abstention. Existing quantities are never
overwritten. Native monetary amounts and currency are still ignored.

The proposal is copied into the draft with a pending quantity check and its
original source region. Existing review evidence is preserved. Provider
confidence supports the decision to propose a value; it does not verify that the
value is correct. Quantity field/word confidence must reach 0.98, and all linked
words must meet the existing 0.75 word threshold. No equation is used to fill a
missing quantity or unit price.

Graph-verified entry points are `src/lib/azure-layout.mjs:L178`
(`projectAzureQuantities`), `src/lib/azure-quantities.ts:L7`
(`recoverAzureQuantities`), `src/lib/azure.ts:L18` (`receiptFromAzureWords`)
and `server/azure-reader.mjs:L88` (`createAzureReader`). The shared result schema
adds bounded optional word-index hints and continues accepting old word-only
responses. The HTTP response and browser draft use the same validation path.

## Paired saved-response measurements

The protocol was recorded before implementation. Both versions use the same
six responses, unchanged crop annotations, matcher and scoring configuration.
Automatic currency and a separately supplied currency are scored separately;
no currency or label was sent to a provider. The 24 views are six transactions
across two code versions and two context modes, not 24 independent samples.

| Known field | Before | After |
|---|---:|---:|
| Purchased quantities, either currency mode | 9/15 | **14/15** |
| Matched purchase names | 26/26 | 26/26 |
| Exact normalized descriptions | 18/26 | 18/26 |
| Unit prices | 9/11 | 9/11 |
| Line prices, automatic currency | 18/25 | 18/25 |
| Line prices, supplied currency | 25/25 | 25/25 |
| Attached coupons | 2/3 | 2/3 |
| VAT letters | 9/9 | 9/9 |
| Copied totals, automatic currency | 2/6 | 2/6 |
| Copied totals, supplied currency | 4/6 | 4/6 |

All five recovered quantities are literal `1`: the Taiwan membership row,
three purchases on one restaurant receipt, and the Baso Bihun purchase.
The remaining Jasmine row has weak description evidence and stays blank.
The thresholds were not lowered to accept it. Original words, geometry, purchase
order, descriptions and every monetary field remain unchanged. All drafts
still have blocking checks; there is no automatically accepted payable result.

This is an application interpretation improvement using already available
provider evidence. It is not a new recognition model comparison or independent
vision verification. Azure's historical native-field score remains 15/15
quantities and 23/25 line prices; those numbers must not be mixed with the app's
conditional word-parser scores above. These familiar cropped samples do not
establish full-receipt or general provider accuracy.

The original fifty-receipt replay also remains unchanged: 400 paired views,
zero scored improvements or regressions. With currency supplied, the local
hybrid retains 133/143 line prices, 119/120 quantities, 41/49 copied totals and
6/9 tax-basis matches. Trusted reconciliation remains 0/49; incomplete financial
references leave strict whole-receipt accuracy unscorable for all fifty.

## Verification and limits

All **1,037 unit tests** pass. The quantity tests cover repeated purchases,
conflicting ownership, malformed/weak native evidence, transport bounds,
preserved checks and finalization blocking. Two tests exercise the actual local
HTTP route with synthetic provider responses: valid source hints reach the
draft; a conflicting native quantity leaves the word draft usable. The fake
transport records exactly one upload, one status read and one deletion per test.
No request reaches Azure. This is integration evidence, not recognition testing.

Production build/typecheck pass. The initial build failure was a widened string
type in the new test fixture; its failed log is retained with the corrected
builds. The new browser journey is prepared alongside existing Azure consent,
failure, allowance and Gemini draft-regression journeys: 15 cases across Chrome
desktop/phone emulation and host WebKit. It **has not run**: the unchanged
2.5 GiB startup guard refused at 2,354,847,744 available bytes before launching a
browser. The lightweight HTTP tests do not verify UI interactions or phone
layout. Earlier browser passes belong to their earlier source checkpoint.

The larger browser-model plan is refreshed to v8 with identical images, models,
parameters, scoring and limits. It remains unexecuted because resources are
below the existing trial thresholds. No user applications were closed, files
deleted, guard reduced or model downloaded. Public deployment, physical-phone
validation and trusted automatic financial acceptance remain unfinished.

## Reproduction and preservation

The source snapshots, original responses, failed build, browser refusal, final
tests, build inputs and unchanged fifty-receipt replay are bound in
[advanced-azure-quantity-recovery-v1.json](advanced-azure-quantity-recovery-v1.json).
Verify it locally with:

```powershell
python -X utf8 receipt_training/scripts/build_azure_quantity_report.py --check
```

Fresh offline replays use unused output tags with
`replay_azure_quantities.mjs` and `score_azure_quantities.py`; no API key is needed.
Historical evidence is archived before shared source paths change. The protected
stable reference and original checkout remain unchanged. The complete goal
remains active; this checkpoint does not authorize additional provider uploads.
