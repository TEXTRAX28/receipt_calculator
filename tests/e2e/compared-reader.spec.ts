import { expectReviewBlocked, expectReviewReady } from "./review-assertions";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import {
  comparedDraft,
  comparedRecognition,
  comparedRows,
} from "../fixtures/compared-receipt";

async function start(page: Page, count = 1) {
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        assistedReader: "computer",
        localCheckMode: "always",
        localModel: { configured: true, name: "PaddleOCR" },
        localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
      },
    }),
  );
  await page.goto("/");
  await page
    .getByRole("button", { name: "Assisted scan · This computer", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Assisted scan · This computer",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "true");
  const image = await page.evaluate((rows) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 1400;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 700, 1400);
    context.fillStyle = "black";
    context.font = "20px monospace";
    context.fillText("SYNTHETIC PROTOCOL FIXTURE", 40, 40);
    rows.forEach((text, index) => context.fillText(text, 60, 100 + index * 60));
    return canvas.toDataURL("image/png").split(",")[1];
  }, comparedRows);
  await page.getByLabel("Upload receipt images").setInputFiles(
    Array.from({ length: count }, (_, index) => ({
      name: `protocol-${index + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    })),
  );

  return page.getByRole("button", {
    name: "Read receipt on this computer",
    exact: true,
  });
}

test("independent local readings recover source-proven coupons and require specific human checks before splitting (mock protocol)", async ({
  page,
}, info) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      uploads.push(new URL(request.url()).pathname);
  });
  let originalPanels: unknown;
  await page.route("**/api/receipts/recognize", (route) => {
    const body = route.request().postDataJSON();
    originalPanels = body.panels;
    return route.fulfill({
      json: comparedRecognition(
        body.panels.map(({ photo, part }: { photo: number; part: number }) => ({
          photo,
          part,
        })),
      ),
    });
  });
  await page.route("**/api/receipts/vision", (route) => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body)).toEqual(["panels"]);
    expect(body.panels).toEqual(originalPanels); // No primary OCR text or amounts are supplied to the model.
    return route.fulfill({ json: { receipt: comparedDraft() } });
  });
  const scan = await start(page);
  await scan.click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(3);
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expectReviewBlocked(page, confirm);
  await expect(
    page.getByRole("textbox", { name: "Item 1 discount", exact: true }),
  ).toHaveValue("2.00");
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for purchase 1",
    exact: true,
  });
  await expect(dialog.getByTestId("source-region")).toHaveCount(4);
  await dialog
    .getByRole("checkbox", {
      name: "I checked item discount against the original",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expectReviewBlocked(page, confirm);
  await page
    .getByRole("button", {
      name: "View source for receipt adjustments",
      exact: true,
    })
    .click();
  const adjustmentDialog = page.getByRole("dialog", {
    name: "Receipt source for receipt adjustments",
    exact: true,
  });

  await expect(
    adjustmentDialog.getByText("Savings: 2.00", { exact: true }),
  ).toBeVisible();
  await expect(
    adjustmentDialog.getByText("Coupon(s): 1", { exact: true }),
  ).toBeVisible();
  await expect(
    adjustmentDialog.getByText("Executive Reward: 0.32", { exact: true }),
  ).toBeVisible();
  await expect(adjustmentDialog.getByTestId("source-region")).toHaveCount(3);
  await adjustmentDialog
    .getByRole("checkbox", {
      name: "I checked receipt adjustments against the original",
      exact: true,
    })
    .check();
  await adjustmentDialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expectReviewReady(page, confirm);
  const checked = page.getByRole("checkbox", {
    name: "I checked item discount against the original",
    exact: true,
  });
  await checked.uncheck();
  await expectReviewBlocked(page, confirm);
  await checked.check();
  await mkdir("qa-artifacts", { recursive: true });
  for (const width of [320, 375, 390, 667]) {
    await page.setViewportSize({ width, height: width === 667 ? 375 : 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      (await checked.locator("..").boundingBox())!.height,
    ).toBeGreaterThanOrEqual(44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .locator(".verification-checks")
    .last()
    .screenshot({
      path: `qa-artifacts/compared-review-${info.project.name}.png`,
    });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await confirm.click();
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
  await expect(page.getByTestId("person-total-0")).toHaveText("£8.79");
  await expect(page.getByTestId("person-total-1")).toHaveText("£8.79");
  expect(uploads).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
});

test("a balanced but disagreed price remains blocked until each disputed value is corrected; refresh keeps review state and drops photo data", async ({
  page,
}) => {
  const rows = [
    "Little Market",
    "PRICES INCLUDE TAX",
    "Milk 1x 2.00 2.00",
    "Bread 1x 1.50 1.50",
    "TOTAL GBP 3.50",
  ];
  await page.route("**/api/receipts/recognize", (route) =>
    route.fulfill({ json: comparedRecognition([{ photo: 1, part: 1 }], rows) }),
  );
  await page.route("**/api/receipts/vision", (route) =>
    route.fulfill({
      json: {
        receipt: {
          merchant: "Little Market",
          date: "",
          currency: "GBP",
          subtotal: "",
          printedTotal: "3.50",
          printedTax: "",
          pricesIncludeTax: true,
          printedItemCount: 2,
          taxCodes: [],
          adjustments: [],
          warnings: [],
          items: [
            {
              description: "Milk",
              quantity: "1",
              unitPrice: "1.00",
              lineTotal: "1.00",
              discount: "0",
              taxCode: "",
              note: "",
              sourcePhotos: [1],
            },
            {
              description: "Bread",
              quantity: "1",
              unitPrice: "2.50",
              lineTotal: "2.50",
              discount: "0",
              taxCode: "",
              note: "",
              sourcePhotos: [1],
            },
          ],
        },
      },
    }),
  );
  await (await start(page)).click();
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expectReviewBlocked(page, confirm);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("3.50");
  for (const [index, price] of [
    [1, "2.00"],
    [2, "1.50"],
  ] as const) {
    await page
      .getByRole("textbox", {
        name: `Item ${index} unit price (optional)`,
        exact: true,
      })
      .fill(price);
    await page
      .getByRole("textbox", { name: `Item ${index} line price`, exact: true })
      .fill(price);
  }
  await expectReviewReady(page, confirm);
  await page.reload();
  await expectReviewReady(page, confirm);
  await expect(
    page.getByRole("button", { name: /View source for item/ }),
  ).toHaveCount(0);
  const saved = await page.evaluate(() =>
    localStorage.getItem("gather.receipt.v1"),
  );
  expect(saved).toContain('"reviewChecks"');
  expect(saved).not.toMatch(/data:image|base64|PRICES INCLUDE TAX/);
});

for (const count of [1, 4])
  test(`an ${count === 1 ? "unavailable" : "oversized"} extra reading preserves the successful first draft with an explicit incomplete-review gate`, async ({
    page,
  }) => {
    const uploads: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST")
        uploads.push(new URL(request.url()).pathname);
    });
    await page.route("**/api/receipts/recognize", (route) =>
      route.fulfill({
        json: comparedRecognition(
          route
            .request()
            .postDataJSON()
            .panels.map(({ photo, part }: { photo: number; part: number }) => ({
              photo,
              part,
            })),
        ),
      }),
    );
    await page.route("**/api/receipts/vision", (route) =>
      route.fulfill({
        status: 503,
        json: { error: "Local vision is unavailable for this test." },
      }),
    );
    await (await start(page, count)).click();
    await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(
      3 * count,
    );
    await expect(
      page.getByText(/extra comparison could not/i).first(),
    ).toBeVisible();
    await expectReviewBlocked(
      page,
      page.getByRole("button", { name: "Confirm receipt & add people" }),
    );
    await expect(
      page.getByRole("checkbox", {
        name: "I checked purchase list against the original",
        exact: true,
      }),
    ).not.toBeChecked();
    expect(uploads).toEqual(
      count === 1
        ? ["/api/receipts/recognize", "/api/receipts/vision"]
        : ["/api/receipts/recognize", "/api/receipts/vision-batches"],
    );
    await page
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
    await expect(page.locator(".selected-image")).toHaveCount(count);
  });

test("cancelling the independent second read retains the photos and never accepts a partial draft", async ({
  page,
}) => {
  await page.route("**/api/receipts/recognize", (route) =>
    route.fulfill({ json: comparedRecognition([{ photo: 1, part: 1 }]) }),
  );
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/receipts/vision", async (route) => {
    await held;
    await route.fulfill({ json: { receipt: comparedDraft() } }).catch(() => {});
  });
  const scan = await start(page);
  const secondRead = page.waitForRequest((request) =>
    request.url().endsWith("/api/receipts/vision"),
  );
  await scan.click();
  await secondRead;
  await page.getByRole("button", { name: "Cancel scan", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("cancelled");
  release();
  await expect(scan).toBeEnabled();
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toHaveCount(0);
});
