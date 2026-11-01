# Optional Veryfi text reader

The [frozen integration checkpoint](advanced-veryfi-app-reader-v2.json) records
the executed sources, saved-response replay and validation artifacts.

The app now offers Veryfi as an optional receipt reader when the local server
has credentials **and an explicit finite document allowance**. The default
reader is unchanged. Credentials alone leave the option disabled. The existing
private `.env.local` was not changed, and the running feature preview reports
`configured=false`, `remaining=0`.

This implements the useful path measured in the [six-receipt comparison](VERYFI_SIX_RESULT.md):
literal Veryfi OCR text through the existing parser, with the later
[reduced-price grouping fix](REDUCED_PRICE_GROUPING.md). On those saved crops,
selected currency supplied after extraction yields 26/26 matched descriptions
and 25/25 readable line prices, versus 22/26 and 18/25 for native Veryfi fields.
Automatic currency yields 19/25 line prices. These partial, source-informed
cases do not establish complete financial accuracy or a general provider winner.

## What the app does

The browser sends its already prepared JPEG sections to the local server only
after selecting Veryfi and accepting its current data-use notice. Original
filenames, user currency selections, earlier OCR and reference annotations are
not sent. Up to 15 sections form one ordered ZIP; the generic zero-padded names
preserve order. This follows Veryfi's [ZIP processing contract](https://faq.veryfi.com/en/articles/6243055-processing-zip-files).
A long photo may use several sections. Photos remain available for review.

The server reserves an allowance slot before one extraction request. There are
no automatic extraction retries, fallback providers, refunds or clock-based
allowance resets. Failed or uncertain attempts remain consumed. Exclusive
filesystem slots enforce the cap across restarts and processes sharing the
same persistent directory, account and grant. This local allowance is not a
measurement of the provider account's remaining free quota or billing status.

Only bounded literal `ocr_text` reaches the parser. Native monetary fields,
currency guesses and confidence values are ignored. A new record must have an
exact numeric identity, matching request UUID and no duplicate marker before
the server attempts its one deletion. Ambiguous identities are never deleted.
Cancellation retains an independent bounded cleanup attempt when that new
identity is known. Deletion failures remain visible; uncertain responses are
not retried or followed by account-wide searches.

Every new draft requires checks of its purchases, receipt adjustments and tax
inclusion against the originals, even when its total balances. These checks
persist and reopen when their values change. Missing quantities/prices remain
missing. Combined OCR text supplies no reliable word-to-photo map, so this
reader does not invent source boxes or confidence. Whole original photos can
still be opened and the draft can be corrected manually.

## Operator configuration

The already approved one-receipt and six-receipt live tests are consumed. No new
live upload was made for this integration. To enable future user-initiated app
scans, first check the API account's actual plan and unused quota, then set the
following server-only values in ignored `.env.local` and restart the app:

```dotenv
VERYFI_CLIENT_ID=
VERYFI_BEARER_KEY=
VERYFI_ALLOWANCE_ID=
VERYFI_DOCUMENT_LIMIT=0
VERYFI_ALLOWANCE_DIRECTORY=
```

Keep credentials out of chat, Git and `VITE_` variables. An allowance requires
an 8–80 character grant ID using letters, digits, underscores or hyphens, plus
an integer limit from 1 to 100. Give only the number of additional attempts
intended; do not automatically rotate the ID, delete its ledger or raise its
limit to reclaim attempts. The default limit is zero. The default directory is
the ignored, HTTP-blocked `.receipt-reader-state/` folder. A custom directory
must be persistent, private and outside served/public folders; sharing it is
necessary for several server processes to share one cap.

Veryfi's [API Free plan](https://www.veryfi.com/pricing/) lists 100 documents per
month; this is distinct from its consumer expense app. The app does not
activate billing, validate unused provider quota or guarantee a free request
on an already paid account. The [processing API](https://docs.veryfi.com/api/receipts-invoices/process-a-document/)
documents the file/page constraints and client-dependent ZIP support; an
unsupported ZIP fails visibly without a retry.

The consent notice covers default [US hosting](https://faq.veryfi.com/en/articles/5796847-where-does-veryfi-store-the-data)
and the provider's [proprietary model-improvement policy](https://www.veryfi.com/privacy/).
Requesting deletion does not establish zero retention or training exclusion.
No EU hosting or opt-out configuration was verified. The local ledger retains
only request identity, reservation time, state, cleanup status and new document
ID, without receipt pixels/text or credentials. This remains a loopback-only
preview, without public authentication, TLS deployment or per-user isolation.

## Verification

The frozen integration evidence records 421 passing unit tests, a successful
production build/type check, six focused desktop/mobile browser tests and the
full browser suite's 157 passes with one existing skip.
The browser tests use synthetic responses and cover explicit consent, consent
reset after changing photos/providers, quota exhaustion, photo preservation,
source review, refresh, arithmetic blocking and a finalized £2.75/£2.75 split.
The 320 px and 390 px layouts have no horizontal overflow; their scan controls
are at least 44 px high. Automated accessibility checks pass. These are browser
emulations, not physical handset or live-camera performance measurements.

The saved-response replay passes the six genuine provider outputs through the
actual server adapter and app parser in 12 automatic/selected-currency variants.
Every financial field and calculated amount matches the previous frozen parser
replay. All 12 remain unverified. Transport identities and a JPEG header control
are synthetic: this verifies integration and preserves OCR text, not new image
recognition accuracy. Its global network guard records zero external calls;
original provider document IDs are never used for deletion.

The first API host-guard test incorrectly relied on native fetch overriding
Host; a raw HTTP request now exercises that guard. Two browser runs referenced
a nonexistent total selector; their source, logs and traces remain preserved,
and the final test uses the actual `.grand-total strong` element. Application
money behavior was not changed to make these tests pass.

Graph/source locations, verified after indexing: `createVeryfiReader` in
`server/veryfi-reader.mjs:L84`, `createDocumentAllowance` in
`server/document-allowance.mjs:L9`, `zipReceiptSections` in
`server/receipt-zip.mjs:L17`, and `receiptFromVeryfiText` in
`src/lib/veryfi.ts:L16`. The graph links the API to the adapter, shared schemas,
allowance and existing parser. The deterministic money/split engine is unchanged.

The original corpus is not uploaded again. The prior thirteen exact-byte
evidence gaps in three older reports remain disclosed; later passing checks
do not repair those historical artifacts. Perspective correction, physical
device testing, broader independently verified financial truth and public
deployment remain unfinished parts of the full objective.

The unpublished v1 checkpoint and builder remain in private QA storage. The
aggregate auditor refused its public `.env.example` snapshot under the blanket
secret-path rule. V2 preserves the empty public template under a neutral name;
no real environment file is declared as evidence. A second formatter pass
changed only browser-test whitespace; the actual executed test and a matching
TypeScript AST comparison remain frozen separately.
