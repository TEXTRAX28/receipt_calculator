import { expectReviewAttention } from "./review-assertions";
import { test, expect, type Page, type Route } from "./editor-fixture";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { qaArtifactPath } from "./qa-artifacts";

async function upload(page: Page, requireSupport = true) {
  if (requireSupport)
    test.skip(
      !(await page.evaluate(
        () =>
          typeof OffscreenCanvas === "function" &&
          typeof createImageBitmap === "function",
      )),
      "This browser build lacks the enhanced reader's image APIs; its basic-reader fallback is tested separately.",
    );
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(resolve("tests/fixtures/paddle-synthetic.png"));
  await page
    .getByRole("button", { name: "On-device scan", exact: true })
    .click();
}

test("unsupported device reader falls back locally in one scan without enhanced downloads", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 320, height: 844 });
  await page.addInitScript(() => {
    Object.defineProperty(window, "OffscreenCanvas", {
      configurable: true,
      value: undefined,
    });
  });
  const assets: string[] = [],
    workers: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/ocr-enhanced/"))
      assets.push(request.url());
  });
  page.on("worker", (worker) => {
    if (/paddle\.worker/.test(worker.url())) workers.push(worker.url());
  });
  await upload(page, false);
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "6.00",
    { timeout: 130000 },
  );
  expect(assets).toEqual([]);
  expect(workers).toEqual([]);
  await page.screenshot({
    path: await qaArtifactPath(info, "unsupported-enhanced.png"),
    fullPage: true,
  });
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "6.00",
    { timeout: 130000 },
  );
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "View original receipt image 1" }),
  ).toBeVisible();
  expect(assets).toEqual([]);
  expect(workers).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await writeFile(
    await qaArtifactPath(info, "unsupported-enhanced.json"),
    JSON.stringify({
      browserEngine: page.context().browser()?.browserType().name(),
      enhancedAssetRequests: assets,
      enhancedWorkers: workers,
      basicOcr: { actualSyntheticImage: true, items: 2, printedTotal: "6.00" },
      physicalPhone: false,
    }),
  );
});

