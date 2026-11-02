# Gemini 3.5 Flash-Lite: prepared comparison

2 November 2026. **The user subsequently approved this exact scope; all six
attempts are now consumed.** See the [measured result](GEMINI35_SIX_RESULT.md).
The plan below records the pre-execution protocol. The earlier Gemini 3.8
approval was not reused. Application defaults and the server-held key are unchanged.

## Why this candidate

One non-private, clearly labelled synthetic receipt returned HTTP 200 through
the actual application adapter in **3.258 seconds**, using `gemini-3.5-flash-lite`.
Both product names, quantities, unit and line prices, GBP currency, subtotal,
zero VAT, inclusive basis, merchant and £3.50 total matched the visible fixture.
The date was copied exactly as `29/10/2026`; the initial check incorrectly
required ISO formatting. That failed check and its separate explanation remain
preserved. There was one request, no retry and no private receipt upload.
Provider-reported usage was 1,653 input and 275 output tokens; actual billing
was not inspected. A successful synthetic response establishes availability
for that request, not accuracy or reliable service on real receipts.

Google identifies the model as stable, with image input and structured output.
Its standard API input/output has a free tier. The paid list rates are $0.30
per million input tokens and $2.50 per million output tokens; no paid use is
proposed. Neither those rates nor Google's model description demonstrate better
receipt reading. [Model documentation](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite),
[pricing](https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite).

## Exact proposed scope

- Six previously prepared, identifier-reduced crops: Bristol Costco, Taiwan
  Costco, Tesco, and restaurants `cord-v2-train-003`, `cord-v2-train-004` and
  `cord-v2-test-002`.
- Byte-identical JPEG inputs to the earlier Gemini 3.8 batch. Same framing as
  Azure/Veryfi's earlier PNGs, but JPEG/PNG pixels are not claimed identical.
- Exactly `gemini-3.5-flash-lite` through the existing Interactions adapter,
  `store:false`, image-only extraction instructions/schema, low thinking and
  the existing 24,000-token output ceiling. No labels, old readings, currency
  hints, tools or conversation history sent to the model.
- At most six uploads, one attempt per crop, at least 31 seconds between starts,
  a 90-second request deadline and 1 MiB response bound. Stop later uploads on
  authentication or quota failure. No retries, polling, deletion requests,
  other-provider requests or billing activation.
- Use the existing user-confirmed Free project only after confirmation that
  this model has at least six remaining requests. No key needs to be shared.
- Score native fields against the unchanged 26-row/25-readable-price reference
  and existing matcher. Keep failed cases in all-case coverage and show
  successful-only accuracy separately. Preserve missing/negative/repeated rows;
  do not repair values, infer coupon ownership or promote an app default.

The frozen plan is
`qa-artifacts/provider-review/gemini35-screen-v1/plan.json`, SHA256
`4520ce9af8f63e9edcddd51f51967b4e51bf750f2dccabf3cc8fe41b8dc16f0b`.
Four offline transport/limit tests and five scoring tests pass. Their provider
responses are mocked and do not count as real receipt extraction.

## Privacy and approval boundary

Google's terms apply the paid-services data-use protections to UK users even
on unpaid quota: prompts/responses are excluded from product improvement, but
limited safety logging and processing outside the UK remain possible.
`store:false` opts out of normal Interaction-object storage; it does not
promise zero provider retention. The free project is for this development
test; Google separately requires Paid Services when making API clients
available to UK users. [Terms](https://aistudio.google.com/docs/terms),
[Interaction storage](https://aistudio.google.com/docs/interactions-overview#data-storage-retention).

Phase 6 of the user's goal requires approval before sending private receipt
data to a third party. The existing six-crop 3.8 authorization cannot authorize
this different-model batch. Fresh approval and free-quota confirmation were
recorded before execution. The runner refuses a second execution or resumption
of an interrupted batch. Further private requests require a new scope.
