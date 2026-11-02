# Receipt-scanner technical checkpoint and acceptance audit

Updated 2 November 2026. This is the current consolidated checkpoint for the
twelve-phase objective. [ADVANCED_OCR_REPORT.md](ADVANCED_OCR_REPORT.md) preserves
the longer investigation history. Historical paragraphs describe their own
checkpoints; they must not be read as the latest configuration or test count.

Recognition has improved substantially, and the implementation is a functioning
checked-draft workflow. **The full goal remains active.** Trusted automatic
financial acceptance and public-release readiness have not been demonstrated.
This audit records completed work and specific gaps; it does not turn passing
software tests into receipt-accuracy evidence.

Latest implementation: [optional rotation and perspective correction](CAPTURE_GEOMETRY.md)
preserves originals and native long-receipt sections, adds explicit corrected
previews and mandatory source review, and passes 716 unit tests plus 183 browser
tests with one existing skip. The real on-device synthetic journey still needs
one recorded name edit before an exact £2.75/£2.75 split. A white outside margin
fixes one native synthetic unit-price error; no financial field is edited. It does not establish
general genuine-photo accuracy or physical-phone acceptance.

The preceding [printed purchase columns](COLUMN_PURCHASES.md) improve
explicit-currency hybrid line prices from 131/143 to 132/143 and primary
quantities from 30/120 to 32/120, with no scored per-case regressions. Source
checks remain mandatory. Validation passes 693 unit tests and 179 browser tests
with one existing skip. A separate non-private Gemini 3.8 synthetic test now
succeeds; six real-crop tests are prepared pending new Phase 6 approval.

The preceding [literal financial-summary role proposals](FINANCIAL_ROLE_RECOVERY.md)
improve explicit-currency hybrid fees from 4/8 to 7/8, printed tax from 13/22 to
16/22 and receipt discounts from 2/4 to 3/4, without scored known-field
regressions. Source checks remain mandatory. The new result packet supplements
the earlier 514-file corpus/baseline audit; it does not rewrite that checkpoint.

## 1. Existing system and protected baseline

The original scanner uses browser-hosted English Tesseract.js 6.0.1, bounded image
preparation, overlapping sections for tall photographs and a heuristic text
parser. A separate exact-money engine validates the editable receipt and splits
it among people. The earlier Gemini adapter did not successfully extract a real
receipt in the recorded approved tests.

The main weaknesses were missed text, broken row/column interpretation, currency
ambiguity, missing quantities, coupon association, overlapping photographs and
financial roles. Merely replacing text recognition did not solve these problems.
For example, the initial same-parser Paddle/docTR comparison improved detected
products but still copied very few correct prices or final totals.

The original checkout remains on `receipt-dataset-evaluation` at
`29a187af7347be94c0728f4785be674500833748`, with its three pre-existing changed
files preserved. The protected `stable/receipt-verified` reference remains
`ee725ba45e799bee8501d3de034e0302c0127afd`. Its verification established a
reproducible working application **and documented recognition failures**, not
unattended financial reliability. Improvements are isolated on
`feature/advanced-ocr-vision-ai`.

## 2. Corpus, references and reproducibility

The new [machine-readable audit](advanced-goal-acceptance-audit-v1.json) verifies
all **54 source files / 53 distinct source hashes** against the manifests. There
are no unaccounted source-image hashes. The byte-identical Bristol alias is not
counted as another transaction. The original fifty financial receipts remain
38 development / 12 evaluation; the photo-order control and supplied UK
transaction/photo views remain separate. No source, split membership or external
processing permission was changed.

The collection contains photographs, not genuine digital receipts or retailer
PDFs. Synthetic PDF fixtures verify functionality and limits, but supply no
genuine PDF accuracy score. Previously inspected development/evaluation images
and assistant-reviewed partial references are not a blind holdout or independent
human transcription.

Current field comparisons use the unchanged strict scorer and v5 financial
references. All fifty original receipts still lack sufficient complete truth
for the strict whole-receipt metric. Unknown or publisher-blurred fields remain
unknown. The supplied UK supplement is separately eligible, but its retained
strict score is 0/1; two exact O/0 name errors are sufficient to fail it even
where its financial vector is correct.

