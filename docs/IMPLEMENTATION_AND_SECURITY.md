# Implementation and security report

Updated: 29 October 2026. Original implementation branch: `feature/receipt-scanner-splitter`.

## Delivered behavior

Gather is a responsive React/TypeScript web app. The journey is receipt image/camera/text/manual entry → editable review → people → item or whole-receipt assignments → per-person breakdown/export. English OCR uses locally served Tesseract worker/WASM/model assets and needs no API key. An optional Gemini reader now uses a local server adapter and a server-held API key; photos leave the device only with explicit scan consent. All money calculations and splitting remain in the browser. There is no receipt database or participant account system.

Every monetary, quantity and descriptive receipt field is editable. Original images can be opened from review and later workflow screens. Missing quantities and unfamiliar tax codes remain unresolved. The Costco demo is explicitly a manual transcription and preserves two separate rotisserie chicken purchases. On-device multi-photo overlap is flagged for review; exact joins within a tall image's generated detail windows are merged. Gemini is instructed to combine photographed overlaps using layout/context while preserving genuine separate purchases. Either result requires review.

The splitting engine separates physical units, equal shares, ratios, percentages and whole-receipt shares. Physical allocation must equal purchased quantity times confirmed units per pack. Whole items require integers; measured goods support up to six decimal places. Percentages must equal exactly 100%; selected ratio weights must be positive. Stable UUIDs separate people even when their names match.

The exact financial rules are documented in the README and shown in the app. In particular, Costco A/Z tax rates, trailing negative coupon amounts, tax-inclusive prices, printed tax checks, discounts, fees, tips, deposits and explicitly labelled rounding are supported. Final costs are apportioned in integer minor units. A finalization gate recomputes the receipt, validates review and assignments, and checks that per-person totals exactly conserve the printed total.

## Verification record

| Executed check | Result |
|---|---|
| `npm ci` from the lockfile | Passed; OCR assets regenerated; zero known dependency vulnerabilities |
| `npm run build` (includes TypeScript validation) | Passed; production bundle generated |
| `npm test` | 105 tests passed across seven files after the long-receipt follow-up, including the original 2,500 generated calculation cases and server/client Gemini contract checks |
| `npm run test:e2e` | 65 passed after the long-receipt follow-up, with one duplicate mobile breakpoint check intentionally skipped; includes all new Gemini contract, tall-receipt OCR and previous mobile workflows |
| Real OCR in desktop and phone-sized Chromium | Passed on synthetic receipts, with and without cropping; no receipt uploads or external OCR requests observed |
| Opt-in real-photo test on the supplied Costco JPEG | Passed on desktop: real OCR produced nine purchase rows; explicit corrections through the visible UI restored all 18 purchases, then £58.93 + £58.93 + £58.92 finalized exactly £176.78 |
| axe WCAG A/AA scans | Passed on home, item sharing and completed breakdown screens in desktop/mobile contexts |
| Extra responsive checks | Passed at 360×800, 768×1024 and 1024×768; ordinary mobile workflow uses iPhone 13 dimensions |
| Development server | Started successfully; Chrome rendered the app and entered the manual review screen |
| Formatting, dependency audit and Git checks | Formatting passed; audit reported zero known vulnerabilities; staged whitespace check passed; private/generated paths were confirmed ignored; no supplied membership/payment identifiers or secret patterns were found in tracked sources |

The main browser suite includes actual local OCR, crop/original preservation, failure recovery, repeat-submission blocking, reset, text import, correction, assignments, export, corrupt/unavailable storage, isolation and cross-tab conflict tests. Screenshots were captured and visually inspected; generated artifacts are ignored. Earlier development failures were fixed and rerun rather than treated as passing results.

The supplied photo was **not** accurately extracted end to end without manual correction. Carpet texture, small print and curvature confused the OCR. Cropping and enlargement improve the input, but errors remain visible and block finalization. The verified end-to-end test explicitly exercises the correction path; it does not replace the scan with demo data or label a manual transcription as OCR.

## Issues found and corrections

