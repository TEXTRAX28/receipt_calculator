# Six native PNG controls: preparation checkpoint

**2026-10-31 update:** the six separately approved Veryfi tests have now completed.
See the [wider comparison result](VERYFI_SIX_RESULT.md). The text below preserves
the earlier local-control checkpoint, when that approval was still pending.
The unknown-tax review gap observed here was subsequently
[fixed and replayed](UNKNOWN_TAX_REVIEW.md) without changing extracted values.

Twelve actual local model reads completed on the same six lossless PNG crops
prepared for the [Veryfi screen](VERYFI_SCREENING_SCOPE.md): six Paddle reads
and six independent Qwen reads. The 26-row reference includes nine Bristol
purchases, a Taiwan invoice row, ten Tesco descriptions, three restaurant rows,
one faint restaurant row and a purchase with its separately priced add-on.
One Tesco price remains unknown, so the line-price denominator is 25.

| Local method | Matched priced-row names / 26 | Correct known line prices / 25 | Correct copied final totals / 6 |
| --- | ---: | ---: | ---: |
| Paddle, automatic currency | 20 | 13 | 1 |
| Paddle, known currency supplied after extraction | 20 | 19 | 3 |
| Qwen, automatic currency | 26 | 22 | 3 |
| Qwen, known currency supplied after extraction | 26 | 22 | 3 |
| Independent Paddle + Qwen verification | 26 | 22 | 3 |

The hybrid's field counts are the same with or without the simulated currency
context on this screen. Qwen/hybrid have 25 exact normalized descriptions out
of 26; a name match is not necessarily an exact transcription. None attaches
the three Bristol coupons to the reference purchases correctly. There is no
source-verified payable receipt or provider promotion in these results.

The known-currency variants reuse the same frozen model outputs and supply only
the predeclared currency to deterministic app parsing/review. They do not change
the model prompt or reinterpret canonical AI money strings. No receipt price is
inferred from the final total, and no missing quantity/unit price is filled in
to improve the score. Taiwan's negative redemption remains separately audited
with unresolved type/ownership; unmatched rows are not automatically counted as
false purchases.

The first browser harness bypassed normal conversion and submitted PNGs to a
JPEG-only endpoint. Two requests failed image validation and four were
rate-limited; no model extraction completed. That setup failure is retained.
The replacement native protocol keeps the exact cloud PNG input hashes and
uses the existing model adapters directly. It changes no application upload
guard, server limit or cloud approval scope.

Offline replay loaded nineteen frozen app modules and created 36 variants from
the saved independent results. Every research draft retains a source-coverage
check and remains untrusted. Invalid zero placeholders with blocking issues do
not establish correct reconciliation. The observed unknown-tax-inclusion
default remains an implementation gap for a separate fix.

Paddle initialization and warm per-receipt inference, Qwen fresh CLI loading/
encoding/generation and the earlier Veryfi network/cleanup observation measure
different components. These six cases support no provider speed ratio or p95.
This is an assistant source-checked, previously inspected development screen;
one original evaluation member keeps its membership and is not a fresh holdout.
Digital/long-camera/refund formats and full financial truth are still missing.

The [245-file checkpoint](advanced-provider-screening-preparation-v1.json)
retains source/input/runtime hashes, the failed setup, native runs, frozen
offline code and per-case scores. The [35-file cloud plan](veryfi-screening-plan-v1.json)
passes its checks and fifteen synthetic safety tests. Its six uploads remain
unconsumed, awaiting the single pending scope/quota response. No extra Gemini
upload, paid activation or application/default-reader change occurred.

```powershell
python -X utf8 receipt_training/scripts/build_provider_screening_report.py --check
python -X utf8 receipt_training/scripts/build_provider_screening_plan.py --check
```