Two retained Tesseract runs, from 29 and 31 October, have now been rescored
separately under those same references. Their field counts agree exactly. The
current hybrid score is reproduced from retained, independently extracted
OCR/vision readings and the final verifier replay. This is an offline rescore,
not a new full native run or latency sample.

```powershell
python -X utf8 receipt_training/scripts/build_goal_acceptance_audit.py --check
python scripts/update-graph.py --check
```

The audit binds 514 files, including original inputs, frozen baseline sources,
current replay sources actually loaded, predictions, references, scorer, per-case
scores and current verification logs. Raw receipts, model output and detailed
local artifacts remain ignored by Git. Exact old source bytes are used when a
previous checkpoint explicitly archived them.

The global evidence audit still has **thirteen disclosed legacy missing artifact
declarations**, across three older checkpoints. New tests cannot restore those
historical bytes, screenshots or timings. No zero-gap claim is made.

## 3. Measured before and after

All columns use the original fifty transactions and the same v5 references.
Explicit currency is supplied **after extraction**, separately from the automatic
branch. It is user context, not successful model currency recognition.

| Field / available reference | Protected Tesseract baseline, automatic | Current hybrid, automatic | Current hybrid, explicit currency |
|---|---:|---:|---:|
| Matched priced rows /145 | 39 | 143 | 143 |
| Predicted rows | 83 | 146 | 146 |
| Exact normalized names /145 | 24 | 132 | 132 |
| Quantities /120 | 3 | 119 | 119 |
| Line totals /143 | 5 | 116 | 131 |
| Unit prices /31 | 3 | 22 | 25 |
| Item discounts /7 | 0 | 5 | 5 |
| Receipt discounts /4 | 0 | 2 | 3 |
| Printed subtotals /34 | 0 | 25 | 27 |
| Printed tax amounts /22 | 0 | 13 | 16 |
| Printed final totals /49 | 0 | 34 | 41 |
| Service/other known fees /8 | 0 | 4 | 7 |
| Known price basis /9 | 0 | 0 | 4 |
| Known grouping /14 | 3 | 11 | 11 |
| Known merchant /6 | 1 | 1 | 1 |
| Trusted reconciliation /49 | 0 | 0 | 0 |
| Strict whole-receipt accuracy | Unscorable | Unscorable | Unscorable |

Scoped product recall rises from 26.90% to 98.62%, and scoped precision from
46.99% to 97.95%. Automatic line-price equality rises from 3.50% to 81.12%;
explicit-currency equality is 91.61%. These precision denominators reflect
partial annotation scope: unmatched predictions are not automatically confirmed
false purchases. Zero arithmetic discrepancy is not trusted reconciliation if
currency, fields, charges or source review remain unresolved.

The conditional result still misses two referenced rows and twelve known line
prices, one quantity and eight copied final totals. Seven of eight service
amounts match. All fifty drafts require review. Recoveries and tax-basis
proposals are retained as unconfirmed source checks, rather than silently
accepted corrections.

The protected Tesseract full-pipeline run averaged 1,283.68 ms, p95 3,709 ms.
An earlier fresh current-pipeline original-fifty run averaged 50.56 seconds,
p95 107.34 seconds, including its one safe vision-timeout fallback: fifty OCR
successes and forty-nine vision successes. Later row-first extraction has fifty
retained readings (48 fresh calls plus two protocol-matched pilots). The latest
deterministic replay has no new native latency cohort. Recognition improved at
a substantial resource/latency cost; no speedup is claimed.

Local receipt API fees are $0; electricity and deployment/hosting cost are
unmeasured. Approved cloud tests used user-confirmed free quota, with no billing
activation; account billing itself was not verified. Candidate-specific timings,
peak working sets and limitations remain in their linked evidence packets.

## 4. Technology comparison and selected architecture

