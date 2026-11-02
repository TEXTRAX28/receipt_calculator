// Actual image-only PDF import + installed on-device Tesseract UI. No API/config.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const out = resolve(root, "receipt_training/evaluation/runs", run);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const write = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const inputPath = "qa-artifacts/public-scan-v1/page-extraction.json";
const input = await readFile(resolve(root, inputPath));
const documents = JSON.parse(input).documents;
assert.equal(documents.length, 3);
const reference = await readFile(
  resolve(root, "qa-artifacts/public-scan-v1/reference-freeze.json"),
);
assert(JSON.parse(reference).recorded_before_new_ocr);
const sources = {};
async function freeze(name) {
  const bytes = await readFile(resolve(root, name));
  sources[name] = sha(bytes);
  await mkdir(dirname(resolve(out, "source", name)), { recursive: true });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
}
async function folder(name) {
  for (const entry of await readdir(resolve(root, name), {
    withFileTypes: true,
  })) {
    const path = name + "/" + entry.name;
    if (entry.isDirectory()) await folder(path);
    else await freeze(path);
  }
}
await folder("src");
await folder("public/ocr");
for (const name of [
  "index.html",
  "package-lock.json",
  "receipt_training/scripts/benchmark_scanned_pdf.mjs",
])
  await freeze(name);
