# Automatic local comparison

The improvement branch now defaults **This computer** to **When details need a
check**, when both local readers are installed. The first OCR draft requests an
independent local vision reading for validation issues, parser warnings,
multiple sections, missing source mappings, or weak purchase/financial OCR text.
The 0.75 OCR threshold is a conservative routing rule, not calibrated financial
confidence. **Every scan** forces comparison; **Skip extra check** keeps primary
OCR alone. No cloud provider is selected automatically.

A clear single-section draft can skip vision, but a new mandatory purchase-source
check still blocks confirmation. A failed comparison now preserves the parser's
existing negative-line classification and recovered-price association checks;
the previous fallback replaced that list with just a coverage check. Checking
coverage alone can no longer bypass those other checks. Cancellation rejects the
operation and keeps the photos. The second reader receives exactly the original
prepared pixels and their order, without OCR text, labels or selected currency.

## Saved-response comparison

The new runner executes the actual primary reader, comparison orchestration,
parser, policy, transport and verifier against hash-bound saved PaddleOCR and
Qwen responses. Only the transport responses are substituted. Loaded module
hashes, exact outgoing JPEG hashes/order, request shapes and results are retained.
No new OCR, inference, external request or scanner latency is measured by replay.
Labels are loaded separately during scoring, after extraction.

The original 50 transactions retain their 38 development / 12 evaluation split.
They have already been inspected and used in earlier research: this is regression
evidence, not a fresh holdout. The priced-row label view has 135 rows, 134 known
prices and 120 known quantities. Unknown values remain unscored.

| Field | Primary only | Always compare | Automatic |
|---|---:|---:|---:|
| Exact normalized descriptions | 64/135 | 104/135 | 104/135 |
| Known quantities | 6/120 | 105/120 | 105/120 |
| Known line prices | 8/134 | 89/134 | 89/134 |
| Copied printed totals | 3/49 | 29/49 | 29/49 |
| Current transport errors | 6/50 | 6/50 | 6/50 |

**All six errors are included in those denominators.** Six historical prepared
panels are 1500 × 2667 = 4,000,500 pixels, exceeding today's 4,000,000 limit by
500 pixels. Current recognition validation rejects their retained responses.
The runner preserves their original pixels and dimensions; it does not weaken
the guard. The initial two failed diagnostic runners are retained separately.
These six images need current preparation and fresh native readings before a
complete current upload-path result can be claimed.

The other 44 transactions complete all three replay modes. Automatic and always
comparison have identical receipt values, warnings, review checks and financial
results, ignoring generated IDs only. They also match the earlier frozen verifier
results on those exact independent model readings. Policy-only inspection of all
50 historical readings requests vision for every one; the six incompatible cases
are not counted as successful orchestration. This cohort demonstrates **no
second-model savings**.

Against primary-only output, automatic comparison gains 81 known line prices,
99 quantities, 15 unit prices and one discount. Exact descriptions gain 44 and
lose four. All four description regressions have explicit description review
checks; three include merged preparation/size options and one changes a word.
No known line-price, quantity, unit-price or discount regression was found in this
paired field comparison. This does not establish unknown-field correctness.
The prior full historical verifier reference remains 102/134 known line prices
and 33/49 copied totals; it is a separate historical result, not a newly successful
current-transport measurement. Complete original financial accuracy remains
**unscorable**, with zero eligible complete truth records.

Three saved views of the supplied UK receipt remain a separate supplement, not
three independent transactions. The grouped transaction has 18/18 known prices,
18/18 quantities and the correct printed total in all modes. Automatic and always
comparison are unchanged in every supplement view. Native timing and reliability
are assessed separately below.

## Actual local workflows and resources

Both native attempts use the real application/backend, installed local models,
Chrome 155.0.8059.80 and a 390 px viewport. Cloud keys are blank in their owned
process environment; Veryfi is disabled with allowance zero. Browser traffic is
restricted to local app reads and the two local model endpoints. No cloud request,
paid activation or automatic retry occurred.

| Input | Native outcome | Time to editable review | Sampled process-tree working set |
|---|---|---:|---:|
| Original two-photo UK receipt | OCR HTTP 200, vision HTTP 504; unverified primary draft | 150.42 s | 3.89 GiB |
| Clear synthetic £5.50 receipt | OCR HTTP 200; automatic mode skips vision | 12.90 s | 1.64 GiB |

The UK attempt is a **failed combined extraction**, not a successful accuracy or
split result. It reached editable primary review, then the benchmark stopped on
the unsuccessful vision status. Its app-draft field vector and split were not
captured. An earlier 111.45-second success does not establish reliable latency.
The timeout needs further investigation; it was not extended to make this test
pass. Its timer begins before the automated click, including actionability waits
and remaining preparation, so it is not isolated inference time.

The distinct synthetic attempt uses actual PaddleOCR on a saved generated image,
not a mocked recognition response. It extracts the printed quantity/price/total,
skips the second model, remains blocked by purchase-source review, then completes
the explicitly reviewed split **£1.84 + £1.83 + £1.83 = £5.50** without financial
edits. It verifies integration, not real-receipt accuracy. Its scan button is
enabled before timing begins. Neither sample supports a latency p95 or speed ratio.

Memory is sampled every 250 ms from an owned Node root and its observed Chrome,
Python and native-model descendants. The UK attempt has 555 samples / 30 observed
processes; the synthetic attempt has 71 / 17. The observer reports no sampling
errors. It runs outside the measured tree. The saved observer differs from the
existing worker observer only in its source-root constant and scope description.
Working-set sums can double-count shared resident pages and miss short peaks;
GPU memory, unrelated apps, the supervisor and observer are excluded. These are
desktop process measurements with a phone viewport, not physical-phone memory
or public-server capacity measurements.

## Verification and remaining work

Verification passes **455 unit tests**, **167 browser tests with one existing
skip**, type checking, production build and formatting. The new UI protocol cases
cover default routing, explicit choices, equal request pixels, a clear skip,
classification checks after failure, 320/390 px overflow, 44 px selection controls
and automated accessibility. Unit cases also cover reduced-price checks and
cancellation before/during the independent read. Existing long-receipt tests
retain their explicit forced-comparison choice. These protocol fixtures do not
count as model-accuracy evidence.

The [aggregate evidence](advanced-automatic-local-v1.json) binds 782 files,
including saved inputs, executed scanner/runner snapshots, framework browser
output, native responses, process measurements and current test/build evidence.
Reproduce its integrity check without inference or uploads:

```powershell
python receipt_training/scripts/build_automatic_local_report.py --check
```

Fresh replay/native work always needs a new run name; earlier output directories
are not overwritten. This checkpoint does not restore the thirteen previously
overwritten artifacts disclosed in the evidence-integrity report.

Next work includes the six current-preparation reruns, the actual two-photo vision
timeout, broader independent routing calibration and financial truth, genuine
digital/PDF/refund examples, physical-phone tests and production backend controls.
The full upgrade goal remains active.
