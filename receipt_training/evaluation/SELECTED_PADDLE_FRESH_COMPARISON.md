# Selected primary reader on twelve reserved receipts

4 November 2026. This is a primary-reader comparison, with no local vision
verifier. The full twelve-phase goal remains active.

The selected PaddleOCR PP-OCRv6 medium adapter reads the same original public
CORD PNGs 012–023 as the earlier Rapid small evaluation. Application source is
frozen at `d38d59290da5695a5101ae3623e5a41af440812d`; the matcher, configuration
and 37-component partial references are unchanged. Those references were
previously inspected, so this is not a newly blind annotation exercise. No
application, model, prompt or threshold is tuned on these results.

The first admission check records 1,360,834,560 available bytes and launches no
child. A separately recorded continuation starts after recovery to 2,337,280,000
bytes. The unchanged application Paddle adapter returns eleven readings from
eleven calls. Original image 014 exceeds the same 4,000,000-pixel raw research
boundary; it receives no model call and remains in the twelve-case cohort. Its
six referenced components remain missing. This is not evidence that the app's
normal image preparation rejects that photograph.

Outputs are frozen before interpretation. The current parser and financial
engine replay both actual Paddle outputs and the saved Rapid angle outputs,
with automatic and explicitly supplied IDR contexts kept separate. All prior
Rapid counts reproduce exactly under the unchanged scorer.

| Field | Rapid small | Selected Paddle medium |
| --- | ---: | ---: |
| Matched referenced components | 14/37 | 16/37 |
| Matched components / proposed rows | 14/16 | 16/20 |
| Line prices, automatic currency | 3/37 | 3/37 |
| Line prices, supplied IDR | 14/37 | 16/37 |
| Referenced quantities | 0/37 | 0/37 |
| Explicit unit prices | 0/7 | 0/7 |
| Printed totals, automatic currency | 2/11 | 2/11 |
| Printed totals, supplied IDR | 7/11 | 9/11 |
| Trusted reconciliation | 0/11 | 0/11 |
| Complete financial receipt accuracy | Unscorable | Unscorable |

Paddle's recall advantage comes with lower scoped precision and more proposed
rows. Supplied currency is user context, not successful currency recognition.
All 48 interpreted views require review. The references are assistant-reviewed
and partial, without independent human or complete-financial verification.
These results do not establish reliability across retailers or whole receipts.

Paddle's eleven per-input captures average 1,558.36 ms, with nearest-rank p95
2,422 ms; Rapid's retained captures average 636.27 ms, p95 938 ms. These timings
include capture serialization and exclude initialization and the user workflow.
They are not a full application latency comparison. Paddle's native child
finishes in 31.047 seconds; its outer controller closes normally in 32.915
seconds, with minimum sampled available RAM 1,660,252,160 bytes. The 1.5 GiB
startup/per-input and 1 GiB runtime limits are unchanged.

One offline replay initially fails because `--jitless` disables WebAssembly,
which Vite requires. The next replay enables it, completes all 48 views and
closes its server normally. No model inference is repeated. The failed replay
is retained. The six existing model files keep their hashes; no model download,
external receipt upload, credential load or OpenAI call occurs in this study.

The smaller reader is not promoted, and provider defaults do not change.
Paddle alone remains insufficient; an independently measured recovery reader,
broader complete-financial references and genuine phone capture remain needed.
Evidence is in `qa-artifacts/paddle-fresh-evaluation-v1/`, with the replay/score
controllers in `qa-artifacts/gemini-percent-rate-v1/`.
