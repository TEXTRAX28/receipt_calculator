# Gather OpenAI OCR trial

This branch uses GPT-6 Astra for photo and PDF receipt scanning. Upload or capture your receipt, authorize the scan, then review the digital receipt and split it as usual. The app renders PDF pages into images on your computer and sends the prepared pages in order. Manual entry and pasted receipt text remain available.

## Run this branch

Use Node.js 24 LTS and npm. If this checkout already has its dependencies, start with `npm run dev`. In a fresh checkout, run `npm ci` first.

Put your existing server key in the ignored `.env.local` under `OPENAI_API_KEY` or `OPEN_AI_KEY`. Set a stable `OPENAI_ALLOWANCE_ID` and choose a small `OPENAI_REQUEST_LIMIT` in the same file. See [.env.example](.env.example) for the format. Each submitted scan uses one app attempt, including failed or cancelled requests that reached the provider. The app keeps its count across restarts.

```powershell
npm run dev
```

Open [Gather on this PC](http://127.0.0.1:5175/). The API listens on loopback. Keep this terminal open while testing.

### Reuse an existing settings file

Load the key from its current location with Node. Set the trial allowance in the terminal so this checkout uses its own count.

```powershell
$receiptSettings = 'C:\path\to\existing\.env.local'
$env:OPENAI_ALLOWANCE_ID = 'receipt-openai-trial'
$env:OPENAI_REQUEST_LIMIT = '5'
$env:OPENAI_ALLOWANCE_DIRECTORY = Join-Path (Get-Location) '.receipt-reader-state/openai'
npm run prepare:pdf
node "--env-file=$receiptSettings" node_modules/vite/bin/vite.js --configLoader native --host 127.0.0.1 --port 5175
```

The server reads only OpenAI settings in ordinary development and preview. Scan consent identifies the prepared images and use of API credits. The app keeps the existing US$0.60 estimate limit per request and leaves failed scans available for manual review or a new attempt. OpenAI bills actual usage. [OpenAI API data policy](https://developers.openai.com/api/docs/guides/your-data)

### Build and test

```powershell
npm run build
npm run test
npm run test:e2e
```

The browser tests use synthetic responses and a local server with provider credentials disabled. After building, `npm run preview` serves the OpenAI trial at [port 4175](http://127.0.0.1:4175/). The on-device build on `codex/receipt-digital-review` is available for a side-by-side comparison on the same receipts.

## Baseline reader reference

The sections about on-device and assisted readers describe the baseline branch and compatibility tests. The OpenAI trial's launch commands are above.

## Scanning choices

**On-device scan** is the default. It reads usable PDF text directly; for photos it uses the stronger receipt reader below, with English compatibility OCR when its files or browser features are unavailable. Compatibility fallback happens before recognition, on the same device. A cancelled, invalid or timed-out reading does not start a second model.

There is at most one second option: **Assisted scan**, labelled with its configured helper. It can use the hosting computer or an explicitly consented external service. It never starts automatically after an on-device failure. The default helper priority is computer OCR, Azure, Gemini, Veryfi, local vision, then OpenAI credits as the last resort. The owner can select one configured helper with `RECEIPT_ASSISTED_READER=computer|azure|gemini|veryfi|vision|openai`; leave it blank for that priority. An unavailable explicit preference does not select a different provider. Cloud keys and finite upload allowances are required independently; this preference grants neither.

The decision and measured limitations are recorded in the [scanning review](receipt_training/evaluation/SCANNING_REVIEW_RESULT.md). Quantities and unfamiliar currencies still require checking. A balanced receipt is not proof of correct extraction.

### Prepare the stronger on-device reader

After installing dependencies, prepare the pinned public models once:

```sh
npm run setup:enhanced
npm run dev
```

The default photo flow uses PaddleOCR.js 0.4.2 and PP-OCRv6 tiny in an owned WASM worker, with no API key or receipt uploads. The setup command fetches four checksum-verified public model/configuration files, about 6.3 MB, from fixed official revisions. Model caches and generated `public/ocr-enhanced/` files stay ignored by Git. Normal development/build preparation does not download these optional models; compatibility OCR is selected automatically when they are absent. First use loads about 50 MB including the model runtime and code. Keep the local server running.

The reader preserves actual source rectangles, supports the existing photo/section limits, and stops its worker on cancellation, failure or a two-minute deadline. Every draft requires a purchase-list check. Its paired original-fifty comparison improved known-currency line prices from 30/143 to 103/143, but automatic currency, quantities and overlap grouping remain weak. The configured computer-assisted reader remains more accurate. See the [browser comparison](receipt_training/evaluation/BROWSER_PADDLE_COMPARISON.md) and [app integration evidence](receipt_training/evaluation/BROWSER_PADDLE_INTEGRATION.md). Tests cover Chromium at phone-sized widths; physical Android/iOS and Safari performance remain unverified.

## Photo quality guidance

Camera capture and uploaded-photo review can suggest more light, sharper focus or higher resolution. These checks are advisory; they preserve the original pixels and do not prove that products or prices are readable. A local comparison on twelve development photos increased blur warnings from 2/12 to 10/12 deliberately blurred copies, with no added warnings on their unchanged originals. Six sources were reserved before testing the candidate. These are controlled transformations of familiar photos, not physical-phone or OCR-accuracy results; see the [capture-warning study](receipt_training/evaluation/CAPTURE_PHOTO_QUALITY.md).

## PDF receipts

Upload a PDF alongside supported images. Every PDF page gets a preview and counts toward the twelve-image/page receipt limit. **On-device scan** reads usable embedded text directly when every selected page has it. No OCR model or cloud request is needed for that path. Scanned pages, documents containing a page without usable text, forms and unsupported text layouts use image recognition after local rendering. Applying a crop disables the original text layer so excluded text cannot enter the draft. If an embedded text layer omits visible purchases, upload a photo of that page to scan its pixels instead.

Embedded text can omit purchases stored as pictures or disagree with the visible page. A mandatory purchase-list check blocks confirmation until you compare the rows and amounts with the previews. Genuine repeated purchases remain separate, and source highlights use their original page coordinates. Original PDFs, text layers and page previews remain in memory and disappear on refresh/reset; saved drafts contain the reviewed fields.

PDF import is limited to 12 MiB per file, twelve pages across the receipt, a sixty-second deadline, bounded rendering and the existing total/section budgets. Oversized, password-protected and malformed documents fail without removing earlier uploads. Cancel import stops its owned worker. The pinned PDF.js module and worker load only when a PDF is selected. Gather renders pages without running document actions or following links. Tests cover synthetic digital/scanned/mixed/rotated PDFs, long-page source areas, rejection/cancellation and a complete checked split; genuine retailer PDF accuracy and physical-phone performance still need evidence.

## Optional computer reader

**Assisted scan · This computer** uses the locally installed PP-OCRv6 medium model through a separate Python worker. It needs no cloud API key. It has improved product detection on this project's receipts, but financial extraction still needs review; see the [measured comparison](receipt_training/evaluation/ADVANCED_OCR_REPORT.md). **On-device scan** remains the default without this setup.

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

Choose **Assisted scan · Local vision** after setting `RECEIPT_ASSISTED_READER=vision` and restarting the server. No cloud key or upload consent is needed for this reader. It validates complete JPEG decoding in a bounded Python process, verifies the model/runtime assets before the first inference, unloads an idle computer OCR worker, and launches the fixed native model profile. Temporary inputs and the process are removed when the scan finishes or is cancelled. If cleanup or process termination fails, this reader stops accepting scans and reports the need for manual recovery. Invalid JSON, invalid photo references, relaxed decoder constraints and financial inconsistencies are rejected or remain blocked in review; another service is never called automatically. Native OS isolation and crash recovery still need further work before public deployment. Reproducible comparisons and their limitations are in [the advanced OCR report](receipt_training/evaluation/ADVANCED_OCR_REPORT.md).

## Automatic independent local comparison

The optional computer helper defaults to OCR alone. An owner with both local readers installed can enable `LOCAL_OCR_CHECK_MODE=auto` or `always` in the ignored server configuration, then restart it. These are configuration policies, not additional scanning choices. Automatic verification asks local vision for an independent reading when the first draft has validation issues, parser warnings, uncertain purchase/financial source text, or multiple sections; `always` forces that comparison. The readers see the same original prepared photos independently; OCR text and selected currency never enter the vision request. A clear first draft can skip vision but still requires purchase-source review. Difficult comparisons can take minutes or time out; no cloud service is selected automatically. See the [automatic comparison measurements](receipt_training/evaluation/AUTOMATIC_LOCAL_COMPARISON.md).

For longer inputs, **Local vision** also uses this independent source comparison automatically. Each bounded batch repeats one original section as context. Copies are joined only through unique physical OCR regions with matching description, quantity and prices; genuine repeated purchases remain separate. A disputed tax code remains a mandatory check even when those physical copies can be joined. Unclear regions, different prices and unproved photographic overlaps still need manual review.

The comparison aligns only unambiguous purchase rows, retains genuine repeated purchases, and can recover adjacent Costco coupons from explicit source rows. It removes a savings summary, coupon count or future membership reward only when the printed context proves it is informational. It never changes an amount to make a total balance. Recovered values, disagreements, missing coverage and unsupported fields remain blocked until you check them against the original or correct the affected field. **View on receipt** shows available OCR regions; no rectangle is invented for an unsupported value. Checked values are bound to the draft values and reopen when those values change. Photos and source geometry disappear after refresh; the draft and its review checks remain local.

If the extra reading fails, the successful first draft remains available with an explicit incomplete-comparison check, plus every original classification and recovered-price check. Cancellation keeps the photos and does not accept a partial draft. No cloud provider is called automatically. Local vision now uses a measured compact output format when a request contains multiple original photos, with a bounded longer deadline. One photo, including its multiple detail panels, keeps the previous format. The latest actual two-photo Costco scan recovered all eighteen purchase amounts and four coupons, calculated **GBP 176.78**, then completed an exact three-person split after eight source checks without financial edits. It took **205.86 seconds** to reach review on this laptop. A separate four-photo synthetic receipt completed two model batches and an exact checked split. Earlier timeouts remain recorded; these development examples do not establish reliable latency, physical-phone performance or general receipt accuracy. See the [multi-photo measurements and limits](receipt_training/evaluation/COMPACT_MULTIPHOTO_READER.md).

## Optional Azure receipt reader

The **Azure receipt OCR** reader requires a configured server-side endpoint/key, a finite section allowance and consent for each scan. Credentials alone do not enable uploads. The [setup guide](receipt_training/evaluation/AZURE_SCREENING_SETUP.md) covers the resource configuration; the [integration report](receipt_training/evaluation/AZURE_APP_READER.md) records its development limits.

The draft uses Azure's original words and source rectangles. A missing quantity can also be proposed when Azure's quantity field matches the exact printed words and all related words belong to one purchase. Conflicting or weak evidence leaves it blank; an existing quantity is preserved. Every proposed quantity requires checking against the original before sharing. Native monetary and currency fields are not imported. The [quantity-recovery measurements](receipt_training/evaluation/AZURE_QUANTITY_RECOVERY.md) describe the six-sample result and its limits.

## Optional Gemini setup

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). Access to the Gemini chat app is separate from API access.
2. If `.env.local` does not exist, create it from `.env.example`. Edit the existing file otherwise. Put the key after `GEMINI_API_KEY=`. **Never use a `VITE_` prefix for a secret.**
3. After checking unused provider quota, set `GEMINI_ALLOWANCE_ID` to an operator-chosen name of 8–80 letters, numbers, underscores or hyphens, and `GEMINI_REQUEST_LIMIT` to the finite number of requests you authorize (1–100). Defaults are blank/zero: a key alone cannot enable uploads. Keep the same grant and storage directory across restarts.
4. Restart `npm run dev` or the local preview, reload Gather, and select **Assisted scan · Gemini**. Set `RECEIPT_ASSISTED_READER=gemini` on the server if another configured helper takes priority. The default model is `gemini-3.8-flash`; `GEMINI_MODEL` can select another model available to your project.
5. Select and order the receipt photos, crop out membership/payment details, agree to sending them to Google, then choose **Read receipt with Gemini**.

One complete multi-photo scan reserves one request slot immediately before provider I/O. Errors, lost responses, cancellation and timeouts still consume it. Usage survives restart and key/model changes; there is no daily reset or automatic retry. The ignored `.receipt-reader-state/gemini/` ledger contains only random request IDs, timestamps and status, never keys, photos or OCR. `GEMINI_ALLOWANCE_DIRECTORY` can select a shared absolute persistent directory; multiple instances/checkouts must use the same directory and grant to share a cap. Do not delete the ledger or rotate its grant to bypass a consumed allowance. Only deliberately grant more requests after checking account quota and approving further use. The local count is not Google's remaining quota, a billing cap, or public multi-user authentication.

The local server sends the ordered sections in one Gemini Interactions request using structured JSON output and `store: false`. It validates the result before creating an editable draft. The model is instructed to match overlapping rows using layout/context, preserve genuine repeated purchases, attach item-specific deductions, and read the printed VAT legend. The browser's existing exact calculation engine checks the draft; Gemini does not decide whether it balances. If Gemini copies comma-grouped money such as `259,000`, the draft retains that literal value for correction. Selecting a currency or ticking a review checkbox does not interpret the separators: each invalid amount must be corrected before sharing.

Google currently lists a free tier for Gemini 3.8 Flash, subject to account/model limits. Check your own [API limits and pricing](https://ai.google.dev/gemini-api/docs/pricing) before enabling billing or selecting another model. Google's [terms](https://ai.google.dev/gemini-api/terms) require Paid Services when making API clients available to users in the UK/EEA/Switzerland. This local adapter is for development/testing, binds to loopback, checks host/origin and processing consent, and allows one active scan, two attempts per minute and ten per hour. Publishing it needs a proper authenticated server, hosting/TLS and deployment review. Static hosting alone cannot provide the Gemini endpoint.

API and UI protocol tests use clearly identified synthetic responses. Earlier live synthetic scans succeeded with `gemini-3.1-flash-lite`. On 31 October 2026, two separately approved attempts on exactly the same two identifier-removed Costco crops both returned HTTP 503, so neither produced an accuracy result. Both one-use authorizations are consumed; no additional private upload is authorized. A read-only model check returned 200, but subsequent synthetic controls through both generation endpoints also returned 503. No billing was activated. These availability failures do not establish receipt-reading quality. See the [approved-attempt evidence](receipt_training/evaluation/advanced-approved-gemini.json) and [advanced OCR investigation](receipt_training/evaluation/ADVANCED_OCR_REPORT.md).

## Optional OpenAI last resort

**OpenAI last resort** is an explicit, manual choice. Gather never selects it automatically or calls it after another reader fails. No new live OpenAI request was made while adding this option.

Keep your existing server-only `OPEN_AI_KEY` in the ignored `.env.local`; `OPENAI_API_KEY` is also accepted. A key alone cannot enable scanning. After checking available credits and approving the intended uploads/spend, an operator must set `OPENAI_ALLOWANCE_ID` (8–80 letters, numbers, underscores or hyphens) and `OPENAI_REQUEST_LIMIT` (1–100 attempts), then restart the local server. The default limit is zero. Keep the grant and persistent `.receipt-reader-state/openai/` directory unchanged across restarts and key changes; separate instances must share them to share the cap. Do not copy a private environment file into another checkout or put secrets in `VITE_` variables.

Select and order the photos, crop identifiers, select **OpenAI last resort**, then explicitly consent to the upload and credit use before starting. The server sends the prepared sections independently of any earlier reader's output to fixed model `gpt-6-astra`, with strict structured output, no tools and `store: false`. Its conservative **US$0.60 estimate guard is not an account spending cap**. A submitted attempt remains consumed on errors, cancellation or timeout; there is no automatic retry or refund of the local allowance. The request deadline is 90 seconds. Review the returned draft against the original before sharing.

The local adapter does not log/save receipt content or keys. OpenAI's [API data controls](https://developers.openai.com/api/docs/guides/your-data) describe default exclusion from training, abuse-monitoring retention, caching and regional processing limits; `store: false` does not guarantee zero retention. The [implementation and validation report](receipt_training/evaluation/OPENAI_LAST_RESORT_APP.md) distinguishes the six fake-response browser checks from the earlier, separately approved single real Costco comparison. That one real request does not establish representative accuracy. Public hosting/authentication/spending controls remain release work.

## Use it

Gather is a **web app**: it runs in a desktop or phone browser. The phone layout uses stacked cards, 16px form inputs and controls sized for touch. The current local `127.0.0.1` address belongs to the computer running it; opening Gather on another device needs an accessible hosted URL. Hosting has not been configured.

1. Upload up to twelve JPEG, PNG or still WebP photos, take photos one at a time, paste receipt text, or enter items manually. For a long receipt, work from top to bottom, overlap 3–5 complete rows between photos, and include the final total/VAT table. Use the arrows to change photo order and **Crop** to trim background. Tall images are read in overlapping detail windows automatically. Choose **Try the Costco demo** for a clearly labelled manual transcription, not a simulated scan.
2. Review the compact digital receipt. Tap an item to correct it, or open **Edit fields and receipt text** for the full editor. Continue accepts the receipt as a whole; missing quantities, invalid amounts and arithmetic discrepancies still need correction.
3. Add names. Duplicate names work because people have separate internal identifiers.
4. Tick the people sharing each item, or select physical quantities, ratios or percentages. Alternatively, split the entire receipt.
5. Finalize and open each person's breakdown. Copy or download a plain-text summary.

Purchase quantities and pack contents are separate. A receipt showing `1x` for an eight-can pack means **one purchased pack**. In quantity mode, confirm eight units per pack, then allocate all eight cans. A ratio of 1:3:5 describes nine cost shares; it can divide an eight-can pack's cost without claiming nine physical cans.

Drafts may be incomplete. Finalization requires a balanced, confirmed receipt, valid positive shares, resolved charges, and complete item or whole-receipt assignments. Changing a financial field requires another review. Removing a person clears their assignments and recalculates remaining shares. A second tab's changes stop this tab from overwriting the stored draft; export your version before reloading.

The merchant name is optional when it is missing or unreadable. Leave it blank rather than inventing a name; the receipt card shows **Unnamed receipt** and the text summary says **Merchant not supplied**. Missing merchant information still prompts an independent local reading when automatic comparison is enabled. Currency, financial validation, source review and assignments must still be resolved before sharing.

### Reviewing a scanned receipt

The default review is a compact digital receipt with quantities, names, unit prices and line amounts. The full editor and reading notes open on demand. One Continue action accepts the current receipt; it does not fabricate individual source confirmations. Reading uncertainty remains advisory, while invalid inputs, unresolved currency, unbalanced money and incomplete shares still block progression. Editing financial details invalidates the receipt's acceptance stamp.

Quantity-column headers and neighbouring numeric counts allow a guarded proposal for an isolated `I`, `l` or `|` read as one. A bare leading number is not stripped from an unlabelled product name. Unit prices use exact minor-unit division. When copied line amounts reconcile with the printed total, an inconsistent optional unit observation can be replaced by its calculated effective unit; the original observation is retained. Missing/non-exact divisions and disputed quantities remain for correction. Explicit new unit edits are protected, including across refresh and currency changes. Legacy scanned drafts with an inconsistent optional unit return to review after recalculation. Signed refund lines can retain an unsigned printed unit price.

After successful browser Paddle OCR, a bounded local check can re-read unclear Latin-letter names from their actual source rows. It uses native-scale Paddle crops and enlarged English OCR sequentially, with an eight-second deadline and a shared 24-panel budget. Automatic changes require a one-character edit supported by both local readers, an unchanged count/line amount, and sufficient support for the changed word. The first name is retained. Missing assets, disagreement or timeout keep the first draft; cancellation stops the operation. Model scores are reading signals rather than verified probabilities, and names still need visual review. This check can add time and load the English reader's assets on first use; no cloud provider or API allowance is involved.

VAT/GST registration details are displayed separately from printed rates and tax amounts. An identifier or rate never invents a tax amount. A trailing letter becomes an active tax code only with supporting code/retailer context; otherwise it remains an unclassified source suffix. Real tax legends and unfamiliar codes in a supported code column remain available for correction. Leave optional Printed tax blank when the receipt provides none; that does not classify the purchase as zero-rated. The review screen omits a duplicate calculation card and tax-code controls that are not in use.

Continue validates before advancing. Invalid inputs take priority over downstream reconciliation messages. It opens the editor and collapsed details, highlights and scrolls to the affected control, focuses it, and displays its specific correction message. This also applies to missing people and incomplete assignments. Reduced-motion preferences are respected; physical iPhone keyboard/scroll behaviour still benefits from a hands-on check.

## Tax, discounts and pennies

- For the supplied UK Costco receipt, A means 20% VAT and Z means 0%. `2.00-Z` is a £2 deduction associated with a zero-rated item. `-A` identifies a deduction in the A category. These are merchant-specific codes, not universal retailer rules.
- The parser reads printed tax legends and preserves unfamiliar codes for correction. It does not invent Costco A/Z rates when the legend is missing. On a tax-exclusive receipt, missing code rates block confirmation until entered from the original. Costco tax conventions vary by country.
- The on-device parser attaches separate Costco discount lines to the preceding purchase and flags them for checking. Unclear generic discounts remain editable receipt-wide adjustments. Repeated purchases across different photos are preserved for manual review in on-device mode. The computer reader can match a Costco footer against a longer photo only when both contain the same transaction reference and an exact ordered end sequence with at least two distinct product codes, matching quantities/prices/coupons and a footer starting near the image's top. It preserves genuine within-photo repeats, all original source regions and uncertain overlaps, and reports any merge. Missing references or other overlap layouts still need review. Exact joins between detail windows of one tall image are merged. Gemini is instructed to merge photographed overlaps using context while retaining separate purchases. Every result still requires review.
- A complete numeric Costco row can identify the preceding product title. A title such as `HONEY 1.36KG` or `OLIVE OIL 0.75L` therefore stays a description; its pack measurement is never substituted for the separately printed purchased quantity. Conflicting observed final totals remain in the source text and produce an explicit review warning.
- Item discounts reduce that item's line price. Receipt-wide discounts are apportioned by item net cost before added tax.
- Tax-inclusive prices never receive tax again. Tax rows remain informational. Tax-exclusive receipts use either printed tax adjustments or defined item tax rates, never both. The optional printed tax field checks the calculation.
- For item prices confirmed to exclude tax, choose **Printed tax amount**, then **Add printed tax** to use the amount already in **Printed tax (optional check)**. This explicit action creates one tax adjustment without retyping the amount or inventing a code/rate. Signed amounts stay unchanged. The action is hidden while a tax adjustment exists; review the original before confirming.
- Tax is rounded once per code. The group's minor units are allocated to its items by largest remainder. This reproduces £13.62 VAT and a £176.78 final total for the 18-item Costco demo.
- Other adjustments can follow item costs/ownership or be shared equally among all people. Whole-receipt mode applies its shares to the entire cost and ignores saved item assignments.
- All money uses `bigint` minor units. Prices and weights are parsed as exact decimal strings; no binary floating-point money arithmetic is used. GBP has two decimal places, JPY zero, KWD three, and the other offered currencies use their specified precision.
- IDR and TWD are supported with two minor-unit decimal places. Printed rupiah grouping such as `Rp 36.000` is read as 36000. A single three-place separator without enough currency evidence remains unresolved; the parser keeps the draft editable and asks for correction instead of silently guessing or crashing the scan.
- Final item costs (or the whole receipt) use largest remainder allocation. Highest fractional remainders get the spare minor units; ties follow receipt order and then person creation order. £10/3 is £3.34, £3.33, £3.33. Each component is also explained; any component-to-final rounding redistribution is disclosed and nets to zero across people.
- A signed receipt rounding adjustment must be explicitly entered and labelled. It is never invented to hide a discrepancy.

See [calculation and security report](docs/IMPLEMENTATION_AND_SECURITY.md) for the implementation audit and test evidence.

## Privacy and processing

Receipt images are signature-checked, dimension-checked and decoded locally. On-device scan never uploads them: normalized JPEGs and high-resolution detail windows go to owned local OCR workers. Reader assets load only from the app origin. The stronger reader loads about 50 MB including runtime/code on first use; English compatibility/name checking has a roughly 3 MB language model plus its WASM core. These are software downloads, not per-scan service charges. Runtime cost is device CPU/memory and static asset hosting bandwidth.

Computer mode sends prepared JPEG sections to the local computer server. The server checks their format and bounds, writes them to a dedicated temporary job directory, and removes that directory after success, failure or cancellation. Its worker receives an allowlist of operating-system environment variables, without cloud credentials. Worker output and source-photo references are validated before parsing. Images are not sent to a third party. An abrupt stop can interrupt cleanup. New native OCR jobs record the app and worker owners before any image is written; before the next native worker starts, bounded recovery removes only recognized jobs whose two processes are confirmed absent. Live or uncertain owners, older unmarked jobs, experimental local-vision jobs and unexpected contents remain for operator review. Recovery never terminates a process or selects a cloud reader. See the [recovery implementation and limits](receipt_training/evaluation/NATIVE_JOB_RECOVERY.md). Public-service isolation remains release work. The Python network restriction is an application-level guard, not an operating-system sandbox.

Gemini mode forwards photos through the local server to Google **only after the user explicitly agrees and starts that scan**. Changing photos, order or crops clears that agreement. The local adapter does not log or save images, prompts, results or keys. It requests stateless provider processing, which is separate from Google's own data-use/abuse-monitoring terms. Crop out private footer details first. Google's terms depend on region and account tier. Participant names are not included in extraction requests.

Extracted draft fields and participant names are saved in this origin's browser local storage. Raw OCR/PDF text, photos and original PDFs are not persisted and disappear on refresh/close. Anyone with access to that browser profile can read its stored draft; there is no account authentication. Delete/reset removes this app's saved receipt and its in-memory previews. Exported/downloaded copies remain where you saved or sent them.

Compatibility OCR runs in English. Blur, creases, shadows, abbreviated names and unfamiliar receipt formats can cause mistakes with every reader. Review is required. Missing values stay editable; absent data is not filled merely to make a receipt balance. Gemini also flags a disagreement between its purchase count and a legible printed item count. A balanced total alone does not prove every item is correct.

Upload limits: twelve images/PDF pages, 12 MiB per file and 48 MiB across original files plus prepared PDF page previews, 20,000 pixels per side and 25 megapixels per photo. Full previews are limited to 3,200 pixels/four megapixels. Tall-image windows are up to 1,400×2,200 pixels with at least 18% overlap; at most 24 reading panels are accepted per scan. Computer/Gemini requests are limited to 18 MiB of encoded JSON and responses to 1 MiB. Image decode is bounded to ten seconds; PDF import to sixty seconds. Ordinary reading has a 120-second server/worker deadline plus a small client allowance; long local vision batches share a fifteen-minute job deadline. All readers support cancellation and have no automatic retries. Calculation changes never scan again.

Local OCR text passes `extractionOutputSchema` before parsing. Gemini uses the shared strict `geminiReceiptDraftSchema` on server and client, then the normal receipt schema and exact financial validation. Its draft schema permits bounded comma-grouped monetary strings without converting them; quantities, tax rates, types, keys, photo references and collection limits remain strict. The canonical `aiReceiptSchema` for local vision and the provider's requested output format are unchanged. Neither reader can execute instructions from a receipt. Gemini has no tools, links to fetch or receipt-controlled destinations. Only the server can access its API credential.

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