test("enhanced reader performs actual private browser OCR with the page CSP unchanged", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.setViewportSize({ width: 320, height: 844 });
  const external: string[] = [],
    writes: string[] = [],
    errors: string[] = [],
    workers: string[] = [];
  let closed = 0;
  const loaded: { path: string; declaredBytes: number }[] = [];
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      (!["data:", "blob:"].includes(url.protocol) &&
        url.origin !== new URL(test.info().project.use.baseURL!).origin) ||
      !["GET", "HEAD"].includes(request.method())
    )
      return route.abort();
    return route.continue();
  });
  page.on("response", (response) => {
    const size = Number(response.headers()["content-length"] || 0);
    if (
      response.request().method() === "GET" &&
      Number.isFinite(size) &&
      size > 0
    )
      loaded.push({
        path: new URL(response.url()).pathname,
        declaredBytes: size,
      });
  });
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== new URL(test.info().project.use.baseURL!).origin
    )
      external.push(url.origin);
    if (!["GET", "HEAD"].includes(request.method())) writes.push(url.pathname);
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  page.on("worker", (worker) => {
    workers.push(worker.url());
    worker.on("close", () => closed++);
  });
  await upload(page);
  const csp = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute("content");
  expect(csp).toContain("script-src 'self' 'wasm-unsafe-eval'");
  expect(csp).not.toContain("'unsafe-eval'");
  await expect(page.getByText(/First use loads about/)).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: await qaArtifactPath(info, "enhanced-phone-upload.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        if (
          await page.getByRole("heading", { name: "Your receipt." }).isVisible()
        )
          return "review";
        const alerts = await page.getByRole("alert").allTextContents();
        return alerts.some((text) => /enhanced reader|120 seconds/i.test(text))
          ? "reader-failed"
          : "working";
      },
      { timeout: 130000 },
    )
    .not.toBe("working");
  await expect(
    page.getByRole("heading", { name: "Your receipt." }),
  ).toBeVisible({ timeout: 1000 });
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("6.00");
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.locator("p").filter({
      hasText:
        /Check the complete purchase list, quantities, amounts and overlapping rows/,
    }),
  ).toBeAttached();
  await expectReviewAttention(
    page,
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  );
  await expect.poll(() => closed).toBe(1);
  expect(workers).toHaveLength(1);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(320);
  await page.screenshot({
    path: await qaArtifactPath(info, "enhanced-phone-review.png"),
    fullPage: true,
  });
  const receipt = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
  );
  expect(receipt.items[0]).toMatchObject({
    description: "Soup",
    quantity: "2",
    unitPrice: "1.25",
    lineTotal: "2.50",
  });
  expect(receipt.items[1]).toMatchObject({
    description: "Rice",
    quantity: "1",
    unitPrice: "3.50",
    lineTotal: "3.50",
  });
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByTestId("source-region").first(),
  ).toBeVisible();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("button", { name: "Reread this purchase", exact: true })
    .click();
  await expect(dialog.getByText(/with the enhanced reader/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Read selected area", exact: true })
    .click();
  await expect(dialog.locator(".area-read-text")).toContainText("Soup", {
    timeout: 130000,
  });
  await expect(dialog.locator(".area-read-text")).toContainText("2.50");
  await expect.poll(() => closed).toBe(2);
  expect(workers).toHaveLength(2);
  expect(workers.every((url) => /paddle\.worker/.test(url))).toBe(true);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
    ),
  ).toEqual(receipt);
  await dialog
    .getByRole("button", { name: "Close new reading", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Reread this purchase", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  // The fixed synthetic image explicitly prints this complete financial vector.
  // Receipt acceptance is one action, not an independent OCR accuracy result.
  await expect(page.getByRole("checkbox", { name: /^I checked/ })).toHaveCount(
    0,
  );
  await page
    .getByRole("button", { name: "Confirm receipt & add people", exact: true })
    .click();
  for (const name of ["Alice", "Bob"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
  await page
    .getByRole("button", { name: "Whole receipt", exact: true })
    .click();
  for (const checkbox of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£3.00");
  await expect(page.getByTestId("person-total-1")).toHaveText("£3.00");
  await page.screenshot({
    path: await qaArtifactPath(info, "enhanced-phone-summary.png"),
    fullPage: true,
  });
  await writeFile(
    await qaArtifactPath(info, "enhanced-worker.json"),
    JSON.stringify(
      {
        workers,
        closed,
        external,
        writes,
        errors,
        csp,
        loaded,
        noFinancialEdits: true,
        syntheticSourceChecksExercised: true,
        exactSplit: ["3.00", "3.00"],
        declared_get_response_bytes: loaded.reduce(
          (n, r) => n + r.declaredBytes,
          0,
        ),
        byte_scope:
          "Sum of declared GET Content-Length values; not a measured wire/compression/cache cost.",
        browserEngine: page.context().browser()?.browserType().name(),
        scope:
          "Actual synthetic image through production app and SDK worker, no mocked OCR/model. Desktop-hosted browser emulation, not a physical phone.",
      },
      null,
      2,
    ) + "\n",
  );
});

test("missing enhanced assets use compatibility OCR without asking for another scan choice", async ({
  page,
}) => {
  await upload(page);
  await page.route("**/ocr-enhanced/det.tar", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<!doctype html>missing model",
    }),
  );
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "6.00",
    { timeout: 130000 },
  );
  await page.locator(".review-notes > summary").click();
  await expect(
    page.getByText(/The compatibility reader prepared this draft/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "View original receipt image 1" }),
  ).toBeVisible();
});

