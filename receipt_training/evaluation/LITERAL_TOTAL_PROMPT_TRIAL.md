# Clearer row-total instructions: measured and rejected

Eight fresh local model calls tested whether clearer instructions could fix multiplied row prices and duplicate tax charges. Four previously inspected development transactions each received one same-pixel control and one candidate: the long restaurant receipt, a grouped-number restaurant receipt, historical Tesco reduced-price rows and the supplied two-photo UK Costco receipt.

The candidate added general instructions to copy printed row totals without multiplying them, leave an unprinted unit price empty, represent a printed tax line once, and exclude payment/change/reward metadata from adjustments. It contained no receipt-specific values, merchant rules, OCR text or currency hint. The three single-photo cases retained canonical item objects; the two-photo Costco case retained the production compact representation. Model, schema, image bytes, token settings, seed, runtime and 180-second model deadline were identical within each pair. Pair order alternated.

All eight calls returned strict valid drafts. The actual frozen independent verifier and calculator then processed each draft with the same saved OCR evidence, both without currency context and with an explicit post-extraction selection. Sixteen views therefore represent eight calls on four transactions, not sixteen independently read receipts.

| Source-covered field | Control | Candidate |
|---|---:|---:|
| Matched purchases | 51/51 | 51/51 |
| Normalized descriptions | 49/51 | 49/51 |
| Purchased quantities | 41/41 | 41/41 |
| Known unit prices | 18/19 | 18/19 |
| Known line prices | 44/49 | 44/49 |
| Item discounts | 18/18 | 18/18 |
| Copied final totals | 3/4 | 3/4 |
| Copied printed tax | 2/3 | 1/3 |

These counts are identical in both context views. Faint or unprinted fields remain excluded. On the long receipt, both variants still multiply four printed row amounts by quantity. The candidate removes the correct printed tax from its tax field while retaining PB1 as a fee. Its chosen currency also changes, which is not independently verified currency evidence; the source checks remain necessary.

The sealed promotion gate required a line-price gain without any known-field regression on a transaction. The candidate provides no price gain and regresses tax, so **the application prompt is unchanged**. A clearer instruction is not sufficient evidence of a better reader. Complete financial accuracy remains unscorable for these partial annotations, and every draft still needs review.

No cloud receipt upload, paid activation, retry or new model download occurred. API spend is zero and laptop compute cost is unmeasured. Individual native times and process working sets are retained; they exclude browser preparation/validation and GPU memory and do not establish a speed ratio, p95 or handset suitability.

The [192-file evidence report](advanced-literal-total-prompt-v1.json) retains the sealed requests, all raw native results, exact frozen application sources, postprocessing and versioned scorer inputs.

```powershell
python -X utf8 receipt_training/scripts/build_literal_total_report.py --check
```
