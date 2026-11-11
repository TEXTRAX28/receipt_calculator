import { requireAssistedPolicy } from "./assisted-policy";
import { expectReviewAttention, expectReviewReady } from "./review-assertions";
import { test, expect } from "./editor-fixture";
import { mkdir, writeFile } from "node:fs/promises";
import { costcoDemo } from "../../src/lib/demo";
import { receiptFromAi } from "../../src/lib/gemini";
import { calculateReceipt } from "../../src/lib/engine";

/** Real installed native model + actual image guard + HTTP + browser. Synthetic receipt only. */
test("real local vision reads a synthetic receipt and supports an exact checked split", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const base = process.env.GATHER_LOCAL_VISION_URL;
  if (!base || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base))
    throw new Error(
      "Supply a local GATHER_LOCAL_VISION_URL with the pinned local model enabled",
    );
  const external: string[] = [];
  const uploads: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(new URL(base).origin) ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      uploads.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 850;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1000, 850);
    ctx.fillStyle = "black";
    ctx.font = "bold 40px monospace";
    [
      "LITTLE MARKET",
      "31/10/2026",
      "",
      "Milk 1x 2.50 2.50",
      "Apples 1x 3.00 3.00",
      "",
      "TOTAL GBP 5.50",
      "PRICES INCLUDE TAX",
    ].forEach((line, index) => ctx.fillText(line, 60, 90 + index * 80));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-local-vision.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await requireAssistedPolicy(page, "vision");
  const started = Date.now();
  const nativeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/receipts/vision") &&
      response.request().method() === "POST",
  );
  await page
    .getByRole("button", {
      name: "Read receipt with local vision",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your receipt." }),
  ).toBeVisible({ timeout: 130000 });
  const elapsedMs = Date.now() - started;
  const nativeResult = await (await nativeResponse).json();
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  await writeFile(
    `qa-artifacts/advanced-ocr/local-vision-real-response-${info.project.name}.json`,
    JSON.stringify({ synthetic: true, elapsedMs, ...nativeResult }, null, 2),
  );
  expect(nativeResult.receipt.pricesIncludeTax).toBe(true);
  expect(
    nativeResult.receipt.items.map(
      (item: {
        quantity: string;
        unitPrice: string;
        lineTotal: string;
        discount: string;
      }) => [
        Number(item.quantity),
        Number(item.unitPrice),
        Number(item.lineTotal),
        Number(item.discount),
      ],
    ),
  ).toEqual([
    [1, 2.5, 2.5, 0],
    [1, 3, 3, 0],
  ]);
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("5.50");
  await expect(
    page.getByRole("combobox", { name: "Currency", exact: true }),
  ).toHaveValue("GBP");
  await expect(
    page.getByRole("textbox", { name: "Merchant", exact: true }),
  ).toHaveValue(/LITTLE MARKET/i);
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expectReviewReady(page, confirm);
  await confirm.click();
  for (const name of ["Alice", "Bob"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
  for (let index = 0; index < 2; index++) {
    const card = page.getByTestId(`assignment-item-${index}`);
    await card.getByRole("checkbox").nth(0).check();
    await card.getByRole("checkbox").nth(1).check();
  }
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£2.75");
  await expect(page.getByTestId("person-total-1")).toHaveText("£2.75");
  expect(external).toEqual([]);
  expect(uploads).toEqual(["/api/receipts/vision"]);
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  await writeFile(
    `qa-artifacts/advanced-ocr/local-vision-real-${info.project.name}.json`,
    JSON.stringify(
      {
        synthetic: true,
        elapsedMs,
        timingScope:
          "Scan button through image preparation, strict JPEG guard, asset verification/model loading, native inference and editable review; excludes participant entry/sharing",
        externalBrowserRequests: external.length,
        postEndpoints: uploads,
        noFinancialEdits: true,
        participants: ["2.75", "2.75"],
      },
      null,
      2,
    ),
  );
});

test("real local vision reads three ordered overlapping synthetic sections", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const base = process.env.GATHER_LOCAL_VISION_URL;
  if (!base) throw new Error("Supply GATHER_LOCAL_VISION_URL");
  await page.route("**/*", (route) =>
    route.request().url().startsWith(new URL(base).origin) ||
    /^(data:|blob:)/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  await page.goto(base);
  const images = await page.evaluate(() =>
    [
      [
        "LITTLE MARKET",
        "31/10/2026",
        "PRICES INCLUDE TAX",
        "Milk 1x 2.50 2.50",
        "Apples 1x 3.00 3.00",
      ],
      ["Apples 1x 3.00 3.00", "Bread 1x 1.25 1.25", "Rice 1x 2.00 2.00"],
      ["Rice 1x 2.00 2.00", "TOTAL GBP 8.75"],
    ].map((lines) => {
      const canvas = document.createElement("canvas");
      canvas.width = 1000;
      canvas.height = 750;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "white";
      ctx.fillRect(0, 0, 1000, 750);
      ctx.fillStyle = "black";
      ctx.font = "bold 38px monospace";
      lines.forEach((line, index) => ctx.fillText(line, 50, 90 + index * 90));
      return canvas.toDataURL("image/png").split(",")[1];
    }),
  );
  await page.getByLabel("Upload receipt images").setInputFiles(
    images.map((data, index) => ({
      name: `synthetic-section-${index + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(data, "base64"),
    })),
  );
  await requireAssistedPolicy(page, "vision");
  const response = page.waitForResponse((result) =>
    result.url().endsWith("/api/receipts/vision"),
  );
  const started = Date.now();
  await page
    .getByRole("button", {
      name: "Read receipt with local vision",
      exact: true,
    })
    .click();
  const result = await (await response).json();
  const elapsedMs = Date.now() - started;
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  await writeFile(
    `qa-artifacts/advanced-ocr/local-vision-real-three-${info.project.name}.json`,
    JSON.stringify(
      {
        synthetic: true,
        elapsedMs,
        receipt: result.receipt,
        error: result.error,
        expectedPurchases: 4,
        expectedTotal: "8.75",
        sourceSubtotalWasPrinted: false,
        sourceItemCountWasPrinted: false,
        sourceTaxCodesWerePrinted: false,
      },
      null,
      2,
    ),
  );
  expect(result.receipt).toBeDefined();
  expect(
    result.receipt.items.map(
      (item: { quantity: string; unitPrice: string; lineTotal: string }) => [
        Number(item.quantity),
        Number(item.unitPrice),
        Number(item.lineTotal),
      ],
    ),
  ).toEqual([
    [1, 2.5, 2.5],
    [1, 3, 3],
    [1, 1.25, 1.25],
    [1, 2, 2],
  ]);
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(4);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("8.75");
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
});

test("real local vision preserves the supplied Costco diagnostic and its validation outcome", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const base = process.env.GATHER_LOCAL_VISION_URL;
  const configuredFiles = process.env.GATHER_LOCAL_COSTCO_PHOTOS;
  test.skip(
    !configuredFiles,
    "Supply the original item/footer photo paths for this local-only development diagnostic.",
  );
  if (!base) throw new Error("Supply GATHER_LOCAL_VISION_URL");
  const files: unknown = JSON.parse(configuredFiles!);
  if (
    !Array.isArray(files) ||
    files.length !== 2 ||
    files.some((file) => typeof file !== "string")
  )
    throw new Error("Supply exactly two local photo paths");
  const external: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(new URL(base).origin) || /^(data:|blob:)/.test(url))
      return route.continue();
    external.push(url);
    return route.abort();
  });
  await page.goto(base);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(files as string[]);
  await requireAssistedPolicy(page, "vision");
  const response = page.waitForResponse((result) =>
    result.url().endsWith("/api/receipts/vision"),
  );
  const started = Date.now();
  await page
    .getByRole("button", {
      name: "Read receipt with local vision",
      exact: true,
    })
    .click();
  const result = await (await response).json();
  const elapsedMs = Date.now() - started;
  const expected = costcoDemo();
  const parsed = result.receipt
    ? receiptFromAi(result.receipt, "Local vision")
    : null;
  const calculated = parsed ? calculateReceipt(parsed) : null;
  const fields = [
    "quantity",
    "unitPrice",
    "lineTotal",
    "discount",
    "taxCode",
  ] as const;
  const financialRowsMatch = Boolean(
    parsed &&
    parsed.items.length === expected.items.length &&
    parsed.items.every((item, index) =>
      fields.every((field) => item[field] === expected.items[index][field]),
    ),
  );
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  await writeFile(
    `qa-artifacts/advanced-ocr/local-vision-real-costco-${info.project.name}.json`,
    JSON.stringify(
      {
        privateDevelopmentReceipt: true,
        elapsedMs,
        receipt: result.receipt,
        error: result.error,
        expectedPurchases: 18,
        expectedPrintedTotal: "176.78",
        financialRowsMatch,
        exactEngineIssues: calculated?.issues,
        exactEngineTotalMinor: calculated?.total.toString(),
        externalBrowserRequests: external.length,
      },
      null,
      2,
    ),
  );
  expect(external).toEqual([]);
  expect(parsed).not.toBeNull();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(
    parsed!.items.length,
  );
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  if (calculated!.issues.length) await expectReviewAttention(page, confirm);
  else await expectReviewReady(page, confirm);
  // A passed protocol diagnostic is not a passed accuracy benchmark. Its discrepancies are retained above.
});
