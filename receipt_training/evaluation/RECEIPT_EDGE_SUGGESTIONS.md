# Local edge suggestions for receipt photos

The crop dialog now offers **Find receipt edges**. It suggests a rectangular
frame on the device, which the user can adjust before choosing **Apply crop**.
Original photos remain available, and unclear results leave the current manual
frame unchanged. Reset, cancellation and closing the dialog stop the owned
worker. Whole-receipt edge finding is hidden while rereading one item and on
prepared PDF pages.

The helper uses at most a 640-pixel side / 409,600-pixel sample, a five-second
deadline and no OCR/LLM/API request. Work runs in a separate worker so the
geometric search does not occupy the UI thread. It preserves photo boundaries
when paper continues off-frame, which matters for overlapping receipt sections.

| Development step | Inputs | Proposed frames | CORD word regions checked | Regions outside frame |
| --- | ---: | ---: | ---: | ---: |
| Broad-transition prototype, rejected | 53 | 38 | 786 | 52 |
| Strict localization prototype, not promoted | 53 | 3 | 0 | Unscorable |
| Revised geometry kernel | 53 | 13 | 327 | 0 |
| Actual preview preparation + owned worker | 53 | 13 | 327 | 0 |

The actual pipeline loads five frozen app modules, uses the normal validated
photo preparation and analyses its prepared JPEG. Four frames differ slightly
from the raw-image kernel study; their actual results were audited. All 327
existing upstream word rectangles on eight proposed CORD crops remain enclosed.
Five other proposed target-receipt columns have assistant-reviewed visual
envelopes, including both original Costco sections. The partial second document
beside the 20180210 Taiwan receipt is outside that main-document envelope.

Forty inputs have no suggestion. Some are already framed, while others have
unclear or unsupported boundaries. This is not a paper-boundary precision/recall
measurement or a fresh holdout. The word geometry covers its existing annotated
regions; the other envelopes are source-informed assistant review. Users still
need to check the intended document, all items and the total before applying.

Observed desktop Chrome edge-preview time was about 254 ms median and 762 ms
maximum, including decode/sampling, worker loading and calculation. This excludes
upload preparation, review and OCR. It does not measure physical phone performance.
The built worker is a small local asset; no new dependency or cloud quota is used.

Validation passed: **392 unit tests**, **151 browser tests** with one existing
skip, eight focused browser tests, production build, type check, formatting and
current-graph checks. Seven new asynchronous tests cover stalled decode/worker
deadlines, cancellation, late bitmap closure and worker cleanup. The new browser
flow reads a synthetic photo through real on-device Tesseract after applying
the suggestion and retains both product names and total 5.50. It does not score
real-receipt financial accuracy.

Separate viewport-only captures verify the dialog at 320×844 and 390×844, with
no horizontal overflow and a reachable 46-pixel Apply control. Full-page browser
captures expand fixed-overlay layout during capture, so they are retained as
artifacts rather than used as viewport-fit evidence.

![Synthetic crop preview at 390px](C:/Users/natan/.codex/worktrees/receipt-ocr-baseline/costco_calc/qa-artifacts/receipt-edge-viewport-v1/phone-390-frame.png)

![Reachable crop controls at 390px](C:/Users/natan/.codex/worktrees/receipt-ocr-baseline/costco_calc/qa-artifacts/receipt-edge-viewport-v1/phone-390-controls.png)

The [1,241-file checkpoint](advanced-receipt-edges-v2.json) preserves failed
prototypes, exact source/input hashes, actual module loads, source coverage,
worker tests and viewport measurements. An unpublished first report capture
remains private; the published checkpoint binds a frozen test copy so later
test edits do not invalidate the experiment. The same thirteen historical
evidence gaps remain, with no new expected gap from this change.

Graph-verified implementation locations:

- [`findReceiptEdges`, line 26](../../src/lib/receipt-edges.ts#L26): bounded geometric suggestion/abstention.
- [`suggestReceiptEdges`, line 6](../../src/lib/edge-preview.ts#L6): owned worker, deadlines and resource cleanup.
- [`findEdges`, line 44](../../src/ImageCropper.tsx#L44): preview, manual controls and confirmation.

Existing image-preparation and financial/OCR library bytes are unchanged. The
default reader, bill calculation, original receipt labels/splits/permissions,
stable branch and consumed cloud authorizations are preserved. Diagnostic images
and two canonical attachment copies remain in ignored local QA storage for
reproducibility. Private photos stayed local throughout this work.

Perspective correction, arbitrary rotation, broader faint/occluded document
coverage, physical-camera testing and the remaining production goal stay open.
The measured results support an optional crop aid, not automatic financial
acceptance or a claim of better receipt recognition.

```powershell
python -X utf8 receipt_training/scripts/build_receipt_edge_report.py --check
```
