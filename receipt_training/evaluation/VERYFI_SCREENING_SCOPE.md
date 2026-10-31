# Six-receipt comparison: prepared, awaiting separate approval

The first Veryfi test was promising through OCR text and our parser. This next
screen checks a wider range of receipts before selecting a provider. It has made
zero external requests. The previous one-receipt approval is consumed and does
not authorize these six new uploads.

| Case | Exact prepared input | What it tests |
| --- | --- | --- |
| 01 | [Bristol purchase/total crop](../../qa-artifacts/provider-review/veryfi-screening-crops-v2/case-01/receipt.png) | Nine purchases, three coupons, two genuine repeated cashews, fold and pen stroke; VAT legend absent |
| 02 | [Taiwan invoice body](../../qa-artifacts/provider-review/veryfi-screening-crops-v2/case-02/receipt.png) | Chinese item, separate negative redemption and total; member/card/header panels excluded |
| 03 | [Historical Tesco crop](../../qa-artifacts/provider-review/veryfi-screening-crops-v2/case-03/receipt.png) | Ten descriptions, repeated doughnuts, faded reduced prices; one price remains unknown |
| 04 | [Restaurant amounts](../../qa-artifacts/provider-review/veryfi-screening-crops-v2/case-04/receipt.png) | Three purchases, service charge, tax, discount and comma grouping |
| 05 | [Faint restaurant crop](../../qa-artifacts/provider-review/veryfi-screening-crops-v2/case-05/receipt.png) | Dot grouping, tax, cash and change |
| 06 | [Shadowed purchase/add-on crop](../../qa-artifacts/provider-review/veryfi-screening-crops-v2/case-06/receipt.png) | Separately priced add-on versus printed till item count |

The private crops preserve the original decoded pixels without resizing or
enhancement and strip image metadata. Each ZIP contains only its corresponding
generic `receipt.png`; no original uncropped image is sent. Source inspection
notes disclose faint reverse-side print in case 02 and an already blurred band
in case 05. Cropping reduces identifiable data; this is not a general guarantee
of anonymization.

The reference covers 26 priced rows, including eleven newly inspected Tesco and
Taiwan rows. It is assistant source review, not independent human verification
or a blind holdout. Unprinted quantities/unit prices, the faint Tesco price,
unclear deduction ownership and absent tax inclusion remain unknown. Original
corpus files, labels, split membership and permission flags are unchanged.

The proposed scope is **six extraction POSTs maximum, one attempt per case**, and
**at most six DELETEs**, each limited to a provably new matching test record.
There are no retries, correction/training submissions, listing/deleting older
documents, paid activation or Gemini uploads. An interrupted batch cannot be
restarted with the same consumption ledger. Failure or uncertain cleanup is
reported and can leave provider data retained.

The fixed extraction options request bounding boxes/confidence and disable
missing-field computation: `bounding_boxes=true`, `confidence_details=true`,
`compute=false`. These documented options differ from the first API test's
defaults. Native fields and literal OCR text will be scored separately. The
same PNG bytes are prepared for actual local Paddle/Qwen comparisons; labels,
country/currency hints and earlier OCR never enter the model requests.
[Request reference](https://docs.veryfi.com/api/receipts-invoices/process-a-document/).

The first local browser harness bypassed normal photo conversion and reached a
JPEG-only endpoint with PNG bytes. Its first two requests failed image validation
and four were rate-limited; it produced no OCR extraction. That attempt is
preserved. A separately sealed native-PNG local protocol now uses the same six
PNG bytes directly in Paddle/Qwen, followed by offline app parsing/calculation.
Its timings are model components, not an integrated browser comparison. This
changes no cloud image, extraction option, upload count or approval scope.

Only the existing Free account may be used. The user must confirm at least six
unused document credits before execution. The runner cannot inspect billing or
guarantee the invoice. The published API Free allowance is up to 100 documents
per month; no paid subscription or add-on is activated by this experiment.
[Official pricing](https://www.veryfi.com/pricing/).

Default hosting is US Oregon unless EU hosting is separately arranged. Veryfi's
policy permits proprietary model improvement using submitted data; no training
opt-out has been configured. Documents are retained until deletion/configuration.
Requested cleanup is not proof of zero retention or training exclusion. The
retention FAQ mentions `auto_delete`, but it was absent from the checked v8
request reference, so this screen does not rely on that unverified option.
[Hosting](https://faq.veryfi.com/en/articles/5796847-where-does-veryfi-store-the-data),
[retention](https://faq.veryfi.com/en/articles/6716494-document-retention-management),
[privacy policy](https://www.veryfi.com/privacy/).

Phase 6 of the [goal objective](C:/Users/natan/.codex/attachments/c2fcb9dd-c554-4144-b524-9f9e668a7305/goal-objective.md)
requires approval: “Before activating a paid service or sending private receipt
data to a third party, obtain the necessary approval.” The separate approval
question applies to this exact six-case scope. Fifteen synthetic safety tests
pass, including the nine-case preserved transport suite and six batch tests.
The [sealed plan](veryfi-screening-plan-v1.json) verifies 35 prepared evidence
files. No app provider/default has been changed.

```powershell
# Offline only; reports whether existing credentials are present.
node receipt_training/scripts/benchmark_veryfi_screening.mjs
python -X utf8 receipt_training/scripts/build_provider_screening_plan.py --check
```

This small physical-receipt screen does not settle digital/PDF, long-camera,
refund, general overlap or public-deployment requirements.
