import { expect, test } from "@playwright/test";
import { qaArtifactPath } from "./qa-artifacts";

test("overlapping source rows → pending column checks → exact shared bill (synthetic readers)", async ({
  page,
}, info) => {
  const texts = [
    "Market",
    "Currency GBP",
    "Tea 1 1.00 1.00",
    "Bread 2 1.00 2.00",
    "TOTAL GBP 3.00",
    "Prices include tax",
  ];
  let lines: { text: string; confidence: number; box: number[] }[] = [];
  let words: typeof lines = [];
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        localModel: { configured: true, name: "PaddleOCR" },
        localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
      },
    }),
  );
  await page.route("**/api/receipts/recognize", (route) => {
    const body = route.request().postDataJSON();
    return route.fulfill({
      json: {
        recognition: {
          engine: "paddle-ppocrv6-medium-onnx",
          panels: body.panels.map(
            ({ photo, part }: { photo: number; part: number }) => ({
              photo,
              part,
              width: 700,
              height: 1000,
              lines,
              words,
            }),
          ),
        },
      },
    });
  });
  await page.route("**/api/receipts/vision", (route) =>
    route.fulfill({
      json: {
        receipt: {
          merchant: "Market",
          date: "",
          currency: "GBP",
          subtotal: "",
          printedTotal: "3.00",
          printedTax: "",
          pricesIncludeTax: true,
          printedItemCount: null,
          taxCodes: [],
          adjustments: [],
          warnings: [],
          items: [
            {
              description: "Tea",
              quantity: "1",
              unitPrice: "1.000",
              lineTotal: "1.000",
              discount: "0",
              taxCode: "",
              note: "",
              sourcePhotos: [1],
            },
            {
              description: "Bread",
              quantity: "2",
              unitPrice: "1.000",
              lineTotal: "2.000",
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
  await page.goto("/");
  const fixture = await page.evaluate((texts) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 1000;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 700, 1000);
    ctx.fillStyle = "black";
    ctx.font = "24px monospace";
    ctx.fillText("SYNTHETIC COLUMN RECEIPT", 40, 50);
    const lines = texts.map((text, index) => {
      const y = 150 + index * 110;
      ctx.fillText(text, 50, y);
      return {
        text,
        confidence: 0.99,
        box: [
          48 / 700,
          (y - 26) / 1000,
          (54 + ctx.measureText(text).width) / 700,
          (y + 6) / 1000,
        ],
      };
    });
    return { lines, png: canvas.toDataURL("image/png").split(",")[1] };
  }, texts);
  lines = fixture.lines;
  words = structuredClone(lines);
  // The receipt pixels stay literal. Only the synthetic OCR row rectangle is
  // deliberately too tall, making it contain the neighboring Bread word.
  lines[2].box[3] = lines[3].box[3];
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-columns.png",
    mimeType: "image/png",
    buffer: Buffer.from(fixture.png, "base64"),
  });
  await page
    .getByLabel("Local vision comparison", { exact: true })
    .selectOption("always");
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await expect(
    page.getByRole("textbox", { name: "Item 1 line price", exact: true }),
  ).toHaveValue("1.00");
  await expect(
    page.getByRole("textbox", { name: "Item 2 line price", exact: true }),
  ).toHaveValue("2.00");
  for (const item of [1, 2]) {
    await page
      .getByRole("button", {
        name: `View source for item ${item}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Receipt source for purchase ${item}`,
      exact: true,
    });
    await expect(dialog.getByTestId("source-region")).toHaveCount(1);
    const checks = dialog.getByRole("checkbox");
    await expect(checks).toHaveCount(4);
    if (item === 1)
      await dialog.screenshot({
        path: await qaArtifactPath(info, "column-source.png"),
      });
    for (const check of await checks.all()) await check.check();
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
    if (item === 1) await expect(confirm).toBeDisabled();
  }
  await expect(confirm).toBeEnabled();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: await qaArtifactPath(info, "column-review.png"),
    fullPage: true,
  });
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
  for (const check of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await check.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£1.50");
  await expect(page.getByTestId("person-total-1")).toHaveText("£1.50");
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
});
