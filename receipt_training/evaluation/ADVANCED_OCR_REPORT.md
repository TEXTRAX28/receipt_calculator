# Advanced OCR investigation — work in progress

Updated 2026-10-31. The full twelve-phase objective remains active. This report records evidence gathered so far; it does not certify a finished scanner or public release.

## Protected baseline

The original checkout on `receipt-dataset-evaluation` remains untouched, including its three existing uncommitted Gemini fixes. Those fixes were preserved in isolated commit `ade27e3`. `stable/receipt-verified` points to `ee725ba45e799bee8501d3de034e0302c0127afd`, which adds reproducible baseline evidence and evaluation checks. `feature/advanced-ocr-vision-ai` was created from that exact commit. No merge, deployment, push or billing activation has been performed.

“Verified baseline” means the existing application and its failures were reproduced: 108 unit tests, the production build and 65 browser tests passed, with one duplicate breakpoint check skipped. The worktree application sources matched the tested primary checkout byte for byte. Fifteen evaluation tests passed before the branch was created. It does **not** mean automatic recognition is reliable. The optional Gemini reader had not completed a successful live extraction at that point.

## Original system and corpus

The original pipeline uses English Tesseract.js 6.0.1 with single-block segmentation, browser image normalization and overlapping panels for tall images. A heuristic parser creates an editable draft, then a separate exact-money engine validates and splits it. Graph navigation and verified source locations: `src/lib/ocr.ts:L1`, `src/lib/images.ts:L252`, `src/lib/parser.ts:L36`, `src/lib/engine.ts:L31`, `src/lib/engine.ts:L390`, `src/lib/money.ts:L1`.

The original manifest contains 50 distinct financial receipts: 44 CORD, four Taiwan Costco, one UK Bristol Costco and one historical Tesco. There is also one nonfinancial photo-order control and a byte-identical Bristol alias. Original financial splits remain 38 development / 12 evaluation. The original evaluation set was inspected in an earlier task; repeating it provides regression evidence, not a fresh blind holdout.

The two original user photos form a separate UK Costco transaction with 18 purchases, £163.16 before VAT, £13.62 VAT and £176.78 paid. Four supplementary diagnostic cases cover the grouped photos, each individual photo and the nonfinancial control. They remain separate from the original 50. The user photos have already influenced the demo/parser and are development data.

There are no genuine digital receipts or PDFs in this corpus. CORD labels cover top-level menu items and can omit paid nested modifiers. Six original financial manual annotations are partial source-checked visual references, not independent human verification. The original set has **zero** receipts with enough explicitly complete ground truth for the strict complete-receipt metric. That result is unscorable, not a claimed 0% or 100%. A source-checked complete financial transcription exists for the supplementary UK transaction, with its verification limitations recorded.

## Measured model comparison

The same frozen prepared image panels, original labels, original parser and exact calculation code were used for both neural OCR candidates. No inference runner reads labels. Source, image, panel, prediction and model hashes are recorded. Private raw outputs and images remain ignored; aggregate results are in `advanced-model-comparison.json`.

| Original 50 receipts | Tesseract baseline | PP-OCRv6 medium / ONNX | docTR DB-ResNet50 / PARSeq |
|---|---:|---:|---:|
| Matched labelled products / 130 | 33 | 77 | 71 |
| Product recall | 25.38% | 59.23% | 54.62% |
| Product precision against available labels | 45.83% | 67.54% | 66.98% |
| Exact normalized descriptions / 130 | 20 | 61 | 54 |
| Correct line prices / 129 | 3 | 7 | 6 |
| Correct quantities / 117 | 3 | 6 | 6 |
| Correct printed final totals / 49 | 0 | 1 | 1 |
| Trusted reconciliation successes / 49 | 0 | 0 | 0 |
| Parser failures | 1 | 2 | 2 |

Precision is restricted to the annotation scope; omitted modifiers can make legitimate predictions look extra. Unmatched predictions are not automatically labelled duplicates. A zero discrepancy with invalid fields or the wrong printed total does not count as successful reconciliation.

Tesseract end-to-end baseline mean was 1,283.68 ms and p95 3,709 ms, including browser preparation, a new OCR worker, parsing and reconciliation. Paddle inference alone averaged 2,701.5 ms (p95 6,021 ms); docTR inference averaged 4,089.88 ms (p95 9,922 ms). Their model initialization and image preparation are separate, so these numbers do **not** establish an end-to-end latency comparison. Some preparation exports ran alongside dependency setup; those export times must not be presented as production latency. Both candidate engines completed all 54 original/supplement diagnostic cases without recognition exceptions. Their old-parser failures remain visible in the table.

