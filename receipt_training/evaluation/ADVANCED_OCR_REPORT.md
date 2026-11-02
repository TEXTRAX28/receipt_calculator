# Advanced OCR investigation — work in progress

Current consolidated status, 2 November 2026:
[technical checkpoint and requirement acceptance audit](GOAL_ACCEPTANCE_AUDIT.md).
The latest [printed purchase-column interpretation](COLUMN_PURCHASES.md) improves
explicit-currency hybrid line prices 131/143 → 132/143 and primary quantities
30/120 → 32/120, with no scored per-case regression. Source checks remain
mandatory. Current validation passes 693 unit tests and 179 browser tests with
one existing skip. Saved Azure/Veryfi price scores are preserved without new
uploads. Separately, Gemini 3.8 successfully reads one non-private synthetic
receipt through the real backend; six real-crop tests are prepared pending new
Phase 6 approval. This is availability evidence, not a new accuracy score.

The preceding [literal financial-summary role proposals](FINANCIAL_ROLE_RECOVERY.md)
improve explicit-currency hybrid fees 4/8 → 7/8, printed tax 13/22 → 16/22 and
receipt discounts 2/4 → 3/4 with no scored known-field regression. All proposals
retain source checks; automatic hybrid counts and trusted reconciliation are
unchanged. Its validation passed 674 unit tests and 177 browser tests with one
existing skip. Saved Azure/Veryfi price scores are preserved with zero uploads.
The full goal remains active.

The preceding [514-file offline audit](advanced-goal-acceptance-audit-v1.json) accounts for
all 53 unique source hashes and reproduces both retained Tesseract baselines
against the current references. Automatic known line-price matches improve from
5/143 to 116/143; explicit-currency hybrid matches 131/143. Trusted reconciliation
remains 0/49 and original whole-receipt accuracy remains unscorable. The latest
Gemini upload boundary rejects invalid/oversized prepared JPEG sections before
provider calls. That checkpoint passed 653 unit tests, 175 browser tests with one
existing skip, build/typecheck, formatting and graph refresh. No new model call,
private upload, paid activation, merge, push or deployment occurred. The full
twelve-phase goal remains active.

## Historical checkpoint notes

The following entries retain the measurements and next steps at their original
checkpoints. “Latest,” “next” and “not configured” within those entries refer to
that historical checkpoint; use the consolidated audit above for current state.

Latest reference audit: [financial summaries and strict complete-receipt eligibility](FINANCIAL_SUMMARY_TRUTH.md) add nine source-checked tax-basis labels and one printed zero-rounding value while preserving every stored prediction and existing price/quantity/discount/total score. Across 306 retained views, all nine current hybrid basis values remain unresolved with pending source checks; only 4/8 known service amounts match. All fifty original complete receipts remain unscorable. The separate UK supplement becomes eligible but scores 0/1 per retained view; its earlier primary finances are correct while two exact O/0 product-name readings prevent strict success. Eight source/scoring tests pass. No app source change, model call, new latency sample or cloud upload is claimed.

Latest reader integration: [optional Azure word reader](AZURE_APP_READER.md) preserves the six saved crops’ 25/25 known line prices with explicit currency (18/25 automatically), exact word/row geometry and all prior per-case known-field scores. It supplies real source highlights and mandatory review, ignores native financial fields and requires a separate finite section allowance plus scan consent. No new cloud request or default switch occurred; credentials alone keep it disabled. Verification passes 615 unit tests and 173 standard browser tests with one existing skip, plus local HTTP-to-split synthetic-provider controls. Full financial accuracy, physical-device and public-release acceptance remain open.

Latest source interpretation: [separate quantity/unit/total rows and unit-price proposals](PURCHASE_EXPRESSIONS.md) improve the primary parser on the original fifty from 113/145 to 121/145 matched purchases, 22/120 to 30/120 quantities and 6/31 to 14/31 known unit prices with explicit currency. The hybrid improves selected-currency line prices 126/143 → 131/143 and units 22/31 → 25/31; automatic line prices improve 115/143 → 116/143. Other hybrid financial vectors and copied totals remain unchanged. All nine changed fields across both contexts match existing truth with no scored per-case regression. The final actual local-model phone workflow preserves two correct unit proposals and blocked review without edits, in one 60.22-second observation. This is not a p95, new holdout or complete financial result. [Methods and remaining limits](PURCHASE_EXPRESSIONS.md).

Earlier parser change: [leading purchased counts are separated from descriptions and always reviewed](LEADING_QUANTITY_REVIEW.md). Same-evidence old/new replay covers the original fifty receipts plus the UK supplement in two contexts and two readers: source-known primary quantities improve from 6/120 to 22/120, while every price, discount, tax and adjustment vector is unchanged. A real local Paddle/API/phone-emulated reading preserves Hot Tea as quantity 2 with row price 44000 and a pending source check. Independent agreement cannot clear the new pack-count ambiguity. All 505 unit tests, 167 standard browser tests and the real local native UI repeat pass, with one existing browser skip; the production build/typecheck, formatting and graph refresh pass. The [eight-call clearer-prompt trial](LITERAL_TOTAL_PROMPT_TRIAL.md) is rejected: both variants match 44/49 known prices, while printed-tax accuracy falls from 2/3 to 1/3. No prompt or default-provider change follows that negative result.

Earlier correction: [long single-photo receipts receive the same bounded reading time as multiple photos](LONG_SINGLE_PHOTO_DEADLINE.md). A fresh updated browser/native pipeline completed the previously failing twenty-two-purchase receipt in 169.46 seconds, with OCR/vision HTTP 200 and all names/quantities correct. Seventeen of twenty-one known line prices match; four prices and duplicated tax handling remain incorrect and blocked by unresolved currency/source checks. The canonical one-photo format, financial rules and rate limits are preserved. All 489 unit tests and 167 standard browser tests pass, with one existing browser skip; typecheck/build, formatting and graph refresh pass. This one-case development regression is separate from the fresh fifty-case result below.

Latest full-cohort evidence: [all fifty original receipts have new current-pipeline native readings](CURRENT_NATIVE_ORIGINAL50.md), with fifty OCR successes, forty-nine vision successes and one long single-photo timeout. Under source-covered v4 truth, the automatic hybrid matches 139/145 purchases, 128/145 exact names, 97/120 quantities and 88/143 line prices, versus the primary reference's 113/145, 91/145, 6/120 and 16/143. Printed totals match 32/49, while trusted reconciliation remains 0/49 and complete financial accuracy remains unscorable. Mean preparation-to-editable-draft time is 50.56 seconds and nearest-rank p95 is 107.34 seconds, including the safe fallback. These fresh results expose a regression from the earlier mixed observations and are preserved before the subsequent deadline correction. [546-file evidence](advanced-current-native-original50-v1.json).

Previous implementation checkpoint: [bounded compact output for multiple original photos](COMPACT_MULTIPHOTO_READER.md) completed the actual two-photo Costco workflow in 205.86 seconds, with eighteen correct purchase amounts, four correct coupons, GBP 176.78 and an exact source-reviewed split of GBP 58.93 / 58.93 / 58.92. Eight source checks still block the initial draft. A real local four-photo synthetic workflow completed two model batches, preserved both identical chicken purchases and split GBP 19.50 equally without financial edits. One-photo requests keep the canonical output format because compact trials still made serious price/currency errors. Six formerly oversized historical inputs have also been freshly prepared and inferred under the unchanged pixel guard. The original-50 result now combines those six with 44 retained valid observations; it is explicitly mixed vintage, not a fresh full-cohort latency result. No new cloud requests or paid activation occurred. The twelve-phase goal remains active.

This checkpoint passes **484 unit tests and 167 desktop/mobile browser tests**, with one existing skip, plus the build/type check, formatting and actual four-photo native browser test. The [671-file workflow packet](advanced-compact-multiphoto-v1.json) preserves failed pilots and both actual workflows. A separate [482-file validation packet](advanced-compact-validation-v1.json) freezes source/build/test artifacts, verifies no configured API value in source or built output, and confirms the original three dirty files, their diff hash and the stable commit remain unchanged. The first browser attempt's two navigation failures during an overlapping rebuild remain recorded; the full rerun used an unchanged finished build.

The subsequent [full-source Tesco review](TESCO_FULL_SOURCE_REVIEW.md) adds ten purchase groups and nine known prices in a separate v3 truth view, leaving original/v2 labels unchanged. Seven frozen pipelines are rescored on identical predictions against both versions. The current hybrid's existing predictions score 111/143 known prices and 132/145 exact names under v3, versus 102/134 and 122/135 under v2; these increases are annotation coverage, not a model gain. The fresh same-pixel Tesco canonical/compact trials score 9/9 versus 7/9 prices while both still calculate incorrect payable totals. All purchased quantities, the first unreadable price, numeric reductions and tax basis remain unknown; complete original financial truth remains unscorable. Nineteen evaluation tests pass, with no new inference or application changes.

Next provider experiment: an [Azure Document Intelligence F0 comparison](AZURE_SCREENING_SETUP.md) is prepared for the same six redacted crops. Sixteen synthetic security/protocol checks pass, with zero Azure requests. API/model, crop hashes, upload/poll/deletion bounds and raw-output recording are sealed. Azure endpoint/key configuration, the user-confirmed resource region and six unused F0 pages, and separate private-upload approval are still missing. This does not select Azure, imply better accuracy, activate billing or change the app. Existing provider approvals remain consumed.

Additional evaluation coverage: [service-charge and signed-rounding metrics](RECEIPT_ADJUSTMENT_METRICS.md) expose eight labelled service charges and one newly source-checked printed rounding amount. The same historical Qwen/hybrid observations match only 4/8 charges and 1/1 rounding; price/quantity/name counts remain unchanged. Eight new tests and fifteen existing evaluator tests pass, including rejection of a balanced fee/rounding counterexample. Source unknowns and strict complete-receipt ineligibility remain explicit. This is an evaluation extension; the separate fully fresh fifty-case run above now has terminal evidence and matches 3/8 charges and 0/1 rounding, including its timeout.

Previous research: [direct-source recovery and currency-decoder trials](RECOVERY_DECODER_TRIALS.md) produced no accuracy gain and were rejected. The recovery prototype makes zero replacements across the original 50, three UK supplement diagnostics and six comparison crops. Eight actual local Qwen calls show that currency-specific syntax preserves JPY/KWD precision but leaves all three real outputs identical to fresh controls, including semantic errors. No application/default-provider change or further cloud upload was made. [652-file evidence](advanced-recovery-decoder-trials-v1.json).

Research validation: [436 unit tests, build/type check and formatting pass](advanced-recovery-decoder-validation-v1.json). Consumer sources and all six built app assets match `b732f24` exactly. Its 157 browser passes/one existing skip remain prior evidence for that unchanged app; no new browser run is claimed. A timing-sensitive unit fixture now allows setup before testing the stalled-provider deadline; production behavior is unchanged.

Updated 2026-11-01. The full twelve-phase objective remains active. The latest implementation adds an optional, consent-gated Veryfi text reader with a persistent finite allowance; the existing key alone leaves it disabled. Its text goes through the measured parser, with mandatory purchase, adjustment and tax-source checks even when money balances. Verification includes 421 unit tests, 157 browser tests with one existing skip, the production build/type check and six focused desktop/mobile tests. Twelve saved-response variants preserve all prior financial fields with zero new external requests. See [Veryfi app integration](VERYFI_APP_READER.md). This report records evidence gathered so far; it does not certify a finished scanner or public release. The earlier [unknown-tax guard](UNKNOWN_TAX_REVIEW.md) and [290-file checkpoint](advanced-unknown-tax-review-v1.json) remain historical evidence.

The completed one-use Veryfi comparison found only 16/18 purchase prices correct in its structured fields, while its unchanged OCR text through the parser matched all 18 purchases, four coupons and VAT codes, calculating £176.78 on the two approved redacted crops. Gemini returned no draft in its two approved HTTP 503 attempts. This is one source-informed development transaction, not a broad provider selection. The separate raw-print VLM profile was rejected. See [Veryfi live results](VERYFI_LIVE_RESULT.md), [raw-print pilot](RAW_PRINTED_PILOT.md) and the [683-file evidence checkpoint](advanced-printed-provider-checkpoint-v1.json).

The separately approved [six-receipt Veryfi comparison is complete](VERYFI_SIX_RESULT.md): six successful extraction uploads and six reported deletions, without retries, paid activation or Gemini uploads. Its native fields match 22/26 priced-row names and 18/25 known line prices. After the measured [reduced-price grouping fix](REDUCED_PRICE_GROUPING.md), its saved literal text through the parser matches 26/26 names and 25/25 known prices with currency supplied after extraction; automatic currency yields 19/25 prices. Qwen/hybrid match 26/26 names and 22/25 prices on the same six crops. These partial, source-informed cases do not change the original corpus, establish full-receipt financial correctness or justify changing the default reader. Both Veryfi live-test scopes are consumed. Optional [receipt-edge suggestions](RECEIPT_EDGE_SUGGESTIONS.md) also preserve originals and require explicit Apply; they do not provide perspective correction.

## Protected baseline

The original checkout on `receipt-dataset-evaluation` remains untouched, including its three existing uncommitted Gemini fixes. Those fixes were preserved in isolated commit `ade27e3`. `stable/receipt-verified` points to `ee725ba45e799bee8501d3de034e0302c0127afd`, which adds reproducible baseline evidence and evaluation checks. `feature/advanced-ocr-vision-ai` was created from that exact commit. No merge, deployment, push or billing activation has been performed.

“Verified baseline” means the existing application and its failures were reproduced: 108 unit tests, the production build and 65 browser tests passed, with one duplicate breakpoint check skipped. The worktree application sources matched the tested primary checkout byte for byte. Fifteen evaluation tests passed before the branch was created. It does **not** mean automatic recognition is reliable. The optional Gemini reader had not completed a successful live extraction at that point.

## Original system and corpus

The original pipeline uses English Tesseract.js 6.0.1 with single-block segmentation, browser image normalization and overlapping panels for tall images. A heuristic parser creates an editable draft, then a separate exact-money engine validates and splits it. Current graph navigation and verified source locations: `src/lib/ocr.ts:L1`, `src/lib/images.ts:L272`, `src/lib/parser.ts:L28`, `src/lib/engine.ts:L31`, `src/lib/engine.ts:L390`, `src/lib/money.ts:L1`.