| Technology actually investigated | Measurement and decision |
|---|---|
| Tesseract.js | Preserved on-device option and reproducible baseline. Weak recognition on the supplied photographs. |
| PaddleOCR PP-OCRv6, ONNX | Full original-cohort comparison; more labelled products than docTR with the same original parser. Selected practical computer OCR. Geometry and OCR scores are retained separately from parsing. |
| docTR DB-ResNet50 / PARSeq | Full same-input comparison. Valid configurable alternative; did not beat Paddle on that comparison. |
| Qwen3-VL 4B / pinned llama.cpp Vulkan | Full-cohort independent image extraction, row-first decoding, bounded batches and actual local API/browser flows. Selected optional local verifier/recovery alongside Paddle. It receives source images, not primary OCR text or references. It remains fallible and requires review. |
| PaddleOCR-VL 1.6 | Transcription and later spotting/geometry pilots. Spatial assembly improved conditional prices in that pilot but regressed quantities/totals and withheld two invalid located outputs. Not selected as an app replacement. [Spotting evidence](PADDLE_SPOTTING_TRIAL.md). |
| GLM-OCR and Qwen3.5 profiles | Local diagnostic comparisons retained contract failures and financial errors. Neither justified replacing the selected hybrid. |
| Veryfi | One supplied-UK test plus a separate six-crop screen. On the six crops, native fields match 18/25 line totals. Its text/parser path is better; an optional consent-gated app reader is implemented. No general provider-win claim. |
| Azure prebuilt-receipt, API 2024-11-30 | Six approved UK South F0 crops: native fields match 23/25 line totals and all 15 known quantities, but misidentify four currencies and all three coupon associations. Word geometry plus the parser matches 25/25 prices with explicit currency, 18/25 automatically; quantities remain 9/15, copied final totals 4/6 conditionally. Optional app reader preserves those saved-response scores. [Comparison](AZURE_SIX_RESULT.md), [integration](AZURE_APP_READER.md). |
| Gemini | Synthetic transport smoke succeeded; both separately approved genuine-crop attempts returned 503 without a draft. No real-receipt accuracy score. The optional backend adapter remains available when configured. |
| OpenAI and Anthropic vision | Official capabilities/pricing investigated; no configured access or receipt benchmark. Documentation is not measured superiority. |
| Google Document AI, AWS Textract, Surya | Capabilities, deployment/privacy or licensing constraints investigated. Not locally configured/benchmarked; no extraction score or deployment suitability is invented. |

The practical architecture is bounded preparation → provider extraction → source
layout/parser → independent local comparison where needed → deterministic money
validation → explicit human source checks → assignments and exact splitting.
Usable PDF text is extracted directly, with source rectangles and a complete-list
check; scanned/mixed pages can use image recognition. Originals remain available.

Preprocessing, extraction, parsing, verification and splitting stay separate.
Readers are configurable. An unavailable or failed independent comparison
preserves the primary draft and mandatory coverage checks; it never triggers an
unapproved cloud fallback. Optional cloud readers are not silently selected.

Source locations were verified against graph nodes and actual code:
`src/lib/compared-reader.ts:L19`, `src/lib/verify-readings.ts:L163`,
`src/lib/financial-basis.ts:L36`, `src/lib/pdf.ts:L25`,
`src/lib/engine.ts:L55` and `src/lib/engine.ts:L479`.

## 5. Implemented improvements and latest validation fix

The upgrade includes real computer OCR, independent local VLM verification,
bounded long-receipt batches, source-grounded overlap joins, literal amount/unit
proposals, explicit currency, guarded financial-basis proposals and field/source
review. It adds local digital/scanned PDF import, original-area rereading,
advisory capture checks, optional edge suggestions, and responsive correction,
refund-credit and sharing flows. Missing values and unfamiliar tax legends stay
editable and block acceptance where required.

The supplied UK Costco transaction has eighteen purchases and four coupons:
£163.16 net + £13.62 VAT = £176.78. Its printed legend establishes A=20% and
Z=0% for this receipt; a trailing minus marks the coupon reduction within its
tax category. Codes are not assumed universal. The two £3.99 chicken purchases
remain distinct. Actual local extraction/browser observations have completed
the checked three-person split £58.93 / £58.93 / £58.92.

