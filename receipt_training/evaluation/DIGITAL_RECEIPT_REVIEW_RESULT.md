# Receipt-first review: local candidate

10–11 November 2026. Branch: `codex/receipt-digital-review`.
Base: `146f5b1e57899a7084d896a099184413d5477485`, the previously published and
iPhone-tested receipt-scanning improvement. This branch contains those changes
and the new work together. The base branch is preserved. No new GitHub push or remote
merge has been performed; this candidate stays local for review.

This candidate is ready for hands-on review. The automated checks and their
limits are recorded below; the changes remain local until the user approves a push.

## What changed

The normal review screen is a compact digital receipt: purchased quantities,
names, effective unit prices, line amounts and the printed total. Tap a row or
amount to edit it; the full editor opens on demand. A single Continue action
accepts the receipt as a whole. Individual reading flags retain their original
state, rather than being silently marked as individually checked by a person.

Generic low-confidence text is an optional reading note, grouped by row.
Grouping retains every distinct comparison detail while removing duplicate
notices, and does not mutate the stored reading flags. It no
longer marks every field red or creates a series of confirmation checkboxes.
Missing quantities, malformed money, unresolved currency, arithmetic differences,
missing people and incomplete assignments remain actual validation failures.
Continue opens, scrolls to and focuses their appropriate fields. Editing financial
details invalidates the receipt-level acceptance stamp.

The normal review no longer repeats the whole calculation card underneath the
receipt. The optional editor retains the calculation breakdown, including tax
already present in gross fees. A printed-tax note explains that overlap on the
digital receipt when applicable.
Original photos remain available from the receipt header, with navigation for
multiple images. The full editor and source dialogs retain detailed evidence.
Source-dialog notes open when requested; they have no confirmation boxes.

## Ramen: charge versus observed unit figure

The supplied line has quantity 2 and amount 37.20; exact division gives **18.60**
per item. The photographed unit figure can itself look like 18.80, so this is
not established to be an OCR-only mistake. The effective unit is calculated when
all copied line amounts reconcile with the printed total. The read unit figure
is retained separately and the calculated value is labelled. Neither quantity,
line amount nor grand total is changed to make the arithmetic agree.

Missing totals, unbalanced receipts, disputed quantities, unknown currencies and
non-exact division prevent that repair. A legitimate unsigned unit beside a
signed refund remains unchanged. Explicit new unit edits have their own marker
and are preserved across currency changes and refresh. A legacy scanned draft
whose optional unit is recalculated returns to review, clearing old acceptance
and finalisation stamps while preserving participants and assignments.

## Tax

A VAT registration identifier establishes no tax amount or rate. The restaurant
photo supplies neither a separate tax charge nor a rate; those fields stay blank.
No extra tax is added and no zero-rated status is inferred.

An isolated suffix such as L is not activated as an item tax code without
supporting code/retailer context. The source suffix remains available as provenance.
Real printed tax legends and supported code columns continue to work, including
unknown rates that require correction on tax-exclusive receipts. Independent-reader
comparison retains unclassified source alternatives without promoting them to
trusted tax codes. Unused tax-code controls and misleading zero-tax summary rows
are omitted.

## Name reading

The initial default reader still read Cold Udon as Cald Udon on the new photo.
A local experiment found that its wrong fragment scored about 0.923, while one
correct cropped reading scored about 0.809. Raw OCR scores are therefore not
displayed as verified probabilities or used alone to decide which spelling wins.

The optional name stage uses actual source-row crops with the installed Paddle
and English readers, sequentially. A correction requires a one-character change
supported by both readers, stable purchased count and line amount, and strong
support for the changed word. Original name text is retained. It is restricted
to suitable Latin-letter names, an eight-second deadline, at most eight candidates,
and the remaining shared 24-panel budget. Assets unavailable, disagreement or
timeout preserve the first draft; explicit cancellation stops the operation.
Every temporary image URL, bitmap and canvas is released.

This increases local processing and may load the English reader's assets on first
use. It makes no external receipt requests and uses no API credits. It is a
conservative visual re-read, not a dish-name dictionary or trained guarantee.
Older saved drafts cannot re-read names after their source photos have gone.

## Development measurement on the supplied photo

Three development checkpoints used the same new uncropped restaurant image, actual
application upload and local browser OCR. Both were owned desktop Chrome sessions
at phone CSS size, DPR 1, with external requests blocked and new OCR workers.
These are familiar development cases, not blind holdouts or physical iPhone timings.

