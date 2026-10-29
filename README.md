# Gather

A receipt scanner and bill splitter built on React, TypeScript and Vite. Choose private on-device English OCR, or an optional Gemini reader that sees the receipt's photographs together. All calculations and splitting run in the browser. Participants need no accounts.

## Run locally

Use Node.js 24 LTS (22.12+ supported) and npm.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173/`.

The install, development and build scripts copy the OCR worker, English language data and WASM cores from installed packages to ignored `public/ocr/`. If those generated assets are missing:

```sh
npm run prepare:ocr
```

For a production build and local preview:

```sh
npm run build
npm run preview -- --port 4173
```

On-device OCR needs no API key, paid service, database or account. Keep the local server running while using the app: an already-loaded page still needs it to download the OCR files. Nothing has been deployed or published.

## Optional Gemini setup

1. Create an API key in [Google AI Studio](https://aistudio.google.com/apikey). Access to the Gemini chat app is separate from API access.
2. Copy `.env.example` to `.env.local`, then put the key after `GEMINI_API_KEY=`. A blank, ignored `.env.local` has been prepared for this workspace. **Never use a `VITE_` prefix for a secret.**
3. Restart `npm run dev` or the local preview, reload Gather, and select **Gemini AI**. The default model is `gemini-3.8-flash`; `GEMINI_MODEL` can select another model available to your project.
4. Select and order the receipt photos, crop out membership/payment details, agree to sending them to Google, then choose **Read receipt with Gemini**.

The local server sends the ordered sections in one Gemini Interactions request using structured JSON output and `store: false`. It validates the result before creating an editable draft. The model is instructed to match overlapping rows using layout/context, preserve genuine repeated purchases, attach item-specific deductions, and read the printed VAT legend. The browser's existing exact calculation engine checks the draft; Gemini does not decide whether it balances.

Google currently lists a free tier for Gemini 3.8 Flash, subject to account/model limits. Check your own [API limits and pricing](https://ai.google.dev/gemini-api/docs/pricing) before enabling billing or selecting another model. Google's [terms](https://ai.google.dev/gemini-api/terms) require Paid Services when making API clients available to users in the UK/EEA/Switzerland. This local adapter is for development/testing, binds to loopback, checks host/origin and processing consent, and allows one active scan, two attempts per minute and ten per hour. Publishing it needs a proper authenticated server, hosting/TLS and deployment review. Static hosting alone cannot provide the Gemini endpoint.

No API key is configured or live Gemini accuracy claimed in the verification record. API and UI protocol tests use a clearly identified synthetic response. Test real receipt extraction after supplying your own key; no private receipt has been sent to Google during development.

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
- The parser reads printed tax legends and preserves unfamiliar codes for correction. Costco A/Z are prefilled only when Costco is recognized; without a legend, the app explicitly asks you to confirm those rates. Define any other code from the receipt yourself.
- The on-device parser attaches separate Costco discount lines to the preceding purchase and flags them for checking. Unclear generic discounts remain editable receipt-wide adjustments. Repeated purchases across different photos are preserved for manual review. Exact joins between detail windows of one tall image are merged. Gemini is instructed to merge photographed overlaps using context while retaining separate purchases. Its result still requires review.
- Item discounts reduce that item's line price. Receipt-wide discounts are apportioned by item net cost before added tax.
- Tax-inclusive prices never receive tax again. Tax rows remain informational. Tax-exclusive receipts use either printed tax adjustments or defined item tax rates, never both. The optional printed tax field checks the calculation.
- Tax is rounded once per code. The group's minor units are allocated to its items by largest remainder. This reproduces £13.62 VAT and a £176.78 final total for the 18-item Costco demo.
- Other adjustments can follow item costs/ownership or be shared equally among all people. Whole-receipt mode applies its shares to the entire cost and ignores saved item assignments.
- All money uses `bigint` minor units. Prices and weights are parsed as exact decimal strings; no binary floating-point money arithmetic is used. GBP has two decimal places, JPY zero, KWD three, and the other offered currencies use their specified precision.
- Final item costs (or the whole receipt) use largest remainder allocation. Highest fractional remainders get the spare minor units; ties follow receipt order and then person creation order. £10/3 is £3.34, £3.33, £3.33. Each component is also explained; any component-to-final rounding redistribution is disclosed and nets to zero across people.
- A signed receipt rounding adjustment must be explicitly entered and labelled. It is never invented to hide a discrepancy.

See [calculation and security report](docs/IMPLEMENTATION_AND_SECURITY.md) for the implementation audit and test evidence.

## Privacy and processing

Receipt images are signature-checked, dimension-checked and decoded locally. On-device mode never uploads them: normalized JPEGs and high-resolution detail windows go to the local OCR worker. The app fetches its OCR assets from its own origin. The English model is about 3 MB compressed, plus the chosen WASM core; these are software downloads, not per-scan service charges. Runtime cost is device CPU/memory and static asset hosting bandwidth.

Gemini mode forwards photos through the local server to Google **only after the user explicitly agrees and starts that scan**. Changing photos, order or crops clears that agreement. The local adapter does not log or save images, prompts, results or keys. It requests stateless provider processing, which is separate from Google's own data-use/abuse-monitoring terms. Crop out private footer details first. Google's terms depend on region and account tier. Participant names are not included in extraction requests.

Extracted draft fields and participant names are saved in this origin's browser local storage. Raw OCR text and photos are not persisted and disappear on refresh/close. Anyone with access to that browser profile can read its stored draft; there is no account authentication. Delete/reset removes this app's saved receipt and its in-memory previews. Exported/downloaded copies remain where you saved or sent them.

On-device OCR runs in English. Blur, creases, shadows, abbreviated names and unfamiliar receipt formats can cause mistakes with either reader. Review is required. Missing values stay editable; absent data is not filled merely to make a receipt balance. Gemini also flags a disagreement between its purchase count and a legible printed item count. A balanced total alone does not prove every item is correct.

Upload limits: twelve photos, 12 MiB each, 48 MiB of original photos per receipt, 20,000 pixels per side and 25 megapixels per photo. Full previews are limited to 3,200 pixels/four megapixels. Tall-image windows are up to 1,400×2,200 pixels with at least 18% overlap; at most 24 reading panels are accepted per scan. Gemini requests are limited to 18 MiB of encoded JSON and responses to 1 MiB. Decode is bounded to ten seconds; reading has a 120-second server/worker deadline plus a small client allowance. Both readers support cancellation and have no automatic retries. Calculation changes never scan again.

Local OCR text passes `extractionOutputSchema` before parsing. Gemini uses the shared strict `aiReceiptSchema` on server and client, then the normal receipt schema and exact financial validation. Neither reader can execute instructions from a receipt. Gemini has no tools, links to fetch or receipt-controlled destinations. Only the server can access its API credential.

## Tests and development

```sh
npm run typecheck
npm test
npm run test:e2e
npm run format:check
npm audit
```

The browser suite expects installed Google Chrome (`channel: chrome`) and uses desktop and iPhone-sized Chromium contexts. On a machine without Chrome, install Chrome or change the configuration to use Playwright Chromium and install it with `npx playwright install chromium`. `npm run test:e2e` serves the existing production build on port 4173, so run `npm run build` first. It can reuse an existing preview on that port. Unit tests include seeded property checks for 2,500 generated allocation cases. OCR unit tests exercise bad outputs, missing assets, cancellation and timeouts; browser tests perform actual OCR as well as manual and sharing workflows.

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