The latest security change replaces Gemini's signature-only JPEG check with the
existing prepared-section envelope/dimension guard. A truncated or unsupported
envelope, impossible segment, missing frame, invalid dimensions, side above
4,000 pixels or area above four million pixels is rejected before the provider
request. Eight real local-HTTP controls place the invalid image after a valid
section, prove zero provider calls, then prove a corrected scan succeeds.
Transport fixtures now contain a real synthetic checkerboard JPEG.

This is an envelope/dimension guard, **not a full JPEG decoder or OS sandbox**.
Browser inputs already pass bounded decode/re-encode handling. Source locations:
`server/receipt-api.mjs:L42`, `server/receipt-zip.mjs:L74`.

Current fresh checks pass **674 unit tests**, **177 standard browser tests**
with one existing duplicate-breakpoint skip, production build/typecheck,
formatting and graph refresh. Browser checks cover desktop and phone-sized
Chromium, actual synthetic Tesseract/PDF paths, checked upload-to-split journeys,
failure recovery, consent and security. Mocked cloud transport tests establish
wiring and validation, not live provider extraction accuracy. Physical phones,
camera hardware and Safari are not verified by emulation.

The first full unit run exposed one other signature-only transport fixture;
it was replaced with the valid JPEG. The failed run and final passing run are
separate local artifacts. No receipt/model call was repeated for this fix.

## 6. Requirement-by-requirement disposition

“Verified” below means the stated bounded requirement has evidence. “Partial”
means implemented or investigated but a material acceptance condition remains.
“Unavailable evidence” is not a fabricated pass or an instruction to invent data.