| Finding | Impact | Correction | Verification |
|---|---|---|---|
| Initially selected test-tool versions pulled vulnerable Vitest/mocker/tinypool packages | Risk in exposed development/test tooling; these were not production application dependencies | Updated to compatible Vite 8, React plugin 6 and Vitest 5; lockfile pins resolved versions | Final `npm audit`, dependency tree, clean `npm ci` and full test rerun |
| Generic total parsing missed `TOTAL GBP 5.50` | Real OCR produced item rows but left the printed total blank | Recognize ISO currency labels on total lines | Parser regression and actual browser OCR |
| Carpet/background characters in the real photograph resembled ¥ and a tax percentage | Incorrect currency/tax suggestions and poor extraction quality | Added local crop/enlargement controls, retained the original, require a full VAT legend row, leave ambiguous currency/quantity evidence for review | Crop browser tests, false-symbol/legend regressions, and actual-photo correction exercise |
| Very long numeric receipt lines could cause excessive regex work | Main-thread parsing slowdown with hostile text | Limit receipt lines to 1,000 characters and 2,000 lines before amount matching | Long-numeric-line and excessive-line-count regressions |
| Wrapped select labels were awkward for exact label targeting | Some automated and assistive control targeting could be inconsistent | Explicitly associate each form label with a unique control ID and hint description | Physical quantity/ratio browser journeys and axe accessibility scans |
| Worker initialization can reject with a non-Error/undefined value | A failed asset load could leave no actionable recovery message | Normalize errors, preflight local assets, keep manual entry and cancellation available | Unit network/HTML-asset/undefined-rejection tests and browser aborted-asset tests |
| A footer photo before an item photo could stop parsing the later photo | Multi-photo capture could omit valid purchases | Insert provider-owned image boundaries and reset item-section parsing at each boundary | Parser regression; overlaps remain flagged |
| Multipack notation such as `6x340g` could resemble purchased quantity | Would misstate the number of purchased packs | Only parse explicit trailing purchase expressions; preserve missing quantity/pack size for confirmation | Multipack regression and manual quantity confirmation workflow |
| Splitting base and tax independently can give unnecessarily unequal final shares | A £1.20 item shared equally could appear as 41p/40p/39p | Apportion the final item cost first; disclose zero-sum component rounding differences | 40p/40p/40p regression, signed adjustment paradox regression, conservation properties |
| Separate browser tabs could overwrite each other's drafts | Lost local edits | Observe storage conflicts and stop further saving in the stale tab, with export/reload guidance | Two-tab conflict browser regression |
| Permissive numeric inputs could contain exponent notation, negatives, enormous values or excess precision | Invalid or costly calculations if trusted directly | Exact string parsing, integer bounds, selected currency precision and field/schema limits | Adversarial numeric cases and seeded allocation properties |
| Uploaded images can lie about type or declare huge dimensions | Script/file confusion or excessive memory pressure | JPEG/PNG/still-WebP signatures, MIME match, size and header-dimension checks before decoding, decoded-size checks and normalization | Signature spoofing, pixel bomb, truncated JPEG and malformed browser upload tests |
| OCR can stall, fail or return unexpected structure | Stuck UI, duplicate work or unsafe/unusable draft | One in-flight job, cancel control, 120-second deadline, worker cleanup, output schema and bounded text | Fake-timer stall test, cancellation tests, malformed output and repeated-submission browser tests |
| Names and receipt text can contain markup or instructions | Potential XSS or model/tool injection in a careless implementation | React text rendering only; receipt text is data; Gemini receives extraction-only instructions with no tools or receipt-controlled URL, and its output is strictly validated | Hostile names/merchant browser tests, suspicious text parser regression, unknown-output-field rejection and provider request contract checks |
| Persistent OCR text could retain payment/member fragments unnecessarily | Extra sensitive data stored on the device | Do not persist raw OCR text or images; no receipt-content logging or remote storage | Storage tests and browser network observations |
| Corrupt, oversized or unavailable local storage can break restoration | Lost usability or false saved-state claims | Schema/size checks, recoverable fresh state, visible save warnings and export fallback | Storage unit and browser corruption/quota tests |
| Removed participants or edited prices can leave stale assignments/review state | Incorrect amounts being treated as final | Clean assignments on removal, recompute live, invalidate financial review on changes, recheck at finalization | Edit/removal/duplicate-name/browser refresh tests |

