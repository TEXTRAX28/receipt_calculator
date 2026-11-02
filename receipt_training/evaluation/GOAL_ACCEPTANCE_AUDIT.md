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

Latest [visible purchase-list reference review](VISIBLE_PURCHASE_COVERAGE.md)
checks eight development receipts containing 57 unchanged purchases. Explicit
complete-visible-item coverage rises from 2/50 to 10/50; blurred headers and all
unknown values stay unknown. The same 300 retained predictions scored against
both label versions preserve every existing field score/error. The hybrid
matches all 57 reviewed rows without unmatched additions; the primary reader
matches 51 and proposes four source-confirmed summary rows as products. This is
reference and failure-analysis evidence, not new OCR or complete financial truth.
All fifty remain unscorable for strict whole-receipt accuracy. The 25-file packet
verifies; no application source, model, upload scope or frozen model plan changed.

Latest [financial summary fragment handling](FINANCIAL_SUMMARY_FRAGMENTS.md)
associates a separately read summary label and amount using unique source
geometry and strong literal words. The unchanged original-fifty replay improves
one familiar development receipt's supplied-currency price basis from 4/9 to
5/9 overall, with no other count changes or scored per-case regressions. Both
fragments remain linked for mandatory review. All 940 unit tests and ten focused
desktop/phone browser scenarios pass; the full suite passes 223 browser cases
with one existing skip. Build/typecheck, formatting and graph checks pass.
No new original-receipt inference, upload, provider promotion or automatic
financial acceptance is claimed. Full financial truth, physical phones and the
larger model comparisons remain open.

The preceding [live camera capture](LIVE_CAMERA_CAPTURE.md): local preview, approximate
paper edges, blur/light advice, full-frame capture and inspect/retake now support
consecutive receipt sections. Actual local JPEG-to-OCR-to-split tests pass using
generated camera streams; physical cameras and Safari remain unverified. Current
checks were 912 unit passes and 219 browser passes with one existing skip. This
does not change the recognition benchmark, select a new provider or establish
public-release readiness. Memory measurements retain their sampling limitations.

New [genuine-photo preparation comparison](GENUINE_CAPTURE_COMPARISON.md): four
familiar development transactions / five photos compare actual original, crop
and straighten helpers with independent Tesseract and cached docTR readings.
There are 34 fresh image-section inferences, zero uploads and unchanged truth.
Correction helps weak Tesseract in some cases but loses totals and adds repeated
rows in docTR. It is not promoted automatically. All drafts stay blocked; the UK
strict complete score stays 0/1. Source coverage, model/launcher memory scopes,
actual timings and unresolved recognition/overlap causes are retained separately
from the original-fifty metrics. Application behavior is unchanged by the study.

Latest [OCR invoice-column repair](OCR_INVOICE_COLUMNS.md): the same saved
scanned-invoice reading now preserves quantity 6, unit £15.20, net goods/subtotal
£91.20, delivery £6.95, printed tax £19.63 and total £117.78, with no financial
edits. Its exact product description replaces a column-contaminated description,
and delivery is no longer a false product. A fresh real 390px on-device run
reproduces identical baseline OCR text and word boxes. Automatic strict complete
accuracy remains 0/1 because of a merchant-name OCR error and pending checks;
one explicit source-supported merchant correction plus automated review controls
reaches reviewed 1/1 and £58.89/£58.89 sharing. Those controls are not independent
human verification. The mixed-basis invoice and payment-only control stay blocked.
All original-fifty v5 count metrics remain unchanged across 500 saved-reading
views; no new complete-receipt denominator or provider promotion is claimed.
All 874 unit tests and 189 browser cases pass, with one existing skip;
build/typecheck/formatting/graph checks pass. The packet binds the exact evidence.
No private upload, new model/API call, paid activation or stable-branch change.

The preceding [genuine scanned-PDF baseline](PUBLIC_SCANNED_PDF_BASELINE.md): two public
purchase invoices and a payment-only slip use the actual current on-device image
path, preserving original page content and pixels. All three final totals are
copied correctly, but both purchase drafts omit quantities/unit prices and lose
charge/tax roles. One fully source-referenced supplementary invoice scores 0/1
under the unchanged strict complete-receipt scorer. The mixed-carriage/VAT case
remains outside that denominator; the payment-only control proposes no purchases
and stays blocked. Raw OCR and source references frozen before reading are
retained. This exposes a real interpretation gap rather than a scanner gain.
No original-fifty truth, model, app behavior or external permission changes.

