# Optional OpenAI comparison: offline preparation only

3 November 2026. Existing Free provider quotas are exhausted. **No new receipt
request, credential access, quota probe, credit activation or billing change
was made.** This is an optional next comparison, not an enabled application
provider or a measured recognition improvement. Setup preference and upload
approval remain unresolved. The twelve-phase goal remains incomplete.

**Historical preparation from `a7f8cd7`.** Subsequent refund-parser/review changes
supersede its frozen application source. Its seven passing checks describe that
earlier checkpoint; the command below intentionally refuses changed source.
Do not treat it as current-app readiness or execute the old packet. If the user
chooses this option, create a new unused preparation after a bounded sender is
implemented and checked. No upload approval has been granted.

## Candidate and fixed comparison

The proposed provider is OpenAI's Responses API, model `gpt-6-astra`, with medium
reasoning, original image detail and strict JSON-schema output. The official
model page documents image input and structured output; its actual advantage
on these receipts has not been measured. The fetched page lists only the model
alias, so any future result must retain the returned model identifier and date.
[Model documentation](https://developers.openai.com/api/docs/models/gpt-6-astra).

Original detail preserves these small crops without downsampling under the
documented sizing rules. The image guide recommends it for dense visual tasks
such as OCR when supported. This is a documented input setting, not an accuracy
guarantee. [Image guide](https://developers.openai.com/api/docs/guides/images-vision).

The prepared body contains the same two previously reviewed JPEGs:

| Crop | Dimensions | Bytes | SHA256 |
| --- | ---: | ---: | --- |
| `user-uk-items.jpg` | 485 × 1200 | 321,921 | `1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68` |
| `user-uk-vat-totals.jpg` | 465 × 235 | 55,745 | `adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b` |

Both decode locally as RGB JPEGs. Pillow reports zero EXIF entries and only
JFIF information keys. Visual review excludes merchant/date/payment/member
identifiers; the clipped savings line retains a partial pound symbol. Crops
remain private receipt data, and these checks do not establish anonymization.

The body reuses `server/extraction-instructions.mjs:L1` and the compact schema
in `src/lib/extraction-schema.mjs:L1`, located through the repository graph and
verified against source. It contains no reference totals, previous OCR output,
supplied currency or conversation history. The existing shared prompt includes
Costco coupon examples. This is consequently one familiar development
transaction, not a blind benchmark or an original-fifty evaluation. The crops
do not overlap, so the test would not establish overlap handling.

Any later sender must enforce **one generation POST containing two images,
one attempt, no retries, a 90-second deadline, a 1 MiB response limit, 6,000
maximum output tokens and no tools**. It must preserve failures, refusals,
incomplete output and raw usage without silently retrying or repairing values.
The preparer cannot send requests: these are proposed execution constraints,
not an already tested transport. Local schema checks cannot prove remote API
acceptance or factual correctness.
[Structured-output guide](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=responses).

## Estimated cost

The fetched standard list rates are US$10 per million input tokens and US$50
per million output tokens; cache writes list US$12.50 per million input tokens.
No Fast, regional or other paid option is selected. Rates and account-specific
conditions must be rechecked before a future request.
[Model pricing](https://developers.openai.com/api/docs/models/gpt-6-astra).

The documented 32-pixel patches and 1.2 multiplier estimate **730 + 144 = 874
image input tokens**. The serialized non-image body has 5,135 UTF-8 bytes. A
local heuristic counts each byte as one token and adds 2,048 framing tokens,
giving an input allowance of 8,057 tokens. This is not an official tokenizer
result. The output allowance costs at most **US$0.30 at the listed output rate**.
Together the local standard estimate is **US$0.38057**, or **US$0.501425** using
twice the listed cache-write rate for the entire input allowance. Neither is a
remotely enforced spending cap; actual usage, cache charging, taxes and account
terms are unverified. No charge has been incurred by this preparation.
[Image-token calculation](https://developers.openai.com/api/docs/guides/images-vision).

## Optional access and privacy

No key is needed for offline preparation. If this option is chosen later:

1. Use the official [API Platform](https://platform.openai.com/) and check the
   organization's balance, model access and limits. Do not activate paid
   billing or auto recharge for this experiment.
2. Eligible paid Pro/Business subscriptions may include API credits after
   seven days, subject to ownership and matching-email requirements. Plus,
   Go and Free do not receive this benefit. An active grant needs no API payment
   method. Credits expire; if purchased credits remain after free credits run
   out, API requests continue spending them. Eligibility and balance have not
   been checked for this account. Follow the official
   [credit guide](https://developers.openai.com/api/docs/guides/chatgpt-api-credits)
   only if the user chooses this setup path.
3. After a bounded sender is implemented and verified offline, use a project
   API key in the trusted backend process environment. Keep it out of chat,
   frontend code, tracked files and command history. Existing `.env.local`
   stays untouched. Credential entry is deferred until execution genuinely
   requires it. [API quickstart](https://developers.openai.com/api/docs/quickstart).
4. Obtain fresh approval for this exact private-data upload before execution.
   Setup preference, credit availability and earlier Gemini permissions do
   not authorize an OpenAI request. This follows Phase 6 of the user's goal.

OpenAI states API inputs/outputs are excluded from model training unless the
customer opts in. The prepared request uses `store:false`; this does not provide
Zero Data Retention. Standard abuse logs can retain content for up to 30 days,
with exceptions, and prompt caching can retain encrypted tensors for up to
24 hours. No account-specific training setting or UK processing commitment has
been verified; processing outside the UK is possible. Review these terms again
with the account configuration before upload.
[API data controls](https://developers.openai.com/api/docs/guides/your-data).

## Verified local state

`receipt_training/scripts/prepare_openai_costco.mjs` accepts only offline
`--prepare` mode. It pins both crop hashes and order, validates the JPEG envelope,
records source hashes and writes into one unused direct child of the ignored
`qa-artifacts/provider-review/` directory. Existing packets are not overwritten.
It imports only the shared prompt/schema/JPEG helper, not the secret-dependent
server entry point. No credential loader or live sender exists in this module.

Seven offline checks pass: exact request/crop preservation, changed or reordered
input rejection, nested strict-schema structure, cost arithmetic, saved input
and source hashes, destination/no-overwrite behavior and rejection of live CLI
mode. A throwing fetch stub remains unused. A clean-environment launcher loads
no project Vite configuration or environment file. Separate Pillow decoding and
metadata inspection passes for both unchanged JPEGs. These are protocol checks,
not an extraction result or a new full-application test run.

```powershell
node --test receipt_training/scripts/test_prepare_openai_costco.mjs
```

The ignored `qa-artifacts/provider-review/openai-costco-v1/` directory retains
the private request body, plan, source hashes, seven-check output and local image
metadata review. Do not print or commit `request.json`. Public documentation
fetches and their hashes are in `qa-artifacts/openai-candidate-review-v1/`.
The accompanying evidence manifest binds these exact local bytes.

Application source, provider defaults, original references, resource guards and
the protected baseline remain unchanged. The latest application suite remains
the preceding **1,104 passing unit tests**, typecheck and isolated build; this
offline preparation does not replace them. Actual API compatibility, model
access, latency, cost, financial extraction and public-release readiness remain
unverified. Retain the current reader until a fair comparison supports a change.
