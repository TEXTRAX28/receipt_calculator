# Approved Veryfi test: results

The one approved upload succeeded after the user confirmed unused Free quota
and saved the two server-side settings. One POST returned HTTP 201; one scoped
DELETE returned HTTP 200. Veryfi reported successful deletion of the new test
record. No retry, billing activation or extra Gemini request was made. This does
not verify the account's invoice, zero retention or exclusion from provider
training. The key remains in the ignored local environment file.

The same two redacted JPEG crops were used for the earlier Gemini attempts and
local comparison. This is one previously inspected development receipt. Its
financial reference was checked against the source by the assistant, not by an
independent human. It cannot establish accuracy across retailers or photographs.

| Method on these exact two crops | Purchase prices matching the reference | Coupons attached correctly | Result |
| --- | ---: | ---: | --- |
| Veryfi native structured fields | 16/18 | 0/4 | Copied the final total, but misgrouped the first products; no structured A/Z codes |
| Veryfi OCR text + current app parser | 18/18 | 4/4 | 18 purchases, correct VAT codes and a calculated £176.78 |
| Prior local Paddle + independent Qwen, after the coupon fix | 18/18 | 3/4 | 20 proposed purchases; calculated £181.25 and remained blocked |
| Gemini 3.1 Flash-Lite | Unavailable | Unavailable | Both approved attempts returned HTTP 503 without a receipt draft |

Veryfi's structured response matched all eighteen purchase names but put the
SPAM price/SKU on the tuna description. A later SPAM row had no price. Another
nameless row retained the eggs' SKU and price. It returned all four correct
negative coupon amounts as separate rows, without attaching them to purchases.
Matching names and a copied grand total therefore did not make the structured
receipt correct.

Its literal `ocr_text` preserved the product/price order, coupon signs and A/Z
suffixes. Passing that unchanged text through the existing parser and exact
calculator produced all eighteen correct quantities, unit prices, line prices,
discounts and VAT codes. Both genuine rotisserie-chicken purchases were retained.
The subtotal was £163.16, VAT £13.62 and calculated total £176.78, with no
discrepancy. No label values, money from the structured response, currency hints,
manual edits, additional inference or balancing adjustment entered that path.

This is an offline research result, not an enabled app provider. It retains a
mandatory source-coverage check and remains untrusted. The provider's combined
OCR text supplies line positions, not reliable original-photo bounding boxes.
The measured 3,895 ms includes the network transaction and cleanup; it is neither
an end-to-end app comparison nor a latency distribution. No broad winner can be
selected while Gemini has no successful extraction and only one Veryfi receipt
has been tested. Broader private uploads need their own agreed scope.

The application source and default readers are unchanged. This checkpoint passed
364 application unit tests, nine sealed transport tests, ten offline-audit tests
and TypeScript checking. Browser tests were not rerun for these research scripts;
the prior app checkpoint's 139 passes and one existing skip remain historical.
The original dirty checkout and `stable/receipt-verified` were checked unchanged.

The versioned evidence is
[advanced-printed-provider-checkpoint-v1.json](advanced-printed-provider-checkpoint-v1.json).
It checks 683 source/evidence files, including the retained private response,
source snapshots, exact crop hashes, authorization and one-use ledger. The
separate [raw-print model pilot](RAW_PRINTED_PILOT.md) was not selected for the app.

```powershell
python -X utf8 receipt_training/scripts/build_printed_provider_checkpoint.py --check
```

The full twelve-phase production upgrade remains active. This result makes
Veryfi's OCR text worth a broader comparison; it does not justify a public app
rollout, paid plan or acceptance of its native financial grouping.