The preceding [native PDF invoice-column repair](PDF_INVOICE_COLUMNS.md): the same two
genuine public invoices now retain all six quantities, populated unit prices and
line amounts on a consistent printed basis, both final totals and printed tax
amounts. The £13.06 document completes the actual automated source-review controls
and £6.53/£6.53 split without financial edits. The £2,086.39 document remains
blocked by its printed quantity/unit/line discrepancies, despite balancing overall.
These two familiar supplementary documents are not a blind holdout or a new
original-fifty score. Initial confirmation remains disabled pending source checks;
automated checkbox interactions are not independent human verification. Source
pages, the preceding failure baseline and exact render comparisons are preserved.
All 853 unit tests and 189 final browser cases pass, with one existing skip;
build/typecheck/formatting pass. The first browser run's stylesheet resource
failure and its unchanged rechecks are preserved separately. This is a local
PDF interpretation repair; no model inference, private upload or paid activation.

The preceding [source-backed payment-row exclusions](PAYMENT_ROWS.md)
proposes removing 17 false bill adjustments across 11 original receipts with
supplied currency context. Every affected image was inspected; each excluded
row is a payment or change. Every removal remains pending human review, even
with an empty adjustment list. Existing v5 field scores are unchanged across
400 replay views. All 820 unit tests and 189 browser cases pass, with one
existing skip. This is a source audit of the proposals, not payment recall or complete-
receipt accuracy; no new original-receipt inference or private upload occurred.
Three additional drafts balance arithmetically but remain untrusted because
other required checks fail; trusted reconciliation is still 0/49.

The next [larger local-model comparison](QWEN8B_FEASIBILITY.md) is prepared,
not executed. Official Qwen3-VL 8B files are pinned and six paired requests on
three inspected development receipts are frozen. The measured laptop headroom
fails the retained disk reserve and a conservative trial RAM guard. No 8B
weights were downloaded, no receipt inference ran, and no accuracy or speed
improvement is claimed. The existing installer cap is unchanged. Separate
[bounded installation and low-memory controls](QWEN8B_TRIAL_GUARDS.md) now pass
20 local tests, including an actual harmless owned process-tree stop. The real
native preflight refuses before process launch. Both startup resource gates
remain false; this is tested preparation, not a model benchmark.

The preceding [exact source-word alignment](SOURCE_WORD_ALIGNMENT.md)
recovers one additional line price and unit price on an inspected development
receipt. Across the same 400 retained-reading views, known-currency hybrid
prices improve 132/143 to 133/143 and units 25/31 to 26/31, with no scored
regressions. Automatic-currency results remain unchanged. Actual word/row
ownership and mandatory human checks are retained; no amount decoder, model,
prompt or source input changes. All 775 unit tests and 187 browser cases pass,
with one existing skip. The packet retains both trials. No new private upload.

The preceding [on-device source evidence](DEVICE_SOURCE_EVIDENCE.md)
adds actual word/row highlights and mandatory uncertainty checks. The final
paired original-fifty run preserves every prepared image, OCR text and financial
value, with source areas for 81/82 parsed purchases; this is not price-accuracy
improvement. A controlled tall synthetic improves 43 rows to its printed 40,
preserving two genuine identical purchases. An earlier Tesco grouping regression
is retained and rejected; conflicting amounts now preserve the original text
assembly. All 763 unit tests and 187 browser cases pass, with one existing skip;
the evidence packet binds the final run and rejected trials. No new private
upload or provider promotion.

The preceding [optional rotation and perspective correction](CAPTURE_GEOMETRY.md)
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
with one existing skip. A separate non-private Gemini 3.8 synthetic test
succeeded; the later [approved six-crop batch](GEMINI38_SIX_RESULT.md) returned
no drafts (one timeout, five HTTP 503s), so real-receipt accuracy is unmeasured.

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

The historical collection contains photographs, not genuine digital receipts or retailer
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
OCR/vision readings and the latest source-word alignment replay. This is an offline rescore,
not a new full native run or latency sample.

```powershell
python -X utf8 receipt_training/scripts/build_goal_acceptance_audit.py --check
python scripts/update-graph.py --check
```

