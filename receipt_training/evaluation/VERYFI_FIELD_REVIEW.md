# Offline review of the one-use Veryfi comparison

At the 2026-10-31 preparation checkpoint, both server-side credential settings
were present and passed the local syntax checks. This does not verify account
permissions, credential validity or unused Free quota. The user's one-test upload
approval is recorded; explicit confirmation of unused Free quota is still pending.
No live Veryfi request or result exists at this checkpoint.

The API portal's Dashboard/Usage Analytics shows the processed-document count;
the Billing section shows the account plan. Confirm that the Data Extraction API
account is on Free and still has unused allowance before selecting the pending
Ready response. These local files cannot verify quota. The official API Free plan
lists one hundred documents per month; the separate Expense Management product
has a different allowance.
[API billing and usage](https://faq.veryfi.com/en/articles/5408815-apis-billing-explained),
[API plans](https://faq.veryfi.com/en/articles/3743986-what-are-the-plans-prices-for-ocr-api),
[account billing](https://app.veryfi.com/api/billing/).

After the existing sealed probe completes successfully, run:

```powershell
python -X utf8 receipt_training/scripts/review_veryfi_probe.py
```

This command is entirely offline. It reads the exact retained response, verifies
its hash, the two crop hashes, manifest, archive identity and frozen transport
sources, and writes a new private `offline-field-review-v1` directory beside the
probe run. It refuses to overwrite an earlier review. A later correction must
use a new `--out` directory inside the same private prepared experiment folder.
It never reads credentials, uploads anything or invokes an extraction engine.

`native-fields.json` preserves row order and all native row slots, including
malformed or unmatched rows. Decimal JSON values are parsed exactly, with no
binary floating point or penny-rounding tolerance. Missing values remain missing.
The native `price`, `total`, `gross_total`, `net_total`, `discount`,
`discount_price`, quantity, SKU, tax fields and tax table remain separate.

`comparison.json` uses the existing one-to-one description matcher and frozen
0.65 threshold. Prices cannot choose pairs, including between identical names.
The source-checked annotation covers eighteen purchases and four item coupons.
It was previously inspected by the assistant and is not independently human
verified or a blind holdout. The parent transaction's GBP context is used only
for exact offline scoring. Merchant, date and currency are hidden in the prepared
crops and excluded from extraction metrics.

The official response definitions identify `price` as unit price, `discount` as
the deducted amount and `discount_price` as the lower price after a discount.
`gross_total` is before deductions; `net_total` is after deductions. The generic
`total` definition does not establish a universal pre/post-tax or coupon basis.
The review therefore reports native field equality against the printed purchase
price separately, and does not convert one field to another to make it match.
[Veryfi response reference](https://docs.veryfi.com/api/receipts-invoices/process-a-document/).

Unmatched native rows require source classification. They may be purchases,
separate coupons or summaries. A negative row is retained without attaching it to
a purchase. Coupon magnitude is checked only where the provider itself returned
a discount on a description-matched purchase. Neither native row count nor an
exact grand total establishes purchase precision or correct coupon association.
No application draft, payable-total calculation, trusted-reconciliation score or
provider-selection claim is produced by this audit.

Validate the offline audit with:

```powershell
python -X utf8 -m unittest discover -s receipt_training/scripts -p test_review_veryfi_probe.py -v
node --test receipt_training/scripts/test_veryfi_probe.mjs
python -X utf8 receipt_training/scripts/build_veryfi_probe_plan.py --check
```

Ten synthetic audit tests passed, including an actual subprocess run on wholly
synthetic sealed evidence, refusal of changed evidence and preservation of an
existing review. The nine previously sealed transport tests and eleven-file
prepared-plan check also passed. These tests supply no live-provider accuracy or
latency denominator. The application's extraction and financial code is unchanged
in this checkpoint; its preceding full validation remains 351 unit passes,
137 standard browser passes and one existing skip.
