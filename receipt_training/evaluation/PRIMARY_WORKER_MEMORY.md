# Persistent OCR memory admission and owned shutdown

4 November 2026. Parent `d21771eab172923ecdd426d5d457fcd33178751e`.
The full twelve-phase goal remains active. OpenAI remains the user's last resort;
no OpenAI request, credential setup or credit spending occurs.

## Result

The persistent Paddle/docTR bridge now requires **1.5 GiB available RAM** before
runtime setup, immediately before launching its worker and after readiness before
private job files. It requires **1 GiB** before writing/sending inputs and accepting
a result, and polls that runtime reserve every **250 ms** while loading, reading
or idle. Invalid, fractional, non-finite or throwing probes fail closed. The
probe defaults to the real OS reading; its injection exists for controlled tests,
with no HTTP/environment threshold override.

Low memory returns a fixed 503 with the existing reader fallback. An idle worker
is released; later explicit scans can start a new worker after admission succeeds.
An active failure waits for owned shutdown before removing its inputs. Failed
termination blocks subsequent scans and retains those inputs. Existing Windows
termination allows up to ten seconds for taskkill and five seconds for stream
closure; this is not a five-second bound on the whole termination operation.
No user app or unrelated process is closed. There is no automatic cloud fallback.

These are conservative operating policies, not published model requirements,
memory reservations or OS quotas. Global polling cannot prevent every transient
allocation or another application's memory use. The new memory error can refuse
a previously attempted scan under pressure; that refusal is intentional.

The current graph places `createLocalModelReader()` at
`server/local-ocr.mjs:L123`, `removeOwnedJob()` at `server/local-ocr.mjs:L103` and
`workerEnvironment()` at `server/local-ocr.mjs:L75`, all community 6. Their source
was verified before editing. The refreshed local graph is current with 930 nodes
and 1,650 links; the old root handoff is preserved in the frozen worktree rather
than copied into this index.

## Verification

- **1,362 cases / 75 files / zero failed or pending**, through six sequential,
  disjoint Vitest shards. Exact discovered files and assertion-name multiplicities
  match the frozen plan, including 23 added cases. This is full suite coverage
  through bounded runs, not a successful single-process full-suite invocation.
- Twenty-two virtual memory controls cover admission, model/private-input
  rechecks, exact boundaries, active/loading/idle pressure, invalid probes,
  monitor removal, recovery and unsafe shutdown. A further real local-HTTP case
  verifies 503 without starting a worker, writing photos or calling a provider.
  Existing protocol tests use an explicit deterministic probe; they do not claim
  real OS pressure. All are included in the final full-suite result.
- A real owned Node worker and its descendant are alive before a constructed
  failing probe, then both absent after the production bridge returns 503. Its
  owned job directory is empty. This uses no OCR model and does not exhaust real
  memory. The control completes in 688 ms; the outer controller observes 1,002 ms.
- **One actual installed Paddle invocation** on the unchanged public invoice JPEG
  produces 59 words. Words, confidence values, boxes, lines and dimensions exactly
  match the saved actual reading. Whole panel objects differ only in legacy
  zero-based benchmark identifiers/manifest hash versus production photo/part
  fields. The unnormalized `false` comparison remains in the raw summary; the
  separate content comparison makes the scope explicit.
- That one scan takes 18,574 ms including startup, bridge work, output storage and
  worker release, not isolated inference latency. The outer observation is
  19,301 ms, with minimum available RAM **1,681,399,808 bytes**. The worker closes,
  no job remains and the original JPEG is unchanged. All five exact native/control
  PIDs are subsequently verified absent. No cohort mean/p95 or new accuracy score
  is inferred from this sample.
- Full typecheck passes with the same complete project settings and a 512 MiB V8
  heap cap. Formatting, isolated build and graph refresh/check pass. All thirteen
  retained frontend artifacts are byte-identical to the preceding phone-tested
  package after its explicit unchanged favicon copy. No new browser/device run
  is claimed: the current 2,564,628,480 available bytes fail the unchanged 2.5 GiB
  browser admission; the 4 GiB 8B memory requirement is also unmet.

The first typecheck found a test-table inference issue; explicit table types
fix it. An initial shard's public-file control failed because shared dependencies
live behind a Windows junction. Resolving the fixture root before giving it to
Vite fixes that setup mismatch; every private-file denial assertion remains.
The entire suite is rerun on the final source. Failed/intermediate outputs remain
local and are distinct from accepted verification.

## Git, files and continuation

The implementation is on `feature/advanced-ocr-vision-ai` in:

`C:\Users\natan\.codex\worktrees\primary-worker-memory\costco_calc`

Only `server/local-ocr.mjs` changes application behavior. Existing tests changed
are `tests/local-reader.test.ts`, `tests/local-reader-shutdown.test.ts` and
`tests/private-paths.test.ts`; `tests/local-reader-memory.test.ts` is added.
The other 216 baseline application/test files remain identical. No finance,
parser, model, provider, prompt, UI or memory override is introduced.

The frozen comparison worktree remains detached at `d21771e...` in:

`C:\Users\natan\.codex\worktrees\receipt-ocr-baseline\costco_calc`

Its running app, 84 prepared Gemini source files and original `HANDOFF.md` remain
unchanged. Private configuration is not read, copied or moved. The stable branch
stays `ee725ba45e799bee8501d3de034e0302c0127afd`; the original checkout stays
`29a187af7347be94c0728f4785be674500833748` with its three-file diff preserved.
There is no merge, push or deployment.
Private datasets, installed model environments/cache and historical QA evidence
also remain in that frozen worktree. New local benchmarks must use their explicit
read-only source/cache paths and a runtime directory in the improvement worktree;
their absence from the new checkout is not loss of the original data.

The already-pending Gemini question remains pending. Only fresh explicit approval
of one two-crop Gemini 3.5 Flash-Lite attempt plus confirmation of one remaining
Free request permits execution. Its plan SHA is
`28122e14e4fc5609d0f9015ad6c86873bc83c55b2d772704babe5f3dbaa544db`.
Execute that scope only from the frozen comparison worktree, after the prepared
proof passes and before a trusted backend key loader is invoked. An approved-live
controller must honestly allow that one backend credential load; the offline
guard's no-env/no-credential metadata must not be reused for it. No request or key
load has occurred and `run/` does not exist. Earlier provider scopes and the
selected-4B invoice resume allowance stay consumed. Do not repeat them.

Continue in this chat. The old handoff is a preserved earlier checkpoint; this
report and the updated goal audit describe the later state. No context reset,
new chat, pause or completion is requested. Next work is the approved Free
comparison if consent/quota arrives, otherwise the remaining local capture,
financial-source coverage and public-readiness work. The memory safeguard closes
that specific primary-worker gap, not the full goal.

Machine evidence: `advanced-primary-worker-memory-v1.json` and
`qa-artifacts/primary-worker-memory-v1/`. Check with
`python -X utf8 qa-artifacts/primary-worker-memory-v1/seal.py --check`.
