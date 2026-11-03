# Source-supported invalid prices despite a name disagreement

3 November 2026. Improvement parent: `56027ca`.

On the unchanged original-fifty replay, the local hybrid recovers one additional
known line price with currency supplied: **133/143 to 134/143**. Automatic-currency
results stay at 116/143. No scored field regresses. This is a small interpretation
improvement to the selected local combination, not a new recognition model or a
claim that the remaining financial failures are solved.

## Failure and bounded change

In familiar development receipt `cord-v2-train-011`, independent vision proposes
`1 Nila Bakar/Boreng`, quantity `1`, and invalid canonical amount `27.500`.
The primary reader supplies `1 Nila Bakar/Goreng 27,500`. Its uniquely matched
purchase and clear price token support a proposed line amount of `27500`.
Previously the name's one-letter disagreement prevented that proposal.

The existing name-similarity threshold and unique order-preserving alignment
are unchanged. A nonidentical name can now support a line-price proposal only
when all of these conditions hold:

- A purchased quantity is explicitly present in the parsed source quantity or
  its leading printed quantity and agrees with the independent vision quantity.
- The vision line price is invalid for the resolved, matching currency. A valid
  conflicting amount and an absent amount remain untouched.
- The existing source-row, photo, sign, monetary-word confidence and unit-only
  column checks succeed. No confidence threshold is lowered.
- The invalid model string has complete three-digit groups and matches the
  source token's digits, signs and group boundaries. Comma versus dot is the
  only permitted token difference.

Only the line price is proposed. The name, quantity, unit price, coupons,
financial roles and original model response remain unchanged. Unit-price and
reduced-selling-price recovery keep their exact-name requirements. No subtotal,
final total or balancing sum selects a candidate. The previous amount and actual
source indices remain attached, with an unconfirmed review check; this is not
independent price agreement or automatic financial acceptance.

Graph navigation and source inspection locate the change in
`src/lib/verify-readings.ts:165` (`verifyIndependentReadings`), with the additional
quantity gate at line 449 and token check at line 566. Existing
`src/lib/recover-invalid-price.ts:18` continues to enforce invalid-value and
source-word requirements without modification.

## Measurement

The protocol freezes all 68 current library files before the change. The same
fifty original receipts, retained model observations, 38/12 development/evaluation
split, v5 references, matcher and scorer produce 400 paired views: two readers,
two currency modes, before and after. No image, annotation or model output is
edited. These are familiar cases inspected during development, not a blind test.

| Hybrid field                      |     Before |      After |
| --------------------------------- | ---------: | ---------: |
| Line prices, supplied currency    |    133/143 |    134/143 |
| Line prices, automatic currency   |    116/143 |    116/143 |
| Quantities                        |    119/120 |    119/120 |
| Unit prices, supplied currency    |      26/31 |      26/31 |
| Printed totals, supplied currency |      41/49 |      41/49 |
| Price basis, supplied currency    |        6/9 |        6/9 |
| Trusted reconciliation            |       0/49 |       0/49 |
| Complete-receipt accuracy         | Unscorable | Unscorable |

Every primary-reader count is unchanged. The sole scored gain is the one line
price above; the other nearby misspelled purchase remains unresolved. Nine
known line prices, one quantity and eight printed totals are still missed by
the conditional hybrid. Partial original references do not support a complete
receipt metric. All fifty drafts retain review requirements.

This replay made zero model calls, private uploads, public downloads or paid
activations. It supplies no new OCR latency or runtime-memory measurement.

## Verification and remaining browser check

The two positive regression cases fail on the parent implementation and pass
after the change. The 13 added cases cover preserved originals/source links,
totals independence, differing digits, valid or absent amounts, missing or
conflicting quantities, low monetary confidence, ambiguous repeats, wrong
photos, three-decimal currency, unit-only columns and opposite signs. All
**1,077 unit tests** pass, including the financial allocation regressions.

Typechecking and the frontend production build pass. The build uses the same
React plugin, ES2022 target and ES module worker format, with an isolated output
directory, no API middleware and environment-file loading disabled. Existing
OpenCV externalization and large-chunk warnings remain. Original build evidence
and the final test-only amendment are retained separately.

The new synthetic source-review browser journey is **prepared but unexecuted**.
Its guarded start found 1,943,760,896 bytes available, below the unchanged
2,684,354,560-byte startup floor, and launched no process. A later observation
was also below the guard. The test opens the original-source dialog, checks
320/390px overflow and explicit price confirmation while other checks still
block; these are intended assertions, not verified browser results. No real
handset or fresh native model reading is claimed.

The next larger browser-model plan is `browser-paddle-medium-paired-plan-v13`.
Only source bindings are refreshed; models, cases, parameters, scoring and
resource limits remain identical to version 12. No larger trial was started.

`copied-price-recovery-v1.json` binds the protocol, source snapshots, retained
observations, scores, tests, build, refused browser start and protected-checkout
proof. Verify it without inference:

```powershell
python -X utf8 receipt_training/scripts/build_copied_price_report.py --check
```

Stable and original checkout invariants remain intact. No provider/default,
allowance, credential, cloud permission, training or deployment changed. The
full goal remains active; this change does not complete its broader accuracy,
capture, resource and public-release requirements.
