# Sharing a receipt with an unreadable merchant

5 November 2026. Base checkpoint: `b55e155`.

A cropped receipt could contain checked financial information but still fail
confirmation because its merchant name was empty. Earlier saved-response UI
tests supplied a declared placeholder to proceed. A missing name should stay
missing rather than require invented metadata.

The merchant field is now optional. Its accessible hint explains when to leave
it blank. A populated unnamed receipt shows **Unnamed receipt**; its text export
says **Merchant not supplied**, without writing either fallback into the saved
receipt. Clearing a name still invalidates the previous receipt review. Missing
merchant information continues to trigger the existing independent local-reader
policy through `uncertain-source`, rather than a mandatory-name validation error.

Currency, source verification, financial arithmetic and assignments retain their
existing requirements. No schema, model, prompt, image, financial literal,
calculation algorithm, extraction scorer or provider default changes. This is a
review-workflow improvement, not better merchant recognition or receipt accuracy.
An omitted known merchant still scores as missing in extraction evaluation.

## Verification

Before implementation, the focused suite passed 49 of 53 cases; the four new
positive/fallback checks failed for the expected mandatory-name behavior. After
the change, all 53 pass, including the nine new regression cases. They cover raw
empty/whitespace preservation, exact 501/500-pence allocation, stale review,
explicit export fallback and the independent-reading signal. Five negative
controls retain blocks for missing total, inconsistent unit arithmetic,
unresolved currency, pending source review and unassigned items.

All **1,470 unit cases across 80 files** pass in six disjoint guarded batches,
with every file covered once and no failures or skips. Full strict TypeScript,
changed-file formatting and isolated compilation pass. The twelve compiled
artifacts retain six verified aliases for unchanged large assets; this is not a
complete deployment package. Source hashes remain unchanged throughout checks.

The first full-suite shard had 38 localhost `fetch failed` errors in the sandbox.
The same unchanged source then passes with permitted loopback access, using
mocked upstreams and an environment without provider credentials. The initial
focused run was held before launch for RAM; its later admitted run passes.
These failed/held attempts remain separate from passing results. Vitest's local
token cache is excluded from evidence reads, hashes and Git.

A three-width Chrome flow is prepared for 320, 390 and 1440px. It locally replays
the existing restaurant response, leaves merchant blank, checks review and a
temporary total discrepancy, adds the printed tax, splits IDR 48,000 equally,
downloads the explicit fallback and checks persistence. **It has not run:** the
45-second admission check observed at most 2,538,061,824 available bytes, below
the unchanged 2.5-GiB threshold. No server, browser, inference or upstream request
started. No current phone-screen, download or persistence browser pass is claimed.

The unit startup guard stays at 2 GiB and the runtime reserve at 1 GiB. Unit runs
observe a minimum 1,836,003,328 available bytes; type/build runs also remain above
the runtime floor. No user apps/tabs close, no key is read, no receipt is uploaded,
no credit is spent and no dependency is installed. Protected stable/original
states match. The existing operator preview stays on frozen `181a606`; use the
prepared VS Code local-reader task for current source.

Raw evidence: `qa-artifacts/optional-merchant-v1/` and
`qa-artifacts/optional-merchant-browser-v1/`. Machine checkpoint:
`advanced-optional-merchant-v1.json`. The next verification is the prepared browser
flow once memory qualifies; unchanged unit/type/build checks need no repetition.
The full twelve-phase goal remains active and incomplete.
