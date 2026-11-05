# Public CORD comparison: baseline prepared, paid tests not approved

5 November 2026. Executable/test source remains the verified `1fe22c1` snapshot.
No application, model, prompt, scorer, reference or provider default changes.

## Current development diagnostic

A current replay uses the same twelve familiar development captures, CORD
train 024–035. A research-only parser prototype accepts attached `Rp`/`NT$`
price prefixes without changing observed text or calculating a missing number.
Both versions produce 24 views (automatic and supplied-IDR contexts), with
identical source observations and unchanged field matching.

| Known field, IDR supplied | Current parser | Prefix-only prototype |
|---|---:|---:|
| Matched priced components |12/20|13/20|
| Matched components / proposed rows |12/18|13/21|
| Readable line prices |11/20|12/20|
| Printed quantities |5/16|5/16|
| Printed unit prices |5/10|5/10|
| Printed final totals |5/11|5/11|

The gain is one `MEGA` price. The same change adds `TL` and `CG` summary rows as
products, lowering scoped precision 66.67%→61.90%. **The prototype is rejected**;
no production parsing is changed. This is development diagnosis, not a blind
evaluation or an OCR-engine improvement. The initial scoring adapter omitted a
required elapsed-time field; its failure is retained. The corrected adapter
reuses the same historical native durations in both views, solely for scorer
compatibility. It supplies no new inference or speed comparison.

## Prepared stronger-reader comparison

Six fixed public CORD test sources 012–017 are inspected locally and bound by
their existing source hashes. They are already anonymized in the public dataset;
no private Costco/user photograph is included. Original PNG bytes are preserved,
including the oversized 014. Five prior Paddle readings exist; 014 retains its
recorded raw research input-boundary refusal and all six of its known components
in coverage. This does not show that the app's ordinary preparation rejects it.

A new current-parser replay of those saved observations gives:

| Field, all six selected sources | Automatic currency | IDR supplied |
|---|---:|---:|
| Matched visible priced components |10/23|10/23|
| Matched components / proposed rows |10/12|10/12|
| Known line prices |3/23|10/23|
| Known quantities |0/23|0/23|
| Explicit unit prices |0/4|0/4|
| Printed totals |1/6|4/6|

There are four known and nineteen unknown unit-price fields. Later populated
unknowns must be reported separately; an unknown reference alone does not prove
a hallucination. Source roles remain explicit: 012 has net subtotals after
percentage discounts, 014's coupon is tender, and 016/017 contain zero-price
components/packaging. No unprinted unit price or monetary discount is derived.
References are assistant-reviewed and partial; complete financial receipt
accuracy remains unscorable. These sources were already inspected in previous
reader work, not newly blind truth or proof of no pretraining exposure.

The prepared request profile uses `gpt-6-astra`, original-detail PNG input,
the unchanged application instructions/schema, medium reasoning and 6,000 output
tokens. It contains no labels, currency hint, prior reading, history or tools.
PNG/original input and image-token rules are documented in the
[official image guide](https://developers.openai.com/api/docs/guides/images-vision).
At the checked [model rates](https://developers.openai.com/api/docs/models/gpt-6-astra),
the conservative batch estimate is **US$3.165** (US$3.17 rounded), using twice
the listed cache-write input rate plus the full output ceiling. The ordinary
rate estimate with the same allowances is US$2.346. These are local estimates,
not actual charges or an account spending cap. The research estimate guard is
US$0.80/request; the app's existing US$0.60 guard is unchanged.

Limits are six requests, one attempt per original image, 90 seconds each, at least
31 seconds apart, stopping on authentication/quota failures; no retry, billing
activation, other provider or app allowance change. Three offline controls pass:
missing approval loads no key/calls no transport; six fixed fake requests retain
spacing and cannot rerun their reserved folder; a quota failure consumes one
attempt and leaves five unattempted. These tests perform no receipt recognition.

**New upload/spend approval is pending.** The earlier six-request private-crop
scope is consumed. No real key is loaded and no new provider request/credit is
used here. The profile's SHA256 is
`17a1a8c2fc16dee913fb047f22a275489b164732eca506faf2c96c6807fa87f3`.
[API data controls](https://developers.openai.com/api/docs/guides/your-data)
exclude training by default, with account opt-in unverified. Abuse logs,
GPU caching and processing outside the UK remain possible; `store:false` is
not a zero-retention guarantee.

## Software state and remaining checks

The previously verified 1,470-unit/type/build source is byte-identical; those
checks are carried forward, not rerun. Offline replays and preflight close
normally with unchanged 2-GiB startup/1-GiB runtime guards. The optional-merchant
320/390/1440px browser flow remains held before launch; this turn's 45-second
admission observation reaches at most 2,488,119,296 bytes, below 2.5 GiB. No user
apps/tabs close, dependency changes occur or protected Git states change.

Raw records are under `qa-artifacts/quantity-source-diagnostic-v1/`,
`qa-artifacts/openai-public-six-prep-v1/` and
`qa-artifacts/provider-review/openai-public-six-v1/`.
The packet is `advanced-public-cord-comparison-ready-v1.json`.
The full twelve-phase goal remains active and incomplete.