| Objective requirement group | Disposition and evidence | Outstanding acceptance |
|---|---|---|
| P1: inspect repository/branches, frontend/backend/models, image/parser/split paths, datasets and security; preserve dirty changes; run the existing app | Verified investigation and preserved baseline; Git references above, original frozen source, baseline tests and report history. | No outstanding initial-investigation blocker. This does not certify all later code defect-free. |
| P2: test all available sources; physical/digital/long/poor-quality formats; source truth and per-receipt field/error/time/cost metrics | Verified original fifty plus separate supplementary/control evidence; all 53 unique source hashes accounted for; strict source-derived references, per-case scores and latency/cost limits retained. | Genuine digital/PDF sources absent. Complete financial truth remains unavailable for the original fifty; unknown fields must stay unknown. |
| P3A: investigate dedicated APIs, fields, Costco/general layouts, versions, cost and privacy | Veryfi and Azure measured on approved crops and integrated optionally; Google/AWS official capabilities investigated. | No full-corpus external permission. Google/AWS not benchmarked; exact future regional/version/cost/privacy configuration needs verification if selected. |
| P3B: independently read images with structured VLMs; assess layout, codes, quantities, coupons, long/faded inputs | Qwen full cohort and several model/profile pilots measured; source-only independent extraction implemented. | Closed-provider real-receipt comparison unestablished: Gemini 503; OpenAI/Claude access absent. Do not count synthetic transport as accuracy. |
| P3C: modern open source, local size/GPU/mobile/license tradeoffs | Paddle/docTR/Qwen measured; other specialist profiles tested; Surya researched. Pinned assets/runtime/licenses and working sets recorded. | Server-local GPU inference is not phone-local inference. Larger-model feasibility and full deployment resource costs remain unmeasured. |
| P3D: same-image/reference framework, representative sample, per-field/error/latency/cost/reliability/privacy comparison; evidence-based selection | Reproducible frozen cohorts/panels/source/scorer, full comparisons and narrower separately labelled pilots; losing profiles retained rather than promoted. | No universal provider winner; latency vintages and partial references limit comparisons. |
| P4.1: detect blur/cropping/rotation/distortion/poor light; appropriate correction; preserve originals; recapture advice | Partial. Low resolution, darkness, low detail and blur advice; optional edge/crop suggestions plus bounded user-controlled rotation/projective correction, preview and original preservation. See CAPTURE_GEOMETRY.md. | Automatic clipping/pose/distortion diagnostics, genuine-photo correction accuracy, paper curvature and physical-device performance remain uncalibrated. |
| P4.2: recognize photograph/scan/digital/screenshot/PDF; use embedded text | Partial. Supported image/PDF validation and page/text routing, direct usable text extraction, scanned/mixed fallback. | Image subtype classification is not implemented; genuine retailer digital/PDF accuracy absent. |
| P4.3: best practical primary extraction of all structured purchase/financial fields | Paddle primary and optional readers implemented/tested; source-preserving parser and review work. | Known missing products, prices, merchant, fee/tax/payment roles and totals remain. A schema-valid draft is not a correct receipt. |
| P4.4: independent image-based verification/recovery for uncertainty, discounts, duplicate rows and failed arithmetic; bounded extra calls | Implemented automatic local policy, independent original-image VLM, guarded source proposals, bounded batches and fallback checks; same-reading gains measured. | General automatic recovery and difficult overlap/role errors remain. Current selection is a checked-draft hybrid. |
| P4.5: independent deterministic quantity×unit, item/coupon/tax/charge/refund/subtotal/final validation; inclusive-tax conventions | Implemented exact decimal/bigint engine and regression coverage; disagreement blocks finalization. | A validator detects inconsistency but cannot establish unreadable source facts or correct model financial roles. |
| P4.6: abstain on unreadable values; field uncertainty, original regions, editable corrections, recalculation and blocked unverified money | Implemented pending checks/source rectangles where actually available, editable fields and invalidated confirmations. No invented boxes or confidence probabilities. | OCR threshold is not calibrated receipt-level confidence; broader uncertainty-quality evidence remains required. |
| P4 architecture: configurable modular providers; separate preprocessing/extraction/parser/validator/splitting | Verified modular integration and optional provider configuration. | Public server deployment remains separate work. |
| P5: Costco packaging vs purchased quantity, codes/VAT, coupons, summaries, retailer rules while remaining general-purpose | UK financial vector and checked split pass; source-supported codes/coupons and general CORD/Tesco comparisons exist. | Generic Costco/general-retail reliability remains partial. Do not infer six purchased packs from a product's pack-size name or assume all retailers' A/Z meanings. |
| P6: exact provider rationale/setup/cost/privacy, server-only ignored credentials; approve private uploads/paid activation | Verified consumed scopes and server-held credentials; optional Azure/Veryfi finite allowances and scan consent. No new upload or paid activation in this audit. | Public terms/region/retention review and account-specific training commitments remain incomplete. Gemini consent/rate bounds are not a durable public spending budget. |
| P7: preserve existing changes, stable reference, separate improvement branch, incremental commits; no unauthorized merge/push | Verified stable and original-diff invariants; local commits on improvement branch. | No merge, push or deployment is authorized or performed. |
| P8: individual/equal/ratio/quantity/shared splitting, discounts/tax/currency/decimals, invalid/unassigned values, exact conservation and regressions | Verified unit/generated financial invariants and browser journeys, including signed refund-credit ownership and rounding. | Genuine refund-format accuracy is unmeasured; this does not invalidate the tested exact allocation rules. |
| P9: mobile capture, edges/guidance/progress/editing/source checks/rereads/reconciliation/assignments/payment summaries, preserve style | Partial. Responsive browser workflow, camera file capture, reordered photos, progress/cancel, optional rotation/perspective preview, source edits/rereads and checked exact summaries. | Live-camera framing/pose guidance, physical-device camera and Safari testing remain open. |
| P10: secure uploads/types/size, hostile data/prompt injection, validation/rate/auth/keys/logs/retention/retries/quotas/privacy | Local boundary reviewed/tested; new Gemini envelope/dimension guard; provider output remains untrusted, no model tools; finite cloud allowances where implemented. | Public authentication/TLS, multi-user quotas/spend limits, durable jobs/crash cleanup/OS isolation and jurisdiction-specific privacy acceptance are not delivered. Loopback checks are not public authentication. |
| P11: run both tiers, repeat original cohort, full upload-to-split, source values/finances, errors/security/resources, protect stable, separate new cases | Fresh current software checks pass; original-fifty native readings and latest offline field replay preserved; actual local-model and synthetic/provider browser paths distinguished. | Latest full native latency cohort, genuine new input types, independent full financial truth and real handset evidence are incomplete. Thirteen historical artifact declarations cannot be reproduced from missing bytes. |
| P12: existing assessment, technology/architecture, improvements, measurements, Git/tests, limits and release path | This consolidated report and its machine-readable checkpoint supply those sections with provenance and limits. | Final acceptance remains open because P4/P9 capabilities and financial/public-readiness evidence above remain partial. |

