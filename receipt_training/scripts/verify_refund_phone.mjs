// One genuine local extraction in the built UI; no field edits or confirmation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium, expect } from "@playwright/test";
import { preview } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
assert(/^[\w-]+$/.test(tag || ""));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const buildTag = process.argv[4] || "refund-document-validation-v1";
assert(
  /^(?:refund-document-validation|receipt-date-parser|refund-financial-summary)-v[1-9]\d*$/.test(
    buildTag,
  ),
);
const buildFolder = "qa-artifacts/" + buildTag;
const suppliedCurrency = process.argv[5] || null;
assert(suppliedCurrency === null || suppliedCurrency === "USD");
const controller = JSON.parse(
  await readFile(resolve(root, buildFolder, "build-controller.json")),
);
assert(controller.exit_code === 0 && controller.source_unchanged);
for (const [path, expected] of Object.entries(controller.source_sha256))
  assert.equal(sha(await readFile(resolve(root, path))), expected, path);
const inputs = {};
async function remember(path) {
  inputs[path] = sha(await readFile(resolve(root, path)));
}
async function walk(folder) {
  for (const entry of await readdir(resolve(root, folder), {
    withFileTypes: true,
  })) {
    const path = folder + "/" + entry.name;
    if (entry.isDirectory()) await walk(path);
    else await remember(path);
  }
}
await walk(buildFolder + "/dist");
const imagePath = "qa-artifacts/public-refund-costco-v1/refund.webp";
await remember(imagePath);
assert.equal(
  inputs[imagePath],
  "1858d6225c1b58992a0644f1a499e5220ab98c06f31f086a31a4cee9ae8f96f0",
);
await remember("receipt_training/scripts/verify_refund_phone.mjs");
await write("starting.json", { pid: process.pid, input_sha256: inputs });
if (process.argv[3] === "--await-observer") {
  const started = Date.now();
  while (true) {
    try {
      const ready = JSON.parse(
        await readFile(resolve(out, "observer-ready.json")),
      );
      assert.equal(ready.root_pid, process.pid);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert(Date.now() - started < 15000);
    await new Promise((done) => setTimeout(done, 100));
  }
}
const service = await preview({
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  build: { outDir: resolve(root, buildFolder, "dist") },
  preview: { host: "127.0.0.1", port: 0, strictPort: false, open: false },
});
let browser;
const writes = [],
  external = [],
  errors = [],
  workers = [];
let closedWorkers = 0;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      external.push(url.origin);
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      writes.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  const origin = `http://127.0.0.1:${service.httpServer.address().port}`;
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 500)));
  page.on("worker", (worker) => {
    workers.push(worker.url());
    worker.on("close", () => closedWorkers++);
  });
  await page.goto(origin);
  if (suppliedCurrency)
    await page
      .getByLabel("Receipt currency (optional)", { exact: true })
      .selectOption(suppliedCurrency);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(resolve(root, imagePath));
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Enhanced on-device", exact: true })
    .click();
  const started = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  const elapsed_ms = Date.now() - started;
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")),
  );
  await write("initial-state.json", { receipt: state.receipt, elapsed_ms });
  assert.equal(state.receipt.items.length, 1);
  const item = state.receipt.items[0];
  assert.equal(item.lineTotal, "-499.99");
  assert.equal(item.quantity, "");
  assert.equal(item.unitPrice, "");
  assert.equal(state.receipt.printedTax, "-43.12");
  assert.equal(state.receipt.printedTotal, "-543.11");
  assert.equal(state.receipt.date, "2026-07-21");
  if (suppliedCurrency) {
    assert.equal(state.receipt.currency, suppliedCurrency);
    assert.equal(state.receipt.currencyUnresolved, false);
    assert.equal(state.receipt.pricesIncludeTax, false);
    assert.equal(state.receipt.taxMode, "printed");
    assert.equal(state.receipt.items[0].taxCode, "Y");
    assert.deepEqual(state.receipt.taxCodes, []);
    assert.equal(state.receipt.adjustments.length, 1);
    assert.equal(state.receipt.adjustments[0].kind, "tax");
    assert.equal(state.receipt.adjustments[0].amount, "-43.12");
    for (const field of ["pricesIncludeTax", "taxCodes", "adjustments"])
      assert(
        state.receipt.reviewChecks.some(
          (check) =>
            check.field === field &&
            check.reason === "recovered" &&
            !check.confirmedValue,
        ),
      );
  }
  await expect(
    page.getByLabel("Receipt date (optional)", { exact: true }),
  ).toHaveValue("2026-07-21");
  assert(
    state.receipt.reviewChecks.some(
      (check) =>
        check.itemId === item.id &&
        check.field === "lineTotal" &&
        check.reason === "classification" &&
        !check.confirmedValue,
    ),
  );
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  if (suppliedCurrency) {
    await expect(
      page
        .locator("dt")
        .filter({ hasText: /^Calculated total$/ })
        .locator("..")
        .locator("dd"),
    ).toHaveText("−$543.11");
    await expect(
      page
        .locator("dt")
        .filter({ hasText: /^Added tax$/ })
        .locator("..")
        .locator("dd"),
    ).toHaveText("−$43.12");
  }
  const fit = [];
  const lineError = page.locator(
    "[data-testid='review-item-0'] .item-editor-top .field-error",
  );
  await expect(lineError).toContainText(
    "signed product row and refund heading",
  );
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert(scrollWidth <= width);
    const errorBounds = await lineError.boundingBox();
    const rowBounds = await page
      .locator("[data-testid='review-item-0'] .item-editor-top")
      .boundingBox();
    assert(errorBounds.width >= rowBounds.width - 30);
    const errorId = await lineError.getAttribute("id");
    assert(
      (
        await page
          .getByLabel("Item 1 line price", { exact: true })
          .getAttribute("aria-describedby")
      )
        .split(" ")
        .includes(errorId),
    );
    fit.push({
      view: "review",
      width,
      scroll_width: scrollWidth,
      error_width: errorBounds.width,
      row_width: rowBounds.width,
    });
    await page.screenshot({
      path: resolve(out, `review-${width}.png`),
      fullPage: true,
    });
  }
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for purchase 1",
    exact: true,
  });
  await expect(dialog.getByTestId("source-region")).toHaveCount(2);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    assert(scrollWidth <= width);
    fit.push({ view: "source", width, scroll_width: scrollWidth });
    await page.screenshot({ path: resolve(out, `source-${width}.png`) });
  }
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  let financialSourceRegions = null;
  if (suppliedCurrency) {
    await page
      .getByRole("button", {
        name: "View source for whether item prices include tax",
        exact: true,
      })
      .click();
    const financialDialog = page.getByRole("dialog", {
      name: "Receipt source for whether item prices include tax",
      exact: true,
    });
    await expect(financialDialog.getByTestId("source-region")).toHaveCount(3);
    financialSourceRegions = 3;
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const scrollWidth = await page.evaluate(
        () => document.documentElement.scrollWidth,
      );
      assert(scrollWidth <= width);
      fit.push({ view: "financial-source", width, scroll_width: scrollWidth });
      await page.screenshot({
        path: resolve(out, `financial-source-${width}.png`),
      });
    }
    await financialDialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
  await expect(confirm).toBeDisabled();
  const finalState = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")),
  );
  assert.deepEqual(finalState.receipt, state.receipt);
  await expect
    .poll(() => closedWorkers, { timeout: 10000 })
    .toBe(workers.length);
  assert.deepEqual(writes, []);
  assert.deepEqual(external, []);
  assert.deepEqual(errors, []);
  await write("result.json", {
    elapsed_ms,
    fit,
    source_regions: 2,
    financial_source_regions: financialSourceRegions,
    supplied_currency: suppliedCurrency,
    financial_fields_edited: false,
    checks_confirmed: 0,
    confirmation_blocked: true,
    receipt_unchanged_after_source_review: true,
    writes,
    external,
    errors,
    workers,
    closed_workers: closedWorkers,
    input_sha256: inputs,
    build_source_sha256: controller.source_sha256,
    physical_phone_verified: false,
    scope:
      "One genuine public refund through actual production upload/enhanced OCR/review/source UI. Two viewport sizes of one scan. Optional reading currency is explicit setup; no extracted financial field edits, source-check approval or finalized split.",
  });
} finally {
  await browser?.close();
  await new Promise((done, reject) =>
    service.httpServer.close((error) => (error ? reject(error) : done())),
  );
}
