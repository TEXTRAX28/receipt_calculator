# Native OCR temporary-job recovery

5 November 2026. This implements recovery for newly marked persistent native
OCR jobs. It does not change OCR, parsing, financial validation or splitting.
The twelve-phase objective remains active.

## Failure and resulting behavior

The previous original-photo memory-stop test killed its owned process tree
before JavaScript cleanup could finish. Two normalized JPEG job copies remained;
their hashes were verified and they were removed manually from that test's
runtime directory. Ordinary cancellation/error cleanup already existed, but a
process kill cannot execute its finally block.

New native jobs record a versioned, bounded owner file before writing images.
It contains the random job name, app PID, worker PID, input count and timestamp;
no image, OCR text, financial values or keys. Before the next native worker
starts, recovery examines at most 128 runtime entries and removes at most 16
recognized abandoned jobs. It only removes a job if both owners are confirmed
absent, then checks again immediately before deletion. Signal-zero probes check
existence without termination, as documented by [Node.js](https://nodejs.org/api/process.html#processkillpid-signal).
Permission errors, unknown process status and reused/live PIDs retain the job.

The owner record is read through a bounded 1,025-byte buffer; unsupported,
unreadable, malformed or mismatched records do not authorize deletion. Only
direct real scan directories under the canonical runtime root qualify. Job
junctions/symlinks, linked or oversized input files, nested directories and
unknown contents remain. A recognized job may contain only its owner file and
up to its declared 24 numbered JPEGs, each bounded to six MiB. Deletion failure
stops startup instead of claiming cleanup. Existing normal cleanup also now
rejects an indirect job path. These checks use standard filesystem operations;
they are not race-free protection against a malicious writer with the same OS
account. The runtime directory must remain service-owned and private.

## Scope and limits

Recovery occurs on a later explicit native scan, not while the application is
stopped. It never kills a recorded PID, removes a job solely because of age,
retries an extraction or sends images to a cloud provider. Older unmarked jobs
and experimental local-vision jobs remain for operator review. Unknown entries
can consume the bounded inspection budget; cleanup is not guaranteed across an
arbitrarily modified runtime directory. Empty directories left before a marker
is complete are also not automatically erased. Public-service authentication,
isolation, storage ACLs and retention operations still require deployment work.

## Executed validation

- 18 new recovery cases join the existing suite: all 1,457 cases across 80 files
  pass in six disjoint guarded batches, with no skips/failures. The five directly
  affected OCR/vision files also pass 94 focused cases.
- A real test-owned Node process writes a marked synthetic job and exits. A
  separate owned worker stays alive: recovery retains the job. After that worker
  closes, the next ordinary reader startup reaps it before launching its protocol
  worker, processes a new synthetic input and leaves an empty runtime directory.
  No unrelated process is terminated.
- Additional controls cover unknown/live owners, late process-state changes,
  malformed/mismatched versions and PIDs, legacy data, junctions, unknown/nested
  contents, bounded work and cancellation. Existing memory/shutdown controls
  still retain inputs when worker closure cannot be confirmed.
- TypeScript initially rejected an incomplete helper parameter annotation. Its
  correction changes only two JSDoc lines; removing those exact lines reproduces
  the full-suite module bytes, and all other executable/test/config bytes stay
  identical. The final complete strict TypeScript check passes. Failed checks
  remain in the evidence packet.
- A separately prepared actual Paddle smoke uses the non-private checkerboard
  transport JPEG. Its three-GiB outer startup admission was not met (maximum
  3,053,334,528 bytes); it started no child and made no inference. It is not
  described as a pass. The prior successful original-photo phone flow remains
  historical evidence for revision 47220b2.

No private receipt, real cloud credential, external upload, credit spend,
dependency installation or model download was used for this change. Memory
admission/runtime limits were not lowered. New recovery functions live in
server/receipt-jobs.mjs; server/local-ocr.mjs integrates them and keeps the
existing cleanup export for local vision.

Evidence: `advanced-native-job-recovery-v1.json` and ignored raw packets under
`qa-artifacts/native-job-recovery-v1/`. The earlier original-photo memory stop
and successful higher-headroom run remain separate historical records.

## Later actual-worker compatibility check, 5 November 2026

With more available RAM, the v4 sandboxed checkerboard attempt started and
completed transport, marker verification and per-job cleanup in 8.773 seconds.
Its later disposal could not confirm stream/process closure, so the overall
attempt failed. A read-only query scoped to that unique runtime subsequently
found zero matching workers; no unrelated process was stopped. This failure is
retained, rather than relabelled as success.

A separate v5 normal-context check on the same backend and non-private 8x8 JPEG
then passes. It makes one actual cached Paddle call, verifies the marker before
the worker request, leaves zero temporary jobs and confirms the owned worker's
exit/close events. Extraction/transport takes 5.849 seconds; the full controller
takes 6.833 seconds. Worker exit code 1 follows intentional termination, while the
Node check/controller exit 0. Initial/minimum sampled available RAM are
3,360,190,464 / 3,160,096,768 bytes. The three-GiB startup and one-GiB runtime
guards are unchanged. All provider credentials are excluded, with no cloud
request, model download or private photograph read.

This checks actual native protocol/ownership/cleanup compatibility. The fixture
contains no receipt text, so zero returned words establish no recognition score.
It does not replace the real owned-process orphan recovery tests or prove a
race-free OS sandbox. Raw failed/successful evidence is under
qa-artifacts/native-job-recovery-native-v4/ and native-job-recovery-native-v5/;
the current printed-tax checkpoint includes their hashes.
