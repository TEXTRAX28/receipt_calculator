import { qaArtifactPath } from "./qa-artifacts";
import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

async function configure(page: Page) {
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: { localModel: { configured: true, name: "PaddleOCR" } },
    }),
  );
}
async function openPurchaseSource(page: Page) {
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  return page.getByRole("dialog", { name: "Receipt source for purchase 1" });
}
async function picture(page: Page, receiptLines?: string[]) {
  const data = await page.evaluate((receiptLines) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 700, 700);
    ctx.fillStyle = "black";
    ctx.font = "14px monospace";
    ctx.fillText("SYNTHETIC PROTOCOL FIXTURE", 40, 28);
    ctx.font = "30px monospace";
    (
      receiptLines || [
        "LITTLE MARKET",
        "Milk 1x 2.00 2.00",
        "Bread 1x 1.50 1.50",
        "TOTAL GBP 3.50",
      ]
    ).forEach((text, i) => ctx.fillText(text, 70, 100 + i * 70));
    return canvas.toDataURL("image/png").split(",")[1];
  }, receiptLines);
  return {
    name: "protocol-fixture.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}
function responseFor(
  panels: { photo: number; part: number }[],
  texts = [
    "LITTLE MARKET",
    "Milk 1x 2.00 2.00",
    "Bread 1x 1.50 1.50",
    "TOTAL GBP 3.50",
  ],
) {
  return {
    recognition: {
      engine: "paddle-ppocrv6-medium-onnx",
      panels: panels.map((panel) => ({
        photo: panel.photo,
        part: panel.part,
        width: 700,
        height: 700,
        words: texts.map((text, i) => ({
          text,
          confidence: 0.95,
          box: [0.1, 0.1 + i * 0.1, 0.9, 0.15 + i * 0.1],
        })),
        lines: texts.map((text, i) => ({
          text,
          confidence: 0.95,
          box: [0.1, 0.1 + i * 0.1, 0.9, 0.15 + i * 0.1],
        })),
      })),
    },
  };
}

test("configured computer reader fits phones and produces an editable balanced draft (mock protocol)", async ({
  page,
}, info) => {
  await configure(page);
  let packets = 0;
  await page.route("**/api/receipts/recognize", async (route) => {
    packets++;
    const body = route.request().postDataJSON();
    expect(body.consent).toBeUndefined();
    expect(body.panels).toHaveLength(1);
    await route.fulfill({ json: responseFor(body.panels) });
  });
  const cloud: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/receipts/extract"))
      cloud.push(request.url());
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "This computer", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await mkdir("qa-artifacts", { recursive: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const button = page.getByRole("button", {
      name: "This computer",
      exact: true,
    });
    expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.locator(".reader-choice").screenshot({
      path: await qaArtifactPath(
        info,
        `computer-reader-${info.project.name}-${width}.png`,
      ),
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("3.50");
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expect(confirm).toBeEnabled();
  await confirm.click();
  for (const name of ["Alice", "Bob"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
  for (let i = 0; i < 2; i++) {
    const item = page.getByTestId(`assignment-item-${i}`);
    await item.getByRole("checkbox").nth(0).check();
    await item.getByRole("checkbox").nth(1).check();
  }
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£1.75");
  await expect(page.getByTestId("person-total-1")).toHaveText("£1.75");
  expect(packets).toBe(1);
  expect(cloud).toEqual([]);
});

test("computer failure preserves photos and offers an explicit on-device fallback (mock protocol)", async ({
  page,
}) => {
  await configure(page);
  await page.route("**/api/receipts/recognize", (route) =>
    route.fulfill({
      status: 503,
      json: {
        error: "Computer model unavailable. Your photos are still available.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByText(
      "Computer model unavailable. Your photos are still available.",
    ),
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

test("source rows support phone review, edits, keyboard return and private refresh (mock protocol)", async ({
  page,
}, info) => {
  await configure(page);
  let packets = 0;
  await page.route("**/api/receipts/recognize", async (route) => {
    packets++;
    const result = responseFor(route.request().postDataJSON().panels);
    result.recognition.panels[0].words[1].confidence = 0.4;
    await route.fulfill({ json: result });
  });
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 900 });
  const sourceButton = page.getByRole("button", {
    name: "View source for item 1",
    exact: true,
  });
  await expect(sourceButton).toBeVisible();
  await expect(
    page.getByTestId("review-item-0").getByText("Check unclear text"),
  ).toBeVisible();
  await sourceButton.click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for purchase 1",
  });
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("img", {
      name: /Highlighted receipt area in photo 1, section 1/,
    }),
  ).toBeVisible();
  await expect(dialog.getByTestId("source-region")).toHaveCount(1);
  await expect(dialog.getByTestId("source-region")).toHaveAttribute("y", "140");
  await expect(dialog.getByText(/Some text was unclear/)).toBeVisible();
  const quantity = dialog.getByRole("textbox", {
    name: "Item 1 purchased quantity",
    exact: true,
  });
  await quantity.fill("0");
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await quantity.fill("1");
  await expect(quantity).not.toHaveAttribute("aria-invalid", "true");
  await dialog
    .getByRole("textbox", { name: "Item 1 line price", exact: true })
    .fill("2.50");
  await dialog
    .getByRole("textbox", { name: "Item 1 unit price (optional)", exact: true })
    .fill("2.50");
  await expect(dialog.getByText(/Edited since this scan/)).toBeVisible();
  await dialog
    .getByText("Recognized text in this area", { exact: true })
    .click();
  await expect(dialog.locator("pre")).toHaveText("Milk 1x 2.00 2.00");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mkdir("qa-artifacts", { recursive: true });
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 375, height: 812 },
    { width: 390, height: 900 },
    { width: 667, height: 375 },
  ]) {
    await page.setViewportSize(viewport);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await dialog.boundingBox())!.width).toBeLessThanOrEqual(
      viewport.width,
    );
    await dialog.screenshot({
      path: await qaArtifactPath(
        info,
        `receipt-source-${info.project.name}-${viewport.width}.png`,
      ),
    });
    const back = dialog.getByRole("button", {
      name: "Back to receipt",
      exact: true,
    });
    await back.scrollIntoViewIfNeeded();
    await expect(back).toBeInViewport();
    await dialog
      .getByRole("heading", { name: "Purchase 1", exact: true })
      .scrollIntoViewIfNeeded();
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(sourceButton).toBeFocused();
  await expect(
    page.getByRole("textbox", { name: "Item 1 line price", exact: true }),
  ).toHaveValue("2.50");
  await expect(
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  ).toBeDisabled();
  const saved = await page.evaluate(() =>
    localStorage.getItem("gather.receipt.v1")!,
  );
  for (const privateField of [
    "sourceLines",
    '"panels"',
    "blob:",
    "Recognized text in this area",
  ])
    expect(saved).not.toContain(privateField);
  expect(JSON.parse(saved).receipt.rawText).toBe("");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "View source for item 1", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Item 1 line price", exact: true }),
  ).toHaveValue("2.50");
  expect(packets).toBe(1);
});

test("a selected purchase area is reread locally, preserves the draft and fits phones (mock protocol)", async ({
  page,
}, info) => {
  await configure(page);
  let calls = 0;
  const sizes: { width: number; height: number }[] = [];
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/recognize", async (route) => {
    const body = route.request().postDataJSON();
    expect(body.panels).toHaveLength(1);
    calls++;
    if (calls === 1) return route.fulfill({ json: responseFor(body.panels) });
    const size = await page.evaluate(async (data) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const bitmap = await createImageBitmap(
        new Blob([bytes], { type: "image/jpeg" }),
      );
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return dimensions;
    }, body.panels[0].data);
    sizes.push(size);
    await route.fulfill({
      json: {
        recognition: {
          engine: "paddle-ppocrv6-medium-onnx",
          panels: [
            {
              photo: 1,
              part: 1,
              ...size,
              words: [],
              lines: [
                {
                  text: "Milk 1x 2.75 2.75",
                  confidence: 0.96,
                  box: [0.05, 0.2, 0.95, 0.8],
                },
              ],
            },
          ],
        },
      },
    });
  });
  const dialog = await openPurchaseSource(page);
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
  );
  await dialog
    .getByRole("button", { name: "Reread this purchase", exact: true })
    .click();
  const firstSlider = dialog.getByRole("slider", {
    name: "Trim left percent",
    exact: true,
  });
  await expect(
    dialog.getByRole("button", { name: "Find receipt edges", exact: true }),
  ).toHaveCount(0);
  await expect(firstSlider).toBeFocused();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 850 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await dialog
      .getByRole("heading", { name: "Choose the item area", exact: true })
      .scrollIntoViewIfNeeded();
    await dialog.screenshot({
      path: await qaArtifactPath(
        info,
        `area-select-${info.project.name}-${width}.png`,
      ),
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog
    .getByRole("button", { name: "Read selected area", exact: true })
    .click();
  await expect(dialog.locator(".area-read-text")).toHaveText(
    "Milk 1x 2.75 2.75",
  );
  await expect(
    dialog.getByRole("heading", {
      name: "New reading of this area",
      exact: true,
    }),
  ).toBeFocused();
  expect(sizes).toHaveLength(1);
  expect(sizes[0].height).toBeLessThan(300);
  expect(sizes[0].width).toBeGreaterThan(600);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
    ),
  ).toEqual(saved);
  await expect(
    dialog.getByLabel("Item 1 line price", { exact: true }),
  ).toHaveValue("2.00");
  await expect(dialog.getByTestId("source-region")).toHaveAttribute("y", "140");
  await dialog.screenshot({
    path: await qaArtifactPath(info, `area-result-${info.project.name}.png`),
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.getByLabel("Item 1 line price", { exact: true }).fill("2.75");
  await dialog
    .getByLabel("Item 1 unit price (optional)", { exact: true })
    .fill("2.75");
  await dialog
    .getByRole("button", { name: "Close new reading", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: "Reread this purchase", exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page
      .getByTestId("review-item-1")
      .getByLabel("Item 2 description", { exact: true }),
  ).toHaveValue("Bread");
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "3.50",
  );
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/recognize"]);
});

