import { expectReviewAttention, expectReviewReady } from "./review-assertions";
import { expect, test } from "./editor-fixture";
import { qaArtifactPath } from "./qa-artifacts";

test("Gemini grouped amounts stay editable but cannot be shared until corrected (mock provider)", async ({
  page,
}, info) => {
  const raw = {
    merchant: "Synthetic Market",
    date: "",
    currency: "",
    subtotal: "1,000",
    printedTotal: "1,000",
    printedTax: "",
    pricesIncludeTax: true,
    printedItemCount: 1,
    taxCodes: [],
    adjustments: [],
    warnings: [],
    items: [
      {
        description: "Table",
        quantity: "1",
        unitPrice: "1,000",
        lineTotal: "1,000",
        discount: "0",
        taxCode: "",
        note: "",
        sourcePhotos: [1],
      },
    ],
  };
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/config", (route) =>
    route.fulfill({
      json: {
        configured: true,
        provider: "Gemini",
        model: "synthetic-fixture",
      },
    }),
  );
  await page.route("**/api/receipts/extract", (route) => {
    const body = route.request().postDataJSON();
    expect(body.consent).toBe(true);
    expect(body.panels).toHaveLength(1);
    return route.fulfill({ json: { receipt: raw } });
  });
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 700, 1000);
    ctx.fillStyle = "black";
    ctx.font = "26px monospace";
    [
      "SYNTHETIC MARKET",
      "Table 1 x 1,000  1,000",
      "Subtotal 1,000",
      "TOTAL GBP 1,000",
      "PROTOCOL FIXTURE",
    ].forEach((line, i) => ctx.fillText(line, 50, 100 + i * 150));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-grouped-amounts.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page
    .getByRole("button", { name: "Assisted scan · Gemini", exact: true })
    .click();
  await page
    .getByRole("checkbox", {
      name: "Send these receipt photos to Google Gemini for this scan",
    })
    .check();
  await page
    .getByRole("button", { name: "Read receipt with Gemini", exact: true })
    .click();
  const line = page.getByLabel("Item 1 line price", { exact: true });
  const unit = page.getByLabel("Item 1 unit price (optional)", { exact: true });
  const total = page.getByLabel("Printed total", { exact: true });
  const subtotal = page.getByLabel("Subtotal after item discounts (optional)", {
    exact: true,
  });
  for (const input of [line, unit, total, subtotal])
    await expect(input).toHaveValue("1,000");
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expectReviewAttention(page, confirm);
  await page.getByLabel("Currency", { exact: true }).selectOption("GBP");
  // Selecting currency cannot turn invalid money into a payable value.
  const checks = page.getByRole("checkbox", { name: /^I checked/ });
  await expect(checks).toHaveCount(0);
  await expectReviewAttention(page, confirm);
  for (const input of [line, unit, total, subtotal])
    await expect(input).toHaveValue("1,000");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await qaArtifactPath(info, `grouped-draft-${info.project.name}.png`),
    fullPage: true,
  });
  for (const input of [line, unit, total]) await input.fill("1000");
  await expectReviewAttention(page, confirm);
  // Existing review behavior treats a manual field edit as checking that value.
  // Every invalid amount still needs correction, including the optional subtotal.
  await subtotal.fill("1000");
  await expectReviewReady(page, confirm);
  await confirm.click();
  for (const name of ["Alice", "Bob"]) {
    await page.getByRole("textbox", { name: "Person’s name" }).fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
  await page
    .getByRole("button", { name: "Whole receipt", exact: true })
    .click();
  for (const check of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await check.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£500.00");
  await expect(page.getByTestId("person-total-1")).toHaveText("£500.00");
  expect(posts).toEqual(["/api/receipts/extract"]);
});
