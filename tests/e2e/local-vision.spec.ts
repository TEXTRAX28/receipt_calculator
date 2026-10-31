import { qaArtifactPath } from "./qa-artifacts";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { aiCostcoDraft } from "../fixtures/ai-receipt";

async function configure(page: Page) {
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        localModel: { configured: true, name: "PaddleOCR" },
        localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
      },
    }),
  );
}
async function picture(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 700, 700);
    ctx.fillStyle = "black";
    ctx.font = "25px monospace";
    ctx.fillText("SYNTHETIC UI PROTOCOL FIXTURE", 30, 90);
    ctx.fillText("Not a model accuracy test", 30, 150);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return {
    name: "protocol.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}
async function start(page: Page, count = 1) {
  await configure(page);
  await page.goto("/");
  const file = await picture(page);
  await page.getByLabel("Upload receipt images").setInputFiles(
    Array.from({ length: count }, (_, index) => ({
      ...file,
      name: `protocol-${index + 1}.png`,
    })),
  );
  await page.getByRole("button", { name: "Local vision", exact: true }).click();
  return page.getByRole("button", {
    name: "Read receipt with local vision",
    exact: true,
  });
}

test("a chosen currency fills review details without changing model requests or amounts", async ({
  page,
}, info) => {
  const draft = {
    ...aiCostcoDraft(),
    currency: "",
    subtotal: "12345",
    printedTotal: "12345",
    printedTax: "",
    printedItemCount: 1,
    pricesIncludeTax: true,
    taxCodes: [],
    adjustments: [],
  };
  draft.items = [
    {
      ...draft.items[0],
      description: "SYNTHETIC TEA",
      quantity: "1",
      unitPrice: "7.000",
      lineTotal: "7.000",
      discount: "0",
      taxCode: "",
      sourcePhotos: [1],
    },
  ];
  await page.route("**/api/receipts/vision", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.context).toBeUndefined();
    expect(Object.keys(body)).toEqual(["panels"]);
    await route.fulfill({ json: { receipt: draft } });
  });
  const scan = await start(page);
  await page
    .getByRole("combobox", { name: "Receipt currency (optional)", exact: true })
    .selectOption("IDR");
  await mkdir("qa-artifacts", { recursive: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: await qaArtifactPath(
        info,
        `reading-currency-${info.project.name}-${width}.png`,
      ),
      fullPage: true,
    });
    await page
      .getByRole("combobox", {
        name: "Receipt currency (optional)",
        exact: true,
      })
      .locator("..")
      .screenshot({
        path: await qaArtifactPath(
          info,
          `reading-currency-control-${info.project.name}-${width}.png`,
        ),
      });
  }
  await scan.click();
  await expect(
    page.getByRole("combobox", { name: "Currency", exact: true }),
  ).toHaveValue("IDR");
  // The line amount is visible; unit price is in collapsed purchase details.
  await expect(page.locator('input[value="7.000"]')).toHaveValue("7.000");
  await expect(
    page.getByText(/Receipt currency supplied by you: IDR/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  ).toBeDisabled();
});

test("local vision → structured review → exact split uses only the local endpoint (mock protocol)", async ({
  page,
}, info) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      uploads.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/vision", async (route) => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body)).toEqual(["panels"]);
    expect(body.panels.map((panel: { photo: number }) => panel.photo)).toEqual([
      1, 2,
    ]);
    await route.fulfill({ json: { receipt: aiCostcoDraft() } });
  });
  const scan = await start(page, 2);
  await expect(
    page.getByRole("checkbox", { name: /Send these receipt photos/ }),
  ).toHaveCount(0);
  await mkdir("qa-artifacts", { recursive: true });
  for (const width of [320, 375, 390, 667]) {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const choice = page.getByRole("button", {
      name: "Local vision",
      exact: true,
    });
    expect((await choice.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.locator(".reader-choice").screenshot({
      path: await qaArtifactPath(
        info,
        `local-vision-${info.project.name}-${width}.png`,
      ),
    });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await scan.click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(18);
  await expect(
    page.getByText(/Local vision prepared this draft/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
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
  await expect(page.getByTestId("person-total-0")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-1")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-2")).toHaveText("£58.92");
  expect(uploads).toEqual(["/api/receipts/vision"]);
});

test("unknown tax inclusion needs a specific source check even with a balanced total (mock protocol)", async ({
  page,
}, info) => {
  const draft = aiCostcoDraft();
  Object.assign(draft, {
    pricesIncludeTax: null,
    subtotal: "5.50",
    printedTotal: "5.50",
    printedTax: "",
    printedItemCount: 1,
    taxCodes: [],
    adjustments: [],
    items: [
      {
        ...draft.items[0],
        description: "SYNTHETIC TEA",
        quantity: "1",
        unitPrice: "5.50",
        lineTotal: "5.50",
        discount: "0",
        taxCode: "",
        sourcePhotos: [1],
      },
    ],
  });
  await page.route("**/api/receipts/vision", (route) =>
    route.fulfill({ json: { receipt: draft } }),
  );
  await (await start(page)).click();
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("5.50");
  await expect(confirm).toBeDisabled();
  const checked = page.getByRole("checkbox", {
    name: "I checked whether item prices include tax against the original",
    exact: true,
  });
  await expect(checked).not.toBeChecked();
  await page.screenshot({
    path: await qaArtifactPath(info, `unknown-tax-${info.project.name}.png`),
    fullPage: true,
  });
  await checked.check();
  await expect(confirm).toBeEnabled();
  await page.reload();
  await expect(checked).toBeChecked();
  await expect(confirm).toBeEnabled();
  await checked.uncheck();
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("checkbox", { name: /Item prices already include tax/ })
    .uncheck();
  // An explicit human correction supplies a new reading of this field.
  await expect(checked).toBeChecked();
  await expect(confirm).toBeEnabled();
});

test("local vision refuses excess prepared sections before uploading and retains all photos", async ({
  page,
}) => {
  let uploads = 0;
  await page.route("**/api/receipts/vision", (route) => {
    uploads++;
    return route.abort();
  });
  const scan = await start(page, 4);
  await scan.click();
  await expect(page.getByRole("alert")).toContainText("This receipt has 4");
  await expect(page.locator(".selected-image")).toHaveCount(4);
  await expect(scan).toBeEnabled();
  expect(uploads).toBe(0);
});

test("a local vision failure retains the photos and does not trigger a cloud fallback", async ({
  page,
}) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      uploads.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/vision", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error:
          "The local model is unavailable. Your photos are still available.",
      },
    }),
  );
  const scan = await start(page);
  await scan.click();
  await expect(page.getByRole("alert")).toContainText(
    "local model is unavailable",
  );
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(scan).toBeEnabled();
  expect(uploads).toEqual(["/api/receipts/vision"]);
});

test("a schema-valid local vision draft with incorrect arithmetic cannot be confirmed", async ({
  page,
}) => {
  const draft = { ...aiCostcoDraft(), printedTotal: "176.79" };
  await page.route("**/api/receipts/vision", (route) =>
    route.fulfill({ json: { receipt: draft } }),
  );
  const scan = await start(page);
  await scan.click();
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("176.79");
  await expect(
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  ).toBeDisabled();
  await expect(
    page.getByText(/Calculated total .* differs from the printed total/),
  ).toBeVisible();
});
