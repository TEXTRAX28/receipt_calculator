# Gather

A receipt scanner and bill splitter built on React, TypeScript and Vite. Choose private on-device English OCR, or an optional Gemini reader that sees the receipt's photographs together. All calculations and splitting run in the browser. Participants need no accounts.

## Run locally

Use Node.js 24 LTS (22.13+ supported) and npm.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173/`.

In VS Code, open the folder containing `package.json`, choose **Terminal → New Terminal**, and run the commands above. Subsequent starts only need `npm run dev`; keep its terminal open. Stop it with **Ctrl+C** before reinstalling dependencies, since a running Vite process can lock native files on Windows. If the port is occupied, choose another explicitly, for example `npm run dev -- --port 5175`, and open the printed URL.

The install, development and build scripts copy the OCR worker, English language data and WASM cores to ignored `public/ocr/`, and PDF fonts, character maps and image decoders to ignored `public/pdf-assets/`. Both come from the installed packages and are served from this app's own origin. If those generated assets are missing:

```sh
npm run prepare:ocr
```

For a production build and local preview:

```sh
npm run build
npm run preview -- --port 4173
```

On-device OCR needs no API key, paid service, database or account. Keep the local server running while using the app: an already-loaded page still needs it to download the OCR files. Nothing has been deployed or published.

## PDF receipts

Upload a PDF alongside supported images. Every PDF page gets a preview and counts toward the twelve-image/page receipt limit. If all selected pages contain usable embedded text, **PDF text** reads it directly on this device; it is selected automatically unless you already chose a reader. No OCR model or cloud request is needed for that path. Scanned pages, documents containing a page without usable text, forms and unsupported text layouts use the existing image readers after local rendering. Applying a crop disables the original text layer so excluded text cannot enter the draft.

Embedded text can omit purchases stored as pictures or disagree with the visible page. A mandatory purchase-list check blocks confirmation until you compare the rows and amounts with the previews. Genuine repeated purchases remain separate, and source highlights use their original page coordinates. Original PDFs, text layers and page previews remain in memory and disappear on refresh/reset; saved drafts contain the reviewed fields.

PDF import is limited to 12 MiB per file, twelve pages across the receipt, a sixty-second deadline, bounded rendering and the existing total/section budgets. Oversized, password-protected and malformed documents fail without removing earlier uploads. Cancel import stops its owned worker. The pinned PDF.js module and worker load only when a PDF is selected. Gather renders pages without running document actions or following links. Tests cover synthetic digital/scanned/mixed/rotated PDFs, long-page source areas, rejection/cancellation and a complete checked split; genuine retailer PDF accuracy and physical-phone performance still need evidence.

## Optional computer reader

The **This computer** reader uses the locally installed PP-OCRv6 medium model through a separate Python worker. It needs no cloud API key. It has improved product detection on this project's receipts, but financial extraction still needs review; see the [measured comparison](receipt_training/evaluation/ADVANCED_OCR_REPORT.md). The ordinary **On-device** reader remains available without this setup.

For a fresh Windows installation, install Python 3.12, then run from the project root:

```powershell
py -3.12 -m venv receipt_training/.cache/paddle-env
& .\receipt_training\.cache\paddle-env\Scripts\python.exe -m pip install -r receipt_training/scripts/requirements-paddle.lock
py -3.12 scripts/setup-local-ocr.py
```

The setup script downloads only public model files at pinned revisions, verifies their sizes and SHA256 hashes, and never reads or uploads receipts. Dependencies are pinned in the separate Python lockfile. If this environment and the models are already installed, skip those installation commands. An offline asset check is available with `py -3.12 scripts/setup-local-ocr.py --check`.

Add these settings to the ignored `.env.local`, using the **absolute path for your checkout**, then restart the development server:

```dotenv
LOCAL_OCR_PYTHON=C:/path/to/costco_calc/receipt_training/.cache/paddle-env/Scripts/python.exe
LOCAL_OCR_ENGINE=paddle-v6
```

The computer reader appears when its interpreter and verified model files are present. The first scan also starts the model; later scans reuse that worker until sixty seconds of inactivity. Only one computer scan runs at a time, with a two-minute deadline and cancellation. A failed computer scan retains the selected photos and lets you choose another reader; it never sends them to a cloud service automatically. The installed docTR adapter can instead be selected with `LOCAL_OCR_ENGINE=doctr` after installing its separate dependency environment and assets; its measured product recall was lower on the current corpus.

This runs on the computer hosting Gather. It is not phone on-device inference. Access from a separate phone still needs an accessible, secured server URL; the current server accepts loopback only.

## Optional experimental local vision (Windows)

The **Local vision** reader uses the pinned Qwen3-VL 4B model and native Vulkan runtime from the recorded comparison. It is an optional development reader, and every resulting purchase and amount still needs review. Known coupon and unprinted-metadata errors remain; balanced arithmetic alone does not prove accurate extraction. Each native context still accepts at most three prepared sections. Longer receipts automatically use both installed local readers and are read in overlapping batches, covering up to 24 prepared sections from the twelve-photo upload limit. A tall photo can create multiple sections. This can take several minutes; the scanner shows section progress. No sections are silently dropped.

Install the optional computer reader's Python environment above first, then download/verify the separate public vision assets:

```powershell
py -3.12 receipt_training/scripts/setup_vision_candidate.py
```

This downloads approximately 3 GB of pinned public models/runtime files into the ignored local cache and sends no receipts. On an already prepared checkout, add `--check` for offline verification. Set the following in your ignored `.env.local`, retain the absolute `LOCAL_OCR_PYTHON` path, then restart Gather:

```dotenv
LOCAL_VISION_ENABLED=1
```

Choose **Local vision** after uploading your photos. No cloud key or upload consent is needed for this reader. It validates complete JPEG decoding in a bounded Python process, verifies the model/runtime assets before the first inference, unloads an idle computer OCR worker, and launches the fixed native model profile. Temporary inputs and the process are removed when the scan finishes or is cancelled. If cleanup or process termination fails, this reader stops accepting scans and reports the need for manual recovery. Invalid JSON, invalid photo references, relaxed decoder constraints and financial inconsistencies are rejected or remain blocked in review; another service is never called automatically. Native OS isolation and crash recovery still need further work before public deployment. Reproducible comparisons and their limitations are in [the advanced OCR report](receipt_training/evaluation/ADVANCED_OCR_REPORT.md).

## Optional independent local comparison

With both local readers configured, select **This computer**, tick **Compare with local vision**, and scan. The computer OCR and vision model see the same original prepared photos independently; OCR text is never supplied to the vision model. This is optional and slower. For longer inputs, **Local vision** also uses this independent source comparison automatically. Each bounded batch repeats one original section as context. Copies are joined only through unique physical OCR regions with matching description, quantity and prices; genuine repeated purchases remain separate. A disputed tax code remains a mandatory check even when those physical copies can be joined. Unclear regions, different prices and unproved photographic overlaps still need manual review.

The comparison aligns only unambiguous purchase rows, retains genuine repeated purchases, and can recover adjacent Costco coupons from explicit source rows. It removes a savings summary, coupon count or future membership reward only when the printed context proves it is informational. It never changes an amount to make a total balance. Recovered values, disagreements, missing coverage and unsupported fields remain blocked until you check them against the original or correct the affected field. **View on receipt** shows available OCR regions; no rectangle is invented for an unsupported value. Checked values are bound to the draft values and reopen when those values change. Photos and source geometry disappear after refresh; the draft and its review checks remain local.

If the extra reading fails, the successful first draft remains available with an explicit incomplete-comparison check. Cancellation keeps the photos and does not accept a partial draft. No cloud provider is called automatically. On the supplied two-photo development receipt, one fresh local comparison reached an eighteen-purchase GBP 176.78 draft in **111.45 seconds**, then completed an exact three-person split after eight explicit checks without financial edits. This single source-informed case does not establish general or complete-receipt accuracy. See the [measured comparison and limitations](receipt_training/evaluation/ADVANCED_OCR_REPORT.md).

## Optional Gemini setup

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). Access to the Gemini chat app is separate from API access.
2. Copy `.env.example` to `.env.local`, then put the key after `GEMINI_API_KEY=`. A blank, ignored `.env.local` has been prepared for this workspace. **Never use a `VITE_` prefix for a secret.**
3. Restart `npm run dev` or the local preview, reload Gather, and select **Gemini AI**. The default model is `gemini-3.8-flash`; `GEMINI_MODEL` can select another model available to your project.
4. Select and order the receipt photos, crop out membership/payment details, agree to sending them to Google, then choose **Read receipt with Gemini**.

The local server sends the ordered sections in one Gemini Interactions request using structured JSON output and `store: false`. It validates the result before creating an editable draft. The model is instructed to match overlapping rows using layout/context, preserve genuine repeated purchases, attach item-specific deductions, and read the printed VAT legend. The browser's existing exact calculation engine checks the draft; Gemini does not decide whether it balances.

Google currently lists a free tier for Gemini 3.8 Flash, subject to account/model limits. Check your own [API limits and pricing](https://ai.google.dev/gemini-api/docs/pricing) before enabling billing or selecting another model. Google's [terms](https://ai.google.dev/gemini-api/terms) require Paid Services when making API clients available to users in the UK/EEA/Switzerland. This local adapter is for development/testing, binds to loopback, checks host/origin and processing consent, and allows one active scan, two attempts per minute and ten per hour. Publishing it needs a proper authenticated server, hosting/TLS and deployment review. Static hosting alone cannot provide the Gemini endpoint.

API and UI protocol tests use clearly identified synthetic responses. Earlier live synthetic scans succeeded with `gemini-3.1-flash-lite`. On 31 October 2026, two separately approved attempts on exactly the same two identifier-removed Costco crops both returned HTTP 503, so neither produced an accuracy result. Both one-use authorizations are consumed; no additional private upload is authorized. A read-only model check returned 200, but subsequent synthetic controls through both generation endpoints also returned 503. No billing was activated. These availability failures do not establish receipt-reading quality. See the [approved-attempt evidence](receipt_training/evaluation/advanced-approved-gemini.json) and [advanced OCR investigation](receipt_training/evaluation/ADVANCED_OCR_REPORT.md).

## Use it

Gather is a **web app**: it runs in a desktop or phone browser. The phone layout uses stacked cards, 16px form inputs and controls sized for touch. The current local `127.0.0.1` address belongs to the computer running it; opening Gather on another device needs an accessible hosted URL. Hosting has not been configured.

1. Upload up to twelve JPEG, PNG or still WebP photos, take photos one at a time, paste receipt text, or enter items manually. For a long receipt, work from top to bottom, overlap 3–5 complete rows between photos, and include the final total/VAT table. Use the arrows to change photo order and **Crop** to trim background. Tall images are read in overlapping detail windows automatically. Choose **Try the Costco demo** for a clearly labelled manual transcription, not a simulated scan.
2. Check the original photo and every extracted field. Correct missing quantities, discounts, tax codes and totals. Confirm only after the arithmetic matches the printed receipt.
3. Add names. Duplicate names work because people have separate internal identifiers.
4. Tick the people sharing each item, or select physical quantities, ratios or percentages. Alternatively, split the entire receipt.
5. Finalize and open each person's breakdown. Copy or download a plain-text summary.

Purchase quantities and pack contents are separate. A receipt showing `1x` for an eight-can pack means **one purchased pack**. In quantity mode, confirm eight units per pack, then allocate all eight cans. A ratio of 1:3:5 describes nine cost shares; it can divide an eight-can pack's cost without claiming nine physical cans.

Drafts may be incomplete. Finalization requires a balanced, confirmed receipt, valid positive shares, resolved charges, and complete item or whole-receipt assignments. Changing a financial field requires another review. Removing a person clears their assignments and recalculates remaining shares. A second tab's changes stop this tab from overwriting the stored draft; export your version before reloading.

## Tax, discounts and pennies

- For the supplied UK Costco receipt, A means 20% VAT and Z means 0%. `2.00-Z` is a £2 deduction associated with a zero-rated item. `-A` identifies a deduction in the A category. These are merchant-specific codes, not universal retailer rules.
- The parser reads printed tax legends and preserves unfamiliar codes for correction. It does not invent Costco A/Z rates when the legend is missing. On a tax-exclusive receipt, missing code rates block confirmation until entered from the original. Costco tax conventions vary by country.
- The on-device parser attaches separate Costco discount lines to the preceding purchase and flags them for checking. Unclear generic discounts remain editable receipt-wide adjustments. Repeated purchases across different photos are preserved for manual review in on-device mode. The computer reader can match a Costco footer against a longer photo only when both contain the same transaction reference and an exact ordered end sequence with at least two distinct product codes, matching quantities/prices/coupons and a footer starting near the image's top. It preserves genuine within-photo repeats, all original source regions and uncertain overlaps, and reports any merge. Missing references or other overlap layouts still need review. Exact joins between detail windows of one tall image are merged. Gemini is instructed to merge photographed overlaps using context while retaining separate purchases. Every result still requires review.
- A complete numeric Costco row can identify the preceding product title. A title such as `HONEY 1.36KG` or `OLIVE OIL 0.75L` therefore stays a description; its pack measurement is never substituted for the separately printed purchased quantity. Conflicting observed final totals remain in the source text and produce an explicit review warning.
- Item discounts reduce that item's line price. Receipt-wide discounts are apportioned by item net cost before added tax.
- Tax-inclusive prices never receive tax again. Tax rows remain informational. Tax-exclusive receipts use either printed tax adjustments or defined item tax rates, never both. The optional printed tax field checks the calculation.
- Tax is rounded once per code. The group's minor units are allocated to its items by largest remainder. This reproduces £13.62 VAT and a £176.78 final total for the 18-item Costco demo.
- Other adjustments can follow item costs/ownership or be shared equally among all people. Whole-receipt mode applies its shares to the entire cost and ignores saved item assignments.
- All money uses `bigint` minor units. Prices and weights are parsed as exact decimal strings; no binary floating-point money arithmetic is used. GBP has two decimal places, JPY zero, KWD three, and the other offered currencies use their specified precision.
- IDR and TWD are supported with two minor-unit decimal places. Printed rupiah grouping such as `Rp 36.000` is read as 36000. A single three-place separator without enough currency evidence remains unresolved; the parser keeps the draft editable and asks for correction instead of silently guessing or crashing the scan.
- Final item costs (or the whole receipt) use largest remainder allocation. Highest fractional remainders get the spare minor units; ties follow receipt order and then person creation order. £10/3 is £3.34, £3.33, £3.33. Each component is also explained; any component-to-final rounding redistribution is disclosed and nets to zero across people.
- A signed receipt rounding adjustment must be explicitly entered and labelled. It is never invented to hide a discrepancy.

See [calculation and security report](docs/IMPLEMENTATION_AND_SECURITY.md) for the implementation audit and test evidence.

## Privacy and processing

Receipt images are signature-checked, dimension-checked and decoded locally. On-device mode never uploads them: normalized JPEGs and high-resolution detail windows go to the local OCR worker. The app fetches its OCR assets from its own origin. The English model is about 3 MB compressed, plus the chosen WASM core; these are software downloads, not per-scan service charges. Runtime cost is device CPU/memory and static asset hosting bandwidth.

Computer mode sends prepared JPEG sections to the local computer server. The server checks their format and bounds, writes them to a dedicated temporary job directory, and removes that directory after success, failure or cancellation. Its worker receives an allowlist of operating-system environment variables, without cloud credentials. Worker output and source-photo references are validated before parsing. Images are not sent to a third party. A computer or server crash can interrupt cleanup; crash recovery and public-service isolation remain release work. The Python network restriction is an application-level guard, not an operating-system sandbox.

Gemini mode forwards photos through the local server to Google **only after the user explicitly agrees and starts that scan**. Changing photos, order or crops clears that agreement. The local adapter does not log or save images, prompts, results or keys. It requests stateless provider processing, which is separate from Google's own data-use/abuse-monitoring terms. Crop out private footer details first. Google's terms depend on region and account tier. Participant names are not included in extraction requests.

Extracted draft fields and participant names are saved in this origin's browser local storage. Raw OCR/PDF text, photos and original PDFs are not persisted and disappear on refresh/close. Anyone with access to that browser profile can read its stored draft; there is no account authentication. Delete/reset removes this app's saved receipt and its in-memory previews. Exported/downloaded copies remain where you saved or sent them.

On-device OCR runs in English. Blur, creases, shadows, abbreviated names and unfamiliar receipt formats can cause mistakes with every reader. Review is required. Missing values stay editable; absent data is not filled merely to make a receipt balance. Gemini also flags a disagreement between its purchase count and a legible printed item count. A balanced total alone does not prove every item is correct.

Upload limits: twelve images/PDF pages, 12 MiB per file and 48 MiB across original files plus prepared PDF page previews, 20,000 pixels per side and 25 megapixels per photo. Full previews are limited to 3,200 pixels/four megapixels. Tall-image windows are up to 1,400×2,200 pixels with at least 18% overlap; at most 24 reading panels are accepted per scan. Computer/Gemini requests are limited to 18 MiB of encoded JSON and responses to 1 MiB. Image decode is bounded to ten seconds; PDF import to sixty seconds. Ordinary reading has a 120-second server/worker deadline plus a small client allowance; long local vision batches share a fifteen-minute job deadline. All readers support cancellation and have no automatic retries. Calculation changes never scan again.

Local OCR text passes `extractionOutputSchema` before parsing. Gemini uses the shared strict `aiReceiptSchema` on server and client, then the normal receipt schema and exact financial validation. Neither reader can execute instructions from a receipt. Gemini has no tools, links to fetch or receipt-controlled destinations. Only the server can access its API credential.

## Tests and development

```sh
npm run typecheck
npm test
npm run test:e2e
npm run format:check
npm audit
```

The browser suite expects installed Google Chrome (`channel: chrome`) and uses desktop and iPhone-sized Chromium contexts. On a machine without Chrome, install Chrome or change the configuration to use Playwright Chromium and install it with `npx playwright install chromium`. `npm run test:e2e` serves the existing production build on port 4173, so run `npm run build` first and leave that port free. Its isolated preview disables personal computer-model and Gemini configuration. Unit tests include seeded property checks for 2,500 generated allocation cases. OCR unit tests exercise bad outputs, missing assets, cancellation and timeouts; browser tests perform actual on-device OCR as well as manual and sharing workflows. Computer-reader protocol/UI fixtures are explicitly synthetic and do not prove OCR accuracy.

To exercise the **real installed computer model** through its local HTTP endpoint and browser upload-to-split workflow, start the configured development server separately, then run:

```powershell
$env:GATHER_LOCAL_MODEL_URL = 'http://127.0.0.1:5174/' # Use your actual loopback development URL.
npx playwright test computer-reader-real.spec.ts --workers=1
```

This opt-in test uses a made-up receipt, verifies automatic extraction and an exact split, blocks external browser requests, and makes no cloud call. A successful synthetic test proves integration, not real-receipt accuracy. Single-worker execution respects the local model's one-active-scan limit.

A separate case in that file exercises the **specific two original Costco photos** as supplemental development data. Set `GATHER_LOCAL_COSTCO_PHOTOS` to a JSON array containing their local item-photo and footer-photo paths, in that order, then select it with `--grep 'real two-photo Costco'`. It checks eighteen automatically extracted purchase rows, every quantity/unit price/line price/discount/tax code, printed subtotal/tax/total and an exact three-person split, without editing extracted values. Its name checks allow OCR abbreviations; exact description accuracy is scored separately. This receipt already influenced the parser/demo, so it is not a fresh holdout or proof of accuracy on other receipts.

`npm run format` formats source and tests. Generated reports, screenshots, recordings, local databases, environment secrets, uploads and private receipt files are ignored. Safe synthetic fixtures, test sources and the dependency lockfile are tracked.

For phone camera/clipboard use beyond loopback, serve over HTTPS using a host you control. A phone's `127.0.0.1` refers to the phone itself. The app is ready as a static `dist/` build, but production hosting, TLS and HTTP headers must be configured separately. No deployment was authorized or performed. In development only, Vite's CSP permits its inline refresh script and loopback WebSocket; the production HTML restricts scripts and connections to the app's own origin, with the WASM permission needed by OCR.

The opt-in real-photo test takes a local path from `GATHER_REAL_RECEIPT` and is excluded from ordinary runs. It exercises real OCR followed by **explicit manual correction**, using the supplied Costco receipt's verified figures. For example in PowerShell:

```powershell
$env:GATHER_REAL_RECEIPT = 'C:\path\to\your\receipt.jpeg'
npx playwright test real-receipt.spec.ts --project=desktop
```

The included crop percentages in that opt-in exercise fit the supplied photograph; adjust them for a different photo. No private image fixture is committed. On the supplied photo, OCR yielded nine purchase rows and still needed correction; the test then used the visible review controls to enter the verified 18 purchases and finalized exactly £176.78. This is a successful correction workflow, not a claim of complete automatic extraction.

## Structure

- `src/lib/money.ts`: exact decimal parsing, currency formatting and largest remainder allocation.
- `src/lib/engine.ts`: receipt reconciliation, tax/discount allocation and all split methods.
- `src/lib/parser.ts`: validated OCR/text to an editable merchant-independent draft.
- `src/lib/images.ts` and `ocr.ts`: bounded local images, tall-image detail windows and on-device extraction.
- `src/lib/gemini.ts`, `extraction-schema.mjs` and `server/receipt-api.mjs`: optional Gemini transport, shared output validation and server-held credentials.
- `src/lib/model.ts`, `storage.ts`, `summary.ts`: schemas, private draft persistence and export.
- `src/App.tsx`, `styles.css`, `theme.css`: responsive workflow, review, sharing and accessible UI.
- `tests/`: calculation, parsing, privacy, robustness, real OCR and browser journey checks.

The project started empty. The cross-project graph has no Gather entries. A repository-local graph and refresh wrapper are now available; use the local `AGENTS.md` instructions to refresh/query it and verify source when documentation lags.
