# Preserve source-proposed included fee tax during comparison

4 November 2026, parent `3ede57b`, improvement branch only. The full goal remains
active. OpenAI remains the user's last resort and has not been used.

## Result and evidence boundary

The preceding [primary-reader repair](MIXED_INVOICE_SOURCE.md) proposes the
supplementary Western Towing invoice's printed carriage and VAT correctly.
The comparison stage could then discard the fee's included-tax rate: the vision
extraction schema supports fee amounts, but has no included-tax-rate property.
Even a constructed, otherwise correct vision draft therefore calculated 29.89
instead of printed 29.06 when merged with that source reading.

The merger now carries the existing primary-source rate as an **unconfirmed
proposal**. In the controlled before/after replay, calculated minor units change
2989 to 2906. Goods remain 16.32 and 3.75, carriage remains 4.98, full printed VAT
remains 4.84, and printed total remains 29.06. The existing money engine removes
the fee's embedded 0.83 VAT from the added VAT, giving 20.07 + 4.98 + 4.01 = 29.06.
No amount, financial role, allocation or entity identity is rewritten.

**This is a merger/protocol result, not a new vision-accuracy result.** The input
is the same actual saved 59-word Paddle reading plus an explicitly constructed,
schema-valid vision control. No model output is invented or substituted for the
resource-stopped native attempt. The case is familiar and supplementary, with
partial assistant-reviewed references, not a blind holdout or complete financial
truth denominator.

## Conservative source proposal

Graph node `proposeIncludedInvoiceFeeTax()` at
`src/lib/financial-roles.ts:L115`, community 12, locates the new helper.
`verifyIndependentReadings()` at `src/lib/verify-readings.ts:L170`, community 8,
integrates it. Both locations are checked against current source after the local
graph refresh; the graph contains 945 nodes, 1,662 links and 46 communities.

The helper only carries a rate already proposed by the primary invoice parser.
The caller requires source recovery to be enabled, no blocked scalar field,
an original explicit net item-price basis, and original vision subtotal, tax and
final-total agreement with the primary. Both receipts must have resolved equal
currencies, net item prices, printed-tax mode, no item-tax-code table, exactly one
tax adjustment, and matching monetary summary/complete adjustment sets. The
receiving draft must have no existing included-tax-rate annotation.

Each rate must belong to a source fee with actual source indices. Matching uses
the same amount and fee caption, stripping only the printed parenthetical
inclusive-VAT/tax qualifier. Missing, duplicated or different captions, extra
charges, conflicting rates/currencies, unknown basis, weak primary money or
blocked recovery cause abstention. The prior invoice parser still requires the
single complete source footer and its 0.90 financial-word floor. The separate
summary verifier's 0.98 floor and general verifier's 0.75 floor are unchanged.
The source parser's printed rate remains a proposal about its applicability;
neither a default country rate nor target-total fitting is introduced.

The comparison adds a pending adjustments check and retains earlier checks.
It attaches the fee, printed VAT/rate and basis source areas for review. The
agreement counter stays **11 before and after**; pending checks increase **2 to
3** in the constructed successful-vision control. Source recovery is not counted
as independent agreement. Included-rate differences also enter adjustment
comparison, so unsupported differences remain visible even when recovery refuses.
Viewing a source area changes no financial field or confirmation.

## Verification on the current source

- **1,325 application unit tests**, **198 focused cases**, typecheck, formatting
  check and isolated production build pass. Thirteen new merger cases cover the
  successful carry, preserved money/inputs/source checks and the refusal paths
  above, including allocation/identity preservation and existing conflicting rate.
- Four controlled views cover parent/current code and automatic/supplied GBP.
  The actual saved Paddle response and constructed vision input are identical
  before/after. Financial values and agreement count are preserved; the pending
  included-rate proposal accounts for the calculation change.
- Original-fifty regression replay has **400 views / 200 pairs**. All four scored
  count vectors and normalized facts, calculations, source links and checks are
  unchanged. All 362 shared input hashes reproduce. Its source-aware primary
  protocol is the same as parent `3ede57b`; no new protocol difference is added.
- Retained device replay has **106 views / 53 pairs**, covering fifty historical
  on-device readings and three public scans. All normalized outputs remain
  unchanged. Identity normalization preserves values, order, aliases and links;
  five retained controls reject changed amounts, source links and aliases.
