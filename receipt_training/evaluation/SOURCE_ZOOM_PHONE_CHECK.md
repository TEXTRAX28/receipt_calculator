# Receipt-source zoom and current phone workflow

4 November 2026; parent `824dd7103b42b4097f72b41f9a681151404a0f3a`.
The full twelve-phase objective remains active.

## Change and actual browser result

The preceding phone check exposed a usability problem: a highlighted purchase
row could be too small to read inside its dialog. `SourceImage()` in
`src/ReceiptSource.tsx:L12` now offers 100–400% zoom in 50-point steps, zoom out
and fit-width controls. The image scrolls inside a bounded, keyboard-focusable
region. Buttons have at least 44-pixel targets, the zoom level is announced, and
opening another purchase resets the view. Highlight coordinates and receipt
values are unchanged. No dependency or financial-calculation code changed.

An actual Basic on-device OCR scan used the existing generated 800 × 620 JPEG
(`350a15f54ff788b5cbd0bcf8fc945339c3d0ae6ebcdb1c30022da0eeff0922d1`).
It read MILK, quantity 2, unit £2.50, line £5.00; BREAD, quantity 1, unit/line
£1.20; GBP, subtotal and total £6.20. No financial field was edited.
The scan ran at a measured 320 × 820 viewport in the existing in-app browser;
review continued at 390 × 844. This is browser emulation, not physical-phone
camera or Safari evidence.

Nine DOM observations verify that doubling/quadrupling SVG width leaves its
viewBox and highlight boxes unchanged. At 320 pixels, the image grows from
208.67 to 834.67 CSS pixels inside a 209-pixel scroll area; page content remains
305 pixels wide after the scrollbar. An actual ArrowRight press changes the
image region's scroll position. At 390 pixels, page content remains 375 pixels
wide. Maximum zoom disables zoom-in; zoom-out gives 350%; fit-width returns
100% and zero horizontal scroll. Closing at 150% and opening purchase 2 starts
at 100%, with its own BREAD highlight. All visible receipt fields match their
pre-zoom values exactly.

The receipt remains blocked after four purchase-field confirmations. The fifth
confirmation records an explicit reviewer assumption for this synthetic
zero-extra-tax control; the image does not print a VAT-inclusion convention.
This is workflow evidence, not successful recognition of that convention.
Unassigned purchases prevent finalization. Equal assignment to Alex and Sam
then finalizes £3.10 each, conserving £6.20. No external message or export was
sent. The console records no warnings/errors.

## Verification and resource limits

Full strict typecheck, formatting, isolated compilation and graph refresh/check
pass on the changed source. Compilation produces twelve artifacts, retaining
hash-verified aliases for eight unchanged large assets; this is an isolated QA
package, not a complete deployment package.

The first full unit run completes all **1,377 assertions across 77 files**, with
Vitest exit 0. Its outer controller nevertheless samples 1,072,680,960 available
RAM bytes, below the unchanged 1,073,741,824-byte runtime floor, so the guarded
run is retained as a resource failure. A separate 384-MiB heap attempt stops
earlier at that floor. Neither is described as a clean guarded full-suite pass;
the earlier clean suite at the parent checkpoint remains historical. No further
full-suite retry was made.

The first preview closes normally after sandbox socket denial prevented browser
access; no receipt was uploaded there. The next preview is held before process
launch for insufficient RAM. A later measured qualifying resource state admits
the loopback-only preview outside the network sandbox. That server completes
the real UI check, serves twelve requests with HTTP 200, makes zero POSTs or
external requests, and closes normally after 269.904 seconds. Its minimum
sampled available RAM is 1,206,661,120 bytes. Cloud/local-computer providers and
environment-file loading are disabled throughout this preview.

Owned test tab 5 and cleanup tab 6 close; an owned blank tab permits a successful
viewport reset to 1280 × 720 after the first reset reported unavailable user-tab
access. The original user tab is never acted on. Its final draft readback is
unavailable, so no fresh readback claim is made. Failed temporary tab 4 cannot
be explicitly retrieved/closed because its generated error-page data URL is
blocked; it is unmarked and left to normal turn-end cleanup.

Evidence is in `qa-artifacts/source-zoom-browser-v3/`, with retained unsuccessful
attempts in `source-zoom-v1/` and `source-zoom-browser-v2/`. The checkpoint binds
exact source, logs, screenshots and compilation bytes. Prior evidence remains
verifiable. No model comparison, fresh holdout inference, private provider
upload, key provisioning, billing activation or OpenAI request occurred here.
Remaining recognition, genuine-capture, complete-financial-reference and public
release requirements are unchanged; this phone usability fix is not whole-goal
completion.