| Measured field | Receipt-first UI before name stage | With targeted name stage |
|---|---:|---:|
| Scan to review | 4.708 s | 8.236 s |
| Correct line amounts | 8/8 | 8/8 |
| Correct purchased quantities | 8/8 | 8/8 |
| Printed total | 110.70 | 110.70 |
| Cold Udon correction needed | Yes | No |
| Mandatory source checkboxes | 0 | 0 |
| API uploads / credits used | 0 / 0 | 0 / 0 |

The final fresh run took **8.344 s**, retained 8/8 line amounts and quantities,
and produced **7/8 exact item names**. Cold Udon needed no edit. One
reference-assisted name correction reached two shares of 55.35. A remaining
romanisation difference, Tankotsu versus Tonkotsu in the longer ramen name,
shows that names still need visual review; the Cold Udon edit count is not a
claim that every semantic field was transcribed perfectly. The deliberately
inconsistent 18.80 unit case is covered by regression fixtures; this particular
new-photo run initially read 18.60 already. No measured human correction time
is claimed.

Private photos, OCR text, intermediate crops and screenshots remain in ignored
local QA directories. The public tests use synthetic receipt transcriptions and
local provider protocol stubs.

## Verification

The final complete unit run passed **1,599 tests / 86 files** in 94.25 seconds.
TypeScript (768 MiB heap limit) and the production local-only build passed.
A deliberately reproduced saved-review regression failed before its fix and
passed afterward: schema property ordering could previously discard receipt
acceptance while saving. Saving now transfers a valid acceptance to the
sanitised persisted shape; later financial edits still invalidate it. A refreshed
split still requires finalisation again, as before. The first typecheck attempt
used a 384 MiB heap and exhausted that limit; the corrected command passed. Existing OpenCV
browser-externalisation and large-bundle warnings remain. Dependencies were not
reinstalled; their shared junction and the original checkout were preserved.

The old financial fixtures explicitly open the editing view, while the default
receipt surface has its own desktop/mobile tests. Source confirmation boxes are
asserted absent. Financial values, source regions, consent, cancellation,
allowances, storage conflicts and exact-split checks remain.

| Check actually executed | Result |
|---|---|
| Complete unit suite, one worker | 1,599 passed / 86 files |
| Complete mobile browser batch | 149 passed; 1 intentional duplicate viewport check skipped |
| Desktop case coverage across broad and repair runs | Latest executed result passed for all 150 cases; none unexecuted |
| Final-build focused run, both browser projects | 22 passed |
| TypeScript `--noEmit`, 768 MiB heap | Passed |
| Production build, native loader, local-only mode | Passed, with the existing warnings noted above |
| Local graph freshness and changed-file formatting | Passed |

Desktop coverage combines four runs; it is not a single full-suite run of the
final build. The full mobile batch preceded the last source-detail grouping
change. The final 22-case run tested that final build on both projects, including
receipt acceptance, quantity corrections, unit edits/refresh, real VAT legends,
source evidence and two-tab protection. Detailed local logs and the per-case
coverage audit are retained in the ignored QA directory. Provider-specific UI
checks use synthetic local responses; no new live-provider benchmark is claimed.

Interrupted and failed development runs are retained and are not passes. Browser
tests retain phone CSS/touch behaviour with DPR 1, one worker, no retries, and
unchanged startup/runtime memory guards. WebKit is not installed; physical Safari
acceptance is still a hands-on check.

## iPhone review before any push

1. Start a fresh scan of the supplied receipt. Check the eight rows, quantities,
   unit 18.60 and amount 37.20 for the ramen, and total 110.70. Review names too.
2. Confirm that no item-review checkbox list or unsupported tax-code selector
   appears. Open a row, make one correction and continue with the whole receipt.
3. Clear a required quantity and press Continue: its field should open, highlight,
   receive focus and remain usable above the phone keyboard.
4. Test overlapping Costco photos and one receipt with real printed VAT codes;
   check discounts, tax once, original-photo navigation and the final split.
5. Refresh a draft. Its numbers should persist; a new manual unit edit should
   stay unchanged, and original photos should require re-upload as documented.

The temporary iPhone preview uses the existing, still-valid test certificate and
runs on-device scanning without provider credentials. Its access code, running
address, expiry and TLS/pairing smoke results belong to ignored local QA files;
the final reply supplies the running link after startup verification. Keep the
PC awake and both devices on the same network while testing.

No GitHub push or remote merge of this candidate has been performed. The next
step is the user's iPhone review before any request to publish these changes.