- Three built Chrome phone-emulation cases pass: automatic comparison at 320px,
  always-compare at 390px, and simulated unavailable-vision fallback at 390px.
  They use the real prepared public invoice JPEG and saved actual Paddle response,
  with constructed vision success/HTTP-503 controls. There are two intercepted
  local POSTs per case, no retry, external request or fresh model HTTP call.
  Success controls retain three checks; primary fallback retains all eight.
  Initial confirmation is disabled, the included 20% proposal is visible,
  source viewing leaves the receipt unchanged, and automated review then reaches
  exact item-wise shares **14.54 / 14.52** without monetary edits or overflow.
  The 320px review image is visually inspected. These are not physical-phone,
  Safari, human-verification or new OCR-accuracy observations.

Test/build/browser guards bind the same 219 application/test source files. They
exclude live env loading and provider credentials. The final full unit run takes
60.149 seconds with minimum available RAM 2,578,743,296 bytes. Concurrent final
typecheck/build remain above the 1 GiB runtime floor. Browser startup is
2,945,376,256 bytes, runtime minimum 2,420,899,840 bytes, with a 6.785-second whole
controller observation; it is saved-response test timing, not model latency.

## Actual local vision attempt and retained failures

One actual selected **Qwen3-VL 4B Q4_K_M / pinned llama.cpp b11960** process is
started on the same prepared JPEG. Its request contains the image and existing
canonical row-first instructions/schema, no OCR/reference text or expected
money. The model/projection assets are verified by the existing native runner.
Context 8192, output 4000, side 1536, auto GPU, batch 256/ubatch 128, four threads,
temperature zero, seed 20261031 and canonical note/warning limits are unchanged.

The existing guard stops the owned process tree after 4.965 seconds when available
RAM falls from 2,647,683,072 to 865,271,808 bytes, below the 1 GiB runtime floor.
Native PID 62976 is verified absent; stdout is empty and no model-output JSON or
completed metadata exists. The single native warning does not identify the
memory cause. **No extraction, accuracy score or successful inference is claimed.**

One additional attempt is prepared after an apparent memory improvement, with a
higher empirical startup floor of 2,923,261,952 bytes: prior initial RAM plus the
observed deficit below the runtime floor plus 64 MiB. This is a trial guard, not
a published model requirement. Two preflights refuse at 2,501,083,136 and
2,826,338,304 bytes, without starting a child or creating the resumed native run.
There is only one actual native attempt and no retry loop. No user apps are closed.
The original 1.5 GiB CPU/native startup, 1 GiB runtime, 180-second native and
210-second outer deadlines remain; browser limits stay 2.5 GiB/1 GiB/300 seconds.
No limit is lowered.

The initial request preparation refuses a noncanonical schema before model
startup. Its corrected request matches the existing selected profile. The first
new positive regression fails before the implementation. A later assertion
incorrectly expects a printed-total review at the separate 0.98 summary floor;
it is corrected to check preservation of actual previous checks, without changing
any confidence threshold. Typecheck then catches the test's invalid `equal`
allocation enum; `equal-people` fixes it. All final results use that correction.
An offline analysis initially refuses to overwrite an existing result filename;
a new versioned output completes with unchanged inputs/scorer. All failures and
pre-format source bytes remain retained, rather than replacing passing evidence.

## Protection, reproduction and next action

`advanced-included-fee-merge-v1.json` binds current/archive source, constructed
inputs, actual saved raw reading, native failure/preflights, tests, replay,
phone evidence and this report. Local work is under
`qa-artifacts/mixed-invoice-vision-v1/`; original-fifty replay is v31 and final
device replay is `mixed-invoice-fee-merge-device-v2`. Its seal check reads retained
witnesses, not large model weights. Fifteen already-known historical evidence
gaps are unchanged; this is a targeted checkpoint, not a new full aggregate audit.

Stable `ee725ba45e799bee8501d3de034e0302c0127afd`, the original checkout at
`29a187af7347be94c0728f4785be674500833748`, its three dirty files and binary-diff
hash `72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b`
remain preserved. Application/test changes are two existing library files, the
existing real-OCR fixture's new constructed control, and one new 13-case test.
The root `HANDOFF.md` remains the user's saved earlier checkpoint, unchanged;
this report and the acceptance audit record the newer work. No chat is created
or paused, and no context-reset claim is made. No push, merge or deployment occurs.

There is no live `.env.local` access, API key setup, quota probe, new model
download, private external upload, provider request, OpenAI credit use or billing
change. API cost is zero; local compute cost is unmeasured. All previous cloud
test scopes remain consumed.

The next useful accuracy step is an actual independent local reading on this
same source when resources qualify, then additional genuine mixed-fee captures
kept separate from the original corpus. Broader capture/phone, complete financial
truth, current end-to-end latency and public-backend work remain in the
[acceptance audit](GOAL_ACCEPTANCE_AUDIT.md). Protocol controls do not close those
gaps, and human source review remains an intentional product requirement.