## Security boundary

All user/OCR/model fields are untrusted. Zod bounds the structured draft and extraction result. The money engine separately validates financial semantics, so a shape-valid draft is not automatically finalizable. No `innerHTML`, `dangerouslySetInnerHTML`, application `eval`, receipt-driven tool calls or secret-bearing frontend variables are used. The optional API credential is held only by the local server.

File decoding occurs in the browser and relies on the browser's maintained image decoder and sandbox. Header checks and limits reduce risk; they do not prove every malformed codec input harmless. WASM runs in a worker, and receipt text cannot select code, arbitrary URLs or actions. OCR resources are hardcoded to the app's own origin. Main-document production CSP disallows arbitrary remote scripts/connections and object embedding. WASM compilation is explicitly allowed because OCR needs it. Development-only refresh allowances are separated in Vite configuration.

The optional Gemini API accepts only loopback clients and recognized local Host headers, checks Origin against Host, requires JSON and a custom request header, validates explicit processing consent and bounds the body before contacting a fixed Google endpoint. There is no CORS allowance, receipt-selected URL, remote database, or model tool dispatch. Requests use `store: false`; this does not override Google's own processing/abuse-monitoring terms. The local server does not log/save receipt payloads or model results and never returns its API key. Provider error bodies are replaced with bounded, useful messages. One active request, two attempts/minute and ten/hour limit local usage, with no automatic retries. Cancellation and a two-minute deadline abort upstream requests. Stalled request bodies are also terminated.

This adapter is for local development/testing, not a public authenticated service. Public/phone hosting with AI needs server-side authentication, authorization, network exposure review, TLS, secrets and deployment configuration. Users sharing a browser profile share its local storage; that is disclosed, not protected by an account boundary. No deployment or cloud account configuration was performed.

Images, original PDFs, PDF text layers and raw OCR disappear on refresh or tab close. Draft fields and participant names persist in browser local storage until reset or browser storage clearing. Exported summaries are ordinary files/clipboard text under the user's control. Reset clears Gather's stored receipt/current previews, not already exported copies. Private originals are never copied into tracked fixtures. Generated artifacts and secret/local files are ignored by Git. The committed PDF fixtures are wholly synthetic.

### PDF import boundary

PDF signatures and declared MIME must agree before loading the optional pinned PDF.js 6.4.299 module. Only in-memory file bytes enter an owned browser worker; the application creates static page canvases, with no viewer, annotation event handlers, document JavaScript or link navigation. Fonts, character maps, image decoders and color profiles use fixed same-origin paths. Password-protected and XFA documents are rejected. Each document is bounded to 12 MiB, the remaining twelve-page receipt allowance and sixty seconds. A page is bounded to 20,000 PDF units per side before allocation, twelve million render pixels and a 12,000-pixel canvas side; all pages share a 48-million render-pixel budget. Operator lists, extracted characters, text items and the existing upload/detail-section budgets also have explicit limits. Cancellation destroys the worker and releases partial previews, preserving earlier uploads.

`stopAtErrors` is enabled. In the pinned library, an oversized-image worker error could still resolve a partial operator list before its public promise rejected. A separate observer rejects any worker stream-error message and retains no error content. The hostile image-dimension fixture verifies this boundary; dependency upgrades must retain that regression. These bounds are application safeguards, not OS memory isolation or a measured peak-memory guarantee.

Usable text layers are parsed directly without OCR or an API request. Finite source rectangles are mapped to the full rendered page, including long pages that also have image-reading windows. Complex/rotated/overlapping text, forms, cropped pages and pages without useful text require image recognition. A complete-list review check remains mandatory because selectable text can be hidden, stale or omit scanned purchases. A fixed provenance marker in these regions records literal extraction, not an OCR accuracy probability. PDF pages and photographs are untrusted source content throughout.

