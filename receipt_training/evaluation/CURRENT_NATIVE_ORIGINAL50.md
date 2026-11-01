# Fresh current local reader — original fifty receipts

On 1 November 2026, every original financial receipt received a new browser preparation, native Paddle reading and attempted independent native Qwen reading. All fifty primary requests returned HTTP 200; forty-nine vision requests returned 200 and one long single-photo restaurant receipt returned 504. Its editable primary draft and unresolved source checks were preserved. There were no cloud requests, automatic retries or new model downloads.

This run freezes the application from the compact multi-photo checkpoint (`c3856c0`), before the later single-photo deadline correction. It is a fully fresh extraction run, unlike the earlier report combining six fresh cases with forty-four retained observations. The original membership stays 38 development / 12 evaluation receipts. These sources were previously inspected; they are regression data rather than an untouched holdout.

## Source-covered fields

Both views use the same newly extracted OCR evidence. The primary reference reprocesses that response through the actual primary pipeline; it is not a second OCR inference or a separately timed primary workflow. The automatic hybrid uses independent vision when requested by the current routing policy. The failed comparison remains in every denominator.

The v4 truth view retains source-checked Tesco prices and one printed signed rounding value. Original, v2, v3 and v4 views are reported separately on identical predictions. Unknown labels remain unknown.

| Field | Primary reference | Automatic hybrid |
|---|---:|---:|
| Matched purchases | 113/145 | 139/145 |
| Purchase precision | 73.86% | 97.89% |
| Purchase recall | 77.93% | 95.86% |
| Exact descriptions | 91/145 | 128/145 |
| Purchased quantities | 6/120 | 97/120 |
| Unit prices | 6/31 | 22/31 |
| Line prices | 16/143 | 88/143 |
| Item discounts | 1/7 | 5/7 |
| Receipt discounts | 0/4 | 2/4 |
| Copied printed subtotal | 2/34 | 24/34 |
| Copied printed tax | 0/22 | 12/22 |
| Copied final total | 3/49 | 32/49 |
| Service charges | 0/8 | 3/8 |
| Signed rounding | 0/1 | 0/1 |
| Merchant | 3/6 | 1/6 |

Automatic currency remains unresolved on 41/50 hybrid drafts; only 8/50 satisfy the scorer's source-aware currency criteria. Matching a copied total does not establish that the application can calculate or split it. Trusted reconciliation succeeds on 0/49 source-covered totals. Complete financial accuracy has **zero eligible fully annotated receipts** and is unscorable, not a measured zero-percent success rate. Every returned draft requires review.

The fresh hybrid's 88/143 line prices and 97/120 quantities are lower than the earlier mixed observations' 111/143 and 119/120. The single timeout loses all twenty-one source-known line prices and twenty-two quantities on its long receipt. Additional numerical differences also remain; the historical mixed result is not relabelled as a current success.

The [separate split report](advanced-current-native-original50-splits-v1.json) preserves the original memberships. On the twelve evaluation receipts, primary versus hybrid matches 13/22 versus 22/22 purchases, 9/22 versus 21/22 exact names, 0/14 versus 14/14 quantities, 1/22 versus 16/22 line prices and 1/11 versus 7/11 copied final totals. Ten evaluation currencies remain unresolved and trusted reconciliation is 0/11. On the thirty-eight development receipts, the hybrid matches 117/123 purchases, 107/123 names, 83/106 quantities, 72/121 line prices and 25/38 copied totals. The timeout belongs to development. The split sums are checked against every count in the combined report; this analysis makes no new model call.

## Measured time and limits

Preparation through the editable draft, including the failed comparison's safe fallback, averages **50,555.30 ms** across all fifty cases. Median is 44,252.50 ms and nearest-rank p95 is **107,339 ms**; the range is 30,187–134,148 ms. Full owned-worker lifetime averages 54,975.88 ms with p95 111,665 ms and range 34,768–139,071 ms.

The worker timer also includes fresh Node/Vite/Chrome startup, reader and asset setup, saved-response reference processing and disposal. Each case has its own actual API quota state, preserving two requests per minute and ten per hour. This is serial independent-case extraction testing, not shared-server throughput. OS/GPU caches, host load and observation differ from earlier checkpoints, so these figures do not establish a controlled before/after speed ratio. They are laptop observations, not physical-phone measurements. API spend is zero; compute and electricity costs are unmeasured.

## Reproducibility

The [machine-readable report](advanced-current-native-original50-v1.json) binds 546 exact evidence files, including sources, prepared JPEGs, native/API results, truth reviews and copied scorers. No source-specific labels, OCR text, country, merchant or currency hints were sent to vision. App sources stayed unchanged throughout the fifty-case run.

```powershell
python -X utf8 receipt_training/scripts/build_current_cohort_report.py --check
python -X utf8 receipt_training/scripts/build_current_split_report.py --check
```

The completed run is retained without replacement. A subsequent longer-deadline diagnostic or single-case regression must be reported separately and cannot turn these fifty observations into a newly executed post-change cohort.
