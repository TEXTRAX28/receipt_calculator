# Service-charge and signed-rounding evaluation

The original evaluator measured item prices, quantities, discounts and printed tax/total, but did not score the eight known upstream service charges as separate fields. All original rounding labels were also unknown, even though the full `cord-v2-train-000` source visibly prints **Rounding -45**. A versioned evaluation extension now makes those gaps visible. It changes no application extraction or bill calculations.

The full original was opened at its original resolution on 1 November 2026. Its footer explicitly labels `Rounding -45`; the retained upstream `sub_total.etc` token independently contains `-45`. This supports the classification for this source only. The amount was not derived by balancing totals, and generic `etc` values are not automatically classified as rounding. A separate v4 annotation view changes only this rounding field and its review provenance; every previous item, fee, tax, subtotal, total, coverage flag, split and permission remains unchanged. Other unknown rounding amounts remain null. [Source-review record](advanced-rounding-truth-v1.json).

The [272-file evaluation packet](advanced-receipt-adjustments-v1.json) scores the identical five historical pipelines on all fifty original financial receipts:

| Frozen pipeline | Known service charges / 8 | Signed rounding / 1 |
|---|---:|---:|
| Tesseract baseline | 0 | 0 |
| Paddle/layout | 0 | 0 |
| docTR/layout | 0 | 0 |
| Qwen | 4 | 1 |
| Hybrid | 4 | 1 |

These are newly reported fields on old observations, not recognition improvements. The pipelines differ in historical preparation/version. No new inference or latency is measured by this rescore. Existing price, quantity, description and complete-receipt counts are verified unchanged. No original receipt has known tax inclusion or complete financial truth, so those metrics remain unscorable; the separately source-checked UK supplement is outside this table.

The fee metric requires the right charge kind and exact signed minor-unit amount, including multiplicity. Upstream `service_price` explicitly maps to the app's `fee` kind, not `tax`. Two equal service rows require two proposals. Unknown fees are neither zero nor evidence that another proposed charge is extra.

Known rounding requires an explicit rounding proposal with the right signed sum. The evaluator never rounds an incorrect financial value into a match. Known tax inclusion must match the source boolean and have an identified tax mode; a default boolean with unknown tax mode does not count as successful extraction.

Complete scoring now additionally checks fee structure and rounding coverage. A synthetic counterexample showed that an invented fee and offsetting negative rounding could preserve all previously scored fields and a balanced total. The additional checks reject that result. Missing rounding truth remains unscorable unless its absence was explicitly verified. This strengthens the evaluated contract for these components; it does not certify a universal financial contract or make incomplete source truth complete.

Eight new evaluator tests and fifteen existing evaluation tests pass. These cover the balanced counterexample, service-versus-tax classification, repeated fees, signed rounding, unknown fields, unknown tax basis and invalid currency precision. The historical scorer and its reports remain unchanged. The separate fully fresh original-50 report will use this versioned extension and show original/v2/v3/v4 label views on the same new predictions; that report requires terminal run metadata before publishing.

```powershell
python -X utf8 receipt_training/scripts/test_score_adjustments.py -v
python -X utf8 -m unittest discover -s receipt_training/scripts -p test_evaluation.py -v
python -X utf8 receipt_training/scripts/record_rounding_review.py --check
python -X utf8 receipt_training/scripts/build_adjustment_metrics_report.py --check
```

The labels combine upstream CORD semantics and retrospective assistant source review, without independent human verification. Unprinted quantities, tax inclusion, discount ownership and other uncertain fields remain unknown. Original/current complete-receipt accuracy is still unscorable. This work adds evidence of remaining financial errors; it does not justify a default-provider change or public-release claim.
