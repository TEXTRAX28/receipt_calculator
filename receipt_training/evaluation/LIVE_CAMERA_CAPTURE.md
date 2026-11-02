# Live receipt capture checkpoint — 2 November 2026

The capture screen now offers a local camera preview, approximate paper outline,
lighting/sharpness advice, full-frame capture, inspection and retake. Long
receipts can be photographed in consecutive overlapping sections through the
existing twelve-photo import flow. This closes an implementation gap in phase 9;
physical phone performance and receipt-recognition accuracy remain unverified.

## Implemented behavior

Choose **Take a photo**, allow the camera, frame a section, then **Capture photo**.
The camera stops while the photo is reviewed. **Inspect text** shows original
pixels; **Use photo** adds it to the existing checked import flow. The next
section's guidance asks for 3–5 overlapping complete rows and the final total/VAT
table. A photo is not read or accepted as a financial draft merely by capturing it.

The paper outline is advisory and never crops the captured image. Dark, blurred,
low-detail and low-resolution warnings reuse the existing local quality helper.
They do not certify readability or block a deliberate capture. The original
camera/photo picker remains available if live preview is unavailable or denied.
There is no new dependency, provider, financial rule or default-reader change.

Graph navigation and verified source: `src/ReceiptCamera.tsx:L160` starts the
camera only after a user action; `L116` samples advice once per second; `L234`
captures the full intrinsic video frame; `L61` releases owned tracks/timers.
It imports `src/lib/image-quality.ts:L117` and
`src/lib/receipt-edges.ts:L26`, alongside the existing image-preparation
community. The quality helper now also accepts a video source; its image math is
unchanged. These locations were verified against the refreshed local graph.

Camera requests disable audio and prefer the rear camera. Permission/startup
has a 15-second deadline, JPEG encoding a 10-second deadline, and imported frames
retain the existing 25-megapixel/12-MiB bounds. Closing, hiding or unmounting the
capture screen stops owned tracks. Late permission and encoding results cannot
reopen the screen or add a photo. Retakes revoke the prior preview URL. Camera
tracks also stop immediately after drawing the captured frame, before encoding.

