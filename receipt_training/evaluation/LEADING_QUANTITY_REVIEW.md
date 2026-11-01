# Leading purchased counts with source review

The primary parser previously left a leading purchase expression such as `2 x Tea 6.00` inside the product description and left purchased quantity empty. It now proposes description `Tea`, quantity `2` and the unchanged printed row total `6.00`. Unit price stays empty: the parser does not multiply the row total or calculate an unprinted unit price.

Every newly interpreted leading count requires an explicit source check because it can also describe pack contents. A numeric pack measurement such as `6 x 340g Spam` keeps its wording and unknown purchased quantity. An existing trailing purchase expression takes priority, genuine repeated purchases remain separate, and the negative-row/coupon classification is unchanged. The new check also survives independent OCR/vision agreement; agreement does not by itself resolve pack semantics.

Review messages now ask the user to compare the value with the receipt and show the specific reason. They no longer assume only one reader was used. This keeps the explanation accurate when two readers agree but the meaning of a count still needs review.

## Measured change

The actual old/new parser and independent verifier were replayed over saved current-preparation OCR for all fifty original financial receipts plus the separate two-photo UK supplement. Both variants received identical evidence and were evaluated without currency context and with an explicit post-extraction currency selection. That produces 204 paired reader/context views of 51 transactions, without new model requests.

On the original fifty, source-known primary quantities improve from **6/120 to 22/120**, entirely on one previously inspected development receipt. The original twelve evaluation cases are unchanged. The normalized-description scorer already removes leading quantity wording, so it shows no description-accuracy gain even though the displayed descriptions are cleaner.

Every unit price, line total, discount, tax setting, printed total and adjustment vector is identical before/after across all 204 pairs. Primary line-price accuracy stays 16/143 without context and 111/143 with an explicit selection. The independent-comparison fields are unchanged, including 119/120 quantities and 105/143 prices in this particular saved-evidence view. Those comparison figures combine the original fresh cohort with a later successful long-case vision result and a later same-pixel UK control; they are not a new full-cohort native benchmark. The preserved original fresh run still includes its timeout.

The native browser regression reads the real restaurant photo using installed Paddle OCR and the actual local API. In phone emulation, `Hot Tea` appears with purchased quantity `2`, unit price empty and row total `44000`, with its source check pending. IDR is explicitly selected before scanning and applied after extraction; the backend request contains only the prepared panels. There is no vision or cloud upload, no financial-field edit and no claim of a correct complete bill. The original photo, raw response, prepared JPEG, fields and screenshot are retained privately.

## Verification

All 505 unit tests pass, including sixteen focused cases for pack measurements, decimal counts, trailing expressions, coupons, negative rows, genuine repeats and checks surviving two-reader agreement. Typecheck, production build, formatting and graph refresh pass. The final standard browser suite passes 167 tests with one existing skip, and the separate real native UI check passes. Two actual Paddle/API/UI repeats use identical pixels on the same receipt; they are one accuracy case, not two independent examples. Browser phone emulation is not a physical-device test.

This fixes a parsing gap; it does not repair the model's four multiplied prices, duplicated tax, unresolved currency or other remaining financial errors. The separate [literal-total prompt experiment](LITERAL_TOTAL_PROMPT_TRIAL.md) was rejected because it produced no price gain and lost tax evidence. No model prompt/default-provider change, external receipt upload or paid activation is included.

The [machine-readable quantity report](advanced-leading-quantity-v1.json) binds the exact old/new sources, 408 replay records, source checks, native UI evidence and validation. The stable branch and original uncommitted changes remain protected.

```powershell
python -X utf8 receipt_training/scripts/build_leading_quantity_report.py --check
```