The historical corpus audit binds 514 files, including original inputs, frozen baseline sources,
its then-current replay sources, predictions, references, scorer, per-case
scores and verification logs. Its 131/143 conditional-price checkpoint stays
unchanged; later column and source-word packets supplement it. Raw receipts, model output and detailed
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
| Line totals /143 | 5 | 116 | 133 |
| Unit prices /31 | 3 | 22 | 26 |
| Item discounts /7 | 0 | 5 | 5 |
| Receipt discounts /4 | 0 | 2 | 3 |
| Printed subtotals /34 | 0 | 25 | 27 |
| Printed tax amounts /22 | 0 | 13 | 16 |
| Printed final totals /49 | 0 | 34 | 41 |
| Service/other known fees /8 | 0 | 4 | 7 |
| Known price basis /9 | 0 | 0 | 5 |
| Known grouping /14 | 3 | 11 | 11 |
| Known merchant /6 | 1 | 1 | 1 |
| Trusted reconciliation /49 | 0 | 0 | 0 |
| Strict whole-receipt accuracy | Unscorable | Unscorable | Unscorable |

Scoped product recall rises from 26.90% to 98.62%, and scoped precision from
46.99% to 97.95%. Automatic line-price equality rises from 3.50% to 81.12%;
explicit-currency equality is 93.01%. The latest conditional values are bound by
[the financial-summary comparison](FINANCIAL_SUMMARY_FRAGMENTS.md), following
[the source-word comparison](SOURCE_WORD_ALIGNMENT.md). These precision denominators reflect
partial annotation scope: unmatched predictions are not automatically confirmed
false purchases. Zero arithmetic discrepancy is not trusted reconciliation if
currency, fields, charges or source review remain unresolved.

The conditional result still misses two referenced rows and ten known line
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

