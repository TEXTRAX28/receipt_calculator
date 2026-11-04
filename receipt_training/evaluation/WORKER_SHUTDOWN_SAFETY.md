# OCR worker shutdown safety and regression validation

4 November 2026. All **1,300 unit tests**, 39 focused process-reader cases,
typecheck and the isolated frontend build pass. The original-fifty saved-reading
comparison is now scored and verified unchanged. The 22 collected browser cases
remain unexecuted after their RAM preflight. The twelve-phase goal stays active.

## Corrected worker ownership

The repository graph locates the persistent reader at
`server/local-ocr.mjs:L120` (`createLocalModelReader`) and its new safe-stop error
at `server/local-ocr.mjs:L62` (`stopFailed`). These locations were checked against
the current source before reporting them.

Previously the reader cleared its worker reference before confirming shutdown.
A second stop could consequently return while the first was still running.
After a failed stop, the instance could advertise itself as ready and accept a
replacement worker. An exit status could also bypass waiting for stream closure.

The reader now shares one pending shutdown operation and retains ownership until
closure. Starts wait for a pending stop. A failed stop blocks new scans, makes
the capability report unavailable, retains active input files, and exposes a
bounded error without paths or PIDs. Late output is ignored during shutdown or
after failure. A final file-cleanup failure also blocks the instance. Explicit
disposal can still attempt cleanup of its retained worker.

The reader waits for `close` even when an exit status has already arrived.
[Node's matching-version documentation](https://nodejs.org/download/release/v24.14.0/docs/api/child_process.html)
explains that streams can remain open after the exit event. This is a process
lifecycle repair; no OCR model, parser, financial amount or provider default is
changed.

Four new virtual-process cases in `tests/local-reader-shutdown.test.ts:L1`
cover failed termination, concurrent automatic/explicit shutdown, exit before
stream closure, and retaining an active job's inputs after unsafe cancellation.
Both process-launch exports are mocked; the virtual identifier cannot reach an
OS termination function. The exact frozen old reader fails all four cases;
the corrected reader passes all four. The earlier two-case failure is retained.

## Why the preceding diagnostic runs stalled

The earlier isolated launcher omitted several standard Windows OS variables.
A source-free Node protocol worker responded in 223 ms, but its termination
helper timed out and release failed after 15,269 ms. The worker was still alive;
the 40-second outer guard terminated the owned experiment. Closing the helper's
stdin and using ignored stdio did not repair it; both losing probes are retained.

Preserving a finite additional OS-variable allowlist makes the **unchanged old
reader** finish the same protocol: response at 258 ms, worker close at 1,167 ms,
release at 1,169 ms. Its guard records 2,006 ms for the whole process. The added
names are `COMSPEC`, `SYSTEMDRIVE`, `HOMEDRIVE`, `HOMEPATH`,
`NUMBER_OF_PROCESSORS`, `PROCESSOR_ARCHITECTURE`, `PROCESSOR_LEVEL`,
`PROCESSOR_REVISION` and `PROGRAMW6432`. Individual-variable causality was not
isolated. Only names, never their values, are recorded in the controller.

Provider credentials, proxy settings and arbitrary runtime injection variables
remain excluded. Environment files stay disabled. CPU startup/runtime floors
remain 1.5/1 GiB; the full-run deadline remains 240 seconds, individual tests
15 seconds, the termination helper ten seconds and close confirmation five
seconds. No timeout or memory threshold is increased to obtain a pass.

These are protocol and lifecycle timings. They do not measure real OCR speed
or receipt recognition accuracy. No OCR/VLM inference or receipt API request
occurs in this follow-up.

## Verification and retained evidence

The [evidence packet](worker-shutdown-safety-v1.json) preserves both diagnostic
failures and successful controls.

| Check | Actual result |
| --- | --- |
| Frozen old reader, final four safety cases | 0/4 pass; expected regressions reproduced |
| Corrected reader, same four cases | 4/4 pass |
| Existing process-reader/API cases plus new safety cases | 39/39 pass |
| Full current unit suite | 1,300/1,300 pass; zero failures/skips |
| Typecheck and isolated build | Pass |
| Saved original-fifty replay scoring and paired comparison | 400 views, 200 pairs verified |
| New browser run | 22 cases collected, zero executed |

The complete unit run takes 125,383 ms, starts with 2,046,885,888 available RAM
bytes and records a 1,678,303,232-byte minimum. Source hashes remain unchanged
throughout. Typecheck takes 18,306 ms; build takes 5,016 ms. The graph refresh
records 233 files, 905 nodes and 1,608 links, with no LLM extraction.

The original-fifty control uses the saved `grouped-amounts-v27` readings already
produced by the fee-tax checkpoint. All four count vectors reproduce the prior
checkpoint and remain unchanged, with no scored improvement or regression.
All normalized drafts, calculations, source mappings and review checks match
across the 200 pairs. All 362 shared input hashes match; no reference is edited.
The current receipt-library hashes still match the replay's frozen after-source.

The initial strict comparison omitted generated IDs belonging to removed
adjustments and the excluded Bristol footer purchase. Its two failed analysis
versions and a diagnostic listing the four affected ID paths are retained.
Final normalization changes only generated identities and their references,
plus the variant/timing bookkeeping. Controls verify that a changed line price,
calculated total or removed review checks still produces a difference.

No included-fee tax metadata is introduced into any of these automatic drafts.
All fifty transactions still require review, and original-fifty complete-receipt
accuracy remains unscorable under the partial references. The manual Western
Towing calculation remains 29.06 with its source amounts intact; this follow-up
does not make that invoice automatically extractable.

## Remaining browser and broader goal work

The prepared browser selection combines automatic local-reader, coupon-source
review and manual included-fee journeys in desktop Chrome and iPhone-size Chrome
emulation. It includes 320/390/1440px manual fee cases. Collection is not execution.
The 2.5 GiB startup guard refuses at 2,179,022,848 available bytes, before any
browser or preview is spawned. Its 1 GiB runtime floor and 300-second deadline
also remain unchanged. No new phone-layout, hardware-phone or Safari pass is
claimed. Use a fresh run tag only after a qualifying memory observation.

The stable branch and original checkout remain protected. Nothing is pushed,
merged or deployed. OpenAI stays the user's last resort; no key setup, credit
usage, private upload or billing change occurs. The original `.env.local` remains
untouched. The fifteen previously reported historical evidence declarations
remain explicit gaps; this checkpoint does not replace their missing bytes.

Genuine capture coverage, larger-model feasibility, complete financial references
and public authentication/TLS, multi-user budgets and durable crash cleanup
remain broader goal limitations. Passing software/protocol checks does not
establish those outcomes.