## 7. Security/privacy disposition and path to release

This version is a local development web application with a trusted local backend,
not an authenticated public financial API. It keeps keys server-side and uses
loopback/Host/origin boundaries, bounded JSON/images/PDFs, deadlines, no automatic
provider retries and sanitized errors. It does not persist source photos/raw OCR
in browser storage; the editable draft and participant names remain until reset
or storage clearing. Exported copies are outside reset's control.

The latest JPEG fix closes a specific backend gap without changing provider
prompts, model choice, permissions or extraction scores. Receipt text and all
model output remain untrusted; arithmetic and explicit source verification are
independent of instructions found in a receipt. Neither `store:false` nor a
successful provider deletion proves zero retention or exclusion from training.

All prior private-upload scopes are consumed: two Gemini attempts, seven Veryfi
extractions with seven reported deletions, and six Azure extractions with eight
polls and six reported 204 deletions. Existing credentials are not permission to
send additional private receipts. No original-fifty external upload is allowed.
Azure/Veryfi current app allowances remain zero. New private tests need an exact
reviewable scope and Phase 6 approval; reversible local work does not. The new
Gemini 3.8 availability check sent one known synthetic receipt, with one metadata
GET and one successful extraction POST. It sent no private receipt. Six matched
identifier-reduced crops and their bounded one-shot runner are now prepared;
their new private-upload approval remains pending. Google's current terms give
UK users paid-service data protections even on free quota, but require paid
services for publicly available UK/EEA/Swiss API clients. See
[the prepared comparison and source links](COLUMN_PURCHASES.md).

Before public release, the remaining work is concrete:

1. Resolve source-grounded financial-role and missing-price failures, measuring
   the same frozen references without fitting values to a desired total. Keep
   failed proposals and source-review requirements visible.
2. Calibrate clipping/rotation/perspective diagnostics and test the new optional
   correction on genuine photos. Preserve originals and abstain on unsupported frames.
3. Obtain genuine digital/scan/screenshot/PDF and refund examples when available;
   keep new cases separate from the original cohort. Independently review enough
   financial truth for an honest whole-receipt metric.
4. Validate real phone camera/Safari workflows and current end-to-end resource
   budgets. An attractive 390-pixel browser layout is only part of mobile readiness.
5. If a closed VLM trial is justified, configure only the selected provider and
   request a bounded private-data scope after its local protocol is ready. No new
   provider is required merely to complete another synthetic transport test.
6. Design the public authenticated backend, durable cancellation/cleanup,
   tenant/rate/spend limits, secret management and retention/deletion operation;
   complete account-specific provider and jurisdiction/privacy review before
   deploying. The local preview is not a substitute for these controls.

The latest code checkpoint adds optional image geometry and its checked-source
workflow. The preceding `e0db735` adds printed-column interpretation; `72bbd35`
preserves verification when archived build paths disappear. `3409145` adds financial-role proposals, while
`6e22912` adds the Gemini guard and corpus audit. No runtime dependency, model
download, training or paid feature is added. The separate synthetic Gemini
request is recorded above. Earlier app commit `4686b8e` and research commit
`b6a7dcf` remain independently reviewable. The exact
commit for this checkpoint is obtained from the local Git log; its machine packet
records its parent to avoid a self-referential commit hash.

No whole-goal completion or deployment approval is implied by this report.