The original manifest contains 50 distinct financial receipts: 44 CORD, four Taiwan Costco, one UK Bristol Costco and one historical Tesco. There is also one nonfinancial photo-order control and a byte-identical Bristol alias. Original financial splits remain 38 development / 12 evaluation. The original evaluation set was inspected in an earlier task; repeating it provides regression evidence, not a fresh blind holdout.

The two original user photos form a separate UK Costco transaction with 18 purchases, £163.16 before VAT, £13.62 VAT and £176.78 paid. Four supplementary diagnostic cases cover the grouped photos, each individual photo and the nonfinancial control. They remain separate from the original 50. The user photos have already influenced the demo/parser and are development data.

There are no genuine digital receipts or PDFs in this corpus. CORD labels cover top-level menu items and can omit paid nested modifiers. Six original financial manual annotations are partial source-checked visual references, not independent human verification. The original set has **zero** receipts with enough explicitly complete ground truth for the strict complete-receipt metric. That result is unscorable, not a claimed 0% or 100%. A source-checked complete financial transcription exists for the supplementary UK transaction, with its verification limitations recorded.

## Initial model comparison with the original text parser

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
| PaddleOCR 3.7.0, PP-OCRv6 | Detection, multilingual recognition, boxes and OCR scores; tested via ONNX Runtime 1.31.1. Code and the two downloaded model cards declare Apache-2.0. [Project](https://github.com/PaddlePaddle/PaddleOCR), [usage](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/OCR.html). | Stronger measured local candidate than docTR on this cohort. Now available through the configured computer reader; financial extraction is still insufficient for unattended use. |
| docTR 1.1.0 | Local neural detection/recognition with word geometry; project Apache-2.0. Tested with Torch 2.15.0+cpu, DB-ResNet50 and PARSeq. [Project](https://github.com/mindee/doctr). | Measured competitor; retained as a configurable adapter, not chosen over Paddle on current evidence. |
| Qwen3-VL-4B-Instruct GGUF | Official Apache-2.0 model; tested locally with Q4_K_M language weights, Q8_0 projector and pinned llama.cpp Vulkan b11960. [Model](https://huggingface.co/Qwen/Qwen3-VL-4B-Instruct-GGUF), [runtime](https://github.com/ggml-org/llama.cpp/blob/master/tools/mtmd/README.md). | V1 rejected two of seven formats; v2 passed all seven and improved labelled fields, but six financial cases still yielded zero trusted reconciliations. Not selected as an automatic replacement. See the separate pilot below. |
| Surya 0.23.0 | Current project uses local inference through vLLM or llama.cpp. Code Apache-2.0; weights have a separate modified license with commercial conditions. [Project and license](https://github.com/datalab-to/surya). | Researched, not benchmarked. Backend setup and weight licensing need review before public integration. |
| Veryfi | Structured receipt/invoice fields and literal OCR text. API Free lists 100 documents/month; no paid activation was made. Default US hosting and proprietary model improvement require explicit consent. [Fields](https://faq.veryfi.com/en/articles/3740415-what-fields-veryfi-extract-for-receipts-invoices), [pricing](https://www.veryfi.com/pricing/), [privacy](https://www.veryfi.com/privacy/). | One UK transaction and a separately approved six-case screen measured. Native fields are weaker than its text/parser path here. Optional app integration uses literal text only, stays disabled without a finite allowance and never auto-selects itself. All live-test approvals are consumed; no original-corpus upload is authorized. |
| Google Document AI Expense Parser | Dedicated expense processor. Published price is $0.10 per document count of up to ten pages. Online requests are processed in memory; Google states customer content is not used to train these models. [Processors](https://docs.cloud.google.com/document-ai/docs/processors-list), [pricing](https://cloud.google.com/products/document-ai/pricing), [data handling](https://docs.cloud.google.com/document-ai/docs/security). | Not configured or benchmarked. Exact processor version, target-region availability and trial eligibility must be pinned if selected for a trial. |
| Azure Document Intelligence | `prebuilt-receipt`, GA API 2024-11-30, structured item/quantity/price/tax fields and geometry. F0 lists 500 free pages/month. Temporary data/results are retained up to 24 hours; v4 supports deleting analyze results earlier. [Receipt model](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/receipt?view=doc-intel-4.0.0), [pricing](https://azure.microsoft.com/en-us/pricing/details/document-intelligence/), [retention](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/faq?view=doc-intel-4.0.0). | Not configured or benchmarked. The public pricing table returned placeholders for paid regional prices, so no exact paid price is asserted. |
| AWS Textract AnalyzeExpense | Structured summary fields and line-item groups, including normalized item/quantity/price. [API](https://docs.aws.amazon.com/textract/latest/APIReference/API_AnalyzeExpense.html), [pricing](https://aws.amazon.com/textract/pricing/). | Not configured or benchmarked; region-specific cost and AI data-use/opt-out policy review remain open. |
| OpenAI vision | Current Responses image APIs support detailed image input and structured output. Pricing lists GPT-6.1 Sol at $2/$10 and Terra at $1/$5 per million input/output tokens at standard short-context rates. [Vision](https://developers.openai.com/api/docs/guides/images-vision), [pricing](https://developers.openai.com/api/docs/pricing). | No API credentials, quota or private-data approval. No live receipt benchmark. Model access, retention configuration and actual token cost remain unverified. |
| Gemini | Earlier 3.1 Flash-Lite synthetic smoke passed in 8,747 ms. The two separately approved real-crop attempts both returned HTTP 503; later synthetic controls also returned 503, while model metadata returned 200. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [pricing](https://ai.google.dev/gemini-api/docs/pricing). | No real-receipt extraction or accuracy result. Both private-upload approvals are consumed. No automatic provider retry/fallback or paid activation. |
| Anthropic Claude | Current model catalog supports image input. Sonnet 5.5 lists $2/$10 per million input/output tokens. [Models and pricing](https://platform.claude.com/docs/en/models/overview). | No credentials or real-receipt measurements. Retention and high-resolution input settings need verification before implementation. |

Cloud prices are published planning figures, not measured receipt costs or proof of accuracy. The investigation has not selected a final cloud provider or established that any paid service outperforms the measured local models.

## Implemented changes so far

- Immutable baseline outputs and a stricter scorer covering exact descriptions, merchant, quantity, unit/line price, discount association, subtotal, printed tax/total, missing/extra rows, trusted reconciliation, strict complete-receipt eligibility and mean/p95 timing. Added regression cases prevent incomplete truth and false arithmetic balance from inflating scores.
- Grouped-photo/control evaluation, exact panel exports and pluggable local-model benchmarking. Model adapters retain geometry and OCR scores independently of receipt parsing and money calculations.
- The Gemini REST parser now reads final `model_output` steps. SDK `output_text` is not guaranteed in raw REST responses. Tests reject thought/user/tool content as financial output. [REST response specification](https://ai.google.dev/api/interactions-api).
- Development/evaluation watchers ignore model environments and generated runs.
- A bounded JSON-lines local-model worker validates parent-owned JPEG paths, hashes, decoded dimensions and protocol limits. Its real synthetic smoke test loaded Paddle, read the fixture, rejected an outside path and exited cleanly in 9,837 ms including startup.
- A server-held persistent-worker bridge, local recognition/capability endpoints and the **This computer** scan choice now connect that model to the existing upload/review/split workflow. Cloud consent remains specific to Gemini; local errors retain photos and never trigger a cloud fallback. Public serving, authentication and deployment have not been implemented.
- The computer reader validates pinned model assets before advertising availability, strips provider credentials from the worker environment, bounds UTF-8 output and photo references, stops its owned process tree on cancellation/deadline, and removes checked per-job temporary directories. Crash-time cleanup and OS-level isolation remain open.

At the computer-integration checkpoint, 132 application unit tests passed, including thirteen new computer-process/API cases for malformed output, worker failure/recovery, concurrent scans, cancellation, deadlines, credential stripping and cleanup boundaries. After the overlap/title/image-budget fixes below, that checkpoint count was **155 passed**; the current rounding checkpoint below records **170 passed**. Typecheck and production build passed. The fresh standard browser run records 69 passed and one duplicate-breakpoint skip; four desktop/mobile cases use explicitly mocked computer responses and cover phone layout, review-to-split and failure recovery. Evaluation/spatial/worker checks: 22 passed. No external real-receipt accuracy result has been produced.

### Genuine computer-reader integration checks

Two opt-in browser cases used the installed Paddle model through the real local HTTP endpoint, in desktop and iPhone-sized contexts. Each uploaded the same made-up two-item receipt, automatically extracted its fields without correction and split its £5.50 total into £2.75 per person. They passed, blocked external browser requests, and made only the local recognition POST. Their durations (14.5 seconds desktop and 4.8 seconds mobile) are whole test durations, not corpus latency measurements.

A separate HTTP check read two different synthetic receipts with one reused worker, returned the expected distinct text, and verified empty temporary-job storage after both requests. Example cold/warm request times were 9,404/986 ms. Those two observations do not establish mean/p95 latency or a speed advantage. Reproducibility assets now include fixed model URLs/revisions, sizes and SHA256 checksums, a verified-public-download setup script and an offline check. All six existing Paddle files passed; a fresh installation/download has not been claimed as tested.

These checks prove the new provider can run through the consumer workflow. The subsequent original-photo check below measures one development transaction; full original-corpus integrated inference still remains required.

### Financial-parser follow-up

The feature branch now supports IDR and TWD throughout the receipt schema, AI schema, exact money calculation and payment formatting. A separate printed-amount normalizer validates grouping, keeps signs, never rounds a value into currency precision and leaves ambiguous three-place separators unresolved. A malformed or ambiguous OCR amount now keeps an editable draft instead of crashing the entire scan. Missing Costco VAT legends no longer cause invented A=20%/Z=0% rates; unresolved rates on tax-exclusive items block confirmation.

The same frozen Paddle outputs were rescored after these changes, with the original labels unchanged. `advanced-parser-comparison.json` records 102/130 matched products (78.46% recall), 102/143 precision against available labels, 81/130 exact descriptions, 8/129 correct line prices, 6/117 quantities and 3/49 printed totals. There are no parser exceptions, but still **zero trusted reconciliations**. Many receipts lack printed currency context, and price/quantity layout extraction remains inadequate. This is measured progress, not a reliable finished scanner. These current-model results must also remain distinct from the engine-only comparison above.

### Supplied two-photo Costco transaction

The computer reader now retains source boxes while assembling text and conservatively matches a partial footer to a larger photo. It requires a single identical printed transaction reference, complete end-of-purchase sections, an exact ordered sequence of descriptions/SKUs/quantities/unit prices/line prices/tax codes/coupons, at least two distinct purchase SKUs, a smaller section starting near its image's upper edge, and one unambiguous larger match. It never removes repeated purchases within a photo. Missing identity, conflicting coupons, a single repeated SKU or ambiguous alternative sources leave rows untouched. Transaction references are not exposed in merge notes. This rule covers a narrow, tested footer case, not arbitrary multi-photo overlap.

A shared numeric-row matcher also lets the parser identify the preceding product title. `HONEY 1.36KG` and `OLIVE OIL 0.75L` remain descriptions, rather than losing the title or becoming a false price/tax-code row. Purchased quantity still comes from the separate numeric row. Different observed final totals produce an explicit warning; source values are preserved, not edited to force balance. Photo order can still affect which conflicting total is proposed, so human review remains necessary.

On the source-checked supplementary transaction, the frozen Paddle replay changed **20 purchase rows to 18**, retaining both genuine chickens and all four coupons. All 18 purchased quantities, unit prices, line prices and item discounts match the available transcription, as do £163.16 subtotal, £13.62 VAT and £176.78 total. Sixteen of eighteen descriptions are exact under the scorer; two OCR character differences remain. Strict complete-receipt accuracy therefore remains **0/1**, despite successful financial reconciliation. The receipt influenced the parser/demo and is development evidence, not a new holdout. Full metrics and provenance are in `advanced-layout-comparison.json`.

Two genuine local API/browser cases then uploaded the two original uncropped images, checked all eighteen financial rows without editing them, and completed a three-person split of **£58.93 / £58.93 / £58.92**. Desktop and iPhone-sized contexts passed. Latest whole-test durations were 40.7 and 34.3 seconds; these include UI assertions and are not OCR latency measurements. Only the local recognition endpoint was called; external browser requests were blocked. The review visibly disclosed both the overlap merge and conflicting OCR totals.

### Fair parser replay and integration failures found

Both local engines were replayed against the **same current parser source snapshot** and the unchanged original 50 labels. Paddle remains at 102/130 matched products, 8/129 correct line prices, 6/117 quantities, 3/49 final totals and zero trusted reconciliations. docTR yields 97/130 products, 7/129 line prices, 6/117 quantities, 4/49 totals and one trusted reconciliation. Both current replays have zero parsing exceptions; strict original complete-receipt accuracy is still unscorable because its complete-label denominator is zero. Paddle leads product detection, but does not lead every financial metric, and neither is a final production-quality choice.

The first stricter evidence replay exposed six legacy preview images sized 1500×2667, or 4,000,500 pixels. That exceeds the exact four-megapixel decode limit. Current original previews and crops now round down; a seeded 1,000-case property check verifies their dimensions stay within the server's unchanged bounds. The old panels and their model evidence remain immutable. Offline parser/layout replay explicitly records its scope and any legacy over-budget panels; it does not pretend those old panels pass today's live HTTP/decode gate. Fresh integrated full-corpus inference after this preprocessing fix is recorded below, separately from those immutable offline replays.

The initial live browser check also failed before scanning because the benchmark Vite instance shared the running app's dependency cache. Benchmark runs now have their own cache directory. The owned feature server was restarted after confirming that failure; the original primary server was preserved. Fresh live and standard browser checks passed after isolation. New runs also save and hash the evaluator itself, which scoring verifies alongside source/config/prediction hashes.

### Independent local vision-language pilot

The investigation now includes real independent image-based structured extraction with Qwen3-VL-4B, not just neural text OCR. Seven development cases were predeclared, including six financial receipts and one nonfinancial control; no original evaluation ID was selected. Frozen image panels matched the OCR comparison bytes exactly. The model received no labels or OCR text and made no external calls. Pinned public weights/runtime and bounded Windows benchmark/import tools are retained for reproduction.

On the same six financial cases, current Paddle/docTR matched 48/55 labelled products each, versus 15/55 accepted by the v1 Qwen protocol. Correct line prices were 25/54, 24/54 and 15/54 respectively. Qwen read 4/6 final totals correctly, versus Paddle 2/6 and docTR 3/6, but had zero trusted reconciliations. Two strict schema failures count as failures. On the separate nonfinancial control, the frozen Tesseract baseline proposed one spurious draft purchase, while current Paddle, docTR and Qwen each proposed zero. This small pilot remains separate from the full original-50 results.

The native decoder relaxed unsupported `\d` regex constraints; the strict application validator correctly rejected invalid numeric fields. The long Costco result also misclassified coupons/summary figures, and CORD exposed missing signed-rounding support in the shared AI contract. Those v1 contract defects are addressed in the separately versioned rerun below; the original failures remain preserved. The exact 4B/quantization/prompt/decoder protocol is not a justified production replacement. Timing, memory, failure provenance, reproduction commands and limitations are in [VISION_PILOT.md](VISION_PILOT.md) and `advanced-vision-pilot.json`.

### Structured rounding and the complete v2 vision rerun

The shared structured contract now represents an explicitly printed signed rounding adjustment, using a disjoint union that retains nonnegative ordinary purchases/fees/discounts. Equivalent ASCII numeric patterns compile cleanly in the pinned local decoder. Both server and browser keep strict output validation, missing values remain unresolved and currency precision is checked by the exact engine. Fifteen new regression cases cover signed conservation, invalid negative ordinary charges, unreadable/excess-precision values, provider REST decoding and a schema-valid model draft that double-counts VAT. Current verification is **170 application unit tests**, **69 browser tests passed / one duplicate layout skip**, **22 Python tests**, typecheck and production build. The rounding change is isolated in commit `69a0b69`; the stable ref and primary checkout patch remain unchanged.

All seven predeclared vision cases were rerun with the same images/model/runtime, without labels or OCR text. V2 compiled without numeric-schema relaxation and passed strict formatting **7/7**. Across six financial cases, accepted product matching rose to **55/55 labelled products**, exact descriptions **52/55**, line prices **50/54**, purchased quantities **55/55**, unit prices **27/27** and printed totals **6/6**. Item precision is **55/63** and correct coupon association/grouping remains incomplete. Trusted reconciliation is still **0/6** and strict complete receipt **0/1**. The known UK supplement contains 22 proposed purchases against 18 actual purchases. These results support further independent vision experiments, not unattended financial use. The original v1 failures and full original-50 results remain separate. See [VISION_PILOT.md](VISION_PILOT.md) and [advanced-vision-pilot-v2.json](advanced-vision-pilot-v2.json) for exact scopes, hashes and reproduction.

One actual Gemini 3.1 Flash-Lite request with a newly generated synthetic image accepted the union schema and independently reconciled GBP 4.37 with fee, VAT and negative rounding. No private receipt was supplied and no paid service was activated. The local Qwen synthetic output formatted correctly but also emitted VAT as a fee; the exact calculation rejected its 5.10 result against 4.37. Synthetic results establish protocol behavior, not real-receipt accuracy. Actual account billing was not independently verified.

### Fresh full original-corpus HTTP run

The current pipeline has now processed the **50 original financial receipts** from their original image bytes: 38 development and 12 evaluation. Four separate supplement diagnostics also completed. All **54 local recognition HTTP requests** passed the application request/decode path, without a recognition/parser exception, external request or remaining temporary job directory. Each run freezes and hashes browser library source, backend/worker source, model manifest, evaluator, dependency identity and predictions. The scorer verifies the frozen runtime source as well as the existing source/config/prediction hashes. A successful request is not evidence of correct financial extraction.

Original-50 field results reproduce the current offline comparison: **102/130 matched products**, **102/143 precision**, **81/130 exact descriptions**, **8/129 line prices**, **6/117 quantities**, **3/49 printed totals** and **0/49 trusted financial reconciliations**. Strict original complete receipt accuracy is **unscorable (denominator zero)**. The grouped UK supplement again matches all eighteen quantities, unit/line prices, item discounts and grouping fields, subtotal/tax/total and financial reconciliation. Exact names remain **16/18** and strict complete accuracy **0/1**. Individual photos and the nonfinancial control remain diagnostics without invented complete labels.

Original-50 mean time was **3,053.52 ms**, median **1,731 ms**, nearest-rank p95 **9,722 ms**. Timing includes browser preparation, actual HTTP/body/JPEG checks, native recognition, layout/parser/calculator and RPC. The first case in each run starts a fresh model worker; later cases reuse it and file caches can be warm. Independent integration cases use fresh API middleware quota state; the production handler has no benchmark bypass and normal quota behavior is tested separately. These figures are not bulk throughput, a cold-machine benchmark, or comparable to earlier inference-only times without those caveats.

The maximum sampled worker-tree working set was **2,695,290,880 bytes (2.51 GiB)**. The observer includes Windows venv launcher descendants, uses read-only OS process APIs, and was actually checked with a controlled parent/64 MiB child process. The initial one-PID smoke measured only the small launcher; its result is preserved and excluded from model-memory claims. Sampling can miss short-lived peaks, shared pages can be counted across processes, and browser/GPU/peak Node memory remain unmeasured. Worker temporary directories were inspected as empty after every run. API charges were zero; device compute cost was not measured.

Aggregate metrics and immutable run/resource hashes are in [advanced-live-http-v1.json](advanced-live-http-v1.json). Reproduce under new names with the already configured local model, keeping these commands sequential:

```powershell
node receipt_training/scripts/evaluate.mjs --http-local --split development --run local-http-development-new
node receipt_training/scripts/evaluate.mjs --http-local --split evaluation --run local-http-evaluation-new
node receipt_training/scripts/evaluate.mjs --http-local --manifest annotations/private/supplement-manifest.jsonl --split development --include-controls --run local-http-supplement-new
python receipt_training/scripts/score.py local-http-development-new local-http-evaluation-new --output evaluation/runs/local-http-development-new/combined-score-original50.json
```

The supplement has complete labels only for its grouped transaction. Do not score all four diagnostics against a one-record label map. No cloud provider is enabled in this benchmark.

### Document-specific VLM component trial

The official Apache-2.0 [PaddleOCR-VL 1.6 GGUF](https://huggingface.co/PaddlePaddle/PaddleOCR-VL-1.6-GGUF/tree/511b09642bb324401f15f97cc23bc67e8f0a291d) provides approximately 1.82 GB of language/projector weights, pinned and checked against official sizes/SHA256 values. The existing llama.cpp build supports the architecture. Its legacy multimodal CLI crashed on the synthetic input with Windows `c0000409` in `ucrtbase.dll`; that failure is preserved and its root cause is not established. The documented standard CLI worked. A versioned output-file decoder removes only its verified user/assistant transcript framing, retains the model's values and rejects malformed/empty/reasoning outputs. Native streams, decoder/harness/request/model hashes and the original transcript remain archived. Five new transport tests bring Python verification to **27 passed**.

All seven previous cases were sealed before real inference, with the same nine image-panel bytes and no labels or OCR text supplied. Every native panel returned usable text. With the existing text parser, the six financial cases produced **41/55 product matches**, **18/54 prices**, **18/55 quantities**, **2/6 totals** and **0/6 trusted reconciliations**. The control produced zero purchases. Tesco output exceeded the parser's line/length bound and remains a failure. The grouped UK transaction retained twenty purchase rows. This component-plus-parser pipeline was not selected over the stronger structured candidate.

This tests the element recognizer on complete prepared panels. [Paddle's documentation](https://www.paddleocr.ai/main/en/version3.x/pipeline_usage/PaddleOCR-VL.html) distinguishes that component from the complete layout-analysis/recognition pipeline and warns that directly invoking the VLM does not reproduce full-pipeline performance. No word boxes or confidence scores were fabricated for its text-only output. Full-pipeline deployment remains untested. Detailed counts, resource scope and provenance are in [advanced-paddle-vl16-pilot.json](advanced-paddle-vl16-pilot.json).

### GLM-OCR component and structured trials

The pinned [GLM-OCR GGUF](https://huggingface.co/ggml-org/GLM-OCR-GGUF) uses Q8_0 language/projector weights totaling approximately 1.43 GB, verified by size and SHA256. The [upstream model card](https://huggingface.co/zai-org/GLM-OCR) declares MIT for the model. The separately published [SDK code](https://github.com/zai-org/GLM-OCR) has Apache-2.0 licensing. These tests invoke the model directly; they do not evaluate its complete SDK/layout pipeline.

Both modes were sealed before real inference on the previous seven-case pilot's identical panel bytes and frozen application source. Six cases are financial receipts; the seventh is the predeclared nonfinancial photo-order control. The model never received labels or earlier OCR output. These previously inspected development cases are diagnostic, not a blind holdout or the full original cohort.

| Six financial cases, identical frozen parser/validation | Qwen3-VL structured v2 | GLM literal text | GLM structured |
|---|---:|---:|---:|
| Matched labelled products / 55 | 55 | 50 | 22 |
| Exact normalized descriptions / 55 | 52 | 49 | 22 |
| Correct line prices / 54 | 50 | 27 | 2 |
| Correct purchased quantities / 55 | 55 | 27 | 0 |
| Correct unit prices / 27 | 27 | 27 | 0 |
| Correct item discounts / 21 | 14 | 21 | 0 |
| Correct printed final totals / 6 | 6 | 2 | 1 |
| Trusted reconciliation / 6 | 0 | 0 | 0 |
| Strict complete receipt / 1 scorable case | 0 | 0 | 0 |

All nine literal-text panel processes completed, at approximately 5.3–9.0 seconds per panel with about 1.25 GB peak CLI working set. That component-plus-parser pipeline still missed five labelled products and retained five unmatched predictions; five financial cases had unresolved currency. No word geometry or confidence was fabricated. The nonfinancial control produced zero purchases.

Direct structured extraction used a synthetic-tested JSON-template prompt and a bounded format adapter. The adapter accepts one complete JSON object or outer fence and converts explicitly named numeric fields into exact decimal strings; it never fills missing values, rescales amounts, rounds, merges products or repairs counts. All seven native processes exited, but only four returned decodable JSON and only one passed strict application schema validation. The long supplied Costco transaction returned malformed output. The final synthetic control copied two rows and £3.50 correctly but invented a printed item count of one; its mistake remains in the evidence. An earlier forced-decoder attempt failed inside native sampler initialization and is recorded separately from model accuracy.

Neither GLM mode is selected as the application reader. The text component's coupon result merits investigation only as a separately measured recovery option. Its overall financial results are weaker than the existing structured candidate. API calls and external receipt uploads were zero; laptop compute cost is unmeasured. Process working set excludes GPU and whole-application memory, and these fresh CLI timings exclude preparation/setup. Detailed counts and checksums are in [advanced-glm-ocr-pilot.json](advanced-glm-ocr-pilot.json); `python receipt_training/scripts/build_glm_ocr_pilot_report.py --check` verifies the retained evidence without making any model or provider call.

### Qwen3.5-4B protocol trial

The Apache-2.0 [Qwen3.5-4B](https://huggingface.co/Qwen/Qwen3.5-4B) candidate uses pinned [Unsloth Q4_K_M weights](https://huggingface.co/unsloth/Qwen3.5-4B-GGUF) and an F16 projector, approximately 3.41 GB in total. This is a community GGUF conversion, not Qwen's official GGUF release. The documented `enable_thinking:false` configuration was passed explicitly. No cloud receipt requests or paid service were used.

Five synthetic compatibility attempts are retained. They exposed an incomplete unconstrained response, a native grammar/sampler initialization failure, and default CLI escape processing that altered an embedded JSON-schema prompt. The harness now disables escape processing and exact framing tests reject changed prompts. The first literal-prompt control passed strict validation. The control using the exact original pilot schema copied `$schema` into its receipt answer and was rejected. That failure was retained before the seven-case trial, rather than silently removing the metadata or declaring the contract reliable.

The seven cases then used the previous pilot's identical panels, semantic instructions and application validation source, with the explicit JSON schema appended because native constrained decoding failed. All seven processes returned JSON, but only **two passed strict application schema validation**. CORD output included unsupported monetary separators, Bristol quantities violated the decimal-string contract, and Tesco, the supplied Costco transaction and the nonfinancial control copied the schema metadata field. Their invalid drafts remain rejected. Across the six financial cases, the practical pipeline matched **6/55 labelled products**, **0/54 line prices**, **6/55 quantities**, **1/6 final totals** and **0/6 trusted reconciliations**. Four financial schema failures dominate those end-to-end counts; they are not measurements of every raw field's recognition accuracy.

Native times were **16.6–41.4 seconds per case**, with a maximum CLI working set of **3,593,146,368 bytes**, excluding GPU/whole-system memory. Fresh process/model loading is included; preprocessing/download/setup is excluded and caches may be warm. Scoring initially collided on its fixed local browser port; the stored original outputs were replayed sequentially without repeating native inference. This profile is not selected for the app, and its result does not establish that every Qwen3.5 deployment or a corrected protocol would perform the same. Evidence, compatibility outcomes and financial denominators are in [advanced-qwen35-pilot.json](advanced-qwen35-pilot.json), checked with `python receipt_training/scripts/build_qwen35_pilot_report.py --check`.

The local comparison now includes two conventional neural OCR engines, Qwen3-VL structured extraction, PaddleOCR-VL component recognition, both GLM-OCR modes and this Qwen3.5 profile. The older Qwen3-VL protocol remains the strongest measured structured candidate on this cohort; a newer model name alone does not justify replacement. The broader provider comparison and full acceptance criteria remain unfinished.

All **46 Python checks** passed after the harness changes, including exact prompt boundaries, decimal precision, malformed/duplicate JSON, oversized exponents and the existing evaluation/native-worker guards. Reimporting both GLM text and Qwen3.5 structured outputs with their checksum-verified original helper snapshots reproduced the earlier canonical output files byte for byte. No frontend/backend application source changed in this checkpoint; prior app test results retain their original scope.

### Dedicated API comparison preparation and identical-crop local result

A guarded Veryfi v8 experiment is prepared for exactly the two inspected, identifier-removed JPEG crops. The ZIP preserves both files byte for byte, uses generic names and includes no extra source hints, labels or OCR text. The CLI defaults to a dry run. A separate authorization, confirmed free quota, matching sealed input/protocol hashes and server-side Client ID/Bearer key are required before its single extraction request. Nine offline transport tests passed: prior-ledger refusal, missing-approval/quota guards, bounded responses, no retries, exact response-byte preservation, exact large document IDs, scoped cleanup and honest cleanup-failure reporting. No application adapter was activated and no live Veryfi result exists. The user requested comparison of both methods; free-account confirmation/configuration remains pending. Setup, cost and privacy details are in [VERYFI_PROBE_SETUP.md](VERYFI_PROBE_SETUP.md); the sealed plan is [veryfi-probe-plan-v1.json](veryfi-probe-plan-v1.json).

The original local candidate and the actual installed Paddle-plus-independent-Qwen path have now read those **same exact two crop JPEGs**, without unrelated photo re-encoding. Raw HTTP records verify both local readers' input hashes. Both proposed **23 purchases for 18 actual purchases**, matched all 18 labelled products and copied all 18 line prices/unit prices, but recovered **none of the four nonzero coupons**. Exact normalized descriptions were **16/18** for vision alone and **17/18** after the local comparison. The five extra proposals were not silently removed to force a balance.

Both copied the printed **176.78**, while the actual combined draft calculated **193.39**, a **16.61** discrepancy. The financial/review gate blocked it with 41 issues and 38 review checks. This counterexample is preserved alongside the earlier successful full-photo development diagnostic: changing visible context changed the outcome. The primary OCR parse independently retained 18 purchases and all four coupons, and identified Costco without a literal merchant header. Source inspection found that coupon recovery still requires a literal `Costco` string. That guard and the remaining ambiguity require a measured fix; no success is claimed for it yet. Verified source/graph nodes: `src/lib/verify-readings.ts:L155`, `src/lib/parser.ts:L33`, `src/lib/compared-reader.ts:L13` and `src/lib/panel-transport.ts:L10`.

This is one previously inspected development transaction. Its financial reference is the pre-existing source-checked parent annotation; redacted merchant/date/currency evidence is not scored. GBP is known parent-transaction context for exact numerical comparison, not a currency-extraction success. Vision-only took **50,735 ms** including a fresh CLI/model load; the actual serial combined path took **69,782 ms** including browser verification/RPC. These are different pipeline scopes on one laptop/cached case, not a p95 or phone/cloud performance comparison. Provider accuracy remains unknown. Aggregate counts and frozen-source/input checks are in [advanced-provider-crop-comparison-v1.json](advanced-provider-crop-comparison-v1.json); the local private row-by-row review is retained under `qa-artifacts/provider-review/`.

### Full structured vision comparison on all original receipts

The corrected Qwen protocol was extended to **all 50 original financial receipts plus the four separate diagnostics**. Selection used frozen preparation inventories, never label files. The seven previously tested requests retained exactly their bytes; new requests used the same instructions/schema/settings and their own verified image/photo mapping. All 54 native runs returned JSON without decoder-relaxation warnings and all passed strict application validation and supplied-photo reference checks. The browser postprocessor was frozen to the v2 library bytes while source-review development continued; no extracted amount or uncertainty was repaired. This is the previously inspected regression cohort, not a fresh blind holdout.

| Original 50, frozen annotation scope | Tesseract baseline | Current Paddle text pipeline | Current docTR text pipeline | Qwen structured v2 |
|---|---:|---:|---:|---:|
| Matched labelled products / 130 | 33 | 102 | 97 | 129 |
| Exact normalized descriptions / 130 | 20 | 81 | 69 | 118 |
| Correct line prices / 129 | 3 | 8 | 7 | 99 |
| Correct purchased quantities / 117 | 3 | 6 | 6 | 117 |
| Correct final printed totals / 49 | 0 | 3 | 4 | 33 |
| Trusted financial reconciliations / 49 | 0 | 0 | 1 | 0 |

Qwen item precision was **129/137 (94.16%)**, recall **129/130 (99.23%)**, line-price accuracy **99/129 (76.74%)**, unit prices **22/31**, item discounts **4/7**, grouping **10/14**, subtotals **25/34** and tax **12/22**. Exact normalized merchant matches were only **1/6**; the frozen metric does not introduce new brand/translation aliases after seeing results. Forty cases retained unresolved currency evidence. Two drafts had correct labelled amounts and zero financial issues/discrepancy but still lacked currency evidence; they do not count as trusted reconciliation. Original strict complete accuracy remains **unscorable, denominator zero**. The grouped supplement still has 22 proposed purchases against 18 actual purchases and **0/1 strict complete receipt**.

This is a substantial field-extraction gain and the strongest measured structured candidate on this cohort. It has not earned unconditional financial acceptance or public release. The comparison is between practical pipelines: Qwen produces structured fields instead of passing raw OCR through the heuristic text parser. The entire gain must not be attributed to raw recognition alone. CORD modifier omissions and partial manual truth remain limitations. The current application still uses its tested computer OCR reader; native structured-VLM consumer integration and measured hybrid recovery remain next work.

Original-50 native mean was **20,011.04 ms**, median **18,590.5 ms**, p95 **32,395 ms**. Browser validation/RPC brought the scored mean to **20,037.84 ms**. Fresh process/model loading is included for each receipt, with potentially warm file/shader caches; browser image preparation and initial download/asset verification are excluded. Peak CLI working set was **3,678,318,592 bytes**, excluding GPU/whole-application memory. This differs from persistent CPU reader e2e timing and establishes no speed advantage. API charges and external receipt uploads were zero; hardware compute cost is unmeasured. Full aggregate counts, hashes and limitations are in [advanced-qwen-full-v2.json](advanced-qwen-full-v2.json).

Reproduce with retained private inputs under fresh run names. Execute the CLI benchmark once per sealed request before import, with one process at a time:

```powershell
python receipt_training/scripts/prepare_vision_cohort.py --base-pilot qa-artifacts/advanced-ocr/qwen-numeric-rounding-v2.json --version cohort-new
# Run benchmark_vision_cli.py for every request in cohort-new.json, with a new matching output prefix.
python receipt_training/scripts/import_vision_cli.py --pilot qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1.json --prefix qwen-full-v2 --run full-vision-import-new
node receipt_training/scripts/evaluate.mjs --structured-run full-vision-import-new --source-run qwen-vl4b-pilot-v2-original --split development --run full-vision-development-new
node receipt_training/scripts/evaluate.mjs --structured-run full-vision-import-new --source-run qwen-vl4b-pilot-v2-original --split evaluation --run full-vision-evaluation-new
python receipt_training/scripts/score.py full-vision-development-new full-vision-evaluation-new --output evaluation/runs/full-vision-development-new/combined-score-original50.json
```

The import example verifies retained original outputs; a newly generated protocol requires running and importing its own plan/prefix. Keep the supplement/control separate and do not score unlabelled individual photos as complete transactions.

### Source-region purchase review

Computer scans now retain a transient mapping from parsed purchases to literal recognized source lines. Identical purchases keep their separate positions; attached coupon rows follow the purchase; removed overlapping footer copies are excluded. Misaligned text or missing image references never authorize a guessed source rectangle. The new **View on receipt** action shows a cropped context view with real line boxes, flags low-scoring OCR words for checking, and keeps the original read visible while description/quantity/price/discount/tax-code fields are edited. Shared deterministic validation reports invalid fields and recalculates the receipt. The source score is advisory, not a calibrated probability or proof of correctness.

Current graph/source locations are `src/lib/parser.ts:L33`, `src/lib/receipt-evidence.ts:L32`, `src/lib/receipt-evidence.ts:L100`, `src/ReceiptSource.tsx:L1`. Source metadata is separate from persisted financial state. Image changes, replacement/reset and refresh clear it; object URLs are released when their view closes. Other-provider provenance, exact per-field grounding, receipt-wide adjustment regions and individual-area rescanning remain open work.

Verification: **176 application unit tests**, typecheck, production build, format check, **71 standard browser passes / one duplicate layout skip**, and **27 Python tests**. The new browser workflow passed at 320, 375, 390 and landscape 667 pixels, checks keyboard return and accessible errors, and confirms that source coordinates/blobs/text are absent from local storage. Frozen current HTTP recognition replay mapped **190/190 parsed rows across 54 cases**, with every financial draft unchanged; this is a provenance/parser regression replay, not new OCR or a spatial-accuracy annotation. Separate actual two-photo Costco desktop/mobile runs passed with all eighteen financial rows, distinct source positions for both chickens, four source boxes for the cloth/coupon, no edits and the exact **58.93/58.93/58.92** split. Screenshots were visually inspected. Source-review implementation is isolated in commit `25f8d7b`; its model/provider settings and stable baseline remain unchanged.

### Explicit currency evidence before financial calculations

An extracted draft with an empty AI currency, missing text currency or an ambiguous dollar/yen symbol now requires an explicit currency selection. The internal legacy currency placeholder is not used to interpret decimal precision, reconcile a printed total or finalize a split while that selection is unresolved. Calculated receipt/item/share displays and draft exports show an em dash instead of a guessed currency amount. Original amount strings stay editable and unchanged, including JPY integers and KWD three-place decimals. Choosing the same GBP value that was previously only a placeholder still resolves the selection and requires a new financial review.

Older extracted drafts that contain the application's unresolved-currency warning reopen at review, preserving their items, people and assignments. Valid known-currency review fingerprints remain compatible, and a current explicit selection survives refresh even when the original scan warning remains. Manual drafts retain their selected default currency. This gate handles a missing/ambiguous currency reported by extraction; it does not prove that every model-provided currency is correct. General human review and unresolved tax-inclusion evidence remain necessary.

Verification: **191 application unit tests passed**, including fifteen currency-evidence/migration/conservation regressions, typecheck, production build and format check. The standard browser suite passed **73 tests with one duplicate layout skip**. After the small-screen metadata layout was widened, ten phone workflow/layout cases passed; the dedicated unresolved-currency review was checked separately on desktop and mobile at 320px, including accessible field errors, retained amounts on refresh, explicit selection and renewed review. Screenshots were inspected. No new recognition-accuracy or model-latency result is claimed by this checkpoint, and the frozen OCR/VLM comparisons are preserved. Stable ref `ee725ba45e799bee8501d3de034e0302c0127afd` and the original checkout's binary patch hash `72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b` remain unchanged. Full goal acceptance is still outstanding.

### Bounded local vision app integration and its actual limits

The pinned Qwen3-VL 4B / llama.cpp b11960 candidate now has an opt-in **Local vision** app reader and a separate local structured extraction endpoint. The original computer OCR reader remains the default when installed. The adapter retains the tested 8192-token context, 4000 output-token bound, 1536 image tokens, fixed prompt/schema, temperature zero and seed. Its initial context profile accepts at most three prepared sections; over-limit inputs are refused before HTTP upload and are never truncated. Twelve-photo upload and longer receipt support remain available through the other readers. This limit is an implementation checkpoint, not a reduction of the full goal's long-receipt requirement.

The server uses fixed local paths/arguments, verifies the pinned model/runtime assets before the first inference in each server lifetime, validates actual JPEG pixel decoding with a ten-second guard, bounds native output and duration, strips credentials from subprocess environments and kills owned process trees on cancellation. It releases an idle CPU OCR worker before vision. Requests share the loopback/host/origin/body/quota boundary; strict schema and supplied-photo-reference checks apply on the server, and independent exact financial checks remain in the browser. Temporary files are removed on normal success/rejection/cancellation. Failed process termination or cleanup disables this reader and reports manual recovery; crash cleanup and OS isolation remain unfinished.

Actual model-to-browser verification used a synthetic two-purchase GBP 5.50 receipt. The first HTTP extraction took **33.60 seconds** and returned correct purchased quantities and prices, but the complete workflow correctly stopped at a non-ISO date. That failed run and trace remain preserved. A deterministic date normalizer now converts only unambiguous printed dates; it never uses currency or merchant to guess ambiguous day/month order. After that fix, desktop/mobile scan-to-review times were **26.36 / 19.16 seconds**, and both completed an unedited **2.75 / 2.75** split. These are repeated views of one synthetic case, not two independent accuracy cases. A separate real three-section synthetic run retained four purchases once across overlaps and GBP 8.75, taking **29.84 seconds** to reach review. Existing model/shader/OS caches were present; native model loading occurs per scan and asset hashing per server lifetime. These UI timings are not directly comparable to earlier CLI-only cohort times.

The same app path processed the supplied two-photo UK development receipt in **68.94 seconds**. It still proposed **22 purchases instead of 18**, with **zero item coupons instead of four**. Although it read the printed GBP 176.78, its proposed purchases/tax calculated to **177.14**; independent subtotal, tax and final-total checks blocked confirmation. The real protocol diagnostic passed because it retained the evidence and exposed its validation outcome; **receipt accuracy did not pass**. Separately, even the numerically correct synthetic cases invented unprinted subtotal/item-count/tax-code metadata; the three-photo case reported a count of three without a printed count. Item-count warnings now attribute the reading to the provider instead of asserting that the paper necessarily says it. These observed failures justify retaining the experimental opt-in and prioritizing independent field grounding/coupon recovery. Balanced arithmetic is not proof of accurate extraction.

Security review also found that Vite watch exclusions did not prevent HTTP access to private folders. The improvement server now denies private receipt files, datasets, QA output, graph/cache artifacts and test reports, while preserving its installed secret-file deny patterns. A real development HTTP test denied **48 direct, encoded, absolute and Windows case-variant requests**, while serving its public control. The running feature server separately returned 403 for private QA, graph and dataset paths and 200 for the app/provider metadata. This is development-server protection; public authentication/TLS and native OS isolation are still required.

Current verification: **221 application unit tests**, **81 standard browser passes / one duplicate layout skip**, **35 Python tests**, typecheck, production build and formatting. Real synthetic desktop/mobile upload-to-split checks and the separate three-section/UK diagnostics ran against the installed model, not mocked inference. A separate actual original two-photo **Paddle** regression still passed the eighteen-row financial/source-review/split workflow after integration. One original-image frozen-runtime HTTP smoke completed with zero temporary jobs and unchanged runtime source; it verifies the new shared-instruction module is included in the benchmark snapshot and is not a new full-corpus accuracy score. No private receipt was sent to a cloud provider, no paid service was activated and native API cost was zero; hardware/energy and whole-app peak memory were not measured here. All earlier original-cohort results remain frozen.

Machine-readable scope, measurements and source/evidence hashes are in [advanced-local-vision-integration.json](advanced-local-vision-integration.json). With the ignored local evidence present, verify them with `python receipt_training/scripts/build_local_vision_integration_report.py --check`. Setup is in README. To repeat one real synthetic workflow, point `GATHER_LOCAL_VISION_URL` at an enabled loopback server and run `npm run test:e2e -- tests/e2e/local-vision-real.spec.ts --project=desktop --grep "synthetic receipt" --workers=1`. Run additional real diagnostics separately while respecting the normal two-scans-per-minute limit; the standard browser tests remain provider protocol fixtures. Full independent recovery, longer local-vision receipts, digital/PDF inputs, quality correction, area rescan, refunds and the other original requirements remain open.

### Independent local comparison and mandatory field checks

The **This computer** reader now offers an optional **Compare with local vision** check. The primary reader completes first; the native model then independently reads the same original prepared photos without OCR text or candidate amounts in its prompt. Row alignment preserves order and accepts only pairs forced across every optimal alignment. Source-photo identity, literal numeric rows and measured OCR confidence constrain recovery. Description similarity and the 0.75 OCR threshold are conservative rules, not calibrated probabilities. Repeated identical purchases remain distinct. The exact money engine still operates separately.

An adjacent Costco coupon is reclassified only when the printed title/negative row, tax category, source photo, amounts and unique owner/candidate relationship agree. A separate classifier removes savings summaries and coupon counts only when all printed coupon amounts/counts have been accounted for, and future reward earnings only when the printed context identifies them as future earnings. Redeemed rewards, before-total deductions, conflicting amounts/counts and unclear source rows remain unresolved. No correction uses the final balance to select an amount. Generic purchase names now omit only a recognised trailing purchase expression, so a printed `Milk 1x 2.00 2.00` can match the name `Milk`; pack measurements remain part of the name.

Every recovered, disputed, unsupported or incompletely covered value creates a mandatory field check, even if the arithmetic balances. Checking a value records its exact current content; changing it reopens that check. An explicit user correction confirms only that affected field. Group edits do not confirm an entire tax table, adjustment list or purchase list. Tax-table reviews include the calculation mode and tax-inclusion setting. Each supplied rate needs its own legible source witness; a clear zero-rate row cannot validate a different unclear rate. Currency recovery runs before monetary field comparison, including three-decimal currencies; unresolved currency still blocks monetary display, calculations and acceptance. Low-confidence, conflicting or bare-dollar evidence does not resolve currency. The review displays available original source regions for items and receipt fields; unsupported fields never receive a fabricated rectangle. Source images/geometry are transient; review state persists with the editable draft.

The hash-checked **v2 cached replay** processed the same 50 original financial receipts plus four supplemental diagnostics, with no model calls or label access during comparison. Original-cohort item detection remained **129/130**; predicted purchases fell from 137 to **136**, coupon accuracy improved from 4/7 to **5/7**, and grouping improved from 10/14 to **11/14**. Exact descriptions remained **118/130**, line prices **99/129**, known quantities **117/117**, unit prices **22/31**, subtotal **25/34**, tax **12/22**, and printed totals **33/49**. All 50 original drafts retained pending checks; trusted reconciliation remained **0/49**, and complete original financial accuracy is still unscorable (**zero complete labels**). This is a deterministic replay of independent cached outputs with their original differing preparation, not fresh model inference, an app-latency measurement or a new blind holdout. Frozen inputs can exceed today's API pixel/section limits; nothing was silently truncated.

Only the grouped UK supplement has complete visible-body truth: four diagnostics were processed but **one** was scored. It retained **18/18** purchases, quantities, unit prices, line prices, coupons and grouping, and the correct net/VAT/final values. Exact descriptions were **17/18**, merchant exact-match **0/1**, and strict complete accuracy **0/1**. A balanced draft therefore remains a reviewed development result, not a perfect receipt extraction.

A separate **fresh real installed-model + HTTP + browser** run on the supplied original two photographs reached review in **111.446 seconds**. Native vision again proposed 22 purchases. The independent comparison produced **18 purchases, four attached coupons and GBP 176.78**, removed the three informational discount entries, and retained **eight pending checks**. The full financial row vector matched the existing image-checked development reference without edits. The workflow then exercised all eight explicit review controls and finalized **58.93 / 58.93 / 58.92**. It showed the four actual source regions for the chicken-skewer/coupon pair and fit a phone viewport. No external browser request or cloud upload occurred. This is one source-informed development receipt with historical model/OS caches, not evidence of universal accuracy or a latency distribution. Whole-application peak memory and fresh public deployment performance remain unmeasured; 111 seconds is too slow for a polished consumer scanner.

The extra reading is optional and remains off by default. A failure preserves the first draft under an explicit incomplete-comparison gate; cancellation preserves photos and accepts no partial result. Over-limit vision input does not drop sections or trigger cloud fallback. The reader still needs a measured, efficient long-receipt strategy and broader recovery/uncertainty validation before it can be a production default. Machine-readable scope, aggregate metrics and local evidence hashes are recorded in [advanced-independent-comparison.json](advanced-independent-comparison.json). The previous integration JSON remains the immutable `412bbc8` checkpoint; its source hashes describe that commit rather than these later changes.

Reproduce the deterministic comparison with `node receipt_training/scripts/replay_independent_readings.mjs <new-run-prefix>`; the runner refuses overwriting prior runs, verifies original image/cache hashes, freezes the comparison source and reads no truth labels. Score its development/evaluation runs with the existing scorer. Score only the explicitly labelled grouped supplement; individual photos/control do not acquire fabricated truth. Set `GATHER_LOCAL_COMPARISON_URL` to an enabled loopback server and `GATHER_LOCAL_COSTCO_PHOTOS` to a JSON array of the two local originals for `npx playwright test tests/e2e/compared-reader-real.spec.ts --project=desktop --workers=1`. Respect the shared local request quotas. Use `python receipt_training/scripts/build_independent_comparison_report.py --check` to verify this checkpoint's retained local evidence.

### Bounded long-receipt local vision and observed failures

Local vision can now process the existing twelve-photo input allowance through at most 24 prepared sections. The tested native context remains unchanged at three sections, 8192 context tokens and 4000 generated tokens. Longer inputs use computer OCR first, then serial native contexts with one repeated full section as overlap. Both readers receive original pixels; OCR text is not supplied to the model. This is a single local HTTP job with a bounded NDJSON progress/result stream, one shared quota slot and one active native process. The normal request-body deadline remains two minutes; after the complete validated body is accepted, the long job has a fifteen-minute bound. Every expected batch, ordinal and section index must arrive in order followed by a final completion record. An error, disconnect, malformed or incomplete stream never becomes a partially accepted vision receipt. The first OCR draft and original photos remain available under an explicit incomplete-comparison check.

Batch copies are joined through unambiguous physical source regions and matching description/quantity/unit/line/discount values, not by totals or item names alone. The original high OCR-confidence bound is retained. Distinct source positions preserve genuinely repeated identical purchases. A coupon's printed row has its own identity, while its amount remains attached to its owner; overlap copies therefore do not apply a deduction twice. Conflicting tax codes do not turn one physical row into two purchases: the first reading remains provisional and both alternatives stay in mandatory item/table checks. An existing OCR alternative is retained too. Metadata conflicts, unproved overlaps, unclear source text and differing prices remain blocked or explicitly reviewed. Receipt-level charges are not deduplicated merely because their labels and amounts match. Unsupported tax tables can now be edited while prices include tax, without changing the tax-inclusion setting. The generic parser also preserves names ending in a number, such as `Chicken Skewer 15`, by requiring a SKU row to start at its actual numeric boundary.

The first two actual four-photo synthetic runs reached review but the test could not retrieve a streamed response through its browser-debugger body API. Their traces are retained. Those traces also exposed three unjoined overlap copies: one context had invented a tax code, giving nine rows and GBP 30.50 against the printed 19.50. The independent arithmetic/review gates blocked confirmation. After separating physical identity from tax-code agreement and using a bounded in-page stream observer, the next fresh installed-model/HTTP/browser run completed **two native contexts, six purchases including both genuine chickens, and GBP 19.50** in **90.309 seconds**. The item money vector matched its predeclared synthetic source without edits. It still retained **five issue paths** for the unprinted/disputed code, subtotal, merchant, tax table and complete purchase list; the diagnostic verified that confirmation stayed blocked. It did not claim a complete, automatically correct receipt or a finalized real long-receipt split.

The four- and twelve-photo protocol workflows complete checked exact splits on desktop and phone. A twelve-photo test exposed non-wrapping original thumbnails; wrapping them fixed horizontal overflow and unreachable controls. Synthetic tests cover all section counts from 1 to 24, serial contexts, whole-job and stalled-body deadlines, cancellation/disconnect, quota ownership across rejected overlapping requests, split UTF-8 records, omitted/reordered/untrusted results, genuine repeats, overlapping coupons, differing prices, tax alternatives and receipt charges. Current verification is **300 unit passes, 99 standard browser passes and one duplicate-layout skip**, with typecheck, build and formatting. A fresh original-image CPU HTTP smoke verified the new shared `.mjs` dependency is included in the frozen backend snapshot, with zero remaining jobs. The v3 replay of the 50 original receipts and four supplemental diagnostics retained the earlier frozen field metrics: 129/130 detection, 99/129 line prices, 5/7 known coupons, 33/49 printed totals and 0/49 trusted reconciliation. Original complete-receipt truth remains unscorable. That replay tests deterministic comparison against frozen independent outputs, not fresh multi-context inference on the entire corpus.

The 90-second measurement is one synthetic case with existing asset/model/OS caches; it is not comparable to CLI-only cohort latency or a p95 distribution. Genuine long twelve-photo receipt accuracy, unsupported photographic overlaps, long-receipt correction through final split, whole-app peak memory and public deployment performance still need broader evidence. The feature remains an optional development path. Source and local-evidence hashes are in [advanced-long-vision-integration.json](advanced-long-vision-integration.json), reproducible with `python receipt_training/scripts/build_long_vision_report.py --check`. Earlier checkpoint JSON files retain their original source hashes rather than being rewritten around later changes.

### Separately authorized Gemini attempts and availability diagnostics

The user approved one attempt on the two prepared Costco item/VAT crops, then explicitly approved one additional attempt after the first failed. Each upload was restricted to the original inspected crop hashes, `gemini-3.1-flash-lite`, the existing user-declared free quota, no billing activation and no automatic retry. The second request body hash exactly matched the first. Both returned **HTTP 503**, after **527 / 635 ms**, without extracted drafts. They supply no item or receipt accuracy denominator. Both authorizations are consumed; no further private upload is authorized, and the original manifest's external-processing restrictions remain unchanged.

A separate read-only model metadata request returned 200 and listed the model's supported methods. Two non-private controls used the existing synthetic smoke image, one request through each documented generation endpoint; both also returned 503. The configured key could read metadata, but generation availability remained unresolved. No paid service or alternative model was activated, and actual account billing was not inspected. Google's documentation lists image/structured-output support and free input/output tiers for this model, but those descriptions do not substitute for an actual successful receipt benchmark. [Model](https://ai.google.dev/gemini-api/docs/models/gemini-3.1-flash-lite), [pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-3.1-flash-lite), [model metadata](https://ai.google.dev/api/models), [generation](https://ai.google.dev/api/generate-content).

The guarded harness writes a one-use consumption ledger before network I/O, so unknown outcomes cannot trigger another request. It never reads the original receipt files for upload or supplies ground truth/OCR text to the provider. Secrets remain in the server-side ignored environment. Aggregate outcomes and evidence checks are in [advanced-approved-gemini.json](advanced-approved-gemini.json), verified with `python receipt_training/scripts/build_approved_gemini_report.py --check`. `store:false` concerns stored interaction state, not every provider-retention policy. Stronger-model/provider accuracy comparisons remain open.

### Local digital/scanned PDF integration

The app now imports PDF files on the device, retains a preview for every page and uses embedded text directly when every selected page has a usable text layer. Other pages, forms, rotated/ambiguous text layouts and cropped pages can use the existing image readers after rendering. This eligibility check does not prove that a text layer includes purchases stored as pictures within the same page. A mandatory complete-list check prevents confirmation until the user compares every purchase and amount with the previews. Source regions use the full page coordinates, including long pages that also have image-reading windows. Real repeated purchases are retained.

PDF.js **6.4.299** is pinned and loaded only on PDF import. The worker, fonts, character maps and decoders are same-origin assets; only local file bytes are parsed. There is no embedded viewer, active document action or link navigation. Import validates signatures/MIME, rejects password/XFA/oversized/malformed documents, enforces file/page/canvas/operator/text/deadline budgets, destroys the owned worker on cancellation, and discards an incomplete new upload while retaining earlier selections. A worker-error observer supplements public promises: a declared 25-megapixel hostile image initially produced a blank accepted page despite `stopAtErrors`; the pinned library could resolve a partial operator list before rejecting its stream. The added observer now rejects that entire import. This version-specific boundary is covered by an actual PDF fixture and must be retained during dependency upgrades. [PDF.js API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib.html), [official package](https://www.npmjs.com/package/pdfjs-dist).

Nine **wholly synthetic** PDFs cover two digital pages, a sixty-purchase long page, scanned and mixed-page documents, rotated writing, encryption, thirteen pages, oversized page dimensions and a hostile image declaration. They are a separate integration/security set, not additions to the original financial accuracy cohort. Desktop and phone tests extract the two-page source into three purchases, including both identical Milk rows and their purchased quantity of two. After the explicit list check, the unchanged £6.50 divides into **£2.17 / £2.17 / £2.16**, with no OCR or cloud request. The sixty-purchase PDF keeps all sixty rows and highlights the final purchase in the full-page source. Scanned and mixed-page protocol fixtures send all rendered pages to the chosen image reader.

An additional **actual installed PaddleOCR** workflow read the scanned PDF and preserved all three descriptions, quantities, unit prices and line totals without financial edits. Upload through review took **11,439 ms**; the exact completed two-person split was **£3.25 / £3.25**. It made one loopback computer-OCR request and zero external requests. Its first development-server attempt was invalidated by a late dependency-optimization reload before any draft; explicit PDF prebundling fixed the lost selection. A separate password-callback wait and unavailable-font-metric source-rectangle defect were found and fixed during the synthetic runs. Failure traces remain retained.

Current verification: **313 unit tests, 113 standard browser tests and one duplicate-layout skip**, plus the extra actual installed-model PDF workflow; typecheck, build, formatting and a runtime dependency audit with zero reported vulnerabilities passed. Browser visual checks include a phone capture/review flow and literal source highlights. The original cohort/annotations and frozen original outputs remain unchanged; this checkpoint does not claim a fresh original-corpus accuracy gain. The synthetic workflow timings include UI/file preparation and existing caches, not a representative latency distribution or p95. Genuine retailer PDFs, Safari/physical phone performance, broader fonts/layouts, whole-app peak memory and production isolation remain open. Aggregate/source/input checks are in [advanced-pdf-integration.json](advanced-pdf-integration.json), verified with `python receipt_training/scripts/build_pdf_integration_report.py --check`.

### Local capture-quality advice

Photo preparation now checks original, unfiltered pixels for very low native resolution, darkness, little visible detail and likely distributed blur. A small overview assesses exposure/detail; three bounded regions retain native pixel resolution for blur checks. Empty regions abstain. Cropping recalculates the advisory using the original crop dimensions, so upscaling a small crop cannot hide its lack of source resolution. The checks add no upload or model call and do not alter the source image, OCR preparation or financial fields.

Verified graph/source locations: `src/lib/image-quality.ts:L17` (pixel statistics), `src/lib/image-quality.ts:L68` (advisories), `src/lib/image-quality.ts:L117` (original-pixel sampling) and `src/PhotoGuidance.tsx:L13` (grouped upload advice).

The upload screen groups suggestions by problem and current image number, follows photo reordering/removal and keeps the original preview available. The advice fits 320/390/430-pixel screens and passes the targeted accessibility checks. It remains optional: a user can retake a photo or continue to the existing editable receipt review. No “good photo” grade or legibility guarantee appears when warnings are absent. PDF pages do not receive photographic recapture advice.

The first browser run exposed a real missed case: text softened by a five-pixel blur had too little gradient energy to enter the initial blur test. Original-pixel diagnostics showed the reason. The eligibility threshold was corrected, then all checks were rerun. Five unit cases cover sharp/blurred/blank/dark/small samples, immutable input pixels and bounded malformed samples. Six new desktop/phone tests cover the advice, order/removal, original-resolution crop checks and continued reading through the mocked computer-reader protocol.

The full checkpoint passed **318 unit tests and 119 browser tests**, with one existing duplicate-layout skip, plus build/typecheck and formatting. Existing actual Tesseract image/crop workflows are part of that browser suite; the new advice-to-reader case uses a mock response and is not an OCR accuracy measurement. Seven unchanged representative source photos were also processed locally, including both supplied UK photos. All seven assessments were available and none produced a warning. Their repeated assessment-only times were approximately **6.3–15.5 ms** on this desktop, with at most 633,600 sampled pixels per image. This small, previously inspected set has no quality ground truth: it establishes neither a false-positive/negative rate nor physical-phone performance. The engineering thresholds are advisory heuristics, not calibrated confidence probabilities.

Automatic receipt-edge detection, deskew/perspective/orientation handling, live-camera guidance and individual-area rescanning remain open. Source/input/test checksums and explicit limits are in [advanced-capture-guidance.json](advanced-capture-guidance.json), verified with `python receipt_training/scripts/build_capture_guidance_report.py --check`. The original financial corpus, annotations and frozen OCR outputs were not replaced.

### Coupon recovery when the retailer header is cropped out

The identical redacted-crop provider comparison exposed a real verifier defect: the primary OCR parser recognized the Costco purchase layout, but coupon and summary recovery required a literal merchant heading. The verifier now also accepts independently recognized Costco context when the source begins at a purchase. It retains the existing reliable-source, unique-owner, adjacency, photo, tax-code, quantity and amount predicates. A model's merchant claim cannot activate this path; an unrecognized merchant heading also prevents product-name markers from overriding that heading. Verified graph/source location: `src/lib/verify-readings.ts:L155`.

Replaying the exact saved primary OCR and vision responses recovered **three of four coupons**, reducing the cropped draft from **23 to 20 proposed purchases** against 18 real purchases. All eighteen labelled line and unit prices remain correct. The calculated total improved from **£193.39 to £181.25**, while the printed total remained £176.78. Two ambiguous extra purchases and a **£4.47 discrepancy** remain; 26 financial issues and 23 review checks continue to block confirmation. This is a partial recovery, not a correct payable receipt or a new model accuracy run. Hidden merchant/date/currency fields are excluded from crop scoring; parent GBP context is used only to compare visible amounts.

The original **38 development and 12 evaluation cases**, plus the separately scored full-photo supplement, were replayed before and after using identical retained OCR/VLM evidence and locked dependencies. Each browser run records the hashes of the frozen verifier and calculator modules it actually loaded. Only the verifier source differs. All 51 semantic results, including warnings, review checks, source text and financial issues, are unchanged after replacing generated IDs with their positions and excluding replay timing. Original scored field counts are unchanged: item-discount correctness remains 5/7 for this hybrid replay, trusted reconciliation remains 0/49, and strict complete-original accuracy remains unscorable. The supplement still has a merchant mismatch and pending review. Replay timings exclude inference and must not be presented as scanner latency.

The first broad merchant-based guard failed the existing other-retailer regression; that failed log is retained. The narrower guard passes the cropped-header, conflicting-retailer, genuine repeated-purchase and savings-summary regressions. Final verification passed **321 unit tests, 119 browser tests and one existing skip**, typecheck, build, formatting and graph refresh. The aggregate checkpoint and 284 evidence checksums are in [advanced-headerless-coupon-recovery.json](advanced-headerless-coupon-recovery.json), verified with `python receipt_training/scripts/build_headerless_coupon_report.py --check`. No new OCR inference or external upload was needed. Veryfi's separate one-use test remains prepared while free quota and credentials are unconfirmed.

### Reread an individual purchase area locally

Purchases with literal source highlights now offer **Reread this purchase**. The adjustable frame starts around the source rows and can be widened to include the quantity, price and coupon. It uses the configured computer OCR reader, otherwise the bundled on-device English reader. The new text appears beside the original source and existing edit fields. It never applies prices, quantities, coupon ownership or verification automatically; users compare the image and edit the fields themselves. Nearby purchases or totals can appear in the frame. Missing source mappings are not guessed.

The new text, prepared crop and object URLs remain transient. Cancelling, closing the source view or switching source sections aborts the owned read; late responses cannot replace the current view. Errors leave the original draft editable. The original source highlight, receipt metadata, assignments, review checks and confirmation stamps are unchanged by rereading alone. Verified graph/source locations are `src/ReceiptAreaReader.tsx:L84`, `src/ReceiptAreaReader.tsx:L93`, `src/ReceiptSource.tsx:L1`, `src/ImageCropper.tsx:L37` and `src/lib/receipt-evidence.ts:L130`.

Ten new desktop/phone checks cover actual crop dimensions, unchanged saved financial state, manual edits and renewed reconciliation, keyboard focus, 320/390-pixel layouts, accessibility, cancellation, late completion, unavailable/empty reads and private refresh. The PDF-area case uses **actual browser Tesseract**, reading `Milk 2x 1.25 2.50` from one synthetic purchase in both browser projects, without a receipt upload. Those two views are one synthetic case, not two accuracy samples or physical-phone measurements.

An additional **actual installed PaddleOCR** run used the supplied two-photo UK receipt. Rereading the cloth area retained the `6.99 A` purchase and `1.50-A` deduction in the returned text. It left all eighteen financial rows unchanged, and the complete workflow still finalized **£58.93 / £58.93 / £58.92** from £176.78 without financial edits. The full scan sent two prepared photo panels and the subsequent area read sent one cropped panel to the local backend; zero external requests occurred. This previously inspected development transaction is an integration check, not a fresh holdout or a comparison with Veryfi. The area alone took approximately **1.78 seconds** with the existing worker/caches; it excludes the full scan and is not a representative latency or p95.

Final checks passed **321 unit tests, 129 standard browser tests and one existing skip**, the extra actual installed-model workflow, typecheck, build, formatting and graph refresh. The extraction and financial library is byte-for-byte unchanged from the preceding frozen cohort checkpoint; no new original-corpus accuracy delta is claimed. Source snapshots, actual evidence and limits are recorded in [advanced-area-reader.json](advanced-area-reader.json), verified with `python receipt_training/scripts/build_area_reader_report.py --check`. Broader automatic recovery, confidence calibration and physical-device testing remain open.

### Signed refunds, credit ownership and conservative negative-row review

The financial engine now supports positive quantities with signed line prices, including negative receipt totals and negative person shares. A legible unsigned unit price can accompany a negative line credit when its magnitude agrees with quantity × unit price. Positive item discounts reduce the returned gross price before signed tax. Receipt-wide purchase discounts apply only to purchases; negative coupon reversals apply only to returns. Excessive discounts, contradictory unit arithmetic, unassigned credits and direction-reversing adjustments remain blocked. Phone controls can mark a purchase as a refund and change metadata/adjustment signs without relying on a keyboard minus key. Negative shares are explicitly labelled credit shares; no original payer or reimbursement direction is inferred.

Tax-code groups retain signed per-item contributions while rounding the group once. A purchase and return that cancel to zero still retain their separate VAT amounts and owners. For mixed signs, deterministic residual rounding preserves each contribution's direction and the exact rounded group total. Pure-purchase allocation keeps its previous algorithm. Shared proportional charges on mixed purchases and returns require an explicit allocation choice; a flat tax amount is not silently redistributed across signed bases. A return whose goods credit is cancelled by its original coupon can still retain a separately allocated delivery refund.

The first frozen replay exposed a classification regression: bare negative `AMOUNT`/club-card rows and collapsed IRC coupons could become returned products. The corrected parser requires a trailing product quantity/price expression or an explicit return/refund label for generic credits. Retailer-grounded IRC rows and directly adjacent `DISC ITEM …%` / `AMOUNT` pairs remain deductions. Bare negative rows stay provisional with a mandatory type/ownership check and literal source highlight. Independent comparison retains that uncertainty even when two provisional readings and arithmetic agree. The source confirmation now shows the chosen adjustment type and allocation alongside its amount. An unreadable credit amount remains a marked field, including when an unsigned unit price is legible.

Structured validation accepts explicit signed refund prices and totals. Negative ordinary adjustments require an explicit nonzero return line; the existing rejection of negative ordinary charges on purchase-only drafts remains. The compact provider decoder schema is byte-for-byte unchanged, and the model prompt/weights were not modified. This checkpoint changes financial interpretation and review, not raw model recognition accuracy.

The paired replay uses the same retained OCR/VLM outputs and locked dependencies for **38 development, 12 evaluation and one separately scored supplement**. All existing extracted financial fields, monetary results, source purchase counts and scored field counts are unchanged. The new computed return-context flag is false for all these legacy purchase cases. Six development cases have diagnostic changes: five update numeric-error wording to permit signed amounts; one adds an ambiguous-negative-source explanation to review. Every original draft still needs checking. Trusted reconciliation remains **0/49**, original strict complete financial accuracy remains **unscorable**, and the supplement retains its merchant mismatch and unresolved review. Replay times exclude inference and are not scanner latency.

Final validation passed **351 unit tests, 137 browser tests and one existing skip**, typecheck, build, formatting and graph refresh. Five hundred generated signed transactions cover exact VAT, immutable inputs and share conservation at zero-, two- and three-decimal currency precision. Actual bundled Tesseract read one wholly synthetic returned product and its negative printed total in both browser projects, then finalized **−£2.50 / −£2.50** without financial edits or receipt uploads. Both views used identical source PNG bytes; they are one synthetic case on desktop Chrome, not two accuracy samples or physical-phone tests. Screenshots at 320/390 pixels and the classification source view were inspected.

Verified graph/source locations are `src/lib/engine.ts:L35`, `src/lib/engine.ts:L55`, `src/lib/engine.ts:L479`, `src/lib/parser.ts:L33`, `src/lib/verify-readings.ts:L155`, `src/lib/receipt-evidence.ts:L39` and `src/RefundControl.tsx:L1`. Frozen sources, inputs, regression runs and limits are in [advanced-refund-handling.json](advanced-refund-handling.json), verified with `python receipt_training/scripts/build_refund_report.py --check`.

Genuine refund-image truth remains missing. Negative quantities and fee-only credit notes need manual conversion to the supported positive-quantity signed-line representation. The unchanged vision prompt still requests positive ordinary adjustment amounts; broader automatic refund-fee recovery needs a separately measured profile. This checkpoint does not select a cloud provider, establish general refund recognition accuracy or satisfy the whole objective. Veryfi's one-use comparison remains unrun while configuration and free quota are unconfirmed.

### Veryfi setup and offline field-review readiness

Both Veryfi credential settings are now present in the improvement worktree's ignored server-side environment and pass local syntax checks. No credential value was printed or committed. Actual validity, permissions and account quota are not verified by these checks. The user has already requested the scoped one-test comparison; explicit confirmation of unused Free quota remains pending, and no live Veryfi request has been sent.

The offline field-review harness is prepared for the exact sealed response. It verifies response/input/transport hashes, preserves decimal JSON amounts and native row slots, and uses the existing description-only matching rule. Native unit prices, totals, before/after-deduction amounts, discounts and tax fields remain separate; it makes no undocumented tax conversion, coupon attachment, deduplication or balancing edit. Missing values remain missing. Unmatched rows require classification before purchase precision or payable reconciliation can be assessed. The known parent GBP context is restricted to offline scoring; hidden merchant/date/currency are excluded. This is one previously inspected development transaction, not independent human truth or a provider-selection result. [Field-review workflow and limits](VERYFI_FIELD_REVIEW.md).

Ten synthetic audit tests passed, including a real CLI subprocess on synthetic sealed evidence, exact decimal handling, wrong-item coupon association, repeated names, missing fields, unchanged review history and evidence-tamper refusal. The nine sealed offline transport tests and eleven-file plan check also pass. No live extraction accuracy or processing latency is claimed. Application sources and the protected original checkout are unchanged by this checkpoint. The full goal remains active.

### Source-checked priced-row truth revision and paired rescoring

Actual source-image review confirmed two paid add-ons and three zero-price options omitted from the original top-level CORD item view. The new private `priced-rows-v2-labels.jsonl` adds only those five printed rows across four transactions. All original top-level row values, receipt metadata, unknown fields, coverage flags, original labels, manifests and images remain unchanged. Parent ownership is preserved in each added row's provenance. Both paid add-ons have unprinted quantities and unit prices, which remain null. The separate zero-price options are not new paid products; this revision measures printed priced rows rather than the till's sold-product count.

The observations are assistant source checks against actual images and retained upstream annotations, not independent human verification. Three amended transactions belong to the previously measured evaluation split. This is a disclosed retrospective truth repair, not a new blind holdout. No application, model, prompt, parser or matching rule was tuned from these cases. The new labels were written before rescoring and were never supplied to extraction. Frozen predictions from five existing full pipelines were checked against both annotation versions on the identical original fifty transactions:

| Frozen pipeline | Original row detection | Revised priced-row detection | Revised exact line prices | Printed totals | Trusted reconciliation |
|---|---:|---:|---:|---:|---:|
| Original Tesseract | 33/130 | 33/135 | 3/134 | 0/49 | 0/49 |
| Paddle + layout v3 parser | 102/130 | 103/135 | 8/134 | 3/49 | 0/49 |
| docTR + layout v3 parser | 97/130 | 98/135 | 7/134 | 4/49 | 1/49 |
| Qwen structured v2 | 129/130 | 133/135 | 102/134 | 33/49 | 0/49 |
| Current independent hybrid replay | 129/130 | 133/135 | 102/134 | 33/49 | 0/49 |

These are annotation-driven count changes on unchanged outputs, not recognition improvements. Historical pipeline versions, preparation and runtime circumstances differ; this is not an isolated engine ablation or a new latency measurement. Qwen and the hybrid already detect four of the five added rows. Three amounts are correct, including two zero-price options; only one of the two paid add-on amounts is correct. The other source prints `4,000`, while the canonical saved draft contains `4.000`. Exact IDR comparison fails that value without using truth to reinterpret it. The zero-price `Sedang` option is not a separate predicted row. Known quantities expand from 117 to 120, and the hybrid correctly supplies 119; the paid add-ons contribute no invented quantity labels. Nested ownership is retained as truth provenance but is not assessed by the existing flat app schema/scorer.

All receipt-level total and trusted-reconciliation counts remain unchanged. Original strict complete-receipt accuracy is still unscorable: adding five source rows does not resolve blurred merchant evidence, missing quantities, tax/discount basis or incomplete financial coverage. A future expanded complete-financial metric must also assess fee amounts, rounding and nested ownership explicitly; a balanced total alone cannot establish these fields. Genuine digital/PDF/refund truth and representative new evaluation cases remain missing.

Fifteen evaluation regression tests passed. The source-review checkpoint verifies twelve files; the paired rescore verifies 281 files, including all original source images, retained predictions, scanner/runtime snapshots and the unchanged scoring configuration. The preceding signed-finance checkpoint's 266-file verifier still passes, and the protected original checkout's HEAD, dirty paths and binary-diff hash are unchanged. No inference, external upload or application source change occurred. Reproduce the evidence checks with `python receipt_training/scripts/record_priced_row_review_v2.py --check` and `python receipt_training/scripts/build_priced_row_rescore_v2.py --check`. Aggregate evidence is in [advanced-priced-row-truth-v2.json](advanced-priced-row-truth-v2.json) and [advanced-priced-row-rescore-v2.json](advanced-priced-row-rescore-v2.json).

### Explicit currency for text parsing and review; rejected vision hint

An optional receipt-currency choice is now available before reading. It supplies known user context to computer/on-device OCR text parsing, embedded PDF text and independent comparison. It fills missing review currency without claiming that the code was printed. A conflicting printed or returned currency remains unresolved and receives a mandatory review check. The selection never converts prices or reinterprets canonical AI amounts, and resets when the receipt is deleted. It is not copied from the app's provisional default currency. Unknown source amounts remain marked for correction.

A paired **actual installed PaddleOCR** workflow used the same source image, prepared JPEG bytes and identical recognition-request body for both readings of one previously measured Indonesian development receipt. With no selection, the line price and total remained unreadable and currency was unresolved. Selecting IDR allowed deterministic interpretation of `43.636` as **43636** and `48.000` as **48000**. Quantity/unit price and separate added tax remained missing; the final draft still has two blocking issues and a 4,364-rupiah discrepancy. This is useful partial interpretation, not a complete receipt or currency-recognition success. The actual source shows quantity 1 and tax 4,364; neither is inferred from the amount needed to balance.

The same prepared pixels also tested an experimental currency hint sent to the installed Qwen model. It returned IDR but kept thousands marks in canonical JSON money strings. Two erroneous cash/change deposit proposals in its unhinted reading became four erroneous tip proposals, including tax, grand total, cash and change. Both drafts were blocked. **That prompt and transport experiment was withdrawn.** The final backend, model instructions, decoder and inference configuration are unchanged from the pre-change checkpoint; final model requests retain their original shapes and contain no currency hint. AI review can use the user's selected currency for a missing code while preserving every returned amount for checking. The failed trial's source snapshots and raw results remain available.

Current primary-reader click-to-response times were **8.80 / 2.13 seconds**, unselected then selected. The rejected vision pair took **34.38 / 23.62 seconds**. Order, model/OS caches, loading and observation overhead differ, so these timings do not demonstrate that choosing a currency speeds up reading. They are one source-informed development transaction, not a p95, fresh holdout, complete-corpus result or physical-phone measurement. Exact Chrome build was not recorded in the native pilot metadata; code/dependency snapshots and identical-pixel evidence are retained. Six local native HTTP requests include the rejected trial and an earlier primary diagnostic. No external provider request or paid activation occurred.

The final cached replay uses the identical independently extracted evidence for **38 development, 12 evaluation and one supplement**. All extracted fields, checks, warnings and financial results are unchanged without an explicit selection; actual module-load hashes verify the frozen code. Original full-corpus field scores therefore remain unchanged. Final verification passed **357 unit tests, 139 browser tests and one existing skip**, typecheck, build, formatting and graph refresh. The currency control was inspected at 320/390 pixels; browser coverage checks that AI requests remain unchanged and a returned `7.000` is preserved and blocked rather than silently converted.

Verified source locations are `src/lib/reading-context.mjs:L1`, `src/lib/parser.ts:L40`, `src/lib/gemini.ts:L13` and `src/lib/compared-reader.ts:L14`. Frozen evidence, the rejected candidate and 429 file checksums are in [advanced-reading-currency.json](advanced-reading-currency.json), verified with `python receipt_training/scripts/build_reading_currency_report.py --check`. The original protected checkout and stable reference remain unchanged. Stronger extraction, explicit raw-number profiles, general quantity/tax recovery and public-release acceptance remain unfinished. Veryfi's separately approved one-use upload is still unrun pending the user's unused Free quota confirmation.

### Evidence integrity follow-up after repeated browser runs

A broader audit found a defect in the earlier test-artifact convention: repeated browser runs reused fixed filenames. Thirteen exact artifacts referenced by three older checkpoints were overwritten: six selected-area artifacts, four PDF artifacts and three refund artifacts. Their original screenshot bytes and JSON timing/IDs have not been recovered. The old reports and expected hashes are preserved; a newer passing run does not verify those missing historical bytes. The corresponding legacy `--check` commands can fail at these paths. This qualifies the earlier checkpoint verification statements above.

The complete audit checks **1,831 unique declared evidence paths**. All other declared hashes resolve, including the original receipt images, frozen model outputs, source snapshots and corpus predictions. Matching mutable aliases and observed replacements were archived by content hash. Archive fallback requires exactly the expected bytes; the thirteen gaps remain explicit and are not replaced with the newer results.

Affected refund, PDF, selected-area and currency browser tests now write each test attempt into an exclusive folder and reject duplicate artifact names. A focused rerun passed **48 cases**; the subsequent complete run passed **139 cases with one existing skip**. All **82 first-run files** remained byte-for-byte unchanged while the repeated run produced a separate 82-file set. All 65 previously observed mutable aliases also remained unchanged during these controlled reruns. This fixes the identified producers; future artifact writers should use the same convention.

The new immutable packet retains fresh actual Tesseract evidence for the synthetic negative receipt and selected PDF area, plus the direct-text PDF workflow. Refund line/printed totals remain −£5.00 and exact shares −£2.50 / −£2.50 without financial edits or receipt POSTs. The selected-area reading leaves its draft unchanged. The two-page synthetic PDF retains three purchases, both genuinely repeated Milk rows, £6.50 and shares £2.17 / £2.17 / £2.16, with no remaining worker. Desktop and phone emulation repeat the same synthetic transactions; these are current integration checks, not new accuracy samples or recovery of the older raw records.

The disclosed gaps, fresh packet and 155 immutable evidence hashes are in [advanced-evidence-integrity.json](advanced-evidence-integrity.json), verified with `python receipt_training/scripts/build_evidence_integrity_report.py --check`. A fresh complete audit uses `python receipt_training/scripts/audit_evidence_integrity.py --run <new-name> --archive-mutable`; it returns a nonzero exit while historical hashes remain unresolved. Functional tests remain green. The full production-upgrade goal remains active.

### Automatic local comparison and preserved fallback checks

With both local readers configured, the computer reader now defaults to an independent vision comparison when the first draft has validation/source uncertainty, parser warnings or multiple sections. A clear single-section draft can skip vision but still needs an explicit purchase-source check. Users can force every comparison or skip the extra reader. The second model receives original prepared pixels only. Failed comparisons now preserve existing negative-line classification and reduced-price association checks, instead of replacing them with coverage alone. No cloud reader is selected automatically.

The actual orchestration replay covers all original 50 entries, including six historical pixel-limit failures in every mode. Those six old prepared panels exceed today's four-million-pixel guard by 500; they need fresh preparation/inference. Automatic and always comparison produce identical receipt values/checks on the other 44, and all 50 historical readings request vision in policy-only inspection. This cohort establishes no model-call savings. Including the failures, known line prices improve from primary-only **8/134** to **89/134**, and quantities from **6/120** to **105/120**. Four exact description regressions remain explicitly marked for review. Complete original financial accuracy is still unscorable.

A new actual two-photo UK attempt reaches primary review after **150.42 seconds**, with OCR HTTP 200 and vision HTTP 504; it is a failed combined extraction, without a captured final field vector or split. A distinct clear synthetic receipt uses actual PaddleOCR, skips vision, requires source review and splits £5.50 into £1.84/£1.83/£1.83 without financial edits, reaching review in **12.90 seconds**. Sampled owned Node/Chrome/model working-set peaks are **3.89 / 1.64 GiB**, excluding GPU memory and physical-phone claims. These two examples do not establish p95 latency or public sizing. The two-minute vision timeout remains unresolved.

Current verification passes **455 unit tests, 167 browser tests and one existing skip**, production build/typecheck and formatting. Phone controls fit 320/390 px and pass automated accessibility checks. The [detailed methods and limitations](AUTOMATIC_LOCAL_COMPARISON.md) and [782-file evidence checkpoint](advanced-automatic-local-v1.json), verified with `python receipt_training/scripts/build_automatic_local_report.py --check`, keep the failed diagnostics, saved-response measurements and actual model attempts distinct. No new cloud upload or paid activation occurred; earlier cloud approval scopes remain consumed. The thirteen old evidence gaps remain disclosed. The full goal remains active.

### Original-fifty decoder order and actual long-receipt checks

The canonical native decoder now copies each printed row total before generating
quantity and unit price. An order-only comparison across all original fifty
transactions improves known line prices **105/143 → 115/143**, with no scored
per-case regressions. The 38-development/12-evaluation membership stays fixed;
evaluation prices improve **16/22 → 17/22**. These are already inspected regression
cases, not a new holdout. Forty-eight new candidates extend two retained pilot
candidates; controls combine two fresh pilot reads and 48 retained same-pixel
successful original-cohort reads. Names, quantities, known unit prices, totals,
tax and charge counts remain unchanged. Unsupported unit/discount/charge
proposals remain explicitly checked; no complete financial success is certified.

The first actual phone-emulated scan timed out with vision HTTP504 and preserved
its OCR draft. A subsequent instrumented pipeline completed HTTP200/200, and a
separate phone-emulated app run showed all four targeted long-receipt prices
correctly after 172.19 seconds. Source checks and blocked confirmation remain;
there were no financial edits or external requests. The failed and successful
runs are retained. No p95, speedup or handset reliability is inferred. See
[methods, price gains and limitations](ROW_FIRST_DECODER.md), the
[1,043-file cohort result](advanced-row-first-original50-v1.json) and
[125-file pilot](advanced-row-first-pilot-v2.json).

### Consumed Azure comparison against the same six crops

The user configured a UK South F0 resource, confirmed six unused free pages and
separately approved the bounded Azure upload. All six extraction POSTs succeeded,
eight status GETs were made and all six matching deletion requests returned204.
No retries, other-provider uploads, custom training or paid activation occurred.
The approval is consumed; actual billing, quota and region were not inspected
through management APIs.

On the unchanged 26-row/25-known-price crop reference, native Azure matches all
26 names and 23 prices, versus native Veryfi's 22 names and 18 prices. Azure gets
all 15 known quantities and 11 known units, but returns wrong currency codes on
four cases, attaches none of three known coupons and misassociates two Tesco
prices. Its copied final totals match five of six; none is certified a complete
payable receipt. A same-current-parser literal-text ablation reads 25/25 prices
from Veryfi with explicit currency; Azure's split-column plain content reads0/25
and needs a genuine word-geometry adapter before that path can be judged.
No Azure app/default switch is made. See the [detailed comparison](AZURE_SIX_RESULT.md)
and [103-file result checkpoint](advanced-azure-screening-result-v2.json).

### Invalid vision-price proposals and Azure word orientation

The hybrid now proposes a literal source row price when the model's nonempty
amount is invalid, identity/currency agree and the actual monetary OCR word has
confidence at least 0.98. It preserves the previous value and leaves a blocking
source-recovery check. Valid conflicts, currency/sign/identity ambiguity and
unit-only tables are not overridden. Source proposals are not counted as
independent agreement; bill totals never select them.

The isolated saved-reading replay on all original fifty improves known prices
**115/143 → 126/143 with explicit post-extraction currency**. Automatic-currency
results stay 115/143. Eleven changed fields match existing source labels, with
no scored per-case regression or change to other financial vectors. A real
five-item installed-model/HTTP phone-emulated workflow proposes all five correct
prices, preserves source/previous-value details and blocked confirmation, and
reaches editable review in 84.57 seconds. A first run's ambiguous test close
selector and its artifacts remain; the scoped-selector rerun passes. Unsupported
units/headers/charges and complete financial truth remain unresolved.

The saved six Azure responses also support a research-only word-layout adapter.
Using actual word-edge orientation instead of horizontal baselines raises known
prices 19/25 → 25/25 and matched names 21/26 → 26/26 with explicit currency. Every
word/source box and real repeated purchase remains. The retained Qwen hybrid
still reads 22/25; name/size/confidence guards withhold three source proposals.
This is a tuned development screen, not a new holdout or registered Azure app
reader. There are no further model/provider calls in the replays, and all old
upload scopes stay consumed.

Current validation passes 520 unit tests, 167 browser tests with one existing skip,
typecheck/build, formatting and graph refresh. Fourteen new recovery and nine
geometry invariant tests support the change. See the
[methods, actual UI evidence and remaining limits](SOURCE_PRICE_RECOVERY.md) and
[873-file comparison checkpoint](advanced-source-price-recovery-v2.json).

### Receipt-level literal recovery

The independent verifier also proposes invalid nonempty subtotal/final/tax
amounts from uniquely labelled, reliable OCR rows with a monetary-word score of
at least 0.98. Original values remain visible and checks stay pending. Conflicting
totals/currencies, weak evidence, changed signs, empty/valid amounts and embedded
instructions are withheld; no purchase sum or balancing equation selects a value.

The same-reading original-fifty replay improves copied totals **33/49 → 34/49
automatically**, **33/49 → 41/49 with explicit post-extraction currency**, and
selected-currency subtotals **25/34 → 27/34**. All purchase-price, quantity, unit,
discount, tax-basis and charge vectors stay unchanged. Eleven proposals across
both currency views match known labels with no scored per-case regression; these
views are not independent receipt samples or complete financial results.

A fresh actual local-model/HTTP phone workflow preserves all five correct item
prices, proposes subtotal 221000 and final total 261333, opens their source
evidence and keeps confirmation blocked without edits. Its single scan-to-review
observation is 96.90 seconds, not a p95 or speed comparison. All 537 unit checks
pass, including seventeen receipt-level recovery tests. A final isolated guard
preserves disputed headers across model batches; the native observation precedes
this guard, which is covered by current replay and synthetic batch checks. See
[methods and remaining limits](SCALAR_SOURCE_RECOVERY.md) and the
[584-file comparison](advanced-scalar-recovery-v2.json).

## Requirement status against the full objective

| Phase | Current evidence and unfinished acceptance work |
|---|---|
| 1 — Investigation | Existing application, datasets, branches, extraction and financial paths inspected; primary changes preserved. |
| 2 — Baseline/truth | Original cohort and baseline frozen with field/latency metrics. A separate source-checked priced-row revision adds two paid add-ons and three zero-price options; five frozen pipelines are rescored on both label versions without new inference. A new financial-summary review adds nine known tax bases and one printed zero-rounding value; all old per-case amount scores are preserved. All original complete receipts remain unscorable, with a per-case gap inventory. The supplied UK supplement is now eligible but its retained views fail strict completeness. Genuine digital/PDF references remain missing. |
| 3 — Technology comparison | Full neural OCR comparisons, Qwen3-VL cohort, PaddleOCR-VL, GLM modes and Qwen3.5 profiles measured. Veryfi's one UK and six-case live screens are complete; native fields underperform its text/parser path on these cases. Two Gemini attempts returned 503, without an accuracy draft. The approved six-crop Azure screen matches 23/25 native prices; its research word-layout/parser path matches 25/25 with explicit currency, while native currency is wrong on four cases. The measured word path is now an optional app reader with preserved saved-response scores; no new live extraction, general provider winner or full financial accuracy is certified. |
| 4 — Hybrid pipeline | Bounded streamed local batches, source-based joins, local PDF/direct text, actual scanned-PDF OCR-to-split, advisory photo-quality checks, selected-area rereads and explicit user currency work within tested limits. Automatic local comparison routes uncertain drafts to independent vision and preserves checks on failure. Invalid item and receipt-level amounts receive pending literal-source proposals under source, currency and batch-conflict guards. Six old oversized cases now complete fresh current preparation/native inference. Compact multi-photo output completed actual two-photo Costco and four-photo synthetic checked splits, while prior canonical timeouts remain preserved. Broader document classification, genuine long-photo/PDF accuracy, overlap coverage, calibrated quality/edges/deskew/perspective and general recovery remain open. |
| 5 — Costco/general retail | Supplied UK receipt finances/source rows/split pass; strict global/general-retailer reliability remains insufficient. Unknown VAT legends are not guessed. |
| 6 — Credentials/services | Keys remain server-only. Both Gemini scopes, both Veryfi live-test scopes and the separately approved six-crop Azure scope are consumed. The user confirmed sufficient Free credits before each Veryfi run; all seven extraction requests and matching deletions succeeded. Account billing was not inspected and no paid activation was made. New app uploads require a deliberately configured finite allowance plus per-scan consent; current allowance is zero. No broader corpus upload is authorized. |
| 7 — Git protection | Stable baseline and separate improvement branch preserved; incremental local commits; no merge/push/deploy. |
| 8 — Splitting | Exact purchase/refund-credit allocation, signed tax, coupon reversal, currency/rounding and conservation regressions pass. Unresolved currency and ambiguous negative-row classification block confirmation. Genuine refund truth, unsupported input representations and broader financial coverage remain open. |
| 9 — Mobile UX | Capture/reorder/crop/progress, local quality advice, PDF import/cancellation, responsive source review, area rereading/manual correction and sharing work in browser tests. Optional bounded receipt-edge suggestions preserve originals and need Apply. Veryfi consent/review controls fit 320/390 px browser emulation. Perspective/arbitrary rotation, live-camera guidance and physical-device testing remain open. |
| 10 — Public security | Local host/origin/body/rate/timeout/cleanup/secret, PDF worker-error/import and development private-file HTTP boundaries tested. Public authentication/TLS, crash recovery/OS isolation, production quotas/spend/provider privacy review remain open. |
| 11 — Complete verification | The earlier full native run attempted all fifty: fifty OCR successes, forty-nine vision successes and one single-photo timeout, with primary fallback; mean preparation-to-draft time was 50.56 seconds and p95 107.34 seconds. Later row-first evidence retains fifty candidate readings, with 48 fresh calls plus two protocol-matched pilots. The latest same-reading verifier replay matches 41/49 copied totals with explicit currency and 34/49 automatically; it does not replace the earlier latency cohort. Current checks pass 645 unit tests and 175 standard browser tests with one existing skip. The guarded financial-layout proposal improves known net-price basis from 0/9 to 4/9 with explicit currency; all such proposals retain mandatory source checks. Azure controls use the actual local HTTP API with synthetic provider responses; the six retained real responses have an unchanged same-reading score. Two actual local-model phone observations repeat one inspected development receipt; the second uses the final source-expression code. Complete original financial truth, genuine input types, physical-device and broader provider/recovery verification remain incomplete. Thirteen overwritten historical artifacts remain disclosed. |
| 12 — Final report | This is a maintained evidence report with limitations and reproduction. Final requirement-by-requirement acceptance is not yet achieved. |

## Remaining requirements

The next work must improve parsing/locale ambiguity and unsupported overlap layouts, measure stronger and faster independent extraction/recovery, extend genuine long-receipt/PDF accuracy and correction/splitting evidence, and implement broader document classification, quality/edge/deskew/perspective handling, field-uncertainty calibration and automatic item recovery. Genuine refund formats, remaining split/currency invariants, mobile workflows and public-backend security must be completed and tested.

The original model/schema lacked IDR/TWD and treated Indonesian thousands as decimal fractions. The new normalizer fixes clear grouping and rejects ambiguity, but a receipt without currency/format evidence still needs explicit user context. Recovering correct physical quantities, all money fields and cross-photo overlap remains open. Unknown tax codes/rates must continue to require receipt evidence.

All original manifest records still disallow external processing. Two identifier-removed crops reached Gemini under two separate one-use approvals; both returned 503 and consumed their scopes. Veryfi completed the separately approved UK transaction and six exact prepared crops, with seven successful extraction responses and seven reported deletions of matching new records. Both scopes are consumed. The new app integration used only synthetic transports and saved responses; no additional private upload, original-corpus permission or paid activation is implied. Current allowance is zero. Provider deletion is not zero-retention or training-exclusion proof. Google's UK/EEA/Swiss terms and Veryfi's default US hosting/proprietary model-improvement policy still require public-release review. [Google terms](https://ai.google.dev/gemini-api/terms), [Veryfi privacy](https://www.veryfi.com/privacy/).

Final acceptance still needs complete ground truth where available, additional genuine digital/PDF cases, fair cloud/VLM trials where accessible/approved, independent recovery measurements, meaningful uncertainty evidence, exact split regression checks, full upload-to-summary E2E tests, error/security/memory/cost checks, stable-reference verification and the final requirement-by-requirement report. This goal must remain active.

### Financial interpretation: guarded net-price proposal, rejected specialist

An original-image financial-summary specialist using the installed Qwen weights
copied 15/15 amounts but correctly classified only 7/15 role/amount pairs and
0/2 known positive-tax price bases. Five roles were unknown. The three fixed
development calls completed without schema errors in 34.660–36.171 seconds each,
including CLI loading. The specialist is rejected and is not an independent
second model or a new app reader. Public metadata for a larger local candidate
was inspected, but no larger weight was downloaded or benchmarked under the
observed memory constraints.

The implemented recovery instead uses a strongly read, complete original OCR
subtotal/tax/total section to propose net prices only when the vision basis is
unknown. Literal labels and amounts must agree with real OCR words; financial
arithmetic only rejects inconsistent interpretations. Conflicting inclusion text,
zero tax, missing rows, multiple summaries and unresolved currency prevent the
proposal. A dedicated unconfirmed source check and actual highlights remain.
No amount, charge kind, rate, tax mode, coupon, purchase or receipt metadata is
changed, and a valid vision boolean is preserved.

The same-reading frozen replay covers all fifty original receipts in both
currency modes: 200 before/after views with no new inference. Explicit-currency
net-basis correctness improves from **0/9 to 4/9**. A fifth proposal has unknown
basis truth and is not counted as another success. Automatic-currency results,
all known monetary-field counts and trusted reconciliation **0/49** are unchanged.
All receipts still require checking; original complete financial accuracy remains
unscorable. This is a source-informed development result, not a blind holdout.

Current validation passes **645 unit tests**, build/typecheck, formatting and
**175 standard browser tests with one existing skip**. The synthetic net-price
workflow stays blocked until checked and then shares £21.00 as £10.50 each.
The final geometry-corrected fixture passes both browser projects and fits
320/390 px emulation; this is not native-reader or physical-handset evidence.
The 601-file packet retains source, predictions, references, checks and the
earlier failed setup/fixture evidence. Thirteen legacy overwritten artifacts
remain disclosed. The protected branches/original dirty checkout are unchanged.
No private cloud upload, allowance change, paid activation, merge, push or deploy
occurred. [Method, measured limits and reproduction](FINANCIAL_BASIS_RECOVERY.md).
The full production-upgrade goal remains active.

### PaddleOCR-VL spotting and spatial text assembly

The installed model now has a separately measured documented spotting profile.
A derived projector changes only its prescribed maximum-pixel metadata; original
weights and tensor bytes are unchanged. A synthetic comparison exposed the CLI's
default suppression of location tokens. Explicit special-token output preserves
seven exact text lines and their predicted polygons, with minimum synthetic box
IoU 0.7838. No confidence score is invented.

The new pilot makes twelve local native calls over ten previously inspected
transactions/controls: the former seven-case pilot's exact nine panels and three
additional financial cases' exact current panels. All processes finish; ten
outputs satisfy the strict located-line decoder. A fiscal certificate repeats
unlocated digits and Bristol includes unlocated/multiline footer text, so both
readings are withheld. The same current parser and latest references score the
retained transcription and both new text representations.

On the earlier six financial cases, explicit-currency row assembly improves
known line prices from **41/63 to 50/63** and product matches from **41/65 to
51/65** over the retained Paddle transcription. Quantities regress **36/55 to
29/55**, and copied totals **2/6 to 1/6**. Unit prices remain 18/27, item discounts
18/21 and trusted reconciliation 0/6. Automatic prices improve 18/63 to 27/63;
literal generation order alone supplies no correct line prices. The three added
cases have 10/10 conditional prices but five extra rows, 0/10 quantities and 2/3
totals. The no-purchase control remains empty. These are source-informed profile
results, not a blind holdout, an isolated prompt ablation, the app's full original
cohort or a new provider winner.

Real-panel CLI times range 6.040–25.628 seconds, mean 10.266 seconds, with maximum
working set 1,789,669,376 bytes. These exclude preparation/setup, GPU/whole-app
memory and handset execution. There are fourteen local calls including two
compatibility calls, zero private uploads and zero API cost. Twenty-five Python
checks pass; application code remains unchanged from `4686b8e`, so its earlier
645 unit/175 browser passes with one skip keep their prior scope. Stable and the
original dirty checkout remain protected. The **449-file verified packet** and
[method, tradeoffs and reproduction](PADDLE_SPOTTING_TRIAL.md) preserve all native
outcomes and the corrected reporting attempts. The spotting profile is not
selected as an app reader. Full financial recovery and acceptance remain open;
the full goal remains active.
