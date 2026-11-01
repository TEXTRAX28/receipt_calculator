# Full-source Tesco annotation and frozen-result rescore

On 1 November 2026 the assistant opened the full original Tesco 1994 image at its original resolution. Earlier original-cohort truth covered only the merchant, date and total. The separately approved comparison crop already had ten source-checked purchase groups; the new review confirms those rows against the full original without changing historical labels.

| Printed purchase description | Payable line price |
|---|---:|
| 6 JAM DOUGHNTS, first purchase | Unknown: too faint |
| 6 JAM DOUGHNTS, second purchase | GBP 0.55 |
| MLD WHT CHDR | GBP 1.45 |
| RICH TEA | GBP 0.39 |
| C/CHP COOKIE | GBP 0.44 |
| 4 TEACAKES | GBP 0.50 |
| 18 BROWN ROLLS | GBP 0.85 |
| TUNA STEAKS | GBP 0.55 |
| L/GRAIN RICE | GBP 0.64 |
| ORANGE NET | GBP 0.79 |

The numbers in product names do not establish purchased quantity. `REDUCED PRICE` gives that purchase's payable price; neither its original price nor a separate reduction magnitude is printed. The first price remains null even though the printed total is 6.71. No amount is derived by subtracting the other rows from that total. Purchased quantities, unit prices, numeric discounts, pack sizes and tax basis remain unknown. Cash and change are payment rows, not purchases.

The [truth record](advanced-tesco-full-truth-v1.json) creates a separate ignored v3 annotation view, adding ten purchase groups and nine known prices to the same original inventory. All other transactions and receipt-level financial truth remain unchanged. This is retrospective, source-informed assistant review, without independent human verification. It is not a fresh holdout or complete financial transcription.

The [282-file rescore packet](advanced-tesco-full-rescore-v1.json) compares identical saved predictions against v2 and v3 truth within each method. It verifies that each v2 score reproduces its earlier report before adding the Tesco labels. The original fifty financial receipts retain their 38 development / 12 evaluation split.

| Saved pipeline | Tesco matched purchases / 10 | Tesco exact descriptions / 10 | Tesco known prices / 9 |
|---|---:|---:|---:|
| Original Tesseract baseline | 6 | 4 | 2 |
| Historical Paddle/layout | 6 | 6 | 6 |
| Historical docTR/layout | 6 | 6 | 6 |
| Historical Qwen | 10 | 10 | 9 |
| Historical hybrid | 10 | 10 | 9 |
| Current mixed-vintage primary | 10 | 10 | 8 |
| Current mixed-vintage automatic hybrid | 10 | 10 | 9 |

Across the original fifty, the current hybrid's v3 known-price score is **111/143**, versus its same predictions' v2 **102/134**. Exact normalized descriptions are **132/145**, versus **122/135**. The nine additional correct prices and ten names are newly scored existing observations; this is **not a model improvement**. Known-quantity eligibility remains 120 and strict complete-receipt eligibility remains zero. The current report still mixes forty-four retained observations with six fresh ones, as documented in the [preparation checkpoint](advanced-current-preparation-v1.json). Historical pipelines differ in versions/preparation; these tables do not isolate model architecture or establish latency differences.

The separate same-pixel native Tesco trials now have measurable item truth. Canonical output matches nine of nine known prices, but its quantities and extra deductions still produce 5.11 instead of 6.71 and 36 blocking validation issues. Compact output matches seven of nine known prices, produces 9.31 and has 31 issues. Unknown quantity/discount values are excluded from numeric accuracy rather than being invented as truth. The original-source review qualitatively identifies those unsupported readings; neither draft is safe to accept. These results reinforce the decision to retain canonical output for one-photo requests, even when a photo produces multiple detail panels.

Four new scoring-boundary tests and fifteen existing evaluation tests pass. They ensure an unreadable price is independent of the printed total, repeated products stay separate, pack wording creates no quantity/unit/discount truth, and partially known prices cannot enable complete-receipt accuracy. Application sources and built assets remain those verified at `c3856c0`; no new app regression run or inference is claimed for this annotation-only change.

```powershell
python -X utf8 receipt_training/scripts/test_tesco_truth.py -v
python -X utf8 -m unittest discover -s receipt_training/scripts -p test_evaluation.py -v
python -X utf8 receipt_training/scripts/record_tesco_full_review.py --check
python -X utf8 receipt_training/scripts/build_tesco_full_rescore.py --check
```

There were zero new OCR/model/provider requests, no original-label or permission changes and no paid activation. Complete financial truth, locale ambiguity, broader overlap, genuine digital/refund coverage, physical-device measurements and public-backend controls remain open. The full twelve-phase goal remains active.
