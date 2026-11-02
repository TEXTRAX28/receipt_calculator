# Printed quantity, unit-price and total columns

The parser now separates complete printed quantity/unit/total columns when one
receipt section supplies a supported heading or repeated compatible rows. A
single unlabelled numeric row is insufficient. Pack contents remain part of the
product name. Genuine repeated purchases remain separate.

The rule requires resolved currency, three actually printed fields and exact
quantity-times-unit arithmetic as a rejection check. It never computes a
missing price. Contradictory headings, incomplete rows, ambiguous title links,
summary boundaries and photo boundaries withhold the interpretation. It does
not establish column semantics from arithmetic alone.

Column-derived descriptions and purchased quantities always need human source
checks. Hybrid price recovery additionally requires the exact printed token's
OCR word confidence of at least 0.98. Unit-price and line-total spans are checked
separately: identical text in another column cannot supply confidence. Empty or
invalid canonical prices can be proposed; valid conflicting model prices stay
unresolved. Every changed price remains pending review, with its source region.

Verified graph/source locations: `src/lib/column-purchases.ts:L65`,
`src/lib/parser.ts:L48`, `src/lib/recover-invalid-price.ts:L17`,
`src/lib/verify-readings.ts:L163`, `src/lib/purchase-expression.ts:L91`.

## Same-reading comparison

Frozen before (`3409145`) and after sources process the same original fifty
retained independent OCR/vision readings in automatic and explicit-currency
modes, for primary and hybrid readers: 400 views. The unchanged v5 truth, scorer
and 38-development/12-evaluation membership are preserved. These are previously
inspected, source-informed references, not a blind holdout. No new inference or
external request is made by this comparison.

| Known field, explicit currency | Primary before → after | Hybrid before → after |
|---|---:|---:|
| Matched purchases /145 | 121 → 122 | 143 → 143 |
| Exact descriptions /145 | 99 → 101 | 132 → 132 |
| Purchased quantities /120 | 30 → 32 | 119 → 119 |
| Unit prices /31 | 14 → 16 | 25 → 25 |
| Line prices /143 | 119 → 120 | 131 → 132 |

Only development receipt `cord-v2-train-006` improves. Its weaker unit-price OCR
tokens still fail the hybrid confidence threshold. Automatic counts, financial
summary fields, copied totals and scored evaluation fields are unchanged. There
are no scored per-case known-field regressions. Trusted reconciliation remains
0/49; complete original receipts remain unscorable under partial references.

Both optional providers' six saved outputs also pass through the current app
adapters without network access. Their known-currency 25/25 line-price scores
remain controls, not new cloud accuracy observations. Real provider IDs are not
deleted by these synthetic transport replays.

## Verification and separate Gemini preparation

**Later result:** the [approved six-crop batch](GEMINI38_SIX_RESULT.md) completed
with one timeout and five HTTP 503 responses, without receipt drafts, retries
or billing activation. Its authorization is consumed; the preparation below is
historical and does not authorize another run.

The change passes 693 unit tests, including nineteen column cases, and 179
standard browser tests with one existing skip. Two new desktop/mobile journeys
check actual source boxes, four mandatory checks per interpreted purchase,
blocked acceptance, 320/390-pixel layout and an exact £1.50/£1.50 split.
Build/typecheck, formatting and graph refresh pass. The main bundle is 521.72 kB
and retains the existing 500 kB warning; no runtime dependency is added.

Separately, one non-private synthetic receipt succeeded through the real Gemini
3.8 Flash backend: metadata GET 200, extraction POST 200, strict schema pass,
both purchase amounts and GBP 3.50 total correct. This establishes availability,
not real-receipt accuracy. It is one generation request, distinct from the
zero-request column and saved-provider replays.

A six-crop Gemini comparison is prepared with exact image/source hashes and
four offline protocol tests. Its scope is six generation requests, one per crop,
31-second minimum start spacing, 90-second deadlines, no retries or billing
activation, and early stop on authentication/quota failures. It uses the actual
app image-only prompt/schema, without reference labels or currency hints.
Framing/dimensions match the Azure/Veryfi PNG crops, but JPEG encoding differs.
No private Gemini request is authorized by preparation alone. Phase 6 approval
has been requested separately; the original fifty remain excluded.

[Gemini 3.8 Flash](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash)
currently supports image input and structured output, with a standard free tier
listed in [pricing](https://ai.google.dev/gemini-api/docs/pricing). Google's
[terms](https://ai.google.dev/gemini-api/terms) apply paid-service data protections
to UK users even on unpaid quota: no product-improvement use, but limited safety
logging and possible processing outside the UK. They also require paid services
when making API clients available to UK/EEA/Swiss users; free development tests
do not establish a suitable public deployment arrangement. `store:false`
disables interaction-object storage, not every safety log or retention purpose;
see [Interactions retention](https://ai.google.dev/gemini-api/docs/interactions-overview).

Local evidence: `advanced-column-purchases-v1.json` and
`qa-artifacts/column-purchases-v1/`. The full twelve-phase goal remains active.
