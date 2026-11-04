# Memory-aware local vision launch and shutdown

4 November 2026, parent 38bb0cd, improvement branch only. The full OCR improvement
goal remains active. OpenAI remains the user's last resort and has not been used.

## Implemented result

The real selected-Qwen attempt previously crossed the 1 GiB RAM floor without a
draft. The application bounded time/output but had no equivalent free-memory
admission or runtime monitor. It now refuses an extra vision check before
creating receipt inputs when system memory is insufficient, preserving the
primary reading and mandatory source review through the existing fallback.
There is no automatic retry or cloud fallback.

The selected 4B profile requires 3 GiB available before private inputs and again
immediately before native startup. Image/asset validation workers require
1.5 GiB at startup. Every owned subprocess has a 1 GiB runtime floor, sampled
every 250 ms. Invalid or throwing memory probes fail closed with a fixed 503
message. These are conservative operating policies, not published model minimums
or calibrated guarantees that a scan will fit. Model/prompt/decoder settings,
financial thresholds, providers and request permissions remain unchanged.

Termination still targets only its owned process tree and waits for stream
closure. A further reproduced bug let a process report exit before its streams
closed, leaving cancellation waiting indefinitely. The fix avoids signalling a
possibly reused PID while applying the existing five-second closure deadline.
Unconfirmed closure disables that reader and retains active inputs; it never
declares those files safe to remove. The new virtual control proves this case
fails before the repair and passes afterward without an OS termination call.

Current graph/source locations, all in community 5: requireAvailableMemory() at
server/private-process.mjs:L24; runPrivateProcess() at
server/private-process.mjs:L42; createLocalVisionReader() at
server/local-vision.mjs:L76. The refreshed graph has 952 nodes and 1,671 links.

## Current-source verification

All **1,339 unit cases across 74 files** pass through **six disjoint Vitest
shards**, using the unchanged whole-suite config, assertions, per-case timeout
and one worker. Exact file coverage and each test-name multiplicity match the
frozen discovery/reference list; there are no failed or pending cases. This is
whole-suite coverage through bounded runs, not a successful single-process run.
All **35 focused cases** also pass. Fourteen new tests cover memory admission,
invalid probes, exact startup/runtime boundaries, validation/model rechecks,
runtime stopping, explicit later retry, poll cleanup, retained files and disabled
readers after failed shutdown, the exit-before-close case, actual owned Node
descendant termination, and HTTP refusal without a cloud request.

Current typecheck passes with a fixed 512 MiB V8 heap cap and the same complete
project config/noEmit check; no semantic checking option is relaxed. Its guarded
observation is 9.524 seconds, minimum available RAM 1,913,311,232 bytes. Formatting,
graph refresh/check and an isolated frontend bundle build pass on the same
220 application/test source files. The build omits copying unchanged large
browser OCR/PDF assets because these JPEG/HTTP controls do not use them; the
favicon is copied. A V8 heap cap is not a hard RSS limit or OS sandbox.

The initial low-memory regression resolves instead of refusing a request. An
intermediate 1,337-case version passes before CPU-floor tightening and the
stream-closure repair. The attempted parallel compiler/focused rerun then crosses
the unchanged runtime floor. A sequential single-process 1,338-case attempt is
also stopped at 125.885 seconds, with minimum RAM 1,043,881,984 bytes; it is not a
test pass or a deadline extension. Available RAM briefly falls to 539,578,368
bytes after all owned jobs stop. Sequential disjoint runs complete verification
without changing assertions or lowering any guard. Both the intermediate 1,338
coverage and final 1,339 coverage remain separately retained. All pre-format and
superseded evidence-bound source bytes are archived before replacement.

## HTTP and phone evidence

The first built Chrome phone-emulation flows pass at **320px and 390px**, using
the real prepared public Western Towing JPEG and saved actual 59-word Paddle
reading. Only the primary response is intercepted; provider discovery and vision
extraction use the real loopback API and actual OS memory probe. Recorded memory
is 2,402,304,000 / 2,358,083,584 bytes. Both vision calls return 503 before creating
private inputs or starting any native process. Installed-asset status is a
protocol fixture, not proof of an installed/successful model.

Both flows retain all eight pending primary checks, source viewing without
mutation and unchanged monetary values. Automated confirmations then reach
exact item-wise shares **14.54 / 14.52** without horizontal overflow or extra
POSTs. The 320px review is visually inspected. These observations precede the
final worker-floor/stream-closure changes; they are not silently relabelled as
current-source browser runs.

The final browser preflight refuses at 2,398,220,288 bytes, below the unchanged
2.5 GiB startup floor, without starting a browser. A current-source real HTTP
control then records 2,373,459,968 bytes from the OS probe and the identical 503
error contract, with zero native starts, external requests or private input
directory. The API router and **all 13 frontend artifacts, including HTML and
favicon, are byte-identical** to the tested phone build. This provides explicit
artifact/response continuity; it does not claim a fresh final browser, physical
phone, Safari or independent human source verification. Browser limits remain
2.5 GiB startup / 1 GiB runtime / 300 seconds.

The 71 parser/frontend library files also exactly match the preceding original-
fifty and retained-device replay sources (400/106 views, 200/53 pairs). Their
results remain applicable to unchanged interpretation code; no fresh replay or
new recognition accuracy is claimed. There is no new Qwen extraction on the
mixed-tax source and no new receipt-model inference in this checkpoint.

## Reproduction, protection and next work

Local work is under qa-artifacts/vision-memory-limits-v1. Final whole-suite
coverage is unit-shard-coverage-v2.json, with its frozen 74-file/case manifest;
focused-final-v3.json, typecheck-capped-final-v2-controller.json, build-final-
controller.json and http-os-memory-final.json bind the current source. Earlier
failed, intermediate, pending and phone records retain their original scope.
advanced-local-vision-memory-v1.json records the checkpoint bindings; its check
does not read large model caches. Fifteen already-known historical evidence
gaps remain; this is not a new full aggregate integrity audit.

Stable ee725ba45e799bee8501d3de034e0302c0127afd and the original checkout at
29a187af7347be94c0728f4785be674500833748 remain preserved, including its three
dirty files and binary-diff hash
72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b.
Root HANDOFF.md is unchanged. Only two existing backend modules, one existing
test file and one new test file change in application/test source. There is no
live env-file access, key setup, model download, provider request, private
external upload, OpenAI spend, user-app closure, push, merge, deployment or chat
reset. API cost is zero; local compute cost remains unmeasured.

The guard covers local vision and its validation subprocesses. The persistent
primary OCR worker's memory policy remains separate work. Global free-memory
polling cannot replace OS process quotas, authenticated public job/tenant
budgets, durable cleanup or deployment/privacy review. A fresh final headless
run remains held, and physical camera/Safari plus current whole-pipeline native
latency remain open. Continue source-grounded accuracy work and investigate a
practical lower-memory verifier profile with frozen benchmarks; do not lower
the selected profile's guards merely to force another launch. Broader remaining
requirements are in the [acceptance audit](GOAL_ACCEPTANCE_AUDIT.md).
