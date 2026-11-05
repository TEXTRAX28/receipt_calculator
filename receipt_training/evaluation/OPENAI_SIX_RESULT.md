# OpenAI six-crop result: useful last resort, review still required

5 November 2026. Application/source checkpoint: `9d6ed81` (benchmark preparation)
on `feature/advanced-ocr-vision-ai`. Application behavior remains that of
`6866462`; this comparison changes no reader defaults or live app allowance.

Six separately approved `gpt-6-astra` requests returned HTTP 200 and strict-schema
drafts. Against the unchanged partial reference, all 26 purchase descriptions,
25 readable line prices and three coupon attachments match. Returned currency
is correct on only two crops; the other four currencies are empty, rather than
silently filled by the scorer. Current app replay still blocks every unreviewed
draft. This supports keeping the implemented OpenAI option as an explicit last
resort, with source review; it does not establish general or complete-receipt
accuracy.

## Matched native fields

The same six familiar, identifier-reduced JPEGs were previously used for Gemini
3.5. Azure/Veryfi used PNGs with the same framing, not identical encoded pixels.
The frozen description-only matcher and reference are unchanged. Missing or
unknown reference fields are excluded; amounts use reference currency for
comparison, with model currency scored separately.

| Known field delivered | OpenAI | Azure native | Veryfi native | Gemini 3.5 native |
|---|---:|---:|---:|---:|
| Matched purchase names /26 | 26 | 26 | 22 | 21 |
| Exact normalized descriptions /26 | 26 | 23 | 20 | 21 |
| Purchased quantities /15 | 15 | 15 | 15 | 11 |
| Unit prices /11 | 11 | 11 | 8 | 10 |
| Line prices /25 | 25 | 23 | 18 | 17 |
| Attached coupons /3 | 3 | 0 | 0 | 0 |
| VAT letters /9 | 9 | 0 | 0 | 9 |
| Copied final totals /6 | 6 | 5 | 3 | 3 |

These are native-field counts, not a ranking of complete app paths. The existing
Azure source-word/parser path already recovered 25/25 known line prices with
currency supplied after extraction. Retained local Qwen native readings reached
22/25 known line prices and 0/3 coupon attachments on the corresponding PNGs.
No new competing-provider inference was performed here. The earlier comparisons
remain [Azure](AZURE_SIX_RESULT.md), [Veryfi](VERYFI_SIX_RESULT.md),
[Gemini 3.5](GEMINI35_SIX_RESULT.md) and [local](NATIVE_SCREENING_RESULT.md).

| Crop | Request time | Returned currency |
|---|---:|---|
| Bristol Costco | 22.184 s | Empty |
| Taiwan Costco | 13.229 s | TWD |
| Tesco | 13.968 s | GBP |
| Restaurant train-003 | 7.844 s | Empty |
| Restaurant train-004 | 9.199 s | Empty |
| Restaurant test-002 | 10.388 s | Empty |

Mean request/adapter/local-I/O time is **12.802 seconds**. The six-sample p95
estimator is 22.184 seconds, the sample maximum, not a robust production p95.
The controller took 166.051 seconds including spacing. Starts were at least
31.002 seconds apart. This is partial-crop timing, not full long-receipt or
phone performance.

## Costs and consumed authorization

Provider-reported usage totals **8,927 input and 3,731 output tokens**. At the
[checked standard model rates](https://developers.openai.com/api/docs/models/gpt-6-astra),
the ordinary uncached estimate is **US$0.27582 for all six**, approximately
$0.046 per crop. An all-input cache-write sensitivity estimate is **US$0.409725**.
Neither is a verified account charge or a guaranteed actual-cost range. The
prepared full-output conservative estimate was $2.9468; its per-request $0.60
guard is an estimate, not an account spending cap. Remaining credits were not
inspected.

The user's answer to `call_d6d0fad1f84b47dea398a54c9849b095` explicitly approved
these six tests. Six requests were made once each, under the ninety-second
deadline, without retries, other-provider uploads or billing changes. That
permission is consumed. Only the prepared reduced crops were sent, with no
reference labels, previous readings or currency hints. Full original photos
were outside this scope. The server-held key was read only inside the approved
runner; it was not copied into app/browser configuration or evidence.

`store:false`, no tools/history/background/streaming, bounded responses and
exclusive run reservation were retained. The [API data controls](https://developers.openai.com/api/docs/guides/your-data)
exclude training by default, with account opt-in unverified; abuse logs,
caching and processing outside the UK remain possible. No deletion/zero-retention
claim is made.

## Current application replay and limits

Twelve offline views passed through the current frozen app core: six literal
responses, each with automatic and supplied currency. All item descriptions,
quantities, unit/line prices, discounts and VAT letters, plus printed monetary
fields, remain unchanged. Missing VAT definitions retain empty rates;
no price, tax rate or coupon owner was repaired. No key or new model call was
used. All twelve views remain unable to finalize without review.

Important remaining failures are visible:

- Bristol lacks its VAT legend/header. Its correct nine purchase prices and
  coupon owners do not explain the printed total without those missing details;
  the supplied-GBP replay reports a -976-pence discrepancy.
- Four currencies are empty. Missing purchased quantities on Tesco and the
  restaurant add-on remain missing. Unknown quantities were excluded from the
  known-field score rather than invented.
- The faint restaurant has a returned rate of 10 with an empty tax-code name.
  The core rejects this financial configuration, reports missing tax of 4,364
  IDR and blocks confirmation. It is not silently converted to another tax mode.
- The first faint Tesco price was returned as 0.55 with a warning. The frozen
  reference still marks it unknown; this value is unverified and excluded from
  the 25-price denominator. A matching copied final total does not verify it.
- Cropped merchant/date data, tax-inclusion uncertainty and the Taiwan
  subtotal/redemption relationship still need source review. No payable receipt,
  purchase precision or complete-receipt accuracy is inferred from these scores.

The local-only actual-native recovery smoke was reconsidered after the user
closed other apps. Its unchanged three-GiB startup gate still held: the maximum
available memory was 3,068,612,608 bytes, below 3,221,225,472. It started no child
or inference. This does not change the prior unit/process-recovery results or
claim a new native OCR pass. No user apps/tabs were closed by the test tools.

The prepared six fake protocol controls and five unchanged scorer controls
already passed; no app code changed, so the full 1,457-case suite was not rerun.
Protected stable/original worktree checks and evidence hashes are recorded in
the accompanying checkpoint. The wider twelve-phase goal remains incomplete.

Evidence: `advanced-openai-six-result-v1.json`,
`advanced-openai-six-checkpoint-v1.json`, and ignored raw packets under
`qa-artifacts/provider-review/openai-six-v1/` and
`qa-artifacts/openai-six-live-v1/`.