test("enhanced area errors and cancellation preserve the draft and do not switch to a configured computer", async ({
  page,
}) => {
  test.setTimeout(180000);
  const writes: string[] = [],
    workers: string[] = [];
  let closed = 0;
  await page.context().route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) {
      writes.push(url.pathname);
      return route.abort();
    }
    if (
      url.origin !== new URL(test.info().project.use.baseURL!).origin &&
      !["data:", "blob:"].includes(url.protocol)
    )
      return route.abort();
    return route.continue();
  });
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        localModel: { configured: true, name: "docTR" },
        localVision: { configured: false, name: "Qwen3-VL 4B", maxPanels: 3 },
      },
    }),
  );
  page.on("worker", (worker) => {
    workers.push(worker.url());
    worker.on("close", () => closed++);
  });
  await upload(page);
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "6.00",
    { timeout: 130000 },
  );
  await expect.poll(() => closed).toBe(1);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
  );
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await page.route("**/ocr-enhanced/det.tar", (route) =>
    route.fulfill({ status: 404, body: "" }),
  );
  await dialog
    .getByRole("button", { name: "Reread this purchase", exact: true })
    .click();
  await expect(dialog.getByText(/with the enhanced reader/)).toBeVisible();
  await dialog
    .getByRole("button", { name: "Read selected area", exact: true })
    .click();
  await expect(dialog.getByRole("alert")).toContainText(
    "Enhanced reader files are unavailable",
  );
  await expect(
    dialog.getByRole("heading", {
      name: "This area needs another look",
      exact: true,
    }),
  ).toBeFocused();
  expect(workers).toHaveLength(1);
  await dialog
    .getByRole("button", { name: "Close new reading", exact: true })
    .click();
  await page.unroute("**/ocr-enhanced/det.tar");
  for (const action of ["cancel", "close"]) {
    let stalled: Route | undefined;
    await page.route("**/ocr-enhanced/det.tar", (route) => {
      if (route.request().method() === "HEAD") return route.continue();
      stalled = route;
    });
    await dialog
      .getByRole("button", { name: "Reread this purchase", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Read selected area", exact: true })
      .click();
    await expect.poll(() => Boolean(stalled)).toBe(true);
    if (action === "cancel") {
      await dialog
        .getByRole("button", { name: "Cancel area read", exact: true })
        .click();
      await expect(
        dialog.getByRole("button", {
          name: "Reread this purchase",
          exact: true,
        }),
      ).toBeFocused();
    } else {
      await page.keyboard.press("Escape");
      await page
        .getByRole("button", { name: "View source for item 1", exact: true })
        .click();
    }
    await expect.poll(() => closed).toBe(action === "cancel" ? 2 : 3);
    await stalled?.abort().catch(() => {});
    await page.unroute("**/ocr-enhanced/det.tar");
    await expect(dialog.locator(".area-read-text")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
      ),
    ).toEqual(saved);
    await expect(dialog.getByTestId("source-region").first()).toBeVisible();
  }
  expect(writes).toEqual([]);
  expect(workers).toHaveLength(3);
  expect(workers.every((url) => /paddle\.worker/.test(url))).toBe(true);
});

test("cancelling initialization terminates the actual worker and preserves the upload", async ({
  page,
}) => {
  test.setTimeout(180000);
  let stalled: Route | undefined,
    closed = 0;
  page.on("worker", (worker) => worker.on("close", () => closed++));
  await upload(page);
  await page.route("**/ocr-enhanced/det.tar", (route) => {
    if (route.request().method() === "GET") {
      stalled = route;
      return;
    }
    return route.continue();
  });
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect.poll(() => !!stalled).toBe(true);
  await page.getByRole("button", { name: "Cancel scan", exact: true }).click();
  await expect(page.getByText(/Scan cancelled/)).toBeVisible();
  await expect.poll(() => closed).toBe(1);
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: "Read receipt on this device",
      exact: true,
    }),
  ).toBeEnabled();
  await stalled?.abort().catch(() => {});
});
