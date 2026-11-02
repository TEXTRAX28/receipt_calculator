import { test, expect, type Page, type Route } from "@playwright/test";
import { resolve } from "node:path";
import { writeFile } from "node:fs/promises";
import { qaArtifactPath } from "./qa-artifacts";

async function upload(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(resolve("tests/fixtures/paddle-synthetic.png"));
  await page
    .getByRole("button", { name: "Enhanced on-device", exact: true })
    .click();
}

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
        url.origin !== "http://127.0.0.1:4173") ||
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
      url.origin !== "http://127.0.0.1:4173"
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
          await page
            .getByRole("heading", { name: "A quick check, then we share." })
            .isVisible()
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
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 1000 });
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("6.00");
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.locator("p").filter({ hasText: /enhanced reader is experimental/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeDisabled();
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
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  // The fixed synthetic image explicitly prints this complete financial vector.
  // These clicks exercise review controls; they are not independent human truth.
  for (const checkbox of await page
    .locator(".verification-checks")
    .getByRole("checkbox")
    .all())
    if (await checkbox.isEnabled()) await checkbox.check();
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
        scope:
          "Actual synthetic image through production app and SDK worker, no mocked OCR/model. Chromium emulation, not physical iOS/Safari.",
      },
      null,
      2,
    ) + "\n",
  );
});

test("missing enhanced assets preserve images and leave the basic reader available", async ({
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
  await expect(
    page.getByText(/Enhanced reader files are unavailable/),
  ).toBeVisible();
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await page.getByRole("button", { name: "On-device", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: "Read receipt on this device",
      exact: true,
    }),
  ).toBeEnabled();
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
