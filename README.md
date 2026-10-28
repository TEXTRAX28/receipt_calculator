# Gather

A private, account-free receipt scanner and bill splitter. Built on React, TypeScript and Vite, with real Tesseract OCR running inside the browser. No backend or external AI service is required.

## Run locally

Use Node.js 24 LTS (22.12+ supported) and npm.

```sh
npm ci
npm run dev
```

Open the Local URL printed by Vite, normally `http://127.0.0.1:5173/`.

The install script copies the OCR worker, English language data and WASM cores from installed packages to ignored `public/ocr/`. If those generated assets are missing:

```sh
npm run prepare:ocr
```

For a production build and local preview:

```sh
npm run build
npm run preview -- --port 4173
```

No API keys, paid services, database, account or environment variables are required. `.env.example` documents this intentionally empty configuration. Nothing has been deployed or published.

## Use it

1. Upload up to three JPEG, PNG or still WebP images, take a photo on a supported phone, paste receipt text, or enter items manually. Use **Crop** to trim background while preserving the original for review. Choose **Try the Costco demo** for a clearly labelled manual transcription, not a simulated scan.
2. Check the original photo and every extracted field. Correct missing quantities, discounts, tax codes and totals. Confirm only after the arithmetic matches the printed receipt.
3. Add names. Duplicate names work because people have separate internal identifiers.
4. Tick the people sharing each item, or select physical quantities, ratios or percentages. Alternatively, split the entire receipt.
5. Finalize and open each person's breakdown. Copy or download a plain-text summary.

Purchase quantities and pack contents are separate. A receipt showing `1x` for an eight-can pack means **one purchased pack**. In quantity mode, confirm eight units per pack, then allocate all eight cans. A ratio of 1:3:5 describes nine cost shares; it can divide an eight-can pack's cost without claiming nine physical cans.

Drafts may be incomplete. Finalization requires a balanced, confirmed receipt, valid positive shares, resolved charges, and complete item or whole-receipt assignments. Changing a financial field requires another review. Removing a person clears their assignments and recalculates remaining shares. A second tab's changes stop this tab from overwriting the stored draft; export your version before reloading.

## Tax, discounts and pennies

- For the supplied UK Costco receipt, A means 20% VAT and Z means 0%. `2.00-Z` is a £2 deduction associated with a zero-rated item. `-A` identifies a deduction in the A category. These are merchant-specific codes, not universal retailer rules.
- The parser reads printed tax legends and preserves unfamiliar codes for correction. Costco A/Z are prefilled only when Costco is recognized; without a legend, the app explicitly asks you to confirm those rates. Define any other code from the receipt yourself.
- Separate Costco discount lines are attached to the preceding purchase and flagged for checking. Unclear generic discounts remain editable receipt-wide adjustments. Repeated items are preserved, including overlapping photo captures; review and remove only actual duplicate captures.
- Item discounts reduce that item's line price. Receipt-wide discounts are apportioned by item net cost before added tax.
- Tax-inclusive prices never receive tax again. Tax rows remain informational. Tax-exclusive receipts use either printed tax adjustments or defined item tax rates, never both. The optional printed tax field checks the calculation.
- Tax is rounded once per code. The group's minor units are allocated to its items by largest remainder. This reproduces £13.62 VAT and a £176.78 final total for the 18-item Costco demo.
- Other adjustments can follow item costs/ownership or be shared equally among all people. Whole-receipt mode applies its shares to the entire cost and ignores saved item assignments.
- All money uses `bigint` minor units. Prices and weights are parsed as exact decimal strings; no binary floating-point money arithmetic is used. GBP has two decimal places, JPY zero, KWD three, and the other offered currencies use their specified precision.
- Final item costs (or the whole receipt) use largest remainder allocation. Highest fractional remainders get the spare minor units; ties follow receipt order and then person creation order. £10/3 is £3.34, £3.33, £3.33. Each component is also explained; any component-to-final rounding redistribution is disclosed and nets to zero across people.
- A signed receipt rounding adjustment must be explicitly entered and labelled. It is never invented to hide a discrepancy.

See [calculation and security report](docs/IMPLEMENTATION_AND_SECURITY.md) for the implementation audit and test evidence.

## Privacy and processing

Receipt images are signature-checked, dimension-checked and decoded locally. A normalized JPEG is kept in memory and passed to the OCR worker; receipt images and text are **not uploaded**. The app fetches its OCR assets from its own origin. The English model is about 3 MB compressed, plus the chosen WASM core; these are software downloads, not per-scan service charges. Runtime cost is device CPU/memory and static asset hosting bandwidth.

Extracted draft fields and participant names are saved in this origin's browser local storage. Raw OCR text and photos are not persisted and disappear on refresh/close. Anyone with access to that browser profile can read its stored draft; there is no account authentication. Delete/reset removes this app's saved receipt and its in-memory previews. Exported/downloaded copies remain where you saved or sent them.

OCR runs in English. Blur, creases, shadows, abbreviated names and unfamiliar receipt formats can cause mistakes. Review is required. The merchant-independent parser is conservative and is not a universal receipt recognizer. Where it cannot identify quantities or totals, the app highlights the uncertainty and supports manual correction. Multi-photo scans retain all purchase rows and warn about overlaps.

Upload limits: three images, 12 MiB each, at most 20,000 pixels per side and 25 megapixels per image. OCR inputs are reduced to at most 3,200 pixels on the long edge and four megapixels. Image decode is bounded to ten seconds; the whole OCR batch has a 120-second deadline, cancellation, and no automatic retry loop. Calculation changes never call OCR again.

The provider boundary is `ExtractionProvider.extract(images, signal, progress)`. Its result must pass `extractionOutputSchema` before parsing. An external provider would need a separate server-side adapter, secret storage, explicit processing disclosure and privacy review; do not put API keys in frontend environment variables. The shipped app has no LLM, tool execution, outbound receipt API or remote receipt storage.

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
- `src/lib/images.ts` and `ocr.ts`: bounded local image validation and replaceable extraction.
- `src/lib/model.ts`, `storage.ts`, `summary.ts`: schemas, private draft persistence and export.
- `src/App.tsx`, `styles.css`, `theme.css`: responsive workflow, review, sharing and accessible UI.
- `tests/`: calculation, parsing, privacy, robustness, real OCR and browser journey checks.

The project started empty. The existing cross-project knowledge graph had no Gather/costco_calc entries; implementation and report references were verified directly against the new source rather than inferred from that graph.
