# Veryfi receipt API comparison: prepared, not uploaded

**Later result:** this prepared one-use probe has now been consumed after the
user confirmed Free quota and configuration. See [Veryfi live results](VERYFI_LIVE_RESULT.md).
Do not repeat the live command. The setup and original approval scope below
describe the preparation checkpoint.

The dedicated Receipt/Invoice API is worth a measured comparison because it returns line items, quantities, prices, discounts and tax fields directly. That capability is not evidence that it beats the existing reader. The first test is one previously inspected development receipt, not a blind holdout or a public-release decision. [API reference](https://docs.veryfi.com/api/receipts-invoices/process-a-document/)

The prepared ZIP contains only the existing identifier-removed [item crop](../../qa-artifacts/advanced-ocr/cloud-review/user-uk-items.jpg) and [VAT/total crop](../../qa-artifacts/advanced-ocr/cloud-review/user-uk-vat-totals.jpg), in that order. Both JPEGs retain exactly their original bytes. Generic archive names provide no extra merchant, currency, labels or OCR text. Veryfi documents processing related ZIP members as one document. [ZIP behavior](https://faq.veryfi.com/en/articles/6243055-processing-zip-files)

## Account and cost

[Sign up](https://app.veryfi.com/auth/register/) for the **Data Extraction API Free** plan. The current pricing page lists up to 100 documents/month free and a trial without a credit card. Confirm your actual account's plan and unused allowance. Do not activate Starter, enter payment details or enable a paid subscription for this experiment. A paid Starter minimum is also advertised, so the per-receipt price alone does not describe paid-plan cost. [Current pricing](https://www.veryfi.com/pricing/)

The estimate is $0 only if your account's free allowance covers this request. The code cannot verify your invoice or remaining quota. It makes no billing-management call and does not activate a plan.

## Configure credentials locally

In Veryfi's **Settings > Keys / API Auth Credentials**, get the Client ID and create a **Bearer API key**. Prefer a scoped key permitting document creation and deletion, with an expiry. No account login, username, billing credential, legacy API key or Client Secret is requested by this probe. It uses the documented Bearer authentication and default `https://api.veryfi.com` environment. If your account requires signatures or a different region endpoint, tell me before the run. [Bearer keys](https://docs.veryfi.com/api/getting-started/authentication/bearer-keys/), [key management](https://docs.veryfi.com/api/getting-started/authentication/bearer-key-management/)

Use a test client without custom extraction rules, connected apps or webhooks, so this comparison remains isolated.

Add these **real values only on your computer**, in this improvement worktree's ignored file:

`C:\Users\natan\.codex\worktrees\receipt-ocr-baseline\costco_calc\.env.local`

```dotenv
VERYFI_CLIENT_ID=replace_with_your_client_id
VERYFI_BEARER_KEY=replace_with_your_scoped_bearer_key
```

Do not paste secrets into chat, prefix these names with `VITE_`, or commit the file. Setting credentials alone does not authorize an upload. Existing Gemini configuration can stay in the same file.

This command only validates the prepared inputs and reports whether those two settings are present:

```powershell
node receipt_training/scripts/benchmark_veryfi_probe.mjs
```

## Privacy and requested approval

The provider documents default US Oregon hosting, with EU hosting available on request. It stores documents for the active account unless deleted or otherwise configured. Its July 2026 privacy policy permits using submitted data for proprietary model training/improvement; an opt-out is not configured for this experiment. Removing identifiers and requesting deletion do not establish zero retention or exclude training use. [Data location](https://faq.veryfi.com/en/articles/5796847-where-does-veryfi-store-the-data), [retention](https://faq.veryfi.com/en/articles/6716494-document-retention-management), [privacy policy](https://www.veryfi.com/privacy/)

The requested scope is **one extraction POST** containing the exact two redacted crops and **at most one DELETE** for the returned new test record. Cleanup requires HTTP 201, a matching random external ID, an exact valid document ID and no duplicate indication. Other documents are never listed or deleted. A timeout, unmatched record or failed deletion can leave provider data retained; that state is reported. A 202 deletion acknowledgment does not count as completed deletion. [Delete endpoint](https://docs.veryfi.com/api/receipts-invoices/delete-a-document/)

An exclusive consumption ledger is written before network I/O. No timeout, 503 or unknown outcome causes a retry or alternative-provider request. Headers and keys are not logged. Successful JSON is retained locally as exact response bytes, without rounding financial values, and is not automatically accepted by the application. This experiment has no frontend integration.

Phase 6 of the goal requires approval before private receipt data is sent to a third party. Both earlier Gemini approvals are already consumed and do not authorize Veryfi. After the free account/configuration is ready and you explicitly approve this scope, the authorization will be recorded against the sealed [probe plan](veryfi-probe-plan-v1.json). No live Veryfi accuracy has yet been measured.
