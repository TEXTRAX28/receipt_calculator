# RapidOCR small-model development screen

4 November 2026; application parent `ff9e26eaf11340fd45bfd88c37fe0fe71202a6c1`.
The twelve-phase objective remains active. This is a successful local engine
screen and a development parser improvement, **not a production OCR migration**.

## Actual engines and resource results

[RapidOCR 3.10.0](https://pypi.org/project/rapidocr/3.10.0/) was inspected in an
isolated tool directory, without changing the working Paddle environment or
shared npm dependencies. Its full public wheel checksum was verified in RAM;
only Python/configuration, metadata and licences were extracted. OmegaConf 2.3.0
and ANTLR runtime 4.9.3 were isolated alongside it. No package setup script ran.
The software is Apache-2.0; the
[model licence record](https://rapidai.github.io/RapidOCRDocs/main/en/model_licenses/)
also identifies the separate Baidu/Paddle model attribution requirements.

The first runtime profile reused the existing medium ONNX exports, the exact
18,710-character decoder and their declared preprocessing. Both models loaded,
but available RAM then failed the unchanged 1.5 GiB image-admission check.
**No image OCR call started in that medium profile.** Its thirteen planned cases
remain unattempted; this is an operational refusal, not zero-percent accuracy.

A separately frozen profile used the official bundled PP-OCRv6 small detector
and recognizer with the release's small-model defaults. It verified the full
27,288,134-byte wheel and both model hashes, streamed the two models to an owned
child, then used ONNX Runtime's supported
[serialized-model bytes input](https://onnxruntime.ai/docs/api/python/api_summary.html#inferencesession).
No model, wheel or temporary image file was saved. Python network access was
denied before OCR imports; receipts never went to a provider.

The small profile returned all **13/13** calls: one synthetic control plus the
fixed twelve development JPEGs. Native duration was 9.532 seconds; the outer
process, including public download, startup and release, took 12.786 seconds.
The decoder control, model vocabulary and five synthetic text checks passed.
The 1.5 GiB startup/per-image and 1 GiB runtime RAM floors were retained.
The outer minimum sampled RAM was 1,493,815,296 bytes, above the runtime floor.

The disk policy is explicitly different from installing a model. The ten-GiB
**persistent-installation** reserve was not met, so installation remains held.
The small experiment kept model bytes in RAM, bounded recognition JSON to four
MiB and stopped on an ambient disk decline over 64 MiB. Compressing sixteen old
generated QA build directories preserved all 3,478 file hashes, with no deletion
or movement, but did not restore the global reserve. Other disk writes were not
attributed to this experiment without evidence.

## References and fair comparison

The development IDs are CORD train 024–035, selected before their outputs were
known. Both engines consumed exactly the same previously prepared JPEG hashes.
The original PNGs and upstream annotations are unchanged. All twelve images
were reviewed alongside the upstream annotations before prediction fields were
inspected. This is assistant source review, not independent human verification.
Masked or absent fields stay null; no total is filled from cash minus change.
The twelve reserved evaluation receipts were neither viewed nor inferred.
CORD's Indonesian receipts do not establish UK Costco accuracy or prove the
pretrained models had never encountered these sources.

The collector rejected valid mixed grouping/fraction strings such as
`181,500.00`, leaving three item prices, subtotal, total and two payment amounts
null. The correction was discovered after the first score. All seven numbers
were already in the frozen pre-prediction source-review notes. Revised labels
and scores are separate files; the original labels, scores and predictions
remain intact. No scanner output was changed to fit a reference.

Tesseract then returned one actual scan for each of the same twelve JPEGs,
using its installed English best-int data, OEM 1, PSM 6 and preserved interword
spaces, matching the current device-reader settings. Its Node worker terminated.
An earlier startup refusal launched no child and made no OCR call. The later
successful batch followed an observed recovery in available RAM, with no OCR
retry. This compares native engine/component behavior; it is **not a browser
upload-to-split measurement**.

The same frozen pre-change assembler/parser/review/financial code was replayed
for both engines, then the same post-change code for both. All 96 views returned
without a parsing exception. Before-change Rapid fields exactly reproduce the
earlier saved component replay. Price-blind one-to-one matching uses the existing
0.65 threshold. Full-name accuracy excludes one clipped name and a take-away
charge; priced-component accuracy includes that charge explicitly.

| Known field, with IDR supplied as context | Tesseract, before | Rapid small, before | Rapid small, after |
| --- | ---: | ---: | ---: |
| Products detected | 0/19 | 9/19 | 10/19 |
| Product precision | 0/7 | 9/15 | 10/16 |
| Complete visible product names, exact | 0/18 | 7/18 | 8/18 |
| Priced-component line amounts | 1/20 | 9/20 | 10/20 |
| Printed quantities | 0/16 | 1/16 | 4/16 |
| Printed unit prices | 0/10 | 1/10 | 4/10 |
| Item discount amounts and owners | 0/2 | 0/2 | 2/2 |
| Printed grand totals | 3/11 | 5/11 | 5/11 |
| Printed tax amounts | 0/4 | 0/4 | 0/4 |
| Trusted reconciliation | 0/11 | 0/11 | 0/11 |

Supplying IDR is user context, not an OCR currency success. Automatic Rapid
after-change results are weaker: line amounts 5/20, totals 2/11 and resolved
currency 2/12. All twelve views in every group still require review. Complete
financial accuracy is unscorable because no reference has complete unmasked
financial coverage; it is not reported as zero-percent accuracy.

Warm per-image native OCR averages 536.5 ms for Rapid (p95 890 ms), versus
753.3 ms for Tesseract (p95 2,621 ms), twelve observations per engine. Replays and
currency modes reuse those observations. These timings exclude browser capture,
preparation and end-to-end review; the outer durations have different startup
work and are not an end-to-end speedup claim. Provider charges are zero;
local electricity/compute cost was not measured.

## Parser change and validation

The refreshed graph locates `parseReceiptWithSources()` at
`src/lib/parser.ts:L65`. A literal count and `@` unit price directly above
a named priced row now retain their printed roles. A bare zero becomes a new
purchase only through that explicit adjacent expression. A directly following
`DISC ITEM` percentage plus signed amount can belong to that purchase block,
with the exact amount retained. No percentage, unit price, count or total is
calculated to supply missing evidence. Every recovered quantity/unit-price role
and item discount keeps a mandatory source check and its original row indices.
Other receipt discount conventions retain their existing behavior.

Five new controls cover correct zero/discount grouping, conflicting arithmetic,
pack-name ambiguity, unowned discounts, invalid counts and photo boundaries.
All **145 focused assertions across five files pass**, including existing
parser, zero-price, purchase-expression and column controls. An initial broad
bare-zero version hit the existing 300-item protection; it was narrowed before
this passing run, and failed source/test bytes and logs were preserved.

The first full-suite attempt was refused before launch at 1,520,881,664 available
bytes. A subsequent 45-second observation peaked at 1,462,231,040, below the
unchanged 1,610,612,736 startup floor. After observed recovery, the actual full
suite passes **1,376 assertions across 77 files**, retaining all previous test
files and adding five controls. Formatting, isolated compilation and refreshed
graph checks also pass. The compilation omits the separate large public assets
and is not a new complete deployment package or browser check.

Typecheck remains separate: its 512 MiB heap profile was stopped when available
RAM crossed the runtime floor; a 384 MiB profile exhausted V8's heap without
crossing that floor. Both are capacity failures, not a passing typecheck. A
single 448 MiB profile is prepared behind a larger observed admission window,
with the same complete TypeScript program and unchanged safety floors. No new
browser or physical-phone verification is claimed.

## Evidence and next action

Local packets are `qa-artifacts/rapidocr-runtime-v1`, `rapidocr-small-v1`,
`rapidocr-small-quality-v1`, `tesseract-fresh-dev-v1` and
`rapidocr-paired-quality-v1`. The paired plan binds both parser snapshots,
both actual engine outputs, the references and the correction journal.
`advanced-rapidocr-small-screen-v1.json` records exact retained bindings.

Next: complete the pending typecheck under the same
resource policy, then extend this frozen small-model comparison to the existing
Costco and broader development panels. Only evidence from those checks should
drive a modular production-provider integration. The current model/provider
configuration, stable branch, original checkout, frozen handoff and unused
Gemini preparation remain protected. OpenAI is a last resort and has not been
used. The broader twelve-phase goal is incomplete.
