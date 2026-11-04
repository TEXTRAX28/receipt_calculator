# Manual OpenAI last-resort reader

4 November 2026. This is an experimental local-development integration. The
full twelve-phase objective remains active. The implementation adds an explicit
user choice; it does not select a winning general-purpose reader from one sample.

## Behavior and setup

The server accepts the user's existing `OPEN_AI_KEY` alias, or `OPENAI_API_KEY`.
Neither is exposed to the browser. A valid key alone cannot enable requests:
`OPENAI_ALLOWANCE_ID` and a finite `OPENAI_REQUEST_LIMIT` (1–100, default zero)
are required. The operator must check credits and approve the intended use first.
No private environment file was copied, no allowance enabled and no real key
loaded for this implementation's tests.

OpenAI is never selected automatically, including after another reader fails.
The user must select it and agree to sending the current sections and spending
credits. Photo changes revoke consent. The server requires both explicit flags.
The request contains prepared JPEG sections, their photo/panel identifiers and
extraction instructions, without prior OCR/model answers, participant names,
currency hints or reference labels. Missing/invalid returned values remain
subject to ordinary review and exact financial validation.

The fixed `gpt-6-astra` Responses request uses original image detail, medium
reasoning, strict receipt JSON, at most 6,000 output tokens, no tools, no
redirects, no automatic retries and a 90-second server deadline. `store`, stream
and background processing are false. Local requests retain the existing
host/origin, intent, MIME/body, concurrency and rate checks. JPEG dimensions,
photo references and bounded responses are validated; reflected keys are
redacted before returning a draft. No receipt content is logged or saved by
the adapter. The allowance ledger contains request metadata, not receipts.

The conservative US$0.60 estimate guard uses prepared image dimensions and a
full output ceiling before reserving an attempt. It is **not** an account-wide
or guaranteed per-request spending cap. Atomic persistent allowance reservations
survive restart and key changes, and remain used after failures, cancellation
and uncertain responses. Instances must share the same directory/grant to share
a limit. Operators must not reset/delete the ledger to bypass it.

Official sources: [model/rates](https://developers.openai.com/api/docs/models/gpt-6-astra),
[image inputs](https://developers.openai.com/api/docs/guides/images-vision),
[data controls](https://developers.openai.com/api/docs/guides/your-data).
API content is excluded from training by default; provider abuse monitoring,
caching and regional-processing rules still apply. `store: false` is not a
zero-retention commitment. Account-specific settings and billed charges were
not verified. Public use still needs authenticated hosting, TLS, account-level
spending controls, operational monitoring and privacy/deletion review.

## Executed software validation

| Check | Result and scope |
|---|---|
| Full unit suite | 1,439 cases / 80 files, six disjoint single-worker batches; no skipped or failed cases |
| New focused provider/client tests | 30 backend + 7 client cases; included in the full suite |
| Strict TypeScript | Complete `tsc --noEmit` passes |
| Isolated compilation | Pass; emitted artifacts and retained identical worker aliases verified; not a deployment package |
| Desktop and phone browser cases | Six pass: no allowance, explicit consent/error recovery, successful fake draft; no horizontal overflow |
| Original-50 saved-reading replay | 200 new current views match 200 retained full receipt/calculation vectors; 38 development and 12 evaluation receipts, no new inference or independent-truth claim |

All new provider/client/browser tests use fake responses and synthetic images.
They check request bounds, deadlines, cancellation, finite persistent allowance,
concurrency, invalid outputs, price preservation, consent and recovery. The first
browser run passed four cases but tried to inspect a closed optional details
field in two success cases. The corrected test opens the existing details and
checks quantity and unit price. A separate sandboxed rerun failed to reach its
loopback page (`ERR_NETWORK_ACCESS_DENIED`), before app behavior could be tested.
The final isolated loopback run passed all six with no real provider requests.
These failed attempts are retained, not recast as passes.

Only the E2E spec changed after the full unit/build snapshot; runtime sources,
all unit files and build configuration stayed byte-identical. The six browser
cases were rerun against that corrected spec. Source equivalence and historical
hashes are recorded in the evidence packet, rather than claiming a second full
unit execution for a test-locator change.

## Actual original-photo native attempt

The ordinary 390×844 UI accepted the two untouched original Costco photographs
in top-to-bottom order, with GBP selected before scanning and no manual crop.
One real native Paddle call began with two prepared panels. No cloud readers or
keys were configured. The outer guard began with 2,455,502,848 bytes available,
then stopped its owned process tree at 974,778,368 bytes, below the unchanged
one-GiB runtime reserve, after 78.350 seconds of preview lifetime. No recognition
result or editable receipt draft was returned. This time includes preview/UI
preparation and is not extraction latency.

The UI displayed a reader-disconnected error and retained both photos; its
document width was 375 pixels in the 390-pixel viewport. The forced stop left
two temporary normalized JPEGs. Their sizes/hashes matched the started request;
they were removed only from the verified test runtime directory. Original
photos were unchanged. The temporary tab was closed and viewport reset. This
attempt provides failure-recovery and resource-limit evidence, not recognition
accuracy, a successful upload-to-split flow or physical-phone camera coverage.
No resource guard was lowered and no user app was closed.

A separate higher-headroom trial then completed after the temporary browser
tools were released. Outer startup admission was raised to three GiB; it began
with 3,360,313,344 bytes available and stayed above 1,574,027,264 bytes. The same
native reader returned two panels/196 words in 22.049 seconds. At 390×844 the
untouched first draft contained all eighteen purchases; all eighteen quantities,
unit prices, line prices and tax codes matched the partial reference, and all
four coupons belonged to the correct items. Sixteen descriptions matched exactly;
`BELVEDERE VOD.7OCL` and `PLASTIC CONT 380Z` retained O/0 substitutions. The two
genuine rotisserie purchases remained separate while two overlapping footer
purchases were matched. GBP was supplied before scanning, so this does not prove
automatic currency recognition. Merchant/date remain unscored by that reference.

The UI calculated net £163.16, VAT £13.62 and total £176.78 with no financial
edits. After explicitly checking the omitted printed purchase-count summary,
three test participants received £58.93, £58.93 and £58.92 through the ordinary
whole-receipt sharing/finalization controls. Initial fields were saved before
that review action; names were not corrected. Document width stayed 375 pixels
in the 390-pixel viewport. The preview exited successfully; its worker was
closed, temporary jobs were empty, and zero cloud uploads/keys were used. Both
original photos stayed unchanged. This closes the untouched-original-photo
workflow gap for one familiar transaction. It does not establish general
receipt accuracy, physical-camera or Safari behavior, or public readiness.

The earlier [separately approved OpenAI test](OPENAI_COSTCO_ONCE_RESULT.md) read
the two identifier-reduced crops in one live request. It is the only real
OpenAI receipt request so far, and its approval is consumed. No new private
upload or credit spend is authorized by adding this UI. Currency was missing
in that result; the familiar partial-reference match is not representative
or independently verified financial accuracy.

Evidence: `advanced-openai-last-resort-app-v1.json`; ignored raw packets under
`qa-artifacts/manual-openai-v1/`, `manual-openai-browser-v2/`,
`manual-openai-browser-v3/`, `manual-openai-original50-v1/` and
`native-original-overlap-v3/` and `native-original-overlap-v4/`. Historical
snapshots and failed runs remain intact.
