# Gemini 3.5: one prepared two-image Costco comparison

4 November 2026: **v3 is prepared locally; no live request or credential load has
run.** Fresh approval and confirmation of one remaining request on the existing
Free project are required. Daily limits [reset at midnight Pacific](https://aistudio.google.com/docs/rate-limits),
but current account availability is unverified. OpenAI remains unused.

Use `qa-artifacts/provider-review/gemini35-uk-multipart-v3/plan.json`, SHA256
`28122e14e4fc5609d0f9015ad6c86873bc83c55b2d772704babe5f3dbaa544db`.
This freezes current adapter/source and the same two reviewed JPEGs. Merchant,
date and personal/payment identifiers are outside the crops; the clipped savings
line retains a partly visible pound symbol. Limits remain one 90-second request,
two images, 1 MiB response, no retry, paid activation, other provider or stored
Interaction. The existing model, low-thinking and 24,000-token output limit stay
fixed. `store:false` does not guarantee zero safety retention.

Ten offline transport tests pass, including two new controls proving exact
approval/source validation precedes the credential callback. The eight current
same-reading baseline views are in `qa-artifacts/provider-review/uk-multipart-offline-v2`;
their field scorer/reference are unchanged. They are not new reader inferences.
No source checks are cleared and the full goal stays active.

## Historical v2 preparation

3 November 2026. **Prepared locally; unapproved and unexecuted.** The user
reported “All is already at limit” when asked about this additional Free-quota
request. No live request was made. The scope is unconsumed, but available quota
and fresh explicit approval are still required; it will not retry automatically.

The later persistent Gemini allowance change supersedes this frozen runtime
snapshot. **Do not execute the v2 plan against the current app.** Its preflight
rejects changed source. A future trial needs a new preserved preparation and
explicit approval after quota is available. That preparation must also retain
the corrected crop description below: a partly visible pound symbol remains
in the clipped savings line. The old plan's statement that all currency context
was removed was too broad. Its eight transport passes describe the original
frozen protocol, not a validation of later source changes.

Gemini 3.5 returned all six earlier small-crop responses, but did not reliably
attach coupons or interpret every amount. The original UK transaction still
lacks a successful Gemini reading. Testing its complete financial sections
would assess 18 purchases, four attached coupons, genuine repeated chicken
rows, the separate VAT legend and the calculated total in one request.

The same two JPEG files already have a historical Veryfi result: its literal
OCR text plus the app parser preserved 18/18 line prices and 4/4 coupons.
Earlier Gemini 3.1 attempts returned 503. The model versions and historical app
versions differ; this is not an isolated model ablation or a timing distribution.
See [the same-crop result](VERYFI_LIVE_RESULT.md).

## Exact scope

- One request to `gemini-3.5-flash-lite` through the existing Interactions adapter.
- Two unchanged identifier-removed JPEGs: `user-uk-items.jpg` and
  `user-uk-vat-totals.jpg`, containing the purchase list and separate VAT table.
  They do not test photographic-overlap deduplication. Merchant and date are
  outside these crops. A clipped savings line retains a partly visible pound
  symbol; automatic currency recognition must be assessed separately from GBP
  supplied by the user.
- Existing extraction instructions/schema, low thinking, 24,000-token output
  ceiling, `store:false`. No labels, previous OCR, currency hints, tools or
  conversation history are sent to the model.
- One attempt, a 90-second deadline, 1 MiB response bound. No retry, polling,
  deletion request, alternative provider, billing activation or app default change.
- Existing Free project only, after confirmation that at least one request
  remains. An unknown outcome still consumes the attempt.

The frozen plan is
`qa-artifacts/provider-review/gemini35-uk-multipart-v2/plan.json`, SHA256
`e7295e0d68c7e5a0a1b3bebfac4155524e8a07ac8da2116861e1a82a1b0b9ea9`.
Preparation also binds the exact outgoing body and runtime source, including
dependencies. Eight offline transport tests pass: exact two-image content,
approval/source mismatch, one-shot success, authentication/quota/503 failure,
oversized output and a lost response. Fake transports cannot use the network.
The first preparation's missing frozen JSON dependency is retained as a local
failure; it loaded no credentials and made no request. The corrected scope uses
a new directory. The live run has not been started.

## Cost and privacy

Google lists this as a stable image-capable model with structured output and
standard Free input/output quota. Published paid rates are $0.30 per million
input tokens and $2.50 per million output tokens. Paid use is not proposed;
24,000 output tokens would represent $0.06 at list rate, plus input, if billed.
Actual usage and account charges cannot be established before the request.
[Model](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite),
[pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite).

Google applies its paid-services data-use protections to UK users even on free
quota: content is excluded from product improvement, while limited safety
logging and processing outside the UK remain possible. `store:false` disables
normal Interaction storage; it is not a zero-retention guarantee. Public UK
API clients separately require Paid Services. These sources were checked on
3 November 2026. [Terms](https://aistudio.google.com/docs/terms),
[Interaction retention](https://aistudio.google.com/docs/interactions-overview#data-storage-retention).

Phase 6 of the user's goal requires approval before a new private-data upload.
The earlier six-test permission is consumed. A fresh explicit approval must
precede `--execute-approved`; neither this plan nor configured credentials is
permission. The original-fifty corpus permission remains unchanged.

## Evaluation

Preserve the literal provider response, errors, usage and elapsed request time.
Score against the unchanged source-checked UK reference and existing matcher;
keep unavailable fields unavailable and report coupon ownership separately.
Evaluate the frozen application's draft and arithmetic in automatic and
separately supplied GBP contexts without clearing any source checks. A copied
total or balanced arithmetic alone cannot establish correct extraction.

This is one familiar development transaction with assistant-reviewed financial
truth, not an independent holdout, whole-corpus score or physical-phone test.
The comparison can reject or motivate further work; it cannot select a universal
provider winner or authorize more uploads.

The [current offline comparison](UK_MULTIPART_OFFLINE_COMPARISON.md) replays the
historical Veryfi, Paddle and Qwen readings through the same frozen application
source. It uses no API quota. Gemini remains unmeasured on these two images.
