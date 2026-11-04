# Gemini percentage-rate draft recovery

4 November 2026. This fixes draft intake; it does not improve the model's
recognition or coupon ownership. The full twelve-phase goal remains active.

## Change and limits

Previously, a completed Gemini response containing tax rates `20.00%` and
`0.00%` was rejected before an editable draft appeared. The Gemini-only draft
schema now preserves a bounded, literal percentage from 0–100, with at most six
decimal places. Numeric rates and the canonical provider request are unchanged.
Malformed/grouped rates, extra keys and invalid photo references remain rejected.
The local vision decoder retains its original strict numeric-rate contract.

The original percentage strings appear in the editable rate fields and source
comparison. A tax-rate source check explains the required decimal format.
Neither ticking the check nor supplying currency converts a rate or amount.
The existing financial engine still blocks applying these literals on a
tax-exclusive receipt. No price, quantity, coupon ownership or total is repaired
automatically. The receipt remains a draft until review and validation pass.

## Saved-response replay and phone workflow

The same previously approved two-crop response is replayed locally. Its SHA256
remains `6e0e89304f1ac3e68a2b12d425a90ff900a30125386825d4313d1ee91beacd40`.
The prior schema rejects exactly the two rate paths; the current server/client
decoders deliver all 22 proposed rows with their original monetary strings.
The canonical request JSON schema compares equal to its pre-change snapshot.
No live provider request, real key load, retry, billing activation or OpenAI call
occurs. The original live test's rejected outcome and consumed approval remain.

At an actual 390 × 844 browser viewport, the current compiled UI:

1. Imports the two redacted images and receives the saved response through a
   loopback backend with a dummy key and an explicitly stubbed transport.
2. Displays the original percentage literals and keeps confirmation disabled
   even after the source check is ticked.
3. Still reports a £7.88 discrepancy after only the two rates are manually
   changed to decimal form. The model's coupon errors remain.
4. Completes source-assisted review after four item-discount edits and removal
   of four erroneous coupon rows. All eighteen purchase descriptions, line
   prices, unit prices, quantities and tax codes match their original proposed
   purchase values; both real rotisserie-chicken purchases remain separate.
5. Balances £163.16 net + £13.62 VAT = £176.78, blocks unassigned sharing, and
   finalizes an equal whole-receipt split at £88.39 each for Alex and Sam.

This required **two manual rate-format edits, four manual discount edits and
four coupon-row removals**. It is an assisted workflow check, not an automatic
18-item extraction success or independent complete-financial accuracy score.
The crop references remain partial. No physical phone or new camera capture is
claimed. The page width stays 375px within the 390px viewport.

The preview reaches its six-minute deadline before cleanup, with minimum sampled
available RAM 1,378,541,568 bytes, above the 1 GiB stop floor. Its recorded process
is independently verified absent. The loaded client finishes review/splitting
after the backend stops. The viewport resets before the owned tab closes, and
the original user tab is preserved. **No graceful HTTP shutdown or completed
request transcript is claimed.** The timeout is retained, not hidden by the
successful client summary.

## Verification

- All **1,390 unit cases across 78 files** pass in six selected disjoint guarded
  runs. After updating one legacy expectation, four unrelated passing shards
  are carried forward: application modules, test helpers and their test files
  are byte-identical. The changed shard is rerun; the last shard runs once.
  The failed original assertion remains recorded. This is not a single-process
  full-suite pass.
- The standard full strict `tsc --noEmit` check passes in one process with a
  512 MiB heap after memory is recovered. Earlier admission, resource-limit and
  experimental partition-helper failures are retained and are not substituted
  for this full check.
- Current isolated compilation, formatting of all four changed files and local
  graph refresh/check pass on the final 225-file source snapshot.
- CPU-only checks use an explicit smaller heap profile with a 1 GiB runtime
  reserve; native OCR/model safeguards are unchanged. Two inactive Chrome tabs
  are closed under the user's existing cleanup authorization after checking for
  drafts; current work tabs, the API-key tab and other apps are preserved.

Evidence is in `qa-artifacts/gemini-percent-rate-v1/`; the integrity packet is
`advanced-gemini-percent-rate-recovery-v1.json`. Provider defaults and protected
checkouts remain unchanged. Remaining work includes coupon-reading accuracy,
broader selected-provider evaluation, genuine capture, physical-device checks
and public-release requirements.
