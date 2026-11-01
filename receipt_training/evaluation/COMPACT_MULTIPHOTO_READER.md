# Local multi-photo reader: measured format and deadline change

Updated 1 November 2026. This is one implementation checkpoint within the active twelve-phase goal. It improves a demonstrated timeout on the supplied long receipt; it does not certify unattended financial extraction or public deployment.

## Actual upload-to-split results

The supplied two-photo UK Costco receipt completed the actual automatic computer-reader workflow with installed PaddleOCR and Qwen3-VL 4B models. Both HTTP calls returned 200. Both models received exactly the same prepared JPEGs; their request bodies have identical hashes. The second model received photographs independently, without OCR text, labels or selected-currency hints.

The source-informed development reference matched all eighteen purchase quantities, unit prices, line prices, discounts and VAT codes. All four nonzero coupons were attached correctly after independent source verification. The draft calculated GBP 163.16 before VAT, GBP 13.62 VAT and GBP 176.78 paid, with zero arithmetic discrepancy. Seventeen of eighteen normalized descriptions matched exactly. Eight explicit source checks remained required, including recovered coupons and disputed or unsupported fields. The browser completed review and an equal three-person split of GBP 58.93 / 58.93 / 58.92, without changing financial values.

Scan button to editable review took **205,863 ms**. The sampled sum of the owned Node app, Chrome and local-model descendants peaked at **4,120,313,856 bytes** (about 3.84 GiB). Sampling every 250 ms can miss peaks and shared pages can be counted twice. GPU memory, unrelated applications, physical-phone memory and production sizing are excluded. This is one laptop observation with existing caches, not p95 or a controlled speed comparison.

A separate predeclared synthetic four-photo receipt completed actual primary OCR and two native vision batches in **103,072 ms** through editable review. Source joining retained six purchases, including two identical adjacent chicken purchases. After source checks, GBP 19.50 split into three GBP 6.50 shares without financial edits. This exercises batching and splitting; synthetic text is not evidence of real-receipt model accuracy.

## What changed

Requests containing more than one distinct original photo use compact native item arrays in the fixed order:

```text
[description, quantity, unitPrice, lineTotal, taxCode, discount, sourcePhotos]
```

The server expands those positions into the existing item object and validates the complete receipt with the existing strict schema. It copies monetary strings without normalizing, calculating, rounding or balancing them. The existing native item note was already constrained to the empty string. No financial field is discarded. One original photo, even when split into several detail panels, retains canonical item objects.

The multi-photo native process has a 180-second limit, the reader a 200-second limit and the browser a 205-second limit for the vision request. These exclude the earlier primary OCR stage, so the whole upload-to-review duration can exceed 205 seconds. One-photo reader/client limits remain 120/125 seconds. The trusted vision HTTP limit is 200 seconds and the existing whole-batch deadline remains 900 seconds. Limits of two attempts per minute and ten per hour, asset checks, body/pixel bounds, strict photo references, output bounds, cancellation and owned-input cleanup remain in force. Longer budgets are bounded and still may fail on slower hardware.

No provider, model weights or runtime version changed. No cloud fallback, automatic retries, new cloud upload, billing activation or model download was added.

## Failed and successful pilot evidence

