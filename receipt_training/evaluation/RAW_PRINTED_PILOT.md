# Raw printed-number VLM profile: not selected

This local research profile asks Qwen3-VL 4B to copy visible amount tokens before
deterministic currency normalization. A distinct `printed-v1` marker prevents
canonical AI amounts from being reinterpreted as printed text. The application
and backend do not import this profile.

The synthetic smoke test and three predeclared development transactions ran on
the pinned b11960 native runtime. Each real case has one fresh canonical control
and one raw-profile request, with identical pixels, model, effective inference
settings and current benchmark harness. The old canonical request omits two
boolean options that resolve to the same harness defaults explicitly requested
by the raw profile. No labels, OCR text or currency hints entered inference.
Explicit IDR/GBP context was applied only after extraction, equally to both
methods. Old controls used an earlier harness and were not substituted for these
fresh paired runs.

| Case | Canonical control | Raw-profile result |
| --- | --- | --- |
| Faded dot-grouped CORD train-004 | Ambiguous three-place amounts fail precision checks | Correctly normalizes the purchase to 43,636 and tax to 4,364, but copies the wrong final total and makes subtotal/payment summaries into tips |
| CORD train-003 | Correct prices and copied totals; balances through a wrongly typed Tax fee | Correct prices and copied totals, but unknown tax inclusion defaults to inclusive in the current app adapter, leaving 52,416 tax out of the calculated total |
| Original grouped UK photos | 22 rows, coupons treated as purchases, calculated £181.49 | 22 rows; A/Z suffixes contaminate all line-total tokens; adds coupon count and future reward as discounts; calculated £162.80 |

The raw profile's synthetic prices and £3.50 total were correct, but it invented
a printed item count absent from that source. It also inferred item counts on
both CORD cases and supplied unit prices that were not separately printed on
train-003. Unknown reference fields stay excluded from field accuracy rather
than becoming zero-valued truth.

The raw contract separates payments from charges, but the train-004 model put
cash/change in both collections. A schema and explicit instruction did not
prevent semantic duplication. UK coupon rows were not understood as deductions,
and its raw profile incorrectly asserted tax-inclusive prices. The v1 prompt
also lacks an explicit overlapping-photo deduplication clause. Its prompt and
sealed requests were not changed during the experiment.

Every draft retains source review and is untrusted. The control's zero
discrepancy on train-004 is an invalid zero calculation with eight blocking
issues, not a correct bill. The three-case result does not support integration
or a full-cohort v1 migration. Retaining the failed experiment avoids selecting
a profile based only on improved number formatting.

There were seven local native calls including the synthetic case, and no cloud
uploads for this pilot. Recorded real-case times range from 15,327 to 48,727 ms
and process working sets peak near 3.68 GB. They include fresh model loading,
image encoding and generation. Control-first order, caches and host load limit
timing claims; typechecking overlapped part of the UK control. No speed gain,
p95 or physical-phone performance is claimed.

The [checkpoint report](advanced-printed-provider-checkpoint-v1.json) contains
per-case field counts, exact source/request/runtime hashes, strict stdout versus
parsed-output comparisons and frozen adapter/calculator sources. The stdout
audit rejects duplicate JSON members. Seven targeted adapter tests cover grouped
money, ambiguity, canonical/raw isolation, signed credits, payment exclusion,
three-decimal currency precision and conflicting currency context. The full
application unit suite passed 364 tests; TypeScript checking also passed.

No default model, parser, calculator, server or consumer UI was changed. The
[successful Veryfi OCR-text diagnostic](VERYFI_LIVE_RESULT.md) is a separate
experiment on two exact redacted crops and must not be compared as if it used
this pilot's different full-photo input.
