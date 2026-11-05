# OpenAI six-crop comparison: prepared, not approved

5 November 2026. **No request has been sent and no key was read for this
preparation.** The existing one-receipt OpenAI authorization is consumed. A new
specific approval is required under Phase 6 before executing this batch.

The one earlier OpenAI Costco test matched eighteen checked purchase rows and
four coupon owners, but one familiar transaction cannot select a general-purpose
reader. This comparison uses the same six identifier-reduced JPEGs already
tested with Gemini 3.5, and the same source framing as Azure/Veryfi's PNGs. JPEG
and PNG pixels are not claimed identical. All six inputs are familiar partial
source-reviewed crops, not blind evaluation or complete-receipt financial truth.

| Request | Crop |
|---|---|
| case-01 | Bristol Costco, `user-costco-bristol-001` |
| case-02 | Taiwan Costco, `costco-tw-20170303` |
| case-03 | Tesco, `tesco-gb-1994` |
| case-04 | Restaurant `cord-v2-train-003` |
| case-05 | Restaurant `cord-v2-train-004` |
| case-06 | Restaurant `cord-v2-test-002` |

## Exact proposed execution

- Six standalone `gpt-6-astra` Responses POSTs, one prepared JPEG each, one
  attempt per crop, no retries or interrupted-run resumption. Starts are at
  least 31 seconds apart. Authentication/quota errors stop the remaining uploads.
- Fixed endpoint, existing app extraction instructions/strict receipt schema,
  original image detail, medium reasoning, maximum 6,000 output tokens, no
  tools, redirects, conversation history, prior readings, labels or currency
  hints. `store`, background and streaming are false.
- Ninety-second deadline per request and one-MiB response bound. Exclusive run
  reservation and persistent six-slot allowance precede provider I/O. Existing
  configured credentials are read only after the approved plan/source checks
  and run reservation. No app allowance, billing activation, top-up, account
  quota probe, other-provider call, polling or deletion call is proposed.

The frozen bodies have a combined conservative estimate of **US$2.9468** using
the full output ceiling. Each request separately passes the app's US$0.60
estimate guard. Actual usage can be lower; these are local estimates, not an
account spending cap or a verified invoice. The [checked model page](https://developers.openai.com/api/docs/models/gpt-6-astra)
lists standard rates of $10/million input and $50/million output tokens. The
guard uses a higher input allowance for caching sensitivity. The prior 18-item
test's approximately $0.1072 usage estimate is historical, not a promise for
this batch. Only existing reported credits are proposed; no billing change.

OpenAI's [API data controls](https://developers.openai.com/api/docs/guides/your-data)
exclude content from training by default; account opt-in was not inspected.
Abuse monitoring may retain content for 30 days or longer under stated legal/
safety exceptions, and encrypted prompt-cache state can remain for up to 24
hours. Processing outside the UK is possible. `store: false` is not zero
retention. The crops reduce identifiers, but their receipt content remains
private; the original full photos are outside this upload scope.

## Ready and verified locally

The final plan is `qa-artifacts/provider-review/openai-six-v1/plan.json`, SHA256
`3cedf1aaf540c0607523c3216f3e66838a873a3f0fe2b03ed765ade0dc00f739`.
It binds 245 application/configuration/benchmark/scorer source files, six JPEGs,
six exact request bodies and the unchanged reference/configuration. Earlier
unapproved preparation metadata is preserved; request/image/model/cost bytes
were not changed when scorer checks and its imported matcher binding were added.

Six offline protocol cases pass: missing approval blocks key access, exact six
posts/spacing/drafts, no rerun, quota stop, input tampering, bounded/cancelled
responses and encoded-key redaction. These use fake credentials/responses and
are not recognition scores. The unchanged scorer's five tests pass after its
missing historical reference was restored with verified identical bytes; the
initial missing-fixture failure remains recorded. An artificial all-failed
six-case projection retains all 26 purchase, 25 known-price, 15 known-quantity
and six final-total denominators. No reference label is sent to the model.

After a real approved run, scoring requires matching approval, plan and current
source hashes, and checks that each accepted draft equals the retained literal
provider output. It uses the existing matcher without repairing money or coupon
owners. Failed/unattempted cases stay in all-case coverage. Returned currency
is measured separately from monetary equality in the reference currency. Token
usage estimates, unknown failed-request costs and small-sample timing are
reported separately. Nothing here enables a new default or demonstrates a
provider winner before evidence exists.

Operator commands, **only after specific approval and authorization recording**:

```powershell
node receipt_training/scripts/openai_six_screen.mjs --check
node receipt_training/scripts/openai_six_screen.mjs --execute
python receipt_training/scripts/review_openai_six.py
```

Prepared input previews live beside the frozen plan as `case-01.jpg` through
`case-06.jpg`. The runner refuses an existing `run` directory; do not delete it
or reset its ledger to force another attempt. Further use needs a new scope.