The first compact smoke failed before inference because the pinned runtime chooses `items` before `prefixItems` and rejects the boolean `items: false`. The adapter removes only that redundant keyword after asserting a fixed seven-position tuple with matching minimum and maximum length. Runtime tuple construction and strict application validation retain the seven-field contract. See the [pinned llama.cpp parser](https://github.com/ggml-org/llama.cpp/blob/8642541b255bfb5dc39cd351a178be09013a55d6/common/json-schema.cpp#L171). The failed smoke remains saved.

A verbose canonical two-photo diagnostic timed out at 181,230 ms with incomplete JSON. It showed all 37 model layers on the GPU and completed image encoding. It does not support blaming CPU layer offload or trailing whitespace. A later canonical control also remained incomplete at 241,379 ms under a research-only 240-second limit.

| Development input | Canonical native CLI | Compact native CLI | Financial interpretation |
|---|---:|---:|---|
| Supplied UK Costco, two photos | 241,379 ms, incomplete JSON | 162,502 ms, accepted | Hybrid matched eighteen purchase finances and four coupons; eight checks remained |
| CORD train 005, one photo | 54,752 ms | 45,467 ms | Both missed all five known line prices; compact introduced more blocking issues |
| Taiwan Costco 20121104, one photo | 31,911 ms | 31,158 ms | Both copied 1891; compact proposed zero payable value; item truth is unavailable |
| Tesco 1994, two panels from one photo | 119,128 ms | 79,878 ms | Both copied 6.71 but calculated wrong totals: 5.11 and 9.31 respectively |

The table records single observations in fixed canonical-first order, with host load and cache differences. It is not a speed ratio, p95 or broad provider ranking. The one-photo errors are the reason compact output was not promoted globally. The original fifty-receipt cohort consists of one-photo transactions and keeps its established format. The supplied two-photo receipt has influenced implementation and is development data, not a blind holdout. Independent source checks and arithmetic gates remain mandatory; agreement does not prove correctness.

## Six fresh current-preparation reruns

Six older saved panels were 1500 by 2667 pixels, exceeding the current four-million-pixel guard by 500 pixels. The guard was not weakened. Fresh browser preparation from the unchanged originals produced 1500 by 2666, or 3,999,000 pixels. All six actual OCR calls and all six actual vision calls returned 200. The six-case known-price score improved from primary OCR 0/20 to independent hybrid 13/20; quantities improved from 0/14 to 14/14. Each case used fresh API/reader instances under unchanged quotas, so this does not establish shared-server throughput.

The [current-preparation report](advanced-current-preparation-v1.json) combines these six fresh results with 44 retained valid orchestration observations. On the original fifty, hybrid known prices are 102/134, quantities 119/120, exact normalized names 122/135 and copied totals 33/49. This is explicitly mixed vintage; no fresh fifty-case latency or accuracy holdout is claimed. Complete financial truth is still unavailable for all fifty original receipts, so strict complete-receipt accuracy remains unscorable.

## Verification and reproduction

The [671-file aggregate packet](advanced-compact-multiphoto-v1.json) binds exact source snapshots, requests, images, raw native outputs, failed trials, actual UI workflows and validation artifacts. The [482-file validation supplement](advanced-compact-validation-v1.json) freezes the source, tests and build, includes 32 per-test artifact directories from the final browser run, verifies protected Git state and finds no configured API-key values in source/build files. Final checks pass 484 unit tests and 167 desktop/mobile browser tests with one existing skip, plus build/type checking, formatting and the actual native four-photo browser test. Private receipt data remains ignored. The first unit run's invalid photo fixture and the first browser run's two navigation failures during an overlapping rebuild are retained; the final complete checks use the corrected fixture and stable build.

Verified code-map locations: `server/local-vision-format.mjs:L44` expands the representation; `server/local-vision.mjs:L50` owns the native reader; `src/lib/vision-plan.mjs:L8` distinguishes original photos; and `src/lib/local-vision.ts:L13` owns the short vision client. The graph is a navigation aid; source lines were checked for this checkpoint.

```powershell
npm test
npm run build
npm run test:e2e
npm run format:check
python -X utf8 receipt_training/scripts/build_current_preparation_report.py --check
python -X utf8 receipt_training/scripts/build_compact_vision_report.py --check
python scripts/update-graph.py --check
```

Run the build before starting browser tests; replacing a served build interrupts navigation. Opt-in native workflows are separate from the standard suite and need the installed local assets. `benchmark_automatic_local.mjs <new-run>` measures the supplied two-photo workflow; `run_native_long_workflow.mjs <new-run>` measures the synthetic four-photo workflow. Both disable Gemini/Veryfi and preserve exclusive run directories.

Three-minute scan latency, locale/price failures, broader overlap coverage, independent recovery, complete source truth, genuine digital/refund cases, physical devices and public-backend controls remain unresolved. Thirteen historical overwritten-artifact gaps remain disclosed; these new observations do not reconstruct the missing old bytes. The protected stable branch remains unchanged, and the full goal remains active.