## Performance and operating cost

All splitting happens locally without additional scans. Financial arithmetic is `bigint` plus exact fixed-scale weights. Money is bounded to 100 billion minor units per amount; quantities/weights to one billion with six decimal places; drafts to 300 items, 30 people, 30 adjustments and 20 tax codes. Uploads allow twelve images/PDF pages, 12 MiB per file and a 48 MiB source/prepared-PDF-preview budget. Photos are limited to 25 megapixels/20,000 pixels per side; PDF limits are specified above. Full previews are bounded to four megapixels/3,200 pixels; tall images use detail windows up to 1,400×2,200 pixels with at least 18% overlap. There are at most 24 reading panels per scan. Image decode is bounded to ten seconds, PDF import to sixty seconds and ordinary extraction to 120 seconds. Long local vision jobs share a fifteen-minute deadline with at most three sections per native context. Gemini limits requests to 18 MiB of encoded JSON and responses to 1 MiB. No automatic retry is made; Gemini cost/quota depends on the user's API project.

The OCR model is about 3 MB compressed; the app additionally fetches the selected worker/core assets. Initial OCR is heavier than manual entry, particularly on low-memory phones. Serving all generated OCR variants makes the static build larger, but the worker chooses the appropriate core. These costs are device resources and ordinary same-origin bandwidth.

## Remaining limitations and checks outside the evidence

- OCR/parser accuracy varies by print quality and receipt layout. This is a checked draft workflow, not a guarantee of automatic universal extraction. Tax inclusion, generic discount attribution and missing quantities may require correction.
- On-device image OCR is English only. HEIC, animated images and handwriting are outside this version; export/capture a supported still image instead. PDF text and locally rendered PDF page import are supported within the limits above; genuine retailer PDF accuracy remains unmeasured. Other offered currencies can be entered manually; currency symbols alone are sometimes ambiguous and must be confirmed.
- On-device overlapping photos preserve rows for review; generated tall-image window joins merge exact matching sequences. Independent local vision batches join only uniquely supported physical source rows. General overlap between different photographs remains unproved. Both separately approved real Gemini crop attempts returned HTTP 503 without drafts, so real-receipt cloud accuracy remains unmeasured. Multiple separate discounts against one Costco item may require correction.
- Discounts/fees use the visible allocation rules. Retailers with unusual tax/discount rounding may require printed-tax mode or a labelled, explicit rounding adjustment; mismatches block finalization.
- Automated mobile checks use Chromium phone emulation. Physical phone camera hardware, Safari/WebKit, screen-reader interaction by a human, production TLS and deployment-specific headers have not been verified unless explicitly added to the final record.
- One embedded-preview automation session stalled at a native confirmation step. It is not counted as a passing check; the real-photo correction and normal confirmation/reset/removal flows were verified in Chrome.
- Local storage is accessible to the browser profile and is not encrypted by this app. Raw images are memory-only; refreshing requires selecting the original again. There is one saved receipt draft per origin, with conflict detection rather than real-time multi-user collaboration.
- No automatic currency conversion, transfers, payment collection or inferred original payer. Amounts owed are purchase-cost allocations, not payment or accounting advice.
- No deployment, merge, force-push, public link, remote account or billing activation was performed. The user's existing ignored Gemini key was used only within the recorded approved crop attempts and non-private diagnostics. Production hosting must add authentication, secrets, TLS and appropriate HTTP headers (including frame-ancestor restrictions, which cannot be enforced through a meta CSP).
- A clean dependency audit and passing tests describe this tested version; they do not prove the app perfectly secure or bug-free.

## Requirement completion audit

### Long receipt and Gemini follow-up, 29 October

The scanner files existed, but the previous local preview server was no longer running. An already-loaded page could therefore fail its asset preflight. Development/build/preview now prepare OCR assets automatically, and the recovery message explains that the local server must stay running. Same-origin worker/core/language files and real OCR are checked; a stale page after a stopped server is not treated as a complete working app.

