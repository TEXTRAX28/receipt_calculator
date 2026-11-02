# Browser compatibility and recovery checks

2 November 2026. Improvement branch `feature/advanced-ocr-vision-ai`, based on
`025fe4293c885167ab14ceabb2c3008a139b92e1`. This work changes browser recovery and
source-dialog focus. It does not change OCR models, parsers, financial rules,
reference labels, private-upload permissions or the selected default reader.

## Changes and their limits

- Source buttons explicitly take focus before opening the native dialog, so
  closing it returns keyboard focus to the invoking control in WebKit as well
  as Chromium.
- Enhanced on-device reading checks its required image APIs before downloading
  model assets or starting a worker. Unsupported browsers get a useful message
  and can use basic on-device OCR or manual entry with the same photo.
- Perspective correction similarly reports unavailable support without starting
  a worker. The original photo, normal trimming and subsequent reading remain
  available. This is graceful recovery, not a new perspective implementation.
- The optional `npm run test:e2e:webkit` configuration runs one worker with the
  iPhone 13 viewport descriptor. It needs the pinned Playwright WebKit install.

The actual Windows Playwright WebKit 27.2 build 2370 lacks `mediaDevices`,
`MediaStream`, canvas `captureStream`, `OffscreenCanvas` and Canvas2D `filter` in
the measured context. Its iPhone user-agent string is emulation, not a physical
iPhone. Live-camera success, enhanced OCR and perspective-correction success
therefore remain unverified on this build. Their skips are recorded separately
from passing recovery checks. Chrome 155.0.8059.80 exercises the supported paths.

[Playwright documents](https://playwright.dev/docs/browsers#webkit) that its
WebKit tracks upstream WebKit rather than branded Safari, with platform-specific
capabilities. These Windows tests do not establish physical Safari support.

## Actual verification

The production build/typecheck passes, as do 944 unit tests in 57 files.
Formatting and the local graph refresh pass. The added unit checks cover both
missing image APIs and assert that no worker starts and originals stay usable.

The complete standard WebKit suite (`webkit-screen-v9`) finishes with **99
passes, 15 explicit skips, no failures and no retries** in 290.43 seconds of
guarded process time. The skips comprise nine camera-stream cases, four enhanced
reader cases, one perspective-correction success case and one duplicate desktop
breakpoint case. Successful fallback tests remain separate from these skips.

The focused Chrome regression run (`webkit-chromium-check-v4`) covers ten test
files on desktop and phone-sized contexts: **115 passes, one duplicate mobile
breakpoint skip, no failures and no retries**, in 248.60 seconds. It includes
actual enhanced OCR, synthetic camera capture, perspective correction, source
dialog focus, PDF reading, storage isolation and exact reviewed splitting.
This is a focused regression run, not a claim that the full Chromium suite was
rerun at this checkpoint. The previous complete Chromium run remains historical.

Browser fixtures now distinguish host limitations from application failures:

- Camera success tests require the actual synthetic-stream APIs; denial and
  missing-camera recovery still run. The worker-lifetime fixture explicitly
  uses stubs and is not evidence of native image support.
- PDF routing allows same-origin blob reads while rejecting external traffic.
- Blur is generated through downsampling and smoothing, independent of the
  host's optional Canvas2D filter property.
- Pointer placement tolerates one percentage point of CSS-pixel rounding;
  keyboard corner movements must still change the value by exactly one point.
- The Azure zero-allowance fixture waits for its local provider-configuration
  response before closing its mock server, removing a teardown race.
- The separate-context test waits for each saved draft before comparing them:
  a missing storage key is not accepted as an empty isolated receipt. Its owned
  context closes in `finally`. Additional breakpoints select the desktop
  capability rather than relying on one hardcoded project name.

Real synthetic basic/enhanced OCR and PDF decoding are distinguished from
mocked external/computer-reader protocols in the individual test names and
artifacts. No private receipt was uploaded or newly inferred for this work.
Existing genuine-receipt accuracy and mandatory source checks are unchanged.

## Retained failed and interrupted attempts

All attempt folders and source hashes are retained rather than overwritten:

- v1: duplicate web-server configuration prevented startup; zero test evidence.
- v2: five phone-layout cases passed.
- v3: 7 passed, 10 failed, 95 not run after the failure limit. This exposed the
  configuration-response race and missing Windows WebKit camera APIs.
- v4: partial run stopped by the unchanged 1 GiB available-memory floor;
  26 passes, nine skips and two failures were logged, without a finished report.
  Owned-process survivor checks found no surviving test processes.
- v5: full run completed with 90 passes, nine failures and 14 explicit skips.
  Failures exposed PDF blob routing, the blur fixture and pointer assumptions.
- v6: the 2.5 GiB startup guard refused launch; no tests ran.
- v7: focused rerun passed 12 cases and failed the actual perspective workflow
  because this engine has no OffscreenCanvas. The fallback above addresses that
  user-facing error; it does not turn unsupported correction into a pass.
- v8: full run completed with 98 passes, one failure and 15 explicit skips.
  The failure was the isolation fixture reading a missing initial storage key
  before React's save effect. It did not expose another context's receipt.

The final bounded browser runs use one worker, no retries, a 25-minute deadline, a 2.5 GiB
startup floor and a 1 GiB runtime floor. Sampled owned-process memory is not a
model-only peak or physical-phone measurement. API credentials are disabled in
the test server. Actual cameras and private third-party uploads are not used.

Minimum sampled system-available RAM was 2,027,311,104 bytes for WebKit and
1,730,953,216 bytes for Chrome. The owned-tree observer recorded peaks of
1,252,839,424 and 1,877,872,640 bytes respectively, but **both observers reached
their 128-process observation cap**. These are incomplete sampled lower bounds,
not complete memory peaks. The independent system-wide runtime guard continued.
Creation-time checks found no survivors among the 384 observed process records
from v8, v9 and the Chrome run; one reused PID was excluded without touching it.
A separate final OS check found zero automated Chrome and zero installed-test
WebKit processes. No user browser processes were terminated.

The cached tiny/medium OCR comparison remains separate and unrun. Refused tiny
starts v3 and v4 launched no model and read no receipts. Frozen plan v4 keeps
the same models, images, parameters, scoring and limits; its only change from
plan v3 is the current geometry-client source hash. No resource guard was lowered.
The post-test snapshot has 3,627,462,656 bytes of available RAM, below that trial's
3,885,219,840-byte startup floor. Free disk is 5,419,106,304 bytes, below the
16,517,492,768 bytes needed for the separate 8B download plus its existing reserve.

## Evidence and protected project

The report builder binds source versions, logs, artifacts, capabilities,
memory observations and failed attempts into
`advanced-webkit-compatibility-v1.json`. Verify it with:

```powershell
python -X utf8 receipt_training/scripts/build_webkit_compatibility_report.py --check
```

The stable branch remains `ee725ba45e799bee8501d3de034e0302c0127afd`.
The original checkout remains at `29a187af7347be94c0728f4785be674500833748`,
with its original diff hash
`72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b`.
No merge, push, deployment, billing activation or provider promotion occurred.
The wider receipt-scanner goal remains active.
