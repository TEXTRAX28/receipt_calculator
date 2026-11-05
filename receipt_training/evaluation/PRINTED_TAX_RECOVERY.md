# Explicit printed-tax recovery

5 November 2026. Based on feature commit `7c93ab2`; this change is confined
to the review UI, six browser regression cases and documentation. Receipt
extraction, provider prompts, financial algorithms, currencies and splitting
rules are unchanged. OpenAI stays the user's last resort with its existing
default-disabled allowance; every private upload/spend scope remains consumed.

## User-visible change

For prices confirmed to exclude tax, choose **Printed tax amount** and press
**Add printed tax**. The action copies the unchanged optional printed-tax field
into one ordinary proportional tax adjustment, then disappears. No code/rate is
invented and no existing tax row is overwritten. Signed refund amounts remain
signed. Empty printed tax, tax-inclusive pricing, code mode or an existing tax
adjustment hide the action; the existing thirty-adjustment limit disables it.
Malformed money remains subject to the existing validation. Receipt confirmation
and source review are not performed by this action.

The selector labels are now **Printed tax amount** and **Item tax codes**.
Visual inspection found the former long label clipped at 320px; the final label
is readable at that width. Existing button styling and keyboard activation are
used, without dependency or CSS changes.

## Saved-response phone recovery

The familiar six-crop OpenAI restaurant response has a 43,636 IDR purchase,
printed tax 4,364, printed total 48,000 and an empty tax-code name with rate 10.00.
The original app correctly blocks its code-mode configuration. The source crop
and frozen partial reference are unchanged; the malformed code is not renamed.

The unchanged-app baseline completes correction at 320/390px by choosing printed
mode and manually adding/retyping the 4,364 tax row. In the new compiled UI,
choosing printed mode and pressing **Add printed tax** reaches the same result
without retyping a financial number: 43,636 + 4,364 = 48,000. Every purchase and printed
monetary field stays exactly as returned. Explicit review and ordinary people/
assignment controls finalize two 24,000 IDR shares, displayed as Rp 24,000.00 each.
There is no document overflow at either measured width.

The test supplies IDR and a clearly declared missing-merchant placeholder, opens
the original crop, and simulates source review. It replays the literal saved
model response through local HTTP routes. This proves UI recovery, not new OCR,
automatic currency/merchant detection, independent human truth, whole-receipt
accuracy or physical Android/iPhone/Safari compatibility. It sends no receipt to
a provider and reads no real key.

## Executed validation

- All 1,457 unit cases across 80 files pass through six disjoint guarded batches,
  each file covered once with no skips/failures. After that pass, only the two
  selector option elements change. Restoring those two elements reproduces the
  exact full-unit App bytes; all other 238 source/config files stay identical.
- Final complete strict TypeScript, changed-code formatting and isolated Vite
  compilation pass on the final source. The compilation disables env files and
  omits public assets; it is a local QA artifact, not a deployment package.
- Eleven final browser cases pass: six new positive/refund action cases and
  three existing mixed-fee correction/final-split cases at 320/390/1440px, plus
  the two saved-response phone flows. They cover keyboard activation, source
  amount preservation, persistence/reload, tax-inclusion toggling, changed
  printed-tax checks, duplicate prevention, exact totals and layout.
- The earlier two-case manual baseline and eleven-case first action build pass
  separately. A final-label formatting check initially fails; Prettier fixes
  the option layout and the fresh final check passes. Historical runs are not
  replaced by their follow-ups.
- The actual native compatibility follow-up passes with the unchanged cached
  backend, as documented in [native job recovery](NATIVE_JOB_RECOVERY.md). The
  preceding sandboxed disposal failure and resource-held runs remain separate.

No API request, credit spend, original-photo modification, dependency/model
installation or user-app/tab termination was required. All temporary test
servers/browsers/workers closed; the stable branch and original worktree/diff
remain protected. Wider representative recognition, genuine camera/device
coverage and public-service requirements remain incomplete.

Evidence: advanced-printed-tax-action-v1.json; ignored packets under
qa-artifacts/printed-tax-action-v1/, printed-tax-action-final-check-v1/ and
openai-tax-phone-v1/v2/v3/. These packets retain exact sources, inputs, compiled
artifacts, controller outcomes, DOM-state observations and screenshots.

## Current local preview follow-up

A separate loopback preview now serves the committed `181a606` UI with the real
cached computer reader. It loads no environment file or provider credential;
cloud readers and experimental local vision are disabled. Preview logs contain
request metadata, without receipt contents; normal native temporary-file handling
still applies. The original 4173 address had
no listener when checked and was not replaced. The current preview's URL and
process identity are recorded in ignored `qa-artifacts/local-review-181a606-v1/ready.json`;
recheck liveness before reusing that address.

One actual upload-to-final-split control passes in a 390px Chrome context using
the existing non-private synthetic PNG: two purchase rows, quantities 2 and 1,
line prices 2.50 and 3.50, printed total GBP 6.00 and two GBP 3.00 shares. GBP is
selected before scanning and source review is simulated; no financial amount
is edited. The production HTTP API and cached Paddle engine respond directly,
without mocked extraction responses or cloud requests. This is an engineering
fixture, not representative receipt accuracy or a physical-phone test.

The test browser closes, while the user review preview intentionally remains
running. A later scoped process check finds no native Python worker after its
idle timeout, and the runtime has zero temporary jobs. The initial process query
also matched its own diagnostic shell; the corrected name-filtered check is the
authoritative idle observation. Runtime availability is an observation, not a
permanent service guarantee. The existing one-GiB memory reserve remains active.
`advanced-local-review-preview-v1.json` records this follow-up separately.
