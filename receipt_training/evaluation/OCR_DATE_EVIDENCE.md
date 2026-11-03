# OCR dates: shared calendar interpretation and retained sources

3 November 2026. The ordinary OCR parser forced numeric dates into day/month
order even when the result was an impossible month. It now uses the existing
shared date helper, matching the structured-reading path. Uniquely interpretable
dates become ISO dates; ambiguous or invalid literals stay unresolved for review.
This is a parser/provenance fix, not a new OCR engine or a verified bill.

## Source-backed result

Both device readers had already copied the two published Costco dates correctly
as text. Their drafts then contained invalid ISO dates. The unchanged, preread
reference from the [published refund study](PUBLISHED_COSTCO_REFUND.md) supplies
the expected dates; no reference value or original-fifty membership changes.
The publisher-reported purchase/refund images remain one related development
family, edited/redacted and not independently authenticated or human-transcribed.

| Document | Previous draft, both readers | Current draft, both readers |
| --- | --- | --- |
| Purchase | `2026-17-02` | `2026-02-17` |
| Refund | `2026-21-07` | `2026-07-21` |

After four new actual local provider calls, all four prepared-image/text pairs
match their preceding observations exactly. Both automatic and supplied-USD
views produce the correct date: eight views of two documents, not eight receipts.
Every financial value and non-date source check is unchanged in all eight pairs.
The earlier comparison also predates a separate review-message change, so its
entire runtime is not a one-file ablation; the preserved parent source and new
parser integration tests isolate the date behavior.

The parser records the date's actual source indices. Core evidence retains one
printed date row for basic OCR and both repeated refund-date rows for enhanced
OCR. These are actual source rectangles, not inferred boxes. The ordinary
metadata date input does not gain a new dedicated source-dialog control here;
the original image remains available for checking the date.

## Implementation and validation

Graph/source locations: `parseReceiptWithSources()` in `src/lib/parser.ts:L58`
now imports `normalizeReceiptDate()` from `src/lib/receipt-date.ts:L2`. The helper
already rejects locale guesses; currency or merchant does not resolve `03/04`.
The parser preserves unresolved literals, retains their source indices and warns
that their order/calendar validity needs review. Independent date validation
continues to block a nonempty invalid value; users may correct or clear this
optional field. No amount, quantity, tax rate or receipt balance supplies a date.

Ten new parser integration cases fail before the change, including missing source
provenance, and pass afterwards. They cover US/UK/symmetric/ISO dates, ambiguous
order despite USD, impossible calendars, mixed separators and repeated evidence.
**All 1,129 unit tests pass, with zero skips**; 140 focused tests, typecheck and
isolated build also pass. The original helper's prior tests stay intact.

The same original-fifty saved observations are replayed through exact parent and
current libraries: 400 views / 200 pairs. Every existing scored count, financial
vector and non-date check stays identical. Dates also remain identical on those
fifty; among their five known date references, every reader/currency mode remains
2/5 correct. No original-cohort date-accuracy gain is claimed. Unsupported short
year/other-calendar formats are not filled from context.

A new production phone journey uploads the unchanged refund image, runs the
actual enhanced reader and displays `21/07/2026` at 320px/390px. Its stored date
is `2026-07-21`. Review and source screens fit horizontally, both product/refund
source rectangles remain, and confirmation stays blocked. No field is edited,
checkbox confirmed or financial issue cleared. Screenshots were visually inspected.
This is desktop Chrome with phone viewports, not physical-phone verification.

Memory controllers preserve the existing 2.5 GiB browser startup guard, 1 GiB
runtime reserve and 300-second whole-run deadline. Sampled owned Node/browser
tree peaks are 1,759,199,232 bytes for the four-call core run and 1,339,011,072
bytes for the phone journey; these exclude GPU/unrelated memory and are not
handset requirements. All 29 observed study identities are checked exited by
Windows PID, exact creation FILETIME and synchronization state. No pre-existing
application is closed. No download, private external upload, provider API request,
quota probe, billing activation or credential-file access occurs.

## Reproduction and limits

The populated private checkout retains references, raw images, observations,
prepared panels, frozen libraries, test logs and production screenshots. Preserve
existing run names and select an unused tag for new local extraction. The current
comparison uses `public-refund-costco-read-v4`, `public-refund-costco-phone-v3`,
`grouped-amounts-v18` and `receipt-date-parser-v1`. The accompanying
`ocr-date-evidence-v1.json` binds the exact evidence bytes. Older source aliases
use exact archived bytes; newer outputs never replace missing historical results.

The existing parser still selects its first ISO candidate, otherwise its first
supported local candidate. Multiple-event date semantics, two-digit years and
other calendar systems are outside this fix. Synthetic tests establish ambiguous
date abstention; this two-document pair does not measure its population error
rate. Date order normalization cannot prove OCR read every digit correctly.
Currency, unprinted purchased quantity and tax setup remain unresolved on the
published refund; no finalized split or complete-receipt success is claimed.
Provider defaults, original references and the protected baseline remain intact.
The broader twelve-phase goal remains active.