for (const document of documents) {
  assert(
    document.external_processing_allowed === false &&
      document.original_native_text_characters === 0,
  );
  assert.equal(
    sha(await readFile(resolve(root, document.path))),
    document.sha256,
  );
}
await write("plan.json", {
  scope:
    "Three genuine image-only public PDF pages: two purchase invoices and one payment-only control. Actual current file import and on-device OCR UI. Source references frozen beforehand and never parsed by this runner. Read-only worker message observation retains actual OCR without altering pixels, messages or the draft. One UI read per document, no automatic retries, cloud/model API, financial edits or context hints.",
  documents,
  input_path: inputPath,
  input_sha256: sha(input),
  reference_freeze_sha256: sha(reference),
  source_sha256: sources,
  parent_commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  started_at: new Date().toISOString(),
  pid: process.pid,
  physical_phone: false,
  other_native_models_enabled: false,
});
console.log(JSON.stringify({ started: run, pid: process.pid }));
if (process.argv.includes("--await-observer")) {
  const deadline = Date.now() + 60000;
  while (true) {
    try {
      await readFile(resolve(out, "observer-ready.json"));
      break;
    } catch {}
    assert(
      Date.now() < deadline,
      "Memory observer did not start before the deadline",
    );
    await new Promise((done) => setTimeout(done, 250));
  }
}
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  cacheDir: resolve(out, "vite-cache"),
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
});
let browser;
const cases = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const document of documents) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    // Observe the existing worker result; never intercept or replace a message.
    await context.addInitScript(() => {
      globalThis.__scanOcrReads = [];
      globalThis.__scanObserverErrors = [];
      const OriginalWorker = globalThis.Worker;
      globalThis.Worker = new Proxy(OriginalWorker, {
        construct(target, args, newTarget) {
          const worker = Reflect.construct(target, args, newTarget);
          worker.addEventListener("message", (event) => {
            const payload = event.data;
            if (
              payload?.action !== "recognize" ||
              payload?.status !== "resolve"
            )
              return;
            try {
              const text = JSON.stringify(payload.data);
              if (
                text.length > 2 * 1024 * 1024 ||
                globalThis.__scanOcrReads.length >= 24
              )
                throw new Error("Observation limit");
              globalThis.__scanOcrReads.push(JSON.parse(text));
            } catch {
              globalThis.__scanObserverErrors.push(
                "Could not retain a bounded OCR observation",
              );
            }
          });
          return worker;
        },
      });
    });
    const requests = { writes: [], external: [], local_heads: [] };
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (!["GET", "HEAD"].includes(request.method())) {
        requests.writes.push({ method: request.method(), path: url.pathname });
        return route.abort();
      }
      if (url.origin !== origin) {
        requests.external.push(url.origin);
        return route.abort();
      }
      if (request.method() === "HEAD") requests.local_heads.push(url.pathname);
      if (url.pathname === "/api/receipts/providers")
        return route.fulfill({
          json: {
            localModel: { configured: false },
            localVision: { configured: false },
          },
        });
      return route.continue();
    });
    const page = await context.newPage();
    const result = {
      id: document.id,
      input_sha256: document.sha256,
      requests,
      error: null,
    };
    try {
      await page.goto(origin);
      const started = performance.now();
      await page
        .getByLabel("Upload receipt images")
        .setInputFiles(resolve(root, document.path));
      await page.waitForFunction(
        () => document.querySelectorAll(".selected-image").length === 1,
        undefined,
        { timeout: 65000 },
      );
      assert.equal(
        await page
          .getByRole("button", { name: "PDF text", exact: true })
          .count(),
        0,
      );
      await page
        .getByRole("button", { name: "On-device", exact: true })
        .click();
      await page
        .getByRole("button", {
          name: "Read receipt on this device",
          exact: true,
        })
        .click();
      await page.waitForFunction(
        () => {
          try {
            return (
              document.querySelector(".inline-error[role=alert]") ||
              JSON.parse(localStorage.getItem("gather.receipt.v1") || "null")
                ?.step === "review"
            );
          } catch {
            return false;
          }
        },
        undefined,
        { timeout: 150000 },
      );
      result.elapsed_ms = Math.round(performance.now() - started);
      result.state = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")),
      );
      if (result.state?.step !== "review")
        throw new Error(
          await page.locator(".inline-error[role=alert]").innerText(),
        );
      result.ocr = await page.evaluate(() => ({
        reads: globalThis.__scanOcrReads,
        errors: globalThis.__scanObserverErrors,
      }));
      assert(result.ocr.reads.length > 0 && !result.ocr.errors.length);
      result.has_horizontal_overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      result.confirm_enabled = await page
        .getByRole("button", {
          name: "Confirm receipt & add people",
          exact: true,
        })
        .isEnabled();
      await writeFile(
        resolve(out, document.id + "-review.txt"),
        await page.locator("body").innerText(),
        { flag: "wx" },
      );
      await page.screenshot({
        path: resolve(out, document.id + "-review.png"),
        fullPage: true,
      });
      assert.equal(result.state.receipt.rawText, "");
      assert.deepEqual(requests.writes, []);
      assert.deepEqual(requests.external, []);
    } catch (error) {
      result.error = String(error).slice(0, 500);
      result.ocr = await page
        .evaluate(() => ({
          reads: globalThis.__scanOcrReads,
          errors: globalThis.__scanObserverErrors,
        }))
        .catch(() => null);
      await writeFile(
        resolve(out, document.id + "-error.txt"),
        await page.locator("body").innerText(),
        { flag: "wx" },
      );
      await page.screenshot({
        path: resolve(out, document.id + "-error.png"),
        fullPage: true,
      });
    } finally {
      await write(document.id + ".json", result);
      cases.push({
        id: document.id,
        error: result.error,
        elapsed_ms: result.elapsed_ms,
        purchases: result.state?.receipt?.items?.length,
        ocr_sections: result.ocr?.reads?.length,
        confirm_enabled: result.confirm_enabled,
        writes: requests.writes.length,
        external: requests.external.length,
      });
      console.log(JSON.stringify(cases.at(-1)));
      await context.close();
    }
  }
  await write("metadata.json", {
    cases,
    source_sha256: sources,
    source_unchanged: (
      await Promise.all(
        Object.entries(sources).map(
          async ([name, digest]) =>
            sha(await readFile(resolve(root, name))) === digest,
        ),
      )
    ).every(Boolean),
    browser: browser.version(),
    completed_at: new Date().toISOString(),
    external_receipt_uploads: 0,
    model_api_calls: 0,
    automatic_retries: 0,
    timing_scope:
      "Three serial 390px local Chrome observations: PDF import, rendered-image preparation, browser Tesseract, parsing, source checks and review persistence. Browser/server startup excluded; not a physical phone, p95, or controlled model comparison.",
  });
  if (cases.some((item) => item.error)) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
