# Financial source review after a skipped or failed comparison

3 November 2026. Parent commit `d63ff2cf636a0cf111eb2a7207b14ecd1aaa188b`.
This fixes a source-review gap in the local comparison workflow. It changes
neither recognition models nor extracted financial values.

When the extra local vision reading failed or was skipped, `firstReading()`
returned the purchase source indices but replaced the parser's receipt-field
source map with `{}`. It also bypassed the existing source-informed review pass.
Consequently, a weak total could have no individual source check or source button,
even though the parser retained its actual line. Confirming purchase coverage
alone could clear that synthetic otherwise-valid draft.

The fallback now retains `parsed.fieldSources` and runs the existing
`reviewDeviceReading()` before adding the mandatory purchase-list check. Weak
purchase/financial words, contradictory totals, adjustment roles and unsupported
tax basis retain their own pending checks. Existing classification and recovered
price checks survive; no amount, quantity, rate or source rectangle is invented.
The clear automatic-skip case retains its source map without forcing an
additional model request or confirming any field.

Verified graph/source locations are `extractComparedReceipt()` at
`src/lib/compared-reader.ts:L20`, `reviewDeviceReading()` at
`src/lib/device-review.ts:L133`, and `collectReceiptEvidence()` at
`src/lib/receipt-evidence.ts:L44`. The comparison-success branch is unchanged.
The current graph contains the new dependency from comparison to source review.

## Verification

| Check | Result and scope |
|---|---|
| Full software suite | 1,171 unit tests pass, zero failures/skips; TypeScript and isolated production build pass. |
| Focused suite | 86 tests pass, including nine new fallback cases. All nine new cases failed before the implementation; the eight existing orchestration cases passed. |
| Original-fifty replay | 600 views / 300 before-after pairs: two currency modes, automatic/forced injected failures and successful automatic controls. No new OCR or vision inference. |
| Financial preservation | All 300 pairs retain receipt facts, warnings and calculated money values. Comparison decisions and exact outgoing JPEG hashes/order remain identical. |
| Successful controls | All 100 pairs retain complete receipts, source maps, checks and calculation results, ignoring fresh UUIDs only. |
| Failed controls | All 200 pairs retain purchase coverage and existing check reasons, while source maps and additional pending checks are restored. |
| Built browser protocol | All 12 tests pass in desktop Chrome and phone-sized Chrome emulation, zero skips/flaky results. This includes the new weak-total fallback case in both contexts. |
| Source UI | A visible total check/source button, one correctly located synthetic total row, 320/390px horizontal fit, unchanged receipt after source viewing, and blocked confirmation after checking purchase coverage alone. |

The replay executes the actual primary-client validation, prepared-image request
construction, comparison orchestration, parser, review pass and money engine.
Only `fetch` responses are substituted with hash-bound saved primary/vision
responses or an explicit synthetic HTTP503. Both readers receive the exact
original prepared JPEG bytes and order, with no OCR text or reference labels
added to the vision request. All 600 views attempt comparison; the real cohort
provides no skipped-comparison case. That separate path is covered by unit and
existing built-browser protocol tests.

There are 362 shared inputs whose hashes match the preceding original-fifty
replay. The 38 development / 12 evaluation grouping stays intact. No label file
is loaded by this replay, no reference is edited, and evaluation error examples
are not used to change scanner behavior. This is regression/source-metadata
evidence, not a new blind holdout, fresh model-accuracy comparison or latency
distribution. It does not create additional correct prices.

For **one automatic-failure scenario** on the same fifty transactions:

| Result | Automatic currency, before → after | Supplied currency, before → after |
|---|---:|---:|
| Receipts with mapped subtotal regions | 0 → 3 | 0 → 24 |
| Receipts with mapped printed-tax regions | 0 → 3 | 0 → 15 |
| Receipts with mapped printed-total regions | 0 → 4 | 0 → 33 |
| Receipts with mapped price-basis regions | 0 → 8 | 0 → 38 |
| Pending item-field checks | 37 → 48 | 41 → 63 |
| Pending receipt-field checks | 51 → 109 | 52 → 123 |
| Receipts retaining purchase-list review | 50 → 50 | 50 → 50 |

The forced-failure scenario reproduces these counts; it is not fifty additional
transactions. A source field counts as mapped only when the existing parser
indices resolve to real saved source lines. Ambiguous/missing financial values
remain unresolved, particularly without supplied currency. Tax-code-rate regions
remain unmapped in this cohort; this change preserves existing provenance rather
than inferring missing locations. OCR scores are still advisory, with the
existing 0.75 review threshold unchanged and no confidence calibration claim.

The replay retains a nonfatal Vite dependency-discovery warning for an unrelated
old `@probe-paddle` QA entry. All 600 extraction/protocol views complete with
the expected frozen runtime modules and no unexpected intercepted requests.
It is a tooling warning, not an omitted receipt or a model failure.

The browser run uses a built frontend and synthetic recognition/failure
responses. The synthetic canvas and receipt row geometry agree; viewing the
total opens the printed `TOTAL GBP 5.50` row. It is not native OCR accuracy,
hardware-camera, Safari, public-backend or model-outage reliability evidence.
The run lasts 20.819 seconds including its controller; its sampled owned process
tree peaks at 1,263,599,616 bytes with no observer errors. All 53 observed owned
PID/creation-time identities subsequently exit. The unchanged browser limits are
2.5 GiB available RAM at startup, 1 GiB during execution and 300 seconds overall.

## Evidence and limits

`fallback-source-review-v1.json` binds exact local sources, before/after snapshots,
saved inputs, replay, tests, browser observations and protection checks. Verify
retained bytes without inference or network requests:

```powershell
python -X utf8 qa-artifacts/fallback-source-review-v1/seal.py --check
```

The main local artifacts are `qa-artifacts/fallback-source-review-v1/` and
`qa-artifacts/fallback-source-review-browser-v1/`, with the latter's controller,
observer and exclusive browser screenshot directories retained alongside.
Initial failing tests remain preserved, including their exact source. A test
comparison was corrected to ignore fresh adjustment UUIDs before the passing
run; no expected financial value or source reference was changed.

Stable remains `ee725ba45e799bee8501d3de034e0302c0127afd`. The original checkout's
HEAD and dirty-diff hash remain unchanged. No cloud request, quota probe, new
OCR/VLM call, model download, private upload, `.env.local` access, billing change,
merge, push or deployment occurs. The previously disclosed thirteen missing
historical evidence declarations are not repaired or replaced with new runs;
no fresh global historical audit is claimed.

The wider twelve-phase goal remains active. Source checking now survives this
fallback, but recognition errors, missing provenance, broader capture calibration,
larger-model resource constraints and public service operation remain open.
