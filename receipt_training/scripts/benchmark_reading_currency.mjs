// One local-only paired development check through the real UI. No labels are
// loaded here; frozen responses are scored separately after both readings.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const target = new URL(process.argv[2] || "http://127.0.0.1:5174/");
const readerMode = process.argv[4] || "vision";
if (!["vision", "computer"].includes(readerMode))
  throw new Error("Choose vision or computer");
const endpoint =
  readerMode === "vision" ? "/api/receipts/vision" : "/api/receipts/recognize";
if (
  target.protocol !== "http:" ||
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  target.username ||
  target.password ||
  target.pathname !== "/" ||
  target.search ||
  target.hash
)
  throw new Error("Use a bare loopback development URL only");
const run = process.argv[3];
if (!run || !/^[\w-]+$/.test(run))
  throw new Error("Choose a new local run name");
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const remember = {};
await mkdir(resolve(out, "source"));
async function snapshot(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const name = folder + "/" + entry.name;
    if (entry.isDirectory()) await snapshot(name);
    else if (/[.](?:ts|tsx|mjs|css)$/.test(name)) {
      const bytes = await readFile(resolve(root, name));
      remember[name] = sha(bytes);
      const destination = resolve(out, "source", name);
      await mkdir(resolve(destination, ".."), { recursive: true });
      await writeFile(destination, bytes, { flag: "wx" });
    }
  }
}
await snapshot("src");
await snapshot("server");
for (const name of [
  "package-lock.json",
  "vite.config.ts",
  "receipt_training/scripts/benchmark_reading_currency.mjs",
]) {
  const bytes = await readFile(resolve(root, name));
  remember[name] = sha(bytes);
  const destination = resolve(out, "source", name);
  await mkdir(resolve(destination, ".."), { recursive: true });
  await writeFile(destination, bytes, { flag: "wx" });
}
const manifest = await readFile(
  resolve(root, "receipt_training/manifest.jsonl"),
);
const record = manifest
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse)
  .find((entry) => entry.receipt_id === "cord-v2-train-004");
if (
  !record ||
  record.split !== "development" ||
  record.external_processing_allowed !== false
)
  throw new Error(
    "This check is restricted to the original local-only development case",
  );
const input = resolve(root, "receipt_training", record.file_path);
if (sha(await readFile(input)) !== record.sha256)
  throw new Error("Source image changed");