Both models read 18 purchase rows from the main user photo, versus zero with the original scanner on the original uncropped bytes. Both produced 20 rows when the footer photo was also supplied: the old cross-photo path preserved two overlapping purchases. Recognition improvements alone do not solve overlap, financial parsing or currency ambiguity.

All these model runs were local, with $0 receipt API cost. Compute/hosting cost has not been measured. Models ran on CPU with four threads; the laptop has an RTX 3060 with 6 GiB VRAM, but its installed Torch runtimes are CPU builds. Peak process working sets are recorded in private run metadata. A server-hosted model is not an on-device phone model.

## Technologies investigated

| Candidate | Verified capability / access | Current decision boundary |
|---|---|---|
| PaddleOCR 3.7.0, PP-OCRv6 | Detection, multilingual recognition, boxes and OCR scores; tested via ONNX Runtime 1.31.1. Code and the two downloaded model cards declare Apache-2.0. [Project](https://github.com/PaddlePaddle/PaddleOCR), [usage](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html). | Stronger measured local candidate than docTR on this cohort. Not yet wired into the consumer workflow or sufficient for reliable financial extraction. |
| docTR 1.1.0 | Local neural detection/recognition with word geometry; project Apache-2.0. Tested with Torch 2.15.0+cpu, DB-ResNet50 and PARSeq. [Project](https://github.com/mindee/doctr). | Measured competitor; retained as a configurable adapter, not chosen over Paddle on current evidence. |
| Surya 0.23.0 | Current project uses local inference through vLLM or llama.cpp. Code Apache-2.0; weights have a separate modified license with commercial conditions. [Project and license](https://github.com/datalab-to/surya). | Researched, not benchmarked. Backend setup and weight licensing need review before public integration. |
| Veryfi | Structured receipt/invoice line items, quantities, discounts and taxes. Free plan lists 100 documents/month; Starter lists a $500 monthly minimum and $0.08/receipt. [Fields](https://faq.veryfi.com/en/articles/3740415-what-fields-veryfi-extract-for-receipts-invoices), [pricing](https://www.veryfi.com/pricing/). | No credentials or private-upload approval. No measured accuracy or Costco advantage is claimed. |
| Google Document AI Expense Parser | Dedicated expense processor. Published price is $0.10 per document count of up to ten pages. Online requests are processed in memory; Google states customer content is not used to train these models. [Processors](https://docs.cloud.google.com/document-ai/docs/processors-list), [pricing](https://cloud.google.com/products/document-ai/pricing), [data handling](https://docs.cloud.google.com/document-ai/docs/security). | Not configured or benchmarked. Exact processor version, target-region availability and trial eligibility must be pinned if selected for a trial. |
| Azure Document Intelligence | `prebuilt-receipt`, GA API 2024-11-30, structured item/quantity/price/tax fields and geometry. F0 lists 500 free pages/month. Temporary data/results are retained up to 24 hours; v4 supports deleting analyze results earlier. [Receipt model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0), [pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/), [retention](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/faq?view=doc-intel-4.0.0). | Not configured or benchmarked. The public pricing table returned placeholders for paid regional prices, so no exact paid price is asserted. |
| AWS Textract AnalyzeExpense | Structured summary fields and line-item groups, including normalized item/quantity/price. [API](https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeExpense.html), [pricing](https://aws.amazon.com/textract/pricing/). | Not configured or benchmarked; region-specific cost and AI data-use/opt-out policy review remain open. |
| OpenAI vision | Current Responses image APIs support detailed image input and structured output. Pricing lists GPT-6.1 Sol at $2/$10 and Terra at $1/$5 per million input/output tokens at standard short-context rates. [Vision](https://developers.openai.com/api/docs/guides/images-vision), [pricing](https://developers.openai.com/api/docs/pricing). | No API credentials, quota or private-data approval. No live receipt benchmark. Model access, retention configuration and actual token cost remain unverified. |
| Gemini | Existing key works with stable 3.1 Flash-Lite: a synthetic two-item receipt passed schema, description/quantity/price/total checks in 8,747 ms. 3.8 Flash returned HTTP 503 in a separate single attempt. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [pricing](https://ai.google.dev/gemini-api/docs/pricing). | Synthetic connection check only. One real cropped-receipt benchmark is awaiting explicit approval. No automatic provider retry/fallback or paid activation. |
| Anthropic Claude | Current model catalog supports image input. Sonnet 5.5 lists $2/$10 per million input/output tokens. [Models and pricing](https://platform.claude.com/docs/en/models/overview). | No credentials or real-receipt measurements. Retention and high-resolution input settings need verification before implementation. |

Cloud prices are published planning figures, not measured receipt costs or proof of accuracy. The investigation has not selected a final cloud provider or established that any paid service outperforms the measured local models.

## Implemented changes so far

- Immutable baseline outputs and a stricter scorer covering exact descriptions, merchant, quantity, unit/line price, discount association, subtotal, printed tax/total, missing/extra rows, trusted reconciliation, strict complete-receipt eligibility and mean/p95 timing. Added regression cases prevent incomplete truth and false arithmetic balance from inflating scores.
- Grouped-photo/control evaluation, exact panel exports and pluggable local-model benchmarking. Model adapters retain geometry and OCR scores independently of receipt parsing and money calculations.
- The Gemini REST parser now reads final `model_output` steps. SDK `output_text` is not guaranteed in raw REST responses. Tests reject thought/user/tool content as financial output. [REST response specification](https://ai.google.dev/api/interactions-api).
- Development/evaluation watchers ignore model environments and generated runs.
- A bounded JSON-lines local-model worker validates parent-owned JPEG paths, hashes, decoded dimensions and protocol limits. Its real synthetic smoke test loaded Paddle, read the fixture, rejected an outside path and exited cleanly in 9,837 ms including startup. The parent HTTP/process bridge and frontend integration remain unimplemented; this is not yet a new consumer reader.

Current application unit tests: 119 passed. Current evaluation/spatial/worker checks: 22 passed. The production build and fresh browser run passed: 65 tests, one duplicate-breakpoint skip. No external real-receipt accuracy result has been produced.

### Financial-parser follow-up

The feature branch now supports IDR and TWD throughout the receipt schema, AI schema, exact money calculation and payment formatting. A separate printed-amount normalizer validates grouping, keeps signs, never rounds a value into currency precision and leaves ambiguous three-place separators unresolved. A malformed or ambiguous OCR amount now keeps an editable draft instead of crashing the entire scan. Missing Costco VAT legends no longer cause invented A=20%/Z=0% rates; unresolved rates on tax-exclusive items block confirmation.

The same frozen Paddle outputs were rescored after these changes, with the original labels unchanged. `advanced-parser-comparison.json` records 102/130 matched products (78.46% recall), 102/143 precision against available labels, 81/130 exact descriptions, 8/129 correct line prices, 6/117 quantities and 3/49 printed totals. There are no parser exceptions, but still **zero trusted reconciliations**. Many receipts lack printed currency context, and price/quantity layout extraction remains inadequate. This is measured progress, not a reliable finished scanner. These current-model results must also remain distinct from the engine-only comparison above.

## Remaining requirements

The next work must fix parsing/locale ambiguity and overlap handling, integrate the evidence-selected provider into the frontend/backend, and implement document classification, embedded PDF text, quality/edge/deskew/perspective handling, field-region uncertainty and item rescan. Refund/negative-line support, all split/currency invariants, mobile workflows and public-backend security must be completed and tested.

The original model/schema lacked IDR/TWD and treated Indonesian thousands as decimal fractions. The new normalizer fixes clear grouping and rejects ambiguity, but a receipt without currency/format evidence still needs explicit user context. Recovering correct physical quantities, all money fields and cross-photo overlap remains open. Unknown tax codes/rates must continue to require receipt evidence.

All original manifest records disallow external processing. Two inspected crops of the user's UK receipt remove member/card/transaction identifiers; their hash-bound request manifest permits no upload until approval. The proposed scope is one attempt with 3.1 Flash-Lite using existing free quota, with no billing activation. `store:false` disables stored conversation state, not every provider retention practice. Google's UK/EEA/Swiss data-use provisions and public-client paid-service restriction require a release review. [Terms](https://ai.google.dev/gemini-api/terms).

Final acceptance still needs complete ground truth where available, additional genuine digital/PDF cases, fair cloud/VLM trials where accessible/approved, independent recovery measurements, meaningful uncertainty evidence, exact split regression checks, full upload-to-summary E2E tests, error/security/memory/cost checks, stable-reference verification and the final requirement-by-requirement report. This goal must remain active.
