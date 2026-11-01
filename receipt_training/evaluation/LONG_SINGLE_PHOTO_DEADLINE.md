# Bounded reading time for a long single-photo receipt

The fresh fifty-case run exposed a real failure: one twenty-two-purchase restaurant receipt timed out after 117,246 ms of native vision generation. The reader's original 120,000 ms deadline also covered image checks and asset verification, so it could interrupt valid structured output before completion. Multiple original photos already had a longer bounded allowance.

The app now allows the same 180,000 ms native model limit and 200,000 ms reader/HTTP limit for either input shape. The browser allows 205,000 ms. The full batch job remains bounded at 900,000 ms. A shorter trusted injected deadline still takes precedence, and cancellation, serialization, rate limits, output limits and cleanup are preserved. No extra retries or cloud fallback were added.

One original photo still uses canonical item objects, including when it has multiple detail sections. Compact item arrays remain limited to multiple distinct original photos; earlier single-photo compact trials lost readable prices and misread currency. No prompt, financial parsing, model weights, token settings or reconciliation rule changed in this correction.

## Actual evidence

Three observations are kept separate, all using the same prepared JPEG bytes:

| Observation | Result | Measured scope |
|---|---|---|
| Original fresh cohort case | OCR 200, vision 504; primary draft preserved | Native vision interrupted after 117,246 ms |
| Longer-budget standalone diagnostic | Complete canonical JSON, 22 purchases | Fresh native CLI: 143,697 ms |
| Fresh updated app pipeline regression | OCR 200, vision 200; 22-purchase editable draft | Preparation through draft: 169,460 ms; native vision: 152,359 ms; owned worker lifetime: 173,852 ms |

The diagnostic and actual updated pipeline both match all twenty-two source-covered names and quantities, seventeen of twenty-one known line prices, the copied subtotal/tax/final total, the service charge and the signed rounding amount. Four line prices are incorrectly multiplied by purchased quantity. The output also duplicates PB1 as both a fee and printed tax. More processing time recovers a draft; it does not establish correct financial interpretation.

The updated automatic draft has unresolved currency and ninety-three unconfirmed source checks, including checks on all four incorrect line prices. It remains blocked. The standalone diagnostic's explicitly supplied post-extraction IDR view still fails reconciliation; that view is not automatic currency accuracy. No amounts were silently repaired or checks confirmed to manufacture a successful split.

The standalone native process peaked at 4,451,028,992 bytes of sampled working set. That excludes GPU, browser and backend memory and is not handset or production sizing. These are previously inspected development observations on one laptop, without a controlled speed comparison or p95 claim. This single post-change regression does not replace the preserved [fresh fifty-case result](CURRENT_NATIVE_ORIGINAL50.md).

## Verification and evidence

All 489 unit tests, typecheck, production build, formatting and graph refresh pass. New controlled-clock browser-client checks exercise a successful 190-second one-photo response, the 205-second limit and cancellation; a native-process protocol check verifies the canonical one-photo deadline and cleanup. The first new test run failed because its fixture function was passed rather than called; that log is preserved alongside the corrected passing run.

The full standard browser suite passes 167 tests with one existing skip, covering desktop and phone emulation. Its validation packet retains the JSON/HTML results and thirty-two attached test-artifact folders. This is desktop Chrome emulation, not a physical phone test. No paid service, new model download or external receipt upload was used. The stable baseline and original checkout remain protected.

The [machine-readable report](advanced-long-single-photo-deadline-v1.json) binds the retained failure, both new observations, exact source snapshots, field scores and validation files.

```powershell
python -X utf8 receipt_training/scripts/build_current_cohort_report.py --check
python -X utf8 receipt_training/scripts/build_long_deadline_report.py --check
```
