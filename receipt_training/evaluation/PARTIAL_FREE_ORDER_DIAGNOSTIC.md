# A skipped product traced to incomplete-row ordering

4 November 2026. Application HEAD remains
`3ea9e01fcd26d6efb83edab2d9aedd22769e533d`. No application source or provider
default changes. The full receipt-scanner goal remains unfinished.

The original two-photo native test is prepared, but available RAM is below the
unchanged 1.5 GiB startup guard. Its admission records show no child or inference.
The separate OpenAI request remains unchanged, unapproved and unexecuted. Neither
condition is treated as a successful test or a live job to wait on.

## Diagnosis from existing development observations

The source image for CORD train 024 visibly prints three named purchase blocks,
each with unit amount, `x1` and line amount. Existing Rapid small OCR retained
`26.000 x1 26.000` between `1032-Double Cheddar` and `6002-Plastic Bag Medium`.
It retained only `0 x1` for the final free item's numeric row. The first purchase
also lost its count. Those missing observations must remain missing.

The current literal-expression matcher accepts the complete 26.000 row, but
the association helper cannot decide which adjacent name it belongs to. The
incomplete-row witness recognizes count-first numeric syntax, whereas this
incomplete free row prints its zero unit amount before the explicit count.
The saved full-parser result therefore omits the correctly recognized product.
The original image was visually rechecked before assessing the proposed role;
this remains assistant source review, not independent human verification.

Graph navigation locates the expression matcher at
`src/lib/purchase-expression.ts:L17`, the association helper at `L100`, and its
caller at `src/lib/parser.ts:L65`. Their source was inspected directly. The
unchanged helper SHA256 is
`86b4a9ebbb0db69cb43660d9e89a1d378a02effc3253f35fe5f0a19aa0bb0fc7`.

## Executed prototype and its limits

A JavaScript-isolate diagnostic executes a mechanically annotation-stripped
copy of that exact helper. It does not run local Node, Vitest, image recognition,
the complete application parser or financial calculations. Both helper copies,
the 24 saved observation texts and detailed controls remain local in
`qa-artifacts/partial-free-order-diagnostic-v1/`.

The first broad prototype lets any amount-before-count fragment witness row
order. A pack-like `6 x340` counterexample shows that is too permissive, so that
prototype is rejected. The narrower candidate accepts only a literal zero unit
amount followed by an explicit positive count as additional ordering evidence.
It supplies no product, quantity, unit price or line total from an incomplete
row. Existing adjacent-title, ambiguity, summary and photo-boundary rules stay
in place. No missing zero or quantity is calculated.

All **17 helper controls pass** for the narrow candidate, including pack-size
rejection, zero/unreadable counts, conflicting directions, genuine repeats,
complete free purchases, summary isolation and photo boundaries. Across the
existing twelve development receipts with two saved readers, only **one of 24
helper views changes**: the complete Double Cheddar expression is associated
with its source-supported title. Its quantity and prices remain the original
literal tokens. The unread first count and missing free-item total stay
unrecovered. These are helper associations, not a new financial-accuracy score.
Reserved evaluation images and references are untouched.

Three initial diagnostic scripts failed during manual removal of TypeScript
annotations or literal replacement; the corrected JavaScript artifacts and
failure descriptions are retained. One control initially expected all rows to
abstain under conflicting directions. That expectation was corrected: the
ambiguous middle expression abstains while the first unambiguous pair remains.
The candidate itself did not change for that correction.

## Next action

Do not promote the candidate on this evidence alone. Run the actual current and
candidate application parsers on the same saved readings, inspect financial
values and source ownership, and run the relevant regressions before editing
production source. The lighter CPU QA profile's unchanged startup threshold is
1.375 GiB with a one-GiB runtime floor; the final resource check is also below
that admission threshold. A local Node replay has therefore not run. Its
reproduction command, for a suitably admitted guarded environment, is:

```powershell
node --max-old-space-size=192 qa-artifacts/partial-free-order-diagnostic-v1/run_helper.mjs
```

Existing 1,390-case application validation and the real two-crop native phone
flow retain their original scope because application bytes are unchanged. No
new complete-suite or full-photo success is claimed. No key is loaded, cloud
receipt sent, dependency installed, model downloaded, user application closed,
merge, push or deployment performed.