Capture supports twelve ordered photos, individual camera additions, accessible reorder controls, top-to-bottom overlap guidance, cropping from the original source, and detail windows for tall images. The original remains accessible. A tall synthetic receipt with 40 purchases was actually read on desktop and mobile Chromium: first and last purchases, the footer total and a balanced £40.00 draft were verified. A zero/letter OCR naming ambiguity in the initial numbered synthetic fixture was corrected by using clear product words for the top/bottom evidence; OCR accuracy is still not universal.

The optional Gemini adapter sends all photo/detail panels together as one stateless structured extraction request. Output contains only receipt fields and photo references, which are checked on both server and browser. Human review and the exact engine stay authoritative. Missing values, unknown codes, incomplete generations, bad output shapes and printed-item-count discrepancies are surfaced. No live model or private receipt upload was run: the end-to-end Gemini UI exercise uses an explicitly labelled synthetic contract fixture, and server tests use an injected fake upstream transport. These prove wiring and financial validation, not real model extraction quality.

Verification: build/typecheck, formatting, 105 unit/property tests and the final full browser run passed: **65 passed, one duplicate breakpoint check skipped**. Production dependency audit reported zero known vulnerabilities. The new checks cover unconfigured setup, processing consent, photo order, twelve/thirteen-photo boundaries, quota recovery, original preservation, accessibility, tall-image actual OCR and the checked 18-item Costco fixture through a £176.78 final split. Physical camera hardware and live Gemini extraction remain outside the evidence.

### Phone layout follow-up

The phone review found small form text, compact controls, a minimum-content grid overflow at 320px, and an unbroken participant name spilling from a quantity label. The updates use 16px form text, at least 44px button targets, stacked participant amounts, constrained grid tracks and wrapping for long names/notes. They retain normal desktop styling and support touch-device landscape layouts.

The added phone regression tests cover the complete receipt review → people → physical quantity assignment → finalized breakdown flow at 320, 360, 390 and 430 CSS pixels, plus the editor at 844×390 landscape. They compare the rendered content with the requested viewport width, including where mobile browsers might otherwise zoom out to accommodate overflow. Font sizes, button targets, long names, and controls staying within the screen are checked. Generated phone screenshots are stored in ignored `qa-artifacts/`.

Verification: production build and TypeScript checks passed; all ten new phone layout checks passed across desktop and touch-browser contexts; the full browser suite passed 55 tests with the one duplicate breakpoint check skipped. Existing OCR, accessibility, sharing, persistence and desktop workflows were included in that run.

The delivery audit maps each part of the objective to concrete evidence:

1. Empty project inspection, inherited instructions and graph checked; Git initialized and feature branch created. No existing user files were overwritten.
2. Account-free responsive five-step workflow, camera/upload/manual entry, live totals, breakdown, export, draft persistence and reset: browser journeys, screenshots, mobile/desktop layouts.
3. Merchant/date/currency/items/quantity/unit price/line total/discount/subtotal/tax/extras/final total extraction and editing: parser, review controls, original image access, missing-data warnings and reconciliation tests.
4. Equal/physical/ratio/percentage/whole modes, complete/partial/unassigned status and stable person IDs: explicit unit cases and browser journeys.
5. Exact money, currency precision, deterministic final/remainder allocations, tax inclusion and adjustments, no inferred payer: engine tests, invariant properties and human-readable exports.
6. Ivory/sage/peach interface, visible focus, semantic forms, non-color status labels, touch controls and reduced motion: CSS, screenshots and axe checks. Automated accessibility is not a substitute for a human screen-reader audit.
7. Bounded files/images/worker/output/state, injection-safe rendering, local isolation, server-held API credentials and a restricted local upload endpoint: adversarial unit/browser cases and source review.
8. Ignore rules, tracked safe sources/lockfile, `.env.example`, install/run/test/provider/privacy documentation: repository files and Git verification.
9. All specified financial examples, failures, edits/removals, duplicate names/items, total discrepancies, malformed OCR/uploads and network recovery: executed suites and final validation record.
10. Feature branch, implementation summary, setup, configuration, calculation rules, executed test results, issue/fix/verification report and limitations: README and this report.
