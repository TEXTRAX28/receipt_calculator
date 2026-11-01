# Azure receipt comparison setup

**Completed 1 November 2026:** the configured UK South F0 resource completed
the separately approved six-crop test, with six successful responses and six
reported deletions. That approval is consumed. See the
[measured comparison and remaining limits](AZURE_SIX_RESULT.md). The instructions
below preserve how this research-only setup and approval were prepared; they do
not authorize another upload.

The next candidate is **Azure Document Intelligence, `prebuilt-receipt`, API `2024-11-30`**. Its documented fields include purchased quantity, unit price, line price, product code and receipt totals; its receipt schema lists English, Traditional Chinese and Indonesian among supported languages. These are reasons to test it, not proof that it beats Veryfi or the local hybrid. [Receipt model and schema](https://github.com/Azure-Samples/document-intelligence-code-samples/blob/main/schema/2024-11-30-ga/receipt.md).

The [sealed comparison plan](azure-screening-plan-v1.json) uses exactly the same six previously inspected redacted PNG crops as the completed Veryfi/local screen: Bristol Costco, Taiwan Costco, Tesco and three restaurant receipts. There are 26 reference purchase rows and 25 known prices. Faint/unprinted fields remain unknown. The screen is source-informed development evidence, not a blind holdout or a full-receipt accuracy benchmark.

Sixteen synthetic protocol/security tests pass. The driver is offline by default, uses one extraction POST per crop, allows at most thirty status GETs per new asynchronous operation and attempts at most one matching deletion. Separate persistent batch/case records prevent repeated uploads. It rejects redirects, foreign operation URLs and repeated result IDs, bounds response sizes and stops after the first extraction or cleanup failure. Raw response bytes are preserved without calculating financial values. There have been **zero Azure API requests**, no model training calls and no application/default-reader changes. All existing Veryfi/Gemini private-upload approvals are consumed and cannot authorize Azure.

## Account and cost

Use an existing Azure account or Microsoft's [free-account signup](https://azure.microsoft.com/en-us/free/). Create a dedicated **Document Intelligence** resource in the [Azure portal](https://portal.azure.com/) and explicitly select the **Free F0** pricing tier. Select an available UK/EU location appropriate for your account and note the exact displayed region. Region availability and trial eligibility must be checked in your account; the harness does not infer location from the hostname.

Microsoft lists 500 free pages per month on F0. These six PNGs use six pages and are each below the 4 MB F0 input limit. The expected service charge is zero only while using F0 within its unused allowance; the harness cannot inspect your billing or quota. If F0 is unavailable, do not switch to S0 for this test. [Pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/), [input and setup requirements](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0).

## Credentials

Open the resource's **Keys and Endpoint** page. Add these two values to this improvement worktree's ignored `.env.local`:

```dotenv
AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT=https://YOUR-RESOURCE.cognitiveservices.azure.com/
AZURE_DOCUMENT_INTELLIGENCE_KEY=YOUR-RESOURCE-KEY
```

Use the endpoint for that dedicated F0 resource. The research harness accepts HTTPS custom resource endpoints on `cognitiveservices.azure.com`; it never accepts a source document URL. Keep keys out of chat, source code, browser settings and `VITE_` variables. The key permits data-plane operations on that resource, so use a dedicated test resource. The harness needs no subscription-owner credential, Azure storage key or management access. [API authentication and asynchronous request contract](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/analyze-document?view=rest-aiservices-v4.0+(2024-11-30)).

From the improvement worktree, this command only checks the prepared files and reports whether the endpoint/key exist. It does not contact Azure:

```powershell
node receipt_training/scripts/benchmark_azure_screening.mjs
```

This is a research harness; Azure is not an app reader option yet. Do not upload the crops manually through the Azure portal, because that would be an additional unmeasured upload.

## Data handling and approval

Microsoft documents encrypted temporary processing/storage in the resource region and automatic deletion of the input/result 24 hours after analysis completes. Its Delete Analyze Result API supports earlier deletion. The harness will request deletion only for each validated new result returned by this run; invalid operation IDs, provider failures or timeouts may prevent cleanup. A reported HTTP 204 is not an independent erasure audit. [Data handling](https://learn.microsoft.com/en-us/azure/foundry/responsible-ai/document-intelligence/data-privacy-security), [deletion API](https://learn.microsoft.com/en-us/rest/api/aiservices/document-models/delete-analyze-result?view=rest-aiservices-v4.0+(2024-11-30)).

This test makes no custom-model training calls. A separate account-specific contractual training-use commitment has not been verified, so it does not claim a training opt-out or a legal compliance certification. The crops reduce identifiers but are not guaranteed anonymous.

After saving both values, report the resource region and confirm **F0 with at least six unused pages**. A separate explicit Azure upload approval will then bind this exact plan, endpoint and six crop hashes. The execution path stays disabled until that approval exists; credentials alone do not start a scan. No paid activation, retries, original-image upload, other provider call or old-result deletion is included.

Offline reproduction:

```powershell
node --test receipt_training/scripts/test_azure_receipt_probe.mjs
python -X utf8 receipt_training/scripts/prepare_azure_screening.py --check
node receipt_training/scripts/benchmark_azure_screening.mjs
```

At the original research-only preparation checkpoint, Azure accuracy was unmeasured
and app verification had 484 unit and 167 browser passes, plus one existing skip.
The later [six-crop result](AZURE_SIX_RESULT.md) and
[local decoder verification](ROW_FIRST_DECODER.md) supersede those status counts.
Actual account billing, quota and region have not been independently inspected.
The full twelve-phase goal remains active.