The earlier security checkpoint passed **674 unit tests**, **177 standard browser tests**
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
| P2: test all available sources; physical/digital/long/poor-quality formats; source truth and per-receipt field/error/time/cost metrics | Verified original fifty plus separate supplementary/control evidence; all 53 unique original source hashes accounted for; strict source-derived references, per-case scores and latency/cost limits retained. Two native-text PDF invoices and three image-only PDF inputs now have separate genuine-source observations. | One new compatible scanned invoice has complete source coverage and scores 0/1; mixed-basis and payment-only cases remain separate. Complete financial truth remains unavailable for the original fifty; unknown fields must stay unknown. |
| P3A: investigate dedicated APIs, fields, Costco/general layouts, versions, cost and privacy | Veryfi and Azure measured on approved crops and integrated optionally; Google/AWS official capabilities investigated. | No full-corpus external permission. Google/AWS not benchmarked; exact future regional/version/cost/privacy configuration needs verification if selected. |
| P3B: independently read images with structured VLMs; assess layout, codes, quantities, coupons, long/faded inputs | Qwen full cohort and several model/profile pilots measured; source-only independent extraction implemented. | Closed-provider real-receipt comparison unestablished: Gemini 503; OpenAI/Claude access absent. Do not count synthetic transport as accuracy. |
| P3C: modern open source, local size/GPU/mobile/license tradeoffs | Paddle/docTR/Qwen measured; other specialist profiles tested; Surya researched. Pinned assets/runtime/licenses and working sets recorded. | Server-local GPU inference is not phone-local inference. Larger-model feasibility and full deployment resource costs remain unmeasured. |
| P3D: same-image/reference framework, representative sample, per-field/error/latency/cost/reliability/privacy comparison; evidence-based selection | Reproducible frozen cohorts/panels/source/scorer, full comparisons and narrower separately labelled pilots; losing profiles retained rather than promoted. | No universal provider winner; latency vintages and partial references limit comparisons. |
| P4.1: detect blur/cropping/rotation/distortion/poor light; appropriate correction; preserve originals; recapture advice | Partial. Low resolution, darkness, low detail and blur advice now also runs on live camera frames; optional edge/crop suggestions plus bounded user-controlled rotation/projective correction, preview and original preservation. See CAPTURE_GEOMETRY.md and LIVE_CAMERA_CAPTURE.md. | Automatic clipping/pose/distortion diagnostics, genuine-photo correction accuracy, paper curvature and physical-device performance remain uncalibrated. |
| P4.2: recognize photograph/scan/digital/screenshot/PDF; use embedded text | Partial. Supported image/PDF validation and page/text routing, direct usable text extraction, native invoice-column roles and scanned/mixed fallback. Two native-text PDFs preserve all six source quantities/unit/line values and both tax/final totals; one reaches a checked exact split. Three genuine image-only pages correctly route to OCR. | Image subtype classification is not implemented. One compatible scanned invoice now preserves columns and financial roles with mandatory review; broader coverage and mixed-basis cases remain unresolved. The other native invoice's printed unit/line discrepancies correctly remain blocking. |
| P4.3: best practical primary extraction of all structured purchase/financial fields | Paddle primary and optional readers implemented/tested; source-preserving parser and review work. | Known missing products, prices, merchant, fee/tax/payment roles and totals remain. A schema-valid draft is not a correct receipt. |
| P4.4: independent image-based verification/recovery for uncertainty, discounts, duplicate rows and failed arithmetic; bounded extra calls | Implemented automatic local policy, independent original-image VLM, guarded source proposals, bounded batches and fallback checks; same-reading gains measured. | General automatic recovery and difficult overlap/role errors remain. Current selection is a checked-draft hybrid. |
| P4.5: independent deterministic quantity×unit, item/coupon/tax/charge/refund/subtotal/final validation; inclusive-tax conventions | Implemented exact decimal/bigint engine and regression coverage; disagreement blocks finalization. | A validator detects inconsistency but cannot establish unreadable source facts or correct model financial roles. |
| P4.6: abstain on unreadable values; field uncertainty, original regions, editable corrections, recalculation and blocked unverified money | Implemented pending checks/source rectangles where actually available, editable fields and invalidated confirmations. No invented boxes or confidence probabilities. | OCR threshold is not calibrated receipt-level confidence; broader uncertainty-quality evidence remains required. |
| P4 architecture: configurable modular providers; separate preprocessing/extraction/parser/validator/splitting | Verified modular integration and optional provider configuration. | Public server deployment remains separate work. |
| P5: Costco packaging vs purchased quantity, codes/VAT, coupons, summaries, retailer rules while remaining general-purpose | UK financial vector and checked split pass; source-supported codes/coupons and general CORD/Tesco comparisons exist. | Generic Costco/general-retail reliability remains partial. Do not infer six purchased packs from a product's pack-size name or assume all retailers' A/Z meanings. |
| P6: exact provider rationale/setup/cost/privacy, server-only ignored credentials; approve private uploads/paid activation | Verified consumed scopes and server-held credentials; optional Azure/Veryfi finite allowances and scan consent. No new upload or paid activation in this audit. | Public terms/region/retention review and account-specific training commitments remain incomplete. Gemini consent/rate bounds are not a durable public spending budget. |
| P7: preserve existing changes, stable reference, separate improvement branch, incremental commits; no unauthorized merge/push | Verified stable and original-diff invariants; local commits on improvement branch. | No merge, push or deployment is authorized or performed. |
| P8: individual/equal/ratio/quantity/shared splitting, discounts/tax/currency/decimals, invalid/unassigned values, exact conservation and regressions | Verified unit/generated financial invariants and browser journeys, including signed refund-credit ownership and rounding. | Genuine refund-format accuracy is unmeasured; this does not invalidate the tested exact allocation rules. |
| P9: mobile capture, edges/guidance/progress/editing/source checks/rereads/reconciliation/assignments/payment summaries, preserve style | Partial. Live local camera preview with approximate edges and quality advice, explicit capture/review/retake, overlapping sections, native picker fallback; responsive editing/rereads/assignments and checked summaries. | Physical-device camera and Safari, genuine live guidance accuracy and calibrated clipping/pose diagnostics remain open. Browser camera streams are simulated; actual JPEG/OCR/splitting is tested. |
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

All private-upload scopes are consumed: two earlier Gemini attempts, six new
Gemini 3.8 attempts (one timeout, five HTTP 503s), seven Veryfi
extractions with seven reported deletions, and six Azure extractions with eight
polls and six reported 204 deletions. Existing credentials are not permission to
send additional private receipts. No original-fifty external upload is allowed.
Azure/Veryfi current app allowances remain zero. New private tests need an exact
reviewable scope and Phase 6 approval; reversible local work does not. The new
Gemini 3.8 availability check sent one known synthetic receipt, with one metadata
GET and one successful extraction POST. It sent no private receipt. The later
six matched identifier-reduced crops were explicitly approved and attempted
once each, without retries or billing activation. No receipt draft returned;
the six-attempt scope is consumed. See [the result](GEMINI38_SIX_RESULT.md).
Google's current terms give
UK users paid-service data protections even on free quota, but require paid
services for publicly available UK/EEA/Swiss API clients. See
[the prepared comparison and source links](COLUMN_PURCHASES.md).

Before public release, the remaining work is concrete:

1. Resolve source-grounded financial-role and missing-price failures, measuring
   the same frozen references without fitting values to a desired total. Keep
   failed proposals and source-review requirements visible.
