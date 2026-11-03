# Windows reader cleanup deadline

3 November 2026. Parent: `ba37066`.

All **1,095 unit tests pass**, including the thirteen process-cleanup failures
recorded during the item-count correction. The fix changes two Windows
`taskkill.exe` timeouts from five seconds to ten seconds. It does not change
receipt parsing, model selection, financial calculations or scan deadlines.

## Failure reproduced and correction verified

The interim full run recorded 1,080 passes and thirteen failures in
`tests/local-reader.test.ts` and `tests/local-vision.test.ts`. The failures
included cleanup after a successful read, cancellation, restart and removal of
owned descendant processes. They were preserved rather than skipped.

A standalone synthetic worker reproduces the five-second termination-command
timeout at 5,108 ms. A second probe with a ten-second command allowance returns
success at 6,612 ms. These probes explicitly clean up their owned fixtures;
they contain no receipts or model inference. The application keeps its existing
owned-PID tree termination and waits for process closure, with the existing
five-second close-acknowledgment check and failure behavior. No direct-child
fallback is added to the application by this patch.

Both existing cleanup paths now allow the command to finish on this host:
`createLocalModelReader` in `server/local-ocr.mjs:112` (timeout at line 168), and
`runPrivateProcess` in `server/private-process.mjs:28` (timeout at line 68).
The refreshed codebase graph and inspected source locate these functions.

All **35 focused process tests** pass with the new deadlines, followed by
**1,095/1,095** tests in the full suite, with zero failures or skips. Source
hashes remain unchanged during both runs. No local fixture workers remain in
the subsequent process check. Syntax checks, typechecking, formatting and the
graph check pass. These are synthetic process/protocol tests, not fresh OCR
accuracy or actual model-memory measurements. A ten-second allowance is bounded;
it cannot guarantee successful termination under every OS failure.

## Receipt results and pending phone verification

All 68 extraction-library files match the final item-count replay. Its two
removed false purchases and unchanged hybrid scores therefore remain the
current receipt evidence. No new recognition claims, replay scores, model
requests or external uploads are introduced here.

Every bound input of the passing count-summary frontend build is unchanged
except these two backend files. Its frontend bytes and phone test are retained.
The pending copied-price journey is rebound in
`qa-artifacts/copied-price-browser-v4`; it remains **unexecuted**. The final
resource check finds 2,050,224,128 available bytes against the unchanged
2,684,354,560-byte start floor. The medium-reader v14 source bindings remain
current. Browser/model memory requirements and inference/request limits are
unchanged; no user applications are closed.

The count-summary packet verifies all 1,210 declared files. The broader audit
checks 34,664 unique paths and retains only the same thirteen historical missing
declarations in the older area-reader, PDF-integration and refund-handling
packets. Those historical gaps are distinct from the thirteen now-fixed tests.

The stable branch remains `ee725ba`, and the original checkout remains
`29a187a` with the same dirty-diff hash. No upload, quota probe, paid activation,
push or merge occurs. The full twelve-phase goal remains active: the pending
phone check, larger-reader experiments and wider public-readiness limitations
are not resolved by a process-cleanup fix.

`windows-worker-cleanup-v1.json` binds the before/after sources, failing and
passing tests, both probes, resource/protection checks, unchanged frontend and
extraction evidence, and prepared phone plan. Artifacts are under
`qa-artifacts/windows-worker-stop-v1`; the frozen test runner accepts `focused`
or `full` and refuses to overwrite a prior controller result.
