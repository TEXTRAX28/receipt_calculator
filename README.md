# Gather

Gather reads receipt photos and rendered PDF pages with OpenAI and turns them into an editable receipt. Check the purchases and totals, add people, and split the whole bill or assign individual items. Manual entry, pasted receipt text and the Costco demo work without API access.

## Install and run

Use Node.js 22.13 or later and npm.

1. Run npm ci.
2. Copy [.env.example](.env.example) to .env.local in the project directory.
3. Set OPENAI_API_KEY to a server-side OpenAI project key with access to gpt-6-astra. Set OPENAI_ALLOWANCE_ID to a stable identifier of 8–80 letters, numbers, underscores or hyphens. Set OPENAI_REQUEST_LIMIT to the number of attempts to allow, from 1 to 100.
4. Run npm run build and then npm start. Open [Gather on this PC](http://127.0.0.1:4175/).

Use npm run dev for development at [port 5175](http://127.0.0.1:5175/). On Windows, use npm.cmd if PowerShell blocks npm.ps1. The production command serves the built site and the same-origin API over loopback using Node. It works with npm ci --omit=dev after building. Use npm start -- --port 4188 to select another free loopback port.

Environment variables take precedence over .env.local. An existing OPEN_AI_KEY also works as an alias. Keep keys in the ignored settings file or a server-side secret store. Keep the allowance ID and directory stable across restarts. The default directory is .receipt-reader-state/openai. An allowance counts attempted submissions, including provider failures and cancellations after reservation. It applies independently of account billing. Gather estimates the maximum cost of each request against US$0.60, and OpenAI bills actual usage.

The included server is for a local installation. It binds to loopback and has no public account or authentication system. Keep it off public networks. For a temporary private phone test, start the app on your PC, connect the phone to the same network, and run npm run preview:phone. This command requires OpenSSL and prints the HTTPS preview, certificate download and local pairing-code file. Install and trust the test certificate on the phone. The preview expires after eight hours. [Apple’s certificate trust guide](https://support.apple.com/en-us/102390)

## Scanning and privacy

1. Upload or photograph a receipt. For a long receipt, take overlapping photos in order from top to bottom. Crop out membership and payment details.
2. Review the disclosure, then authorize the scan. Gather sends prepared JPEG sections from the selected images or PDF pages to OpenAI through the local server. The original PDF and participant names stay in the browser.
3. Compare the digital receipt with the originals. Tap a row or amount to correct it. Continue opens, scrolls to and focuses the first blocking field.
4. Add people and choose a split. Review and export the per-person totals.

Gather requests store: false from OpenAI. OpenAI API content is excluded from model training by default unless the account opts in. Provider safety logging, caching and regional processing are governed by OpenAI's API policy. [OpenAI API data controls](https://developers.openai.com/api/docs/guides/your-data)

The browser saves the editable draft and participant names locally. Photos and pasted text clear on refresh. Delete / reset receipt clears the saved draft and active photos. The server keeps a minimal allowance record with a generated request ID and outcome. The scan does not automatically retry. If it fails, the photos remain available for a new attempt or manual entry.

Supported uploads are JPEG, PNG, still WebP and PDF, up to 12 MiB per file and 12 images or pages per receipt. The browser checks signatures and image dimensions and renders PDF pages locally. The API accepts up to 24 prepared JPEG sections and 18 MiB of JSON. The server allows one scan at a time, two submissions per minute and ten per hour, with a 15-second upload deadline and a 90-second OpenAI deadline.

## Checks

    npm run typecheck
    npm run format:check
    npm test
    npm run build
    npx playwright install chromium
    npm run test:e2e

Browser tests use desktop and iPhone-sized Chromium contexts. To use installed Google Chrome, set GATHER_TEST_CHROME to 1. Optional WebKit coverage uses npm run test:e2e:webkit after installing Playwright WebKit. Tests disable provider credentials and use synthetic OpenAI responses to check the flow and calculation. See the [implementation and security notes](docs/IMPLEMENTATION_AND_SECURITY.md) for the hands-on checks.