2. Calibrate clipping/rotation/perspective diagnostics and test the new optional
   correction on genuine photos. Preserve originals and abstain on unsupported frames.
3. Expand the repaired scanned-invoice column path and resolve mixed-basis source failures; expand
   screenshot/refund evidence when available. Keep new cases separate from the
   original cohort. Independently review enough
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

The latest app checkpoint `cbe9c91` shares native-PDF invoice columns with
source-owned on-device OCR and preserves mandatory checks/printed inconsistencies.
`756dc44` adds the separately tested, still-unexecuted 8B trial controls.
The genuine-photo preparation comparison is research only, with no provider or
application behavior change. The preceding checkpoint reads native invoice
columns and qualified financial summaries with source checks.
`822f758` preserves the unchanged-app public-PDF failure baseline; `ae7f2e0`
excludes source-supported payment/change rows from bill charges while keeping
every exclusion pending. `b54997a` preserves the
unexecuted 8B feasibility protocol; `e7191c9` adds unique source-word alignment
and keeps recovered amounts pending. The preceding `82706e0` adds actual on-device source highlights
and conservative overlap handling; `6613870` adds optional image geometry and
its checked-source workflow. Earlier `e0db735` adds printed-column interpretation; `72bbd35`
preserves verification when archived build paths disappear. `3409145` adds financial-role proposals, while
`6e22912` adds the Gemini guard and corpus audit. No runtime dependency, model
download, training or paid feature is added. The separate synthetic Gemini
request is recorded above. Earlier app commit `4686b8e` and research commit
`b6a7dcf` remain independently reviewable. The exact
commit for this checkpoint is obtained from the local Git log; its machine packet
records its parent to avoid a self-referential commit hash.

No whole-goal completion or deployment approval is implied by this report.

## Official browser reader measurement, 2 November 2026

`BROWSER_PADDLE_COMPARISON.md` and `advanced-browser-paddle-v1.json` add actual
official PaddleOCR.js 0.4.2 / PP-OCRv6 tiny WASM evidence: 56 real image sections
and four synthetic controls, with no private external uploads. All fifty
original receipts were read on 51 current prepared JPEGs whose hashes exactly
match saved Tesseract v4 inputs. The same frozen parser and unchanged v5 scorer
give line prices 103/143 versus Tesseract 30/143 with supplied currency;
automatic mode gives 19/143 versus 3/143. Tiny quantities remain 11/120 and
automatic final totals 2/49. All original complete-receipt labels remain
unscorable and trusted reconciliations zero. The separate supplied UK case
recovers all eighteen annotated prices/quantities/discounts and its GBP 176.78
total, but retains two overlap duplicates, +1138 pence discrepancy and strict
0/1. This is an optional device-reader integration candidate, not a replacement
for the more accurate existing computer-assisted hybrid or a verified bill.

Warm inference/decode mean/p95 are 0.879/2.439 seconds, excluding startup,
preparation and parsing. The sampled owned development process tree peaked at
2.408 GB; this is not a phone requirement or model-only measurement. Android,
iOS/Safari, production packaging, cancellation/failure and actual app-provider
integration remain open. Root dependencies and app behavior are unchanged in
this research checkpoint. Two pinned public model weights plus their configs
were downloaded (6,299,683 bytes); the separate guarded 8B trial remains
unstarted for lack of disk headroom. Stable/original Git invariants remain
protected, and no paid activation, merge, push or deployment occurred.

## Enhanced device reader implemented, 2 November 2026

`BROWSER_PADDLE_INTEGRATION.md` and
`advanced-browser-paddle-integration-v1.json` bind the optional **Enhanced
on-device** provider, portable checksum-pinned model setup, dedicated WASM
worker, actual source rectangles, mandatory purchase-list review and bounded
cancellation/failure recovery. The SDK/runtime code stays off the page thread;
the production page CSP is unchanged. Basic OCR and existing computer/cloud
paths remain available. The paired field gains above remain qualified by
currency context and partial truth; the new adapter matches all 56 retained
real SDK panels exactly.

Actual production UI tests read the fixed synthetic receipt through an exact
GBP 3.00/3.00 split without financial edits, verify source regions and worker
closure, and fit a 320-pixel viewport. The real VS Code development command was
also tested. The original two-photo UK transaction recovers all eighteen
annotated prices/quantities/discounts and its GBP 176.78 total in the actual
app, but retains two overlap purchases, +1138 pence discrepancy and strict
0/1; no fields or checks were changed, and confirmation remains blocked.
Its observed scan-to-review time is 10,319 ms; sampled owned development
process-tree peak is 1,755,017,216 bytes, not handset/model-only memory.

