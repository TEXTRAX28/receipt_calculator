# One last-resort OpenAI comparison, ready for approval

4 November 2026. The user has explicitly chosen reuse of the existing
`OPEN_AI_KEY` alias in the old comparison checkout's ignored `.env.local`.
Presence is verified without printing its value. The file is read-only for
this workflow; no secret is copied, committed or placed in the frontend.
This resolves setup only. **No OpenAI request or spending is approved yet.**

The earlier [offline preparation](OPENAI_COSTCO_PREPARATION.md) remains historical.
The new `receipt_training/scripts/openai_costco_once.mjs` implements a bounded,
operator-run sender. This is a research tool, not an enabled app provider or an
automatic fallback. OpenAI remains the user's last resort.

## Prepared request and cost

The single proposed request uses `gpt-6-astra`, medium reasoning, original image
detail, the current unmodified extraction instructions and strict receipt JSON
schema. Its image input and structured-output capabilities are documented;
accuracy and account access remain untested.
[Model](https://developers.openai.com/api/docs/models/gpt-6-astra),
[structured output](https://developers.openai.com/api/docs/guides/structured-outputs).

It contains only the same two reviewed identifier-reduced Costco JPEGs: the
18-purchase list and VAT table. Their hashes remain
`1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68`
and `adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b`.
The familiar example is not a blind test, a long-receipt overlap test or a
representative provider selection. No reference amounts, earlier reader output,
currency hint or conversation history are added.

Limits are one generation POST, two images, one attempt, no retry, 90 seconds,
one MiB response, 6,000 output tokens and no tools. The sender fixes the HTTPS
endpoint, refuses redirects and changed source/request bytes, and reserves an
exclusive attempt marker before key access. Authentication, quota, incomplete,
refusal, transport and schema failures are retained without switching models.

Current standard list rates are $10/M input and $50/M output, with listed cache
writes at $12.50/M. The two image estimates are 730 and 144 tokens. Adding 5,135
non-image UTF-8 bytes and a 2,048-token framing allowance gives 8,057 assumed
input tokens. The local standard estimate is **$0.38057**; a deliberately
conservative doubled cache-write input calculation gives **$0.501425**. The
sender refuses preparation above its **$0.60 estimate guard**. This is not a
tokenizer result, remotely enforced spending cap or verified account charge;
taxes, account terms and billing remain unverified. No billing activation or
auto recharge is included.
[Pricing](https://developers.openai.com/api/docs/models/gpt-6-astra),
[image rules](https://developers.openai.com/api/docs/guides/images-vision).

## Data handling and verification

The crops remain private receipt data. API content is excluded from training by
default, but this account's opt-in setting is unverified. `store:false` is set;
standard abuse monitoring can retain content for up to 30 days, with exceptions,
and caching can retain encrypted tensors for up to 24 hours. No UK processing
commitment or Zero Data Retention status is established. There is no Files API
upload, hosted tool or saved conversation in this request.
[Data controls](https://developers.openai.com/api/docs/guides/your-data).

All **26 offline controls** pass on the final sender/test bytes: real request
preservation, approval-before-key ordering, exclusive reservation and no retry,
timeout and byte limits, refusal/incomplete/invalid output, key redaction,
user-selected alias parsing, positive preparation and overwrite prevention.
The first preparation failed on a missing local output parent; the fix and a
positive preparation test pass. That failure remains recorded. Tests use fake
keys and injected transports; no real provider, model, billing or availability
check is claimed.

Current request SHA256 is
`68506e9a957785c6c13d8c722767f57cb665d9ad39afa64ef9321dc369ca0677`;
plan SHA256 is
`0d33f5786f223df5260e2aee1452dc28224a6aa11bf0e7863294cde994920fbc`.
The ignored packet is `qa-artifacts/provider-review/openai-costco-current-v2/`.
The current 225 application/test sources remain byte-identical to the Gemini
checkpoint; this change adds research scripts only. The 1,390-case application
checks are carried forward, not rerun or combined with these 26 controls.

Phase 6 of the user's objective requires fresh approval for this exact private
upload and credit use. After approval, create the matching local approval record
and invoke only the bounded sender. Do not treat key setup, the credit balance
or the earlier Gemini/Veryfi/Azure permissions as OpenAI upload authorization.
Keep failures and raw usage, then score unchanged outputs before any provider
promotion. The full project goal remains active.
