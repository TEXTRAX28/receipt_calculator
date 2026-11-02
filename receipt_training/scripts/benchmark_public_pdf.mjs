// Actual local PDF import/read UI. No cloud/config loading, OCR, labels or model calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2] || "public-digital-v1";
const review = process.argv.includes("--review");
assert(/^[\w-]+$/.test(run));
const out = resolve(root, "qa-artifacts", run, "browser");
await mkdir(dirname(out), { recursive: true });
await mkdir(out);
const sha = (value) => createHash("sha256").update(value).digest("hex");
const write = (name, data) =>
  writeFile(resolve(out, name), JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
const input = await readFile(
  resolve(root, "qa-artifacts/public-digital-v1/page-extraction.json"),
);
const documents = JSON.parse(input).documents;
assert(
  documents.length === 2 &&
    documents.every((item) => item.external_processing_allowed === false),
);
const sources = {};
async function freeze(name) {
  const bytes = await readFile(resolve(root, name));
  sources[name] = sha(bytes);
  const path = resolve(out, "source", name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}
async function folder(name) {
  for (const entry of await readdir(resolve(root, name), {
    withFileTypes: true,
  })) {
    const path = name + "/" + entry.name;
    if (entry.isDirectory()) await folder(path);
    else if (/\.(ts|tsx|mjs|css|json)$/.test(path)) await freeze(path);
  }
}
await folder("src");
for (const name of [
  "index.html",
  "package-lock.json",
  "receipt_training/scripts/benchmark_public_pdf.mjs",
])
  await freeze(name);
for (const document of documents)
  assert.equal(
    sha(await readFile(resolve(root, document.path))),
    document.sha256,
  );
await write("plan.json", {
  scope:
    "Two public council-published paid invoices, complete original invoice pages. Actual current local PDF UI and embedded-text reader, with frozen current source. No model inference, source hints, label-derived edits, cloud requests or retries. New supplementary documents, separate from the original fifty.",
  review_workflow: review,
  documents,
  source_sha256: sources,
  input_sha256: sha(input),
  parent_commit: execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim(),
  started_at: new Date().toISOString(),
  native_model_calls: 0,
});
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  cacheDir: resolve(out, "vite-cache"),
  server: {
    host: "127.0.0.1",
    port: 5279,
    strictPort: true,
    hmr: false,
    watch: null,
  },
});
let browser;
const cases = [];
try {
  await server.listen();
  const origin = "http://127.0.0.1:5279";
  browser = await chromium.launch({ channel: "chrome", headless: true });
  for (const document of documents) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    const page = await context.newPage();
    const requests = { posts: [], external: [] };
    await context.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (request.method() !== "GET") {
        requests.posts.push(url.pathname);
        return route.abort();
      }
      if (url.origin !== origin) {
        requests.external.push(url.origin);
        return route.abort();
      }
      if (url.pathname === "/api/receipts/providers")
        return route.fulfill({
          json: {
            localModel: { configured: false },
            localVision: { configured: false },
          },
        });
      return route.continue();
    });
    const result = {
      id: document.id,
      pages: document.pages,
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
        (count) =>
          document.querySelectorAll(".selected-image").length === count,
        document.pages,
        { timeout: 65000 },
      );
      const read = page.getByRole("button", {
        name: "Read PDF text on this device",
        exact: true,
      });
      await read.waitFor({ state: "visible", timeout: 10000 });
      await read.click();
      await page.waitForFunction(
        () => {
          try {
            return (
              JSON.parse(localStorage.getItem("gather.receipt.v1") || "null")
                ?.step === "review"
            );
          } catch {
            return false;
          }
        },
        undefined,
        { timeout: 65000 },
      );
      result.elapsed_ms = Math.round(performance.now() - started);
      result.state = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")),
      );
      result.has_horizontal_overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      );
      result.confirm_enabled = await page
        .getByRole("button", {
          name: "Confirm receipt & add people",
          exact: true,
        })
        .isEnabled();
      await page.screenshot({
        path: resolve(out, document.id + "-review.png"),
        fullPage: true,
      });
      assert.equal(result.state.receipt.rawText, "");
      if (review) {
        // Exercise the human review controls; this automation is not independent
        // human validation and never edits an extracted financial field.
        result.source_views = [];
        for (
          let index = 1;
          index <= result.state.receipt.items.length;
          index++
        ) {
          await page
            .getByRole("button", {
              name: `View source for item ${index}`,
              exact: true,
            })
            .click();
          const regions = await page.getByTestId("source-region").count();
          assert(regions > 0);
          result.source_views.push({ item: index, regions });
          await page.getByRole("dialog").screenshot({
            path: resolve(out, document.id + `-source-${index}.png`),
          });
          await page
            .getByRole("button", { name: "Close dialog", exact: true })
            .click();
        }
        for (const box of await page
          .getByRole("checkbox", { name: /^I checked / })
          .all())
          await box.check();
        result.reviewed_state = await page.evaluate(() =>
          JSON.parse(localStorage.getItem("gather.receipt.v1")),
        );
        const financial = ({ reviewChecks, ...receipt }) => receipt;
        assert.deepEqual(
          financial(result.reviewed_state.receipt),
          financial(result.state.receipt),
        );
        const confirm = page.getByRole("button", {
          name: "Confirm receipt & add people",
          exact: true,
        });
        result.reviewed_confirm_enabled = await confirm.isEnabled();
        await page.screenshot({
          path: resolve(out, document.id + "-checked.png"),
          fullPage: true,
        });
        if (result.reviewed_confirm_enabled) {
          await confirm.click();
          for (const name of ["Alice", "Bob"]) {
            await page
              .getByRole("textbox", { name: "Person’s name", exact: true })
              .fill(name);
            await page
              .getByRole("button", { name: "Add person", exact: true })
              .click();
          }
          await page
            .getByRole("button", { name: "Let’s share it", exact: true })
            .click();
          await page
            .getByRole("button", { name: "Whole receipt", exact: true })
            .click();
          for (const box of await page
            .getByTestId("whole-assignment")
            .getByRole("checkbox")
            .all())
            await box.check();
          await page
            .getByRole("button", { name: "Finalize split", exact: true })
            .click();
          result.person_totals = await Promise.all(
            [0, 1].map((index) =>
              page.getByTestId(`person-total-${index}`).innerText(),
            ),
          );
          result.final_state = await page.evaluate(() =>
            JSON.parse(localStorage.getItem("gather.receipt.v1")),
          );
          assert.equal(result.final_state.step, "summary");
          assert.deepEqual(
            financial(result.final_state.receipt),
            financial(result.state.receipt),
          );
          await page.screenshot({
            path: resolve(out, document.id + "-split.png"),
            fullPage: true,
          });
        }
        result.reviewed_horizontal_overflow = await page.evaluate(
          () => document.documentElement.scrollWidth > innerWidth,
        );
      }
      assert.deepEqual(requests, { posts: [], external: [] });
    } catch (error) {
      result.error = String(error).slice(0, 500);
      await writeFile(
        resolve(out, document.id + "-page.txt"),
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
        id: result.id,
        error: result.error,
        elapsed_ms: result.elapsed_ms,
        purchases: result.state?.receipt?.items?.length,
        confirm_enabled: result.confirm_enabled,
        posts: requests.posts.length,
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
    cloud_requests: 0,
    native_model_calls: 0,
    automatic_retries: 0,
    physical_phone: false,
    timing_scope:
      "One local 390px Chromium run per document: upload/PDF preparation, text parsing, review and persistence. Vite/browser startup excluded; not physical-phone performance or a model-latency comparison.",
  });
  if (cases.some((item) => item.error)) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