const meta = {
  scope:
    "One previously measured, source-informed development transaction, paired on identical prepared pixels. User-selected IDR context is given to the second reading, not extraction ground truth. Not a blind holdout or phone performance sample.",
  receipt_id: record.receipt_id,
  reader_mode: readerMode,
  currency_context_sent_to_model: false,
  image_sha256: record.sha256,
  manifest_sha256: sha(manifest),
  source_sha256: remember,
  external_requests: 0,
  blocked_requests: [],
  cases: [],
  started_at: new Date().toISOString(),
};
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const currency of [null, "IDR"]) {
    const tag = currency ? "selected-idr" : "automatic";
    const attempt = { currency_context: currency, model_http_requests: 0 };
    meta.cases.push(attempt);
    const context = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    });
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    const requests = [];
    await page.route("**/*", async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (
        url.origin !== target.origin ||
        (request.method() !== "GET" &&
          !(request.method() === "POST" && url.pathname === endpoint))
      ) {
        meta.blocked_requests.push({
          method: request.method(),
          origin: url.origin,
          path: url.pathname,
        });
        return route.abort();
      }
      if (request.method() === "POST") {
        requests.push(request);
        attempt.model_http_requests = requests.length;
      }
      return route.continue();
    });
    await page.goto(target.href);
    await page.getByLabel("Upload receipt images").setInputFiles(input);
    await page
      .getByRole("button", {
        name: readerMode === "vision" ? "Local vision" : "This computer",
        exact: true,
      })
      .click();
    await page
      .getByRole("combobox", {
        name: "Receipt currency (optional)",
        exact: true,
      })
      .selectOption(currency || "");
    const received = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === endpoint &&
        response.request().method() === "POST",
      { timeout: 135000 },
    );
    const began = performance.now();
    await page
      .getByRole("button", {
        name:
          readerMode === "vision"
            ? "Read receipt with local vision"
            : "Read receipt on this computer",
        exact: true,
      })
      .click();
    const response = await received;
    const bytes = await response.body();
    const elapsed = Math.round(performance.now() - began);
    if (requests.length !== 1)
      throw new Error("Expected exactly one local model request");
    const wire = requests[0].postData(),
      body = JSON.parse(wire);
    if (JSON.stringify(body.context || null) !== JSON.stringify(null))
      throw new Error(
        "The selected reading currency did not reach the request",
      );
    const panels = body.panels.map((panel, index) => {
      const image = Buffer.from(panel.data, "base64");
      return {
        photo: panel.photo,
        part: panel.part,
        sha256: sha(image),
        bytes: image.length,
        file: `panel-${index + 1}.jpg`,
      };
    });
    if (
      meta.cases.length > 1 &&
      JSON.stringify(panels) !== JSON.stringify(meta.cases[0].panels)
    )
      throw new Error(
        "The counterfactual did not receive identical prepared image bytes",
      );
    if (meta.cases.length === 1)
      for (const [index, panel] of body.panels.entries())
        await writeFile(
          resolve(out, `panel-${index + 1}.jpg`),
          Buffer.from(panel.data, "base64"),
          { flag: "wx" },
        );
    await writeFile(resolve(out, `${tag}-response.json`), bytes, {
      flag: "wx",
    });
    const value = {
      currency_context: currency,
      http_status: response.status(),
      response_sha256: sha(bytes),
      request_sha256: sha(Buffer.from(wire)),
      panels,
      elapsed_ms: elapsed,
      model_http_requests: requests.length,
      timing_scope:
        "Browser click through actual loopback response; includes preparation, model loading/inference and transport on this host with existing caches. No p95 claim.",
    };
    Object.assign(attempt, value);
    if (!response.ok()) {
      value.error = "Local reader did not return a successful draft; no retry";
      attempt.error = value.error;
      meta.error = value.error;
      process.exitCode = 1;
      await context.close();
      break;
    }
    await page
      .getByRole("textbox", { name: "Printed total", exact: true })
      .waitFor();
    await page.waitForFunction(
      (expectedSource) =>
        Object.values(localStorage).some((text) => {
          try {
            const state = JSON.parse(text);
            return (
              state?.version === 1 &&
              state.receipt?.source === expectedSource &&
              state.receipt.items.length > 0
            );
          } catch {
            return false;
          }
        }),
      readerMode === "vision" ? "ai" : "ocr",
    );
    const observed = await page.evaluate(async () => {
      const state = Object.values(localStorage)
        .map((text) => {
          try {
            return JSON.parse(text);
          } catch {
            return null;
          }
        })
        .find((entry) => entry?.version === 1 && entry.receipt?.items);
      if (!state) throw new Error("The actual app draft was not saved");
      const { calculateReceipt } = await import("/src/lib/engine.ts");
      return JSON.parse(
        JSON.stringify(
          {
            receipt: state.receipt,
            calculation: calculateReceipt(state.receipt),
          },
          (_key, value) =>
            typeof value === "bigint" ? value.toString() : value,
        ),
      );
    });
    const observedBytes = Buffer.from(JSON.stringify(observed, null, 2) + "\n");
    await writeFile(resolve(out, `${tag}-app-draft.json`), observedBytes, {
      flag: "wx",
    });
    value.app_draft_sha256 = sha(observedBytes);
    attempt.app_draft_sha256 = value.app_draft_sha256;
    await page.screenshot({
      path: resolve(out, `${tag}-review.png`),
      fullPage: true,
    });
    await context.close();
  }
  for (const [name, hash] of Object.entries(remember))
    if (sha(await readFile(resolve(root, name))) !== hash)
      throw new Error("Sources changed during the paired local check");
  meta.source_unchanged = true;
} catch (error) {
  meta.error = error.message;
  process.exitCode = 1;
} finally {
  await browser.close();
  meta.completed_at = new Date().toISOString();
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(meta, null, 2) + "\n",
    { flag: "wx" },
  );
}
console.log(
  JSON.stringify({
    output: relative(root, out),
    local_model_requests: meta.cases.reduce(
      (sum, item) => sum + item.model_http_requests,
      0,
    ),
    completed_cases: meta.cases.filter((item) => item.app_draft_sha256).length,
    external_requests: 0,
    error: meta.error,
  }),
);