Validation is **900 unit passes, 195 browser passes and one existing skip**,
plus separate real-receipt and development-server checks. Production build,
typecheck and formatting pass. Physical Android/iOS/Safari, broader financial
truth, generic quantity/currency recovery, overlap recovery and public service
readiness remain open. The more accurate computer-assisted hybrid remains
available, and no default promotion or whole-goal completion is claimed.

## Footer overlap recovered, 2 November 2026

`FOOTER_OVERLAP_RECOVERY.md` and `advanced-footer-overlap-v1.json` supersede the
two-extra-purchase finding for the original UK photos. Exact transaction and
ordered purchase evidence now work despite a cropped merchant heading and
nonfinancial OCR punctuation differences. The actual enhanced app reads eighteen
purchases, preserves both chickens and the cloth coupon, and calculates GBP
176.78 with zero discrepancy and no financial edits. Source checks still block
confirmation; missing/misread VAT codes and imperfect names remain, so strict
complete accuracy is still 0/1.

Paired parent/current replay covers 108 retained readings and 432 predictions.
All original-fifty financial predictions and the three CORD-photo predictions
remain unchanged. Independent saved docTR observations gain the same footer
recovery plus the previously missed subtotal. This is source assembly/parser
evidence, not new full native/VLM orchestration or blind financial validation.
The full goal and public-readiness limitations above remain active.

## Enhanced source-area recovery, 2 November 2026

`ENHANCED_AREA_RECOVERY.md` and `advanced-enhanced-area-v1.json` add the selected
enhanced device reader to purchase rereads and enable rereading receipt-level
source areas such as the VAT legend. A fresh actual two-photo UK scan followed
by three default-area reads recovers the Z/0% legend row, tomato Z code and full
chicken-skewer name. The skewer tax code remains incorrectly read as 7; it is
not replaced using arithmetic or another item's code.

Every financial field, pending check and original source highlight stays
unchanged through success, failure and cancellation. The whole receipt remains
strict 0/1 and blocked despite a balanced GBP 176.78. These focused improvements
are new evidence for explicit manual correction, not a claim of automatic
whole-receipt accuracy or independent model verification. Public-readiness and
the wider goal remain incomplete.

## Larger browser-model comparison prepared, 2 November 2026

`BROWSER_PADDLE_MEDIUM_READINESS.md` and
`advanced-browser-paddle-medium-readiness-v1.json` freeze a paired tiny/medium
comparison on three known-failure UK crops and four complete development
receipts. Both official model archives are cached; no download is necessary.
The startup guard refused at 2,724,827,136 bytes of available RAM against a
3,885,219,840-byte threshold, before process launch or model inference.
The guard and existing 8B resource limits remain unchanged.

Actual offline checks preserve all five prior tiny receipt panels and the six
lines of a retained medium synthetic observation. These are adapter checks,
not new medium receipt readings. Paired accuracy and latency remain unmeasured,
the original fifty are untouched, and application behavior is unchanged.

The current resume plan is `browser-paddle-medium-paired-plan-v2`, frozen after
`a407133`. It preserves all models, images, references, limits and parameters
while binding the current parser/observer. The controller verifies frozen
inputs before launch; three offline protocol tests pass. Its actual start
refused at 3,849,785,344 bytes available against the unchanged 3,885,219,840-byte
guard, before any process or image attempt. `advanced-browser-paddle-medium-resume-v2.json`
retains the plan, stop and checks. There is still no new model comparison result;
application source and the previous 940-unit/223-browser validation are unchanged.

## Gemini six-crop batch completed, 2 November 2026

`GEMINI38_SIX_RESULT.md` and `advanced-gemini38-screening-result-v1.json` record
six approved attempts against Gemini 3.8 Flash using user-confirmed free quota.
One request timed out at 90 seconds; five returned HTTP 503 with high-demand
messages. There were no receipt drafts, retries, quota-error responses or billing
activation. All attempts count as consumed, including the timeout. This is
availability evidence; receipt-reading accuracy remains unmeasured.

The unchanged reference/matcher preserves every failed case in delivered-field
coverage, with successful-only accuracy explicitly null. Five offline checks
pass and the 70-file evidence packet verifies. Application source, defaults,
protected branches and the original checkout's dirty changes are unchanged.
No additional upload, stronger-model result or whole-goal completion is claimed.
