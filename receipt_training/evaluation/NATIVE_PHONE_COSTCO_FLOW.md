# Real local-reader phone workflow

4 November 2026. Current application source is identical to the tested Gemini
checkpoint, with research HEAD `0d693f502312467a64202537543c06356b5a153a`.
This verifies one familiar supplied Costco transaction, not broader receipt
accuracy, a physical phone or the full hybrid pipeline.

The current compiled UI is served from a new loopback origin. Its real production
Paddle reader is configured explicitly; every cloud reader is disabled and no
environment file or provider key is loaded. The existing model cache is read
without installing or downloading weights. The spawn wrapper records lifecycle
metadata only. The worker's idle interval is five seconds for this owned test;
production source and its memory safeguards are unchanged.

At a measured **390 × 844** viewport, the normal upload controls import the two
existing identifier-reduced crops. GBP is explicitly selected before scanning;
currency recognition is not claimed. Normal browser preparation re-encodes the
two JPEGs to 209,692 and 37,334 bytes. A single real
`POST /api/receipts/recognize` returns HTTP 200, two panels and 133 words.
The backend call takes **12,332 ms**, including first-model startup; browser
file preparation and human review are outside that measurement. No saved
response or recognition stub is used, and no request is retried.

All eighteen item-detail panels are opened through the UI. DOM values match the
source-backed purchase prices, purchased quantities, unit prices and VAT codes
for all eighteen rows; all four deductions belong to the correct purchases.
Both genuine rotisserie-chicken purchases remain separate. The VAT legend is
read as A = 20.00% and Z = 0.00%, with tax-exclusive item prices. Two description
transcriptions remain uncorrected: `BELVEDERE VOD.7OCL` and `PLASTIC CONT 380Z`.
This is not a claim of exact product-name recognition.

The draft shows **£163.16 net + £13.62 VAT = £176.78**. Confirmation is blocked
by the purchase-list source check. Its actual highlighted photo area visibly
reads `TOTAL NUMBER OF ITEMS SOLD - 18`; checking it enables confirmation.
There are **zero financial edits, rate-format edits, coupon moves or removed
rows**. Supplied GBP and one explicit source check remain necessary context
and review, rather than automatic acceptance.

Three fictitious participants are added. Unassigned finalization is verified
disabled. Whole-receipt equal sharing then finalizes at **£58.93 / £58.93 /
£58.92**, conserving exactly £176.78. No summary is copied, downloaded or sent.
The page width remains 375px inside the 390px viewport; vertical scrolling is
normal. The viewport resets and the owned tab closes, preserving the user's
original tab at port 4173. This is browser viewport testing, not a genuine
camera capture or physical-device/Safari test.

The server closes normally with exit zero after **393.495 seconds**, before
its eight-minute deadline. The HTTP transcript contains six successful
requests, including the one recognition POST. Minimum sampled available RAM is
**1,641,340,928 bytes**, above the unchanged one-GiB runtime floor. The native
worker is closed by the factory's owned idle shutdown and records Windows exit
code 1; a successful native exit code is not claimed. No temporary runtime jobs
remain. There are no external fetch attempts, cloud uploads or real key loads.

One browser selector wait expires while the original scan remains active; the
same scan subsequently completes. A full-page screenshot attempt fails, while
the ordinary viewport screenshot succeeds. Neither observation issue causes a
new model call. The screenshot and DOM record are retained separately from
the earlier Gemini fixture's deadline failure, which remains historical.
The browser-supplied viewport capture is a 375 × 812 JPEG; the DOM viewport
remains 390 × 844. Its filename and metadata are corrected to match the returned
format without editing pixels. The initial format/dimension assertions remain
recorded as failed packaging checks.

All 225 application/test source hashes and the compiled artifact hashes are
verified unchanged. The earlier 1,390-case application suite, typecheck and
compilation are carried forward; no fresh full-suite run is asserted. Evidence
is in `qa-artifacts/native-phone-flow-v1/`. The original, old comparison and
stable checkouts remain protected. The separately prepared OpenAI request is
still unapproved and unexecuted; this test consumes no API credit.

The production path was located through the current graph and verified directly:
[createReceiptApi](C:/Users/natan/.codex/worktrees/primary-worker-memory/costco_calc/server/receipt-api.mjs:168),
[createLocalModelReader](C:/Users/natan/.codex/worktrees/primary-worker-memory/costco_calc/server/local-ocr.mjs:142),
[extractWithLocalModel](C:/Users/natan/.codex/worktrees/primary-worker-memory/costco_calc/src/lib/local-model.ts:40)
and [scan](C:/Users/natan/.codex/worktrees/primary-worker-memory/costco_calc/src/App.tsx:646).
The twelve-phase goal remains active: unfamiliar-receipt accuracy, independent
recovery, genuine capture and public-release work are still incomplete.
