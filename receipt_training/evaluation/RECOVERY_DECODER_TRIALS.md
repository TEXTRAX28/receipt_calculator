# Recovery and currency-decoder trials

Two additional candidates were measured and rejected. Neither changes the app,
default provider, bill calculation, original labels or cloud-upload allowance.
The [652-file evidence checkpoint](advanced-recovery-decoder-trials-v1.json)
retains requests, complete native output, independent source geometry, actual
module loads and before/after replays.

## Direct-source price recovery

A private verifier prototype considered replacing only missing or invalid
canonical model prices with independent OCR values. It required an unambiguous
order-preserving purchase match, matching description, reliable source regions,
resolved matching currency and no conflicting valid model amount. Unit prices
additionally required explicit matching quantity and printed unit/line
consistency. Recovered values would remain subject to source checks. No model
token would be reinterpreted as printed text or repaired from a total.

The prototype made **zero replacements** on all 38 development and 12 original
evaluation receipts. The grouped UK supplement and its two individual-photo
diagnostics were also unchanged. Replaying the six existing comparison crops
produced 36 unchanged method/context variants, including 12 hybrid variants.
These are overlapping diagnostic selections, not 56 independent transactions.
All replays used saved inference results; there was no new model/API call.

The diagnostic failure is useful: the independent OCR either has no matching
purchase row or a different description. For example, its parser leaves
`BASO BIHUN 1 43.636` as the product name, while another OCR reading says
`LUCONUT JELLY (L)`. The source needed for this candidate's proposed correction
is not established. The prototype's matching requirements were not met, so it
remains outside the application.

## Currency-specific decoding

The installed Qwen3-VL 4B model was tested with a research schema that couples
its chosen currency to allowed decimal precision. Separate branches support
zero-, two- and three-place currencies; unknown currency retains the previous
six-place contract. Quantities and tax rates keep their existing precision.
This changes decoding syntax, without reinterpreting model amounts afterward.

The pinned llama.cpp version supports anchored patterns and unions, while
conditionals are unsupported and object properties cannot be mixed with unions
at the same level. The candidate therefore uses root `anyOf` branches. The
runtime reported no incomplete-schema warnings. [Pinned grammar documentation](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/grammars/README.md).

Two newly generated synthetic receipts verified actual JPY and KWD price
precision. Both returned the correct prices and final total, but also supplied
an unprinted subtotal and item count. Passing a numeric contract did not prevent
semantic invention.

The real test reused the same three previously inspected development/supplement
transactions as the earlier raw-profile pilot. Each had one fresh canonical
control and one candidate, with identical source pixels/order, prompt, model,
runtime and effective inference settings. Only the decoding schema differed.
There were **eight actual local calls**, including the two synthetic controls,
with no retries, private uploads or billing activation.

All three real control/candidate output objects are identical:

| Known fields across the three transactions | Control | Candidate |
| --- | ---: | ---: |
| Matched purchase names / 22 | 22 | 22 |
| Proposed rows, including extra coupons | 26 | 26 |
| Correct purchased quantities / 22 | 22 | 22 |
| Correct known unit prices / 19 | 18 | 18 |
| Correct known line prices / 22 | 21 | 21 |
| Correct known item discounts / 18 | 14 | 14 |
| Correct copied final totals / 3 | 2 | 2 |

These field counts do not establish a correct complete receipt. In particular:

- The faded Indonesian receipt still returns grouped tokens such as `43.636`
  in the unknown-currency branch. They fail the canonical two-place money check
  when IDR is selected afterward. Cash and change are incorrectly supplied as
  deposits. No value is repaired from the correct final total.
- The other restaurant receipt still calls its tax a fee and leaves item tax
  inclusion unknown. An arithmetic balance cannot verify that interpretation.
- The UK receipt still has 22 rows for 18 purchases, treating coupons as
  purchases and treating savings/future executive reward as extra discounts.
  Correct purchase prices alone cannot make that bill correct.

The selected-currency scoring variants apply the same simulated user context
after both native runs; the model never receives that hint. Unknown reference
fields remain excluded. The source labels include upstream CORD semantics and
assistant source checks, not new independent human verification. These are
development results, not a fresh holdout or new general model benchmark.

Recorded native time includes fresh CLI/model loading, image encoding and
generation. It excludes download, setup and browser preparation. Control-first
order and host/cache effects prevent a speed ratio or p95 claim. The candidate
offers no measured accuracy gain, so it is not enabled in the backend or UI.

The larger official [Qwen3-VL 8B GGUF](https://huggingface.co/Qwen/Qwen3-VL-8B-Instruct-GGUF)
was inspected as another option. Available disk space was below the existing
setup's ten-GiB reserve; no larger model was downloaded and no accuracy claim
is made for it. Current runtime code and model caches remain available.

The [validation checkpoint](advanced-recovery-decoder-validation-v1.json)
records 436 passing unit tests, a successful production build/type check and
formatting. Consumer source content and all six built app assets are identical
to `b732f24`. The prior 157 browser passes/one existing skip retain that source
scope; the browser suite was not rerun for these research files. A timing-only
unit-fixture change gives HTTP/allowance setup 1500 ms before testing a stalled
upstream; its earlier 80 ms deadline could correctly cancel before any upload.
The original failed log and test are retained. Production deadlines are unchanged.

The full production goal remains active. Better independent text/row evidence,
broader approved provider comparisons, complete financial references, capture
correction, physical-phone testing and public-backend controls remain open.