test("cancelling or closing an area read rejects late responses and keeps the source and values (mock protocol)", async ({
  page,
}) => {
  await configure(page);
  let calls = 0;
  let finish: () => void = () => {};
  await page.route("**/api/receipts/recognize", async (route) => {
    calls++;
    const result = responseFor(route.request().postDataJSON().panels);
    if (calls > 1)
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
    await route.fulfill({ json: result });
  });
  const dialog = await openPurchaseSource(page);
  for (const action of ["cancel", "close"]) {
    await dialog
      .getByRole("button", { name: "Reread this purchase", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Read selected area", exact: true })
      .click();
    await expect.poll(() => calls).toBe(action === "cancel" ? 2 : 3);
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
    } else await page.keyboard.press("Escape");
    finish();
    await page.waitForTimeout(150);
    if (action === "close")
      await page
        .getByRole("button", { name: "View source for item 1", exact: true })
        .click();
    await expect(
      dialog.getByRole("heading", {
        name: "New reading of this area",
        exact: true,
      }),
    ).toHaveCount(0);
    await expect(
      dialog.getByLabel("Item 1 line price", { exact: true }),
    ).toHaveValue("2.00");
    await expect(dialog.getByTestId("source-region")).toHaveAttribute(
      "y",
      "140",
    );
  }
  expect(calls).toBe(3);
});

for (const failure of ["unavailable", "empty"]) {
  test(`an ${failure} area read leaves the existing draft editable (mock protocol)`, async ({
    page,
  }) => {
    await configure(page);
    let calls = 0;
    await page.route("**/api/receipts/recognize", async (route) => {
      calls++;
      if (calls === 1)
        return route.fulfill({
          json: responseFor(route.request().postDataJSON().panels),
        });
      if (failure === "unavailable")
        return route.fulfill({
          status: 503,
          json: { error: "The computer reader is unavailable." },
        });
      const result = responseFor(route.request().postDataJSON().panels);
      result.recognition.panels[0].lines = [];
      result.recognition.panels[0].words = [];
      return route.fulfill({ json: result });
    });
    const dialog = await openPurchaseSource(page);
    await dialog
      .getByRole("button", { name: "Reread this purchase", exact: true })
      .click();
    await dialog
      .getByRole("button", { name: "Read selected area", exact: true })
      .click();
    await expect(
      dialog.getByRole("heading", {
        name: "This area needs another look",
        exact: true,
      }),
    ).toBeFocused();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(
      dialog.getByLabel("Item 1 line price", { exact: true }),
    ).toHaveValue("2.00");
    await dialog
      .getByLabel("Item 1 description", { exact: true })
      .fill("Milk checked manually");
    await expect(
      dialog.getByLabel("Item 1 description", { exact: true }),
    ).toHaveValue("Milk checked manually");
    expect(calls).toBe(2);
  });
}

test("a balanced bare negative row needs a classification check with literal source evidence (mock protocol)", async ({
  page,
}, info) => {
  await configure(page);
  const texts = [
    "LITTLE MARKET",
    "Groceries 1x 10.00 10.00",
    "CP Club Card -2.00",
    "TOTAL GBP 8.00",
  ];
  await page.route("**/api/receipts/recognize", (route) =>
    route.fulfill({
      json: responseFor(route.request().postDataJSON().panels, texts),
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page, texts));
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(1);
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "8.00",
  );
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", {
      name: "View source for receipt adjustments",
      exact: true,
    })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for receipt adjustments",
    exact: true,
  });
  await expect(dialog.getByTestId("source-region")).toHaveCount(1);
  await dialog
    .getByText("Recognized text in this area", { exact: true })
    .click();
  await expect(dialog.locator("pre")).toHaveText("CP Club Card -2.00");
  await expect(dialog.locator(".verification-current")).toContainText(
    "Receipt discount; by item cost",
  );
  await expect(
    dialog.getByText(/The negative row could be a discount or a refund/),
  ).toBeVisible();
  await expect(
    dialog.getByText(/The source text was difficult to read/),
  ).toHaveCount(0);
  await dialog.locator(".verification-current").scrollIntoViewIfNeeded();
  await mkdir("qa-artifacts", { recursive: true });
  await dialog.screenshot({
    path: await qaArtifactPath(
      info,
      `refund-ambiguous-source-${info.project.name}.png`,
    ),
  });
  await dialog
    .getByRole("checkbox", {
      name: "I checked receipt adjustments against the original",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expect(confirm).toBeEnabled();
});