Browsers require a secure context and permission for live camera access; a user
may leave the permission request unanswered. The deadline and photo-picker
fallback handle that case. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).
Frame dimensions use the intrinsic video size, rather than its displayed CSS
size. [MDN videoWidth](https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/videoWidth).
Cleanup explicitly stops tracks and clears the video source.
[MDN MediaStreamTrack.stop](https://developer.mozilla.org/en-US/docs/Web/API/MediaStreamTrack/stop).

## Actual verification

| Check | Observed result | Scope |
| --- | --- | --- |
| Unit regression suite | 912 passed, 57 files; 50.81 seconds | Existing money/parser/provider and other unit checks |
| Final dedicated camera suite | 22 passed; 54.2 seconds | Eleven cases in desktop Chrome and phone-size Chrome emulation |
| Full browser suite | 219 passed, one existing skip; 7.1 minutes | Actual local OCR cases plus explicitly synthetic provider protocols |
| Production build/typecheck | Passed | Existing large-chunk warning remains |
| Formatting, graph refresh/check and diff check | Passed | Test formatting was applied after the run; exact formatter-output equivalence is recorded |
| Windows ownership regression | Four assertions passed | Real process handles/times, one injected stale parent link |

Camera tests substitute generated canvas MediaStreams for **hardware only**.
Video presentation, quality analysis, native JPEG encoding, review, image import
and worker execution remain real. Colored corner pixels survive in the captured
720×1080 JPEG, proving the outline does not crop the frame. Screenshots and checks
cover 320, 390 and 430 CSS-pixel widths, no horizontal overflow, a fully visible
capture button, keyboard focus and no automated WCAG A/AA violations. Small
screens scroll inside the dialog to reach secondary controls.

Other cases cover dark/blurred/blank guidance, retake, hidden-page pause, restart,
denied/unavailable camera, unanswered permission, late results, unmount and the
twelfth-photo limit. Native hardware permission prompts themselves are simulated.

The fixed synthetic receipt passes through camera JPEG capture, the actual
cached enhanced on-device OCR worker and the existing parser. Soup remains
2 × GBP 1.25 = GBP 2.50; Rice remains 1 × GBP 3.50 = GBP 3.50; the total remains
GBP 6.00. Confirmation initially stays blocked. Automated source-review controls
then allow the existing whole-receipt flow to show GBP 3.00 for Ari and GBP 3.00
for Bo, without financial edits. Those automated controls are not independent
human verification. This is workflow evidence, not a new real-receipt accuracy
score. The original-fifty benchmark and genuine UK strict score are unchanged.

Final camera artifacts include `qa-artifacts/e2e-runs/mobile-9n43u4/` for
capture/layout and `mobile-fpAaK3/` for actual synthetic OCR/splitting. Full-suite
repetitions are retained separately. The evidence packet binds exact source,
build, fixture, logs, screenshots and observations:
`advanced-live-camera-v1.json`. Recheck with:

```powershell
python -X utf8 receipt_training/scripts/build_live_camera_report.py --check
```

## Resources and failed attempts

| Run | Controller elapsed | Minimum available system RAM | Sampled owned-process peak | Qualification |
| --- | ---: | ---: | ---: | --- |
| Layout v3, two cases | 19,925 ms | 1,956,462,592 bytes | 1,331,474,432 bytes | No OCR; no observer errors |
| Camera v4, 22 cases | 55,001 ms | 1,705,107,456 bytes | 1,915,801,600 bytes | One child could not be sampled; incomplete lower bound |
| Full v1, 220 cases including skip | 424,728 ms | 1,304,969,216 bytes | 1,847,533,568 bytes | 128-process observation cap reached; incomplete lower bound |

These sums include owned Node, preview/browser and worker processes. They are not
model-only memory or phone requirements, and 250-ms sampling can miss brief
children. The full-suite peak must not be compared as if it were a complete
measurement. The separate system-RAM controller sampled through the entire run;
its retained 1-GiB floor did not trigger. No user applications were stopped.

Targeted v1 and v2 each passed 18 cases and failed two. V1's test tried fetching
a blob URL, which the unchanged page CSP correctly rejected; the test now reads
the already decoded image. V2 exposed a real focus-return race while the parent
was importing a photo; focus now returns after the import's React update. Both
failed runs, their source snapshots and traces remain available. A final
validation helper's token-scanner check also failed: the scanner did not rescan
template-literal tokens correctly. Its failed output is retained; the replacement
checks the exact output of the installed formatter against the final test file.

The first memory observer did not write because its output path was outside its
allowed directory. The second exceeded the helper's wait and has no usable
process-tree peak. Investigation found that following parent PIDs alone can
attach an older unrelated process after PID reuse. The observer now accepts a
child only if its creation time is no earlier than its still-live owned parent.
The Windows test injects an older test process's parent link, verifies exclusion,
samples a genuine child and proves the older test process remains running. It
uses read-only handles; the observer never terminates processes. Creation times
come from [Microsoft GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes).
This demonstrates the bug and fix, but does not prove the exact cause of the
earlier timeout. Historical observations lack this ownership check; their raw
data is preserved and must retain that limitation.

## Git, privacy and remaining work

Parent improvement commit: `111045f17d31fff49f69cfe6ea558d64997bc72c`.
The stable reference remains `ee725ba45e799bee8501d3de034e0302c0127afd`;
the original checkout remains at `29a187af7347be94c0728f4785be674500833748`
with its preserved dirty diff. No merge, push or deployment occurred. Exact
protected values and unchanged money/parser/provider/configuration files are
checked in the packet builder. The local graph cap grows from 200 to 250 files
for the now-201-file app/test corpus; sensitive/data/dependency exclusions remain.

No private camera was accessed, private receipt was uploaded, model downloaded
or paid service activated. Keys were not inspected, printed or included in the
evidence. Camera tests block
external requests and HTTP writes; other full-suite cases exercise named local
synthetic protocols with provider credentials blank. Eight camera-journey OCR
reads across the four broad camera/full test runs used the same local synthetic
fixture, not genuine receipts or a new model comparison.

Physical Android/iPhone capture, Safari, lens selection, autofocus, orientation,
low-end memory and real lighting/edge reliability remain open. Live pose,
clipping and distortion diagnostics have not been calibrated. Neither the
existing OCR errors nor broader financial acceptance are solved by camera UI.
Public authentication/TLS, tenant quotas and durable cleanup also remain open.

The 8B disk/RAM guards and cached-medium comparison RAM guard are unchanged.
Neither comparison was started here. Because the observer and quality-helper
sources changed, the prepared paired-model study must be frozen under a new
version before a later inference run; historical plans must not be rewritten.
The full twelve-phase goal remains active.
