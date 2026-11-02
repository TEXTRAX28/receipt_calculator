# Optional rotation and perspective correction

The capture editor now offers **Crop → Rotate or straighten**. Rotate text in
quarter turns, place four corners around the receipt, preview the corrected
copy and explicitly apply it. Corner handles support pointer dragging and arrow
keys; a corner selector and two sliders provide another way to position them.
Ordinary rectangular trimming remains the default.

The original uploaded source and its preview are retained. Correction always
starts from that native source, including when reopening a previous correction;
it does not repeatedly resample an earlier JPEG. After reading, **View receipt
image** lets the user switch between the original and corrected copy. Those
views own and revoke their temporary copy URLs.

## What the correction does

A validated convex quadrilateral and inverse projective transform map the
selected paper to a rectangle using bilinear sampling. Output dimensions use
opposite edge lengths as an aspect estimate; they do not establish the paper's
true physical proportions. It can straighten a planar tilted receipt, but
cannot reconstruct clipped/blurred text, flatten arbitrary paper folds or prove
that the reader copied text correctly. No text restoration or generative image
editing is used. This path keeps color without an additional contrast filter. A small white outside
margin keeps the entire selected area inside the image. Its inset shrinks for
very narrow/short previews; it does not erase edges or recognized characters.

Input headers are checked before decoding. Sources remain limited to 12 MB,
20,000 pixels per side and 25 megapixels. Invalid/crossed/tiny frames and unstable
near-horizon transforms are rejected. An owned local worker bounds resampling
to one prepared image at a time: at most four megapixels and 5 MB per JPEG, with
a thirty-second overall deadline. Cancellation terminates the worker; stale
results cannot replace the image. Unsupported worker/canvas behavior leaves
ordinary trimming available.

Tall corrected receipts retain overlapping reading sections generated from the
native source transform, including both ends. The full receipt is not simply
reduced to the preview's size. Applying a correction that would exceed the
receipt's existing 24-section aggregate limit keeps the previous images and
reports the limit. Neither a preview nor valid geometry verifies financial data.

Corrected-photo scans therefore require a purchase-list source check across all
readers. An existing coverage check is reused and reopened. Confirming it records
the current purchase fields; later edits reopen the check. The independent money
validator still rejects contradictory quantity/unit/line relationships.

Verified graph/source locations: `src/lib/image-geometry.ts:L31` (frame checks),
`:L78` (projective mapping), `:L152` (sampling),
`src/lib/geometry-client.ts:L13`, `src/lib/capture-review.ts:L4`,
`src/ImageGeometry.tsx:L68`, and the `src/ReceiptPhotos.tsx:L1` file node.

## Actual observations and verification

The analytic unit control uses an independently known trapezoid whose centre
maps to `(1/3, 1/3)`, checks raster sample values and verifies rotation without
mirroring. Other cases cover original immutability, long-receipt overlap/end
coverage, malformed/budget/frame rejection, worker cancellation/deadline/failure
and source-check invalidation.

The native browser journey draws one known receipt, independently projects it
into a trapezoid and rotates it sideways. It then uses the real correction worker
and real on-device Tesseract, separately in desktop and iPhone-sized Chromium
contexts. These are two views of one synthetic fixture, not independent receipts.

| Before any user correction | Observation per view |
|---|---:|
| Exact product names | 1/2 |
| Purchased quantities | 2/2 |
| Unit prices | 2/2 |
| Line prices | 2/2 |
| Printed total | GBP 5.50, correct |

The final unedited second row is `~ Apples`, quantity `1`, unit price `3.00`,
line price `3.00`. The name error remains in saved observations. The bill balances
but purchase-list review still blocks acceptance. After inspecting the original
and corrected copies, the test explicitly edits the name to `Apples` and confirms
the list. The exact split is £2.75 each. That edit is human-workflow verification,
**not OCR accuracy**. No financial field is edited.

The first exact-name assertion failed in both contexts. A white-margin trial,
motivated by [Tesseract's image-quality guidance](https://tesseract-ocr.github.io/tessdoc/ImproveQuality.html),
still failed the name assertion. Its initial assessment missed that the raw
trace fixed the unit price from `3.60` to `3.00`. Rechecking that literal output
changed the decision: retain the margin with adaptive insets and thin-preview
tests. Unit accuracy improves 1/2 → 2/2 on this fixture only. Earlier sources,
failed runs and the superseded assessment survive. No punctuation stripping,
fabricated price repair or changed reference makes the final journey pass.

The existing on-device adapter returns plain text without source word geometry.
This journey reviews the full corrected/original photos and does not invent
highlight rectangles. Word-aware readers continue to use their actual section
blobs/boxes; enriching on-device source metadata remains a broader-goal task.

Current validation passes **716 unit tests** (twenty-three new cases), **183 standard
browser tests with one existing skip**, build/typecheck, formatting and graph
refresh. The editor's automated WCAG A/AA checks pass in both standard contexts.
Desktop/mobile journeys also cover 320/390-pixel horizontal fit, reset, late
results, cancellation and unavailable-worker fallback. Emulated touch is a
separate native-input probe; it does not substitute for a physical phone or
Safari camera test.

The main minified bundle is 531.64 kB, with the existing 500 kB warning. The new
geometry worker is 8.70 kB. No runtime dependency, model download, backend API or
default reader changes. Native buffer limits are explicit; physical-device peak
memory and geometry latency distributions have not been measured.

## Scope and remaining work

This delivers optional rotation and planar perspective correction. It does not
calibrate automatic clipping/pose detection, live-camera guidance, genuine-photo
accuracy, paper-curvature correction or physical-device performance. Original
fifty references, permissions and reader outputs are unchanged; their native
benchmark is not rerun or relabelled for this image option. No fresh accuracy
claim for that cohort is made.

All work is local with synthetic capture inputs; no new private upload or paid
activation occurs. The previously prepared six-crop Gemini comparison still
requires its separate pending Phase 6 approval. The protected baseline/original
checkout remain unchanged. The full twelve-phase goal remains active.

Local evidence: `advanced-capture-geometry-v1.json` and
`qa-artifacts/capture-geometry-v1/`.
