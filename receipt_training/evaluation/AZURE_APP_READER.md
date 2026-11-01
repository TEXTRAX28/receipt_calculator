# Optional Azure receipt word reader

Azure's measured word-layout path is now an optional application reader. It uses
the same provider interface, capture preparation, parser, source review and exact
split calculator as the other readers. It does not change the default reader.
The existing Azure endpoint/key alone leave uploads disabled. No new cloud
request, paid activation or original-corpus upload occurred in this work.

## Evidence and decision

The registered JavaScript adapter reconstructs the exact words, confidence,
source boxes and rows of all six saved research responses. The application draft
function was replayed in automatic and explicit post-extraction currency contexts
through frozen modules actually loaded. It ignores native receipt fields,
including Azure's frequently wrong currency. Replacing native fields/content with
conflicting instructions and amounts leaves projected word evidence unchanged.

| Known field on six previously inspected crops | App reader | Prior research path |
|---|---:|---:|
| Matched purchase names /26 | 26 | 26 |
| Exact normalized names /26 | 18 | 18 |
| Purchased quantities /15 | 9 | 9 |
| Unit prices /11 | 9 | 9 |
| Line prices, explicit currency /25 | 25 | 25 |
| Line prices, automatic currency /25 | 18 | 18 |
| Attached coupons /3 | 2 | 2 |
| Known VAT codes /9 | 9 | 9 |
| Copied final totals, explicit currency /6 | 4 | 4 |

There are 27 proposed rows for 26 reference purchases, with one unmatched row.
All per-case known-field and calculated amount results are preserved; additional
mandatory source checks deliberately change blocking-issue counts. Twelve views
are six transactions, not twelve independent recognition samples. Currency is
supplied only after extraction, never as a provider/reading hint. No complete
payable receipt, blind holdout or Azure original-fifty accuracy is established.

These known-price results justify making the option usable, not choosing it as a
general winner: the retained local vision reader has stronger quantities and
exact names on these crops. The [original six-provider comparison](AZURE_SIX_RESULT.md)
and original-fifty local evidence remain separate.

## Reading and review

The adapter groups actual word polygons by orientation and baseline, with the
measured research predicates. It keeps genuine repetitions, source photo/section
identity and original axis-aligned enclosures. Row confidence is the minimum
actual word confidence. It never warps pixels or uses a balancing equation to
choose an amount. Invalid/mismatched/out-of-source geometry and excessive layout
work are rejected instead of producing invented boxes.

Every draft requires purchase-list, adjustment and tax-basis review. Purchases
with weak source rows receive pending description/quantity/unit/line checks, with
source highlights available. Actual OCR confidence is supporting evidence, not
calibrated proof. Unknown currencies, prices, tax roles and unsupported overlaps
remain review problems.

Verified graph/source entry points are `src/lib/azure-layout.mjs:L17`
(`projectAzurePage`), `server/azure-reader.mjs:L84` (`createAzureReader`),
`src/lib/azure.ts:L17` (`receiptFromAzureWords`) and `src/lib/azure.ts:L77`
(`extractWithAzure`). The shared prepared-JPEG guard now returns its already
validated width and height; existing callers retain their behavior.

## Server boundary and optional setup

The server pins `prebuilt-receipt`, API `2024-11-30`, and validates the configured
HTTPS Cognitive Services origin. Result polling/deletion must remain on that
same origin, model and API version with a valid result UUID; redirects are
rejected. Each prepared JPEG section is uploaded once, sequentially, with at most
30 status checks and one cleanup attempt for its new result. No locale, currency,
merchant, expected price or previous reading is sent. There is no automatic
extraction or deletion retry, and partial extraction is not accepted.
[Microsoft REST contract](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0%20%282024-11-30%29).

One prepared section reserves one persistent allowance slot before upload. Failed
or cancelled uploads keep their slots; restarts and concurrent reader instances
cannot restore them. Stored allowance records contain request/state metadata,
without photos, text or credentials. A scan preflights enough remaining slots
for every section, and later reservation races stop processing without exceeding
the grant. A long photo can need several slots.

Prepared images must be under 4 MB, at least 50 pixels on each side and within
the application's existing section bounds. The browser decodes/re-encodes its
images; the server's secondary JPEG envelope/dimension guard is not a full codec.
Sending one image per analysis avoids F0 silently truncating a combined document
after two pages. Provider response size, text, geometry, work and overall job
duration are bounded. F0 throttling is handled as a visible failure, without a
retry. [Microsoft limits](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/service-limits?view=doc-intel-4.0.0).

The ignored `.env.local` already holds the user's server endpoint/key. To enable
future uploads deliberately, the app owner must first review remaining provider
quota, costs and the separate upload authorization, then set an allowance:

```dotenv
AZURE_ALLOWANCE_ID=your-approved-unique-grant
AZURE_SECTION_LIMIT=0
# Optional shared persistent absolute directory; default: .receipt-reader-state/azure
AZURE_ALLOWANCE_DIRECTORY=
```

The example intentionally keeps the limit at zero. A positive finite limit and
a valid grant expose the optional reader after a server restart; the user must
also select it and consent to each scan. Do not renew a grant to bypass provider
quota. The app's allowance is a local cap, not a reading of the Azure account's
billing or Free quota. The six-crop upload approval is consumed; it does not
authorize future scans. No new credential is needed for local tests.

## Privacy and verification

The UI explains processing in the configured resource region and Microsoft's
documented temporary storage/deletion policy. The server requests early deletion
even after cancellation and reports uncertain cleanup. Neither a deletion response
nor these tests prove independent erasure or an account-specific training-use
commitment. Azure's automatic retention policy remains the fallback after a crash
or an unidentifiable operation; crash recovery and public-backend authentication
remain unfinished. [Microsoft data handling](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security).

All **615 unit tests** and **173 desktop/mobile browser tests** pass, with one
existing skip. Thirty new unit tests cover geometry, weak rows, native-field
exclusion, no credential echo, consent/origin checks, finite allowances,
cancellation, bounded polling, failure and cleanup. Six new browser cases use
the actual local HTTP middleware and adapter with injected synthetic provider
responses. They cover consent resets, unavailable allowance, failure without a
retry, real source highlights, 320/390 CSS-pixel layout, accessibility checks and
an exact £2.75/£2.75 split. They are not new Azure recognition or a physical phone.

Build/typecheck and formatting pass; the main-chunk size warning remains. After
the full browser run, only whitespace in one new test locator was formatted.
Both versions and their diff are retained, and a separate rebuild of the final
production sources matches all 222 files served by that browser run byte for byte.
The first build's test-hook type mismatch and first replay's BigInt serialization
failure remain preserved with their corrected successors.

The [frozen evidence packet](advanced-azure-app-v1.json) binds saved responses,
scoring, source/build/tests, screenshots, limitations and protected Git state.
No live timing, cloud invoice, complete-financial or public-release claim follows.

```powershell
python -X utf8 receipt_training/scripts/build_azure_app_report.py --check
```

This check is offline. The full twelve-phase goal remains active.
