# Persistent Gemini request allowance

3 November 2026. Implemented on the improvement branch after `b3986ec`.
No live settings, provider requests, receipt uploads or billing were changed.

## Behavior

Gemini now requires a server-held key and an explicit finite operator allowance.
`GEMINI_ALLOWANCE_ID` identifies a grant, `GEMINI_REQUEST_LIMIT` sets 1–100
requests, and optional `GEMINI_ALLOWANCE_DIRECTORY` selects persistent storage.
Defaults are blank/zero, so existing key-only installations need an allowance
before scanning. [Setup instructions](../../README.md#optional-gemini-setup).
The user's exhausted Free quota was not replenished or enabled.

The existing exclusive-file slot ledger reserves one slot for an entire
multi-photo request after consent and all JPEG validation, immediately before
Google I/O. Failed, cancelled, timed-out and unknown outcomes remain consumed.
Restarting the handler or changing its key/model does not replenish the grant.
No automatic retry, daily reset or HTTP endpoint to change the grant exists.
Slots retain random request identity, time and state, not keys/images/OCR.

This is a local operator cap, not Google's remaining Free quota, a financial
billing cap or public multi-user authentication. Instances/checkouts need the
same directory/grant to share it. An operator with filesystem/configuration
access can deliberately change the cap; deletion, directory changes or new
grant IDs must not be used to bypass consumed approvals. Research harnesses
retain their own separately approved one-attempt protocols; this change guards
the application's HTTP path, not every possible direct SDK call.

The UI reports local availability and remaining scans, refreshes after each
attempt, clears consent and preserves photos on quota failure. Users can choose
the on-device reader without resubmitting to Google. Setup edits an existing
`.env.local` rather than instructing users to overwrite its other settings.

## Storage failure found and fixed

The first focused run had 72/73 passes. Windows returned `ENOENT` when a file
occupied the configured storage directory. The existing ledger treated that as
a missing directory with unused slots. Reservation already refused before any
provider call, but status incorrectly advertised availability.

The shared ledger now checks the closest existing ancestor on `ENOENT`. A file
or unreadable ancestor makes storage unavailable; a missing directory below a
valid folder remains configurable. Status does not create directories or
consume slots. Azure and Veryfi use the same corrected status logic.

## Validation

- 124 focused unit/API tests pass, including Gemini, Azure and Veryfi coverage.
- All 1,053 unit tests pass using the same test-file glob, with environment-file
  loading disabled in the test runner. The only later application edit was
  setup/status wording in `App.tsx`; the production build and browser run cover
  that final text. No unit test imports `App.tsx`.
- Production build/typecheck pass. Input hashes are unchanged during the build.
- All 27 selected browser cases pass without retries or skips: nine scenarios
  each in Chrome desktop, Chrome phone emulation and host WebKit phone emulation.
  These cover actual loopback HTTP with injected synthetic provider responses,
  consent/source checks, disabled key-only setup, quota-photo recovery, grouped
  amount rejection, and the previously pending Azure quantity journey.
- Azure's literal quantity `2` reaches review with its source rectangle, remains
  blocking until checked, and then permits an exact £2.50/£2.50 split. This does
  not establish actual Azure image-reading accuracy or physical iPhone behavior.
- Formatting, graph freshness and diff checks pass. Historical UK and Azure
  evidence packets still verify using exact archived source bytes where needed.

Two earlier Azure-only browser starts remain recorded as refusals, with zero
spawned processes. The final run started at 2,998,390,784 bytes available RAM,
above the unchanged 2,684,354,560-byte guard. Available RAM stayed at least
1,958,883,328 bytes, above the 1 GiB runtime floor. Its elapsed time was 65.53
seconds. The observer reported a sampled owned-process peak of 1,476,038,656
bytes but reached its 128-process observation cap: this is incomplete resource
evidence, not a phone or model RAM requirement. All observed process identities
had exited afterward; unobserved processes remain outside that check.

## Accuracy and outstanding work

No model, prompt, output schema, JPEG preparation, receipt interpretation or
financial calculation was changed. The Gemini extraction function and the
`receiptFromAi` conversion body are byte-identical to the parent. No new
original-fifty inference or field replay was run; its existing field evidence
is not a new accuracy result for this change. The user still needs a stronger
reader comparison and physical-device/public-service validation.

The frozen Gemini two-image v2 trial is now stale and remains unapproved/unrun.
A future trial needs a new preserved preparation and explicit approval after
quota becomes available; there is no scheduled retry. Its old crop description
also overstated removal of currency context and has an explicit correction.

The larger local browser comparison is rebound to
`browser-paddle-medium-paired-plan-v9`. Only the `src/lib/gemini.ts` input hash
changes from v8; models, image bytes, parameters, scoring, timing and guards
are identical. This is preparation only, with zero new inference. The 8B disk
and memory limits remain unchanged.

## Evidence

`qa-artifacts/gemini-allowance-v1` retains the pre-change plan/source, initial
storage failure, focused/full tests, process exit check and model-plan refresh.
`qa-artifacts/gemini-allowance-build-v1` binds final build inputs and outputs.
`qa-artifacts/gemini-allowance-browser-v1` retains its plan, controller, all
27 results and logs; screenshots have unique per-test artifact directories.
The packet `advanced-gemini-request-allowance-v1.json` binds these exact bytes.
The stable baseline and original checkout's pre-existing dirty changes remain
protected. The full goal is active; no merge, push or deployment occurred.
