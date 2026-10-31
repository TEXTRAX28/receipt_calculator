import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { appSchema } from "../../src/lib/model";
import { calculateReceipt } from "../../src/lib/engine";
import { costcoDemo } from "../../src/lib/demo";

// Opt-in local development evidence, not a blind receipt-accuracy benchmark.
test("real independent readers → original two-photo review → exact checked split", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const base = process.env.GATHER_LOCAL_COMPARISON_URL;
  const files: unknown = JSON.parse(
    process.env.GATHER_LOCAL_COSTCO_PHOTOS || "null",
  );
  if (
    !base ||
    !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base) ||
    !Array.isArray(files) ||
    files.length !== 2 ||
    files.some((file) => typeof file !== "string")
  )
    throw new Error(
      "Supply a loopback GATHER_LOCAL_COMPARISON_URL and exactly two approved local photo paths in GATHER_LOCAL_COSTCO_PHOTOS",
    );
  const external: string[] = [],
    posts: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(new URL(base).origin) || /^(data:|blob:)/.test(url))
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(files as string[]);
  await page
    .getByRole("button", { name: "This computer", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: /Compare with local vision/ })
    .check();
  const nativeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/receipts/vision") &&
      response.request().method() === "POST",
    { timeout: 260000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 260000 });
  const elapsedMs = Date.now() - started;
  const state = appSchema.parse(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gather.receipt.v1")!),
    ),
  );
  const calculation = calculateReceipt(state.receipt);
  const native = await (await nativeResponse).json();
  const financial = (receipt: typeof state.receipt) =>
    receipt.items.map((item) => [
      Number(item.quantity),
      Number(item.unitPrice),
      Number(item.lineTotal),
      Number(item.discount),
      item.taxCode,
    ]);
  const financialRowsMatch =
    JSON.stringify(financial(state.receipt)) ===
    JSON.stringify(financial(costcoDemo()));
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  await writeFile(
    `qa-artifacts/advanced-ocr/independent-real-costco-${info.project.name}.json`,
    JSON.stringify(
      {
        scope:
          "One source-informed UK development receipt, local real installed models plus HTTP/browser; not blind or complete-cohort accuracy",
        elapsedMs,
        timingScope:
          "Scan button through both local models, preparation, independent comparison and editable review; excludes manual review and sharing",
        receipt: state.receipt,
        nativeReceipt: native.receipt,
        financialRowsMatch,
        finalMinor: String(calculation.total),
        issuePaths: calculation.issues.map((issue) => issue.path),
        postEndpoints: posts,
        externalBrowserRequests: external.length,
      },
      null,
      2,
    ) + "\n",
  );
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(18);
  expect(financialRowsMatch).toBe(true);
  expect(String(calculation.total)).toBe("17678");
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", { name: "View source for item 4", exact: true })
    .click();
  const source = page.getByRole("dialog", {
    name: "Receipt source for purchase 4",
    exact: true,
  });
  await expect(source.getByTestId("source-region")).toHaveCount(4);
  await source
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".verification-checks")
    .last()
    .screenshot({
      path: `qa-artifacts/advanced-ocr/independent-real-costco-review-${info.project.name}.png`,
    });
  // The test's image-checked development reference verifies the financial vector above.
  // These clicks exercise mandatory review; they do not assert that model agreement proves correctness.
  for (const checkbox of await page
    .locator(".verification-checks")
    .getByRole("checkbox")
    .all())
    if (await checkbox.isEnabled()) await checkbox.check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  for (const name of ["Alice", "Bob", "Charlie"]) {
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
  for (const [index, total] of ["£58.93", "£58.93", "£58.92"].entries())
    await expect(page.getByTestId(`person-total-${index}`)).toHaveText(total);
  expect(external).toEqual([]);
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
  await writeFile(
    `qa-artifacts/advanced-ocr/independent-real-costco-split-${info.project.name}.json`,
    JSON.stringify(
      {
        elapsedMs,
        noFinancialEdits: true,
        reviewChecksExplicitlyConfirmed: state.receipt.reviewChecks.length,
        participants: ["58.93", "58.93", "58.92"],
        externalBrowserRequests: external.length,
        postEndpoints: posts,
      },
      null,
      2,
    ) + "\n",
  );
});
