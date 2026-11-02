# Gemini 3.8 Flash: six-crop availability result

The approved batch completed on 2 November 2026 with **zero receipt drafts from
six attempts**: one 90-second timeout and five HTTP 503 responses. Every returned
provider error attributed the failure to high demand. No HTTP 429 quota error
was observed. This measures failed delivery in this batch; **receipt-reading
accuracy remains unmeasured**. It does not establish that a paid tier would fix
the problem or that another model would read these receipts better.

| Prepared crop | Outcome | Request time |
| --- | --- | ---: |
| Bristol Costco | Timeout; no HTTP response captured | 90.019 s |
| Taiwan Costco | HTTP 503, high demand | 48.929 s |
| Tesco | HTTP 503, high demand | 34.791 s |
| Restaurant, train-003 | HTTP 503, high demand | 2.479 s |
| Restaurant, train-004 | HTTP 503, high demand | 0.775 s |
| Restaurant, test-002 | HTTP 503, high demand | 1.190 s |

The batch ran from 19:21:41 to 19:25:38 UTC. Mean request time, including failures,
was 29.697 seconds. These six unsuccessful attempts are not a production p95 or
a comparison with successful local-inference latency.

## Scope and authorization

The user confirmed the same Gemini 3.8 Flash Free project and approved six tests
after clarifying the reported RPM/TPM/RPD counters. The exact prepared plan SHA256
was `bd37bbd0f8e728096ba7495b5b02a4af0a0ff025785eb0c411546cc1a41d6d5b`.
The runner made six generation requests, one per identifier-reduced crop,
at least 31 seconds apart. It made no retries, other-provider calls or billing
activation. No original-fifty receipts or uncropped source images were uploaded.
This six-attempt authorization is consumed, including the timed-out attempt.
The runner refuses to resume or overwrite the existing run.

Free quota was confirmed by the user; actual billing and remaining quota were
not independently inspected. No usage totals or receipt outputs were returned.
`store:false` was requested; this does not guarantee zero provider retention.
The previously disclosed UK data-handling terms continue to apply.

## What can be compared

The fixed six-crop reference contains 26 purchases and 25 readable line prices.
The offline review preserves failures in all-case field coverage and separately
records successful-only accuracy as `null`, because there are no successful
drafts. A zero delivered-field count must not be presented as a zero-percent
recognition score.

The [earlier Azure/Veryfi native comparison](AZURE_SIX_RESULT.md) remains
23/25 versus 18/25 known line prices. Their later source-text/geometry paths
reach 25/25 with explicitly supplied currency, as documented in
[source-price recovery](SOURCE_PRICE_RECOVERY.md). These are different extraction
paths; none certifies a complete payable receipt. There is no new Gemini
accuracy result to rank against them.

Gemini received the same crop framing and dimensions as those earlier screens,
encoded as quality-98 JPEG rather than PNG. The model received the application's
image-only instructions/schema, without labels, previous readings or currency
hints. This is a familiar development sample, not a blind holdout or a
whole-receipt evaluation. The default reader and application source are unchanged.

## Evidence and checks

[The machine-readable report](advanced-gemini38-screening-result-v1.json) binds
70 files: the authorization, plan, source snapshot, exact request/response
artifacts, reference, unchanged matcher, and offline scoring checks. Raw image
payloads and response artifacts remain in ignored local QA storage. The twenty
request-source files were frozen before execution; no credentials were copied,
hashed or included in the report.

Five offline tests pass. They check missing-field abstention, exact decimal
strings, retained repeated/negative rows, model-output selection, and failure
denominators. These synthetic checks establish scoring behavior, not OCR
accuracy. The application test suite was not rerun for this research-only
addition; the prior 940 unit passes and 223 browser passes plus one existing
skip remain the latest application validation.

Reproduce the offline evidence check without making requests:

```powershell
python -X utf8 receipt_training/scripts/review_gemini38_screening.py --check
python -X utf8 -m unittest discover -s receipt_training/scripts -p test_review_gemini38_screening.py -v
```

Keep the existing reader. A new provider attempt requires a new explicit scope;
no retry or paid upgrade is justified by an accuracy improvement from this batch.
The wider OCR upgrade, physical-phone testing and public-release work remain open.
