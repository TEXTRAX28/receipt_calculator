import { expectReviewAttention, expectReviewReady } from "./review-assertions";
import { expect, test, type Page } from "./editor-fixture";
import AxeBuilder from "@axe-core/playwright";
import { writeFile } from "node:fs/promises";
import {
  comparedDraft,
  comparedRecognition,
} from "../fixtures/compared-receipt";
import { qaArtifactPath } from "./qa-artifacts";

// Synthetic protocol/UI cases, never OCR accuracy or native latency evidence.
const clear = [
  "MARKET",
  "Tea 1x 5.50 5.50",
  "Prices include tax",
  "TOTAL GBP 5.50",
];
async function setup(
  page: Page,
  rows = clear,
  failure = false,
  weakTotal = false,
  zeroPurchase = false,
  localCheckMode = "auto",
) {
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/receipts/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/providers"))
      return route.fulfill({
        json: {
          localCheckMode,
          localModel: { configured: true, name: "PaddleOCR" },
          localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
        },
      });
    if (route.request().method() !== "POST") return route.abort();
    const body = route.request().postDataJSON();
    posts.push({ path, body });
    if (path.endsWith("/recognize")) {
      const output = comparedRecognition(
        body.panels.map(({ photo, part }: { photo: number; part: number }) => ({
          photo,
          part,
        })),
        rows,
      );
      if (weakTotal || zeroPurchase)
        for (const panel of output.recognition.panels) {
          // Match the known canvas rows below. Only recognition is substituted.
          panel.width = 700;
          panel.height = 1100;
          panel.lines = rows.map((text, index) => ({
            text,
            confidence: 0.99,
            box: [
              40 / 700,
              (110 + index * 65 - 24) / 1100,
              0.96,
              (110 + index * 65 + 6) / 1100,
            ],
          }));
          panel.words = panel.lines.flatMap((line, index) => {
            const split = zeroPurchase && line.text.match(/^(.*) (\d[\d.,]*)$/);
            if (split)
              return [
                {
                  ...line,
                  text: split[1],
                  box: [40 / 700, line.box[1], 500 / 700, line.box[3]] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                },
                {
                  ...line,
                  text: split[2],
                  box: [600 / 700, line.box[1], 660 / 700, line.box[3]] as [
                    number,
                    number,
                    number,
                    number,
                  ],
                },
              ];
            return [
              {
                ...line,
                confidence: weakTotal && index === rows.length - 1 ? 0.2 : 0.99,
              },
            ];
          });
        }
      return route.fulfill({ json: output });
    }
    if (path.endsWith("/vision")) {
      if (failure)
        return route.fulfill({
          status: 503,
          json: { error: "Synthetic reader unavailable" },
        });
      const sample = comparedDraft();
      if (zeroPurchase)
        return route.fulfill({
          json: {
            receipt: {
              ...sample,
              merchant: "MARKET",
              subtotal: "",
              printedTotal: "10.00",
              printedTax: "",
              pricesIncludeTax: true,
              printedItemCount: 2,
              taxCodes: [],
              warnings: [],
              adjustments: [{ label: "Plastic bag", kind: "fee", amount: "0" }],
              items: [
                {
                  ...sample.items[0],
                  description: "Meal",
                  quantity: "1",
                  unitPrice: "8.00",
                  lineTotal: "8.00",
                  taxCode: "",
                },
                {
                  ...sample.items[0],
                  description: "Tea",
                  quantity: "1",
                  unitPrice: "2.00",
                  lineTotal: "2.00",
                  taxCode: "",
                },
              ],
            },
          },
        });
      return route.fulfill({
        json: {
          receipt: {
            ...sample,
            merchant: "MARKET",
            subtotal: "",
            printedTotal: "5.50",
            printedTax: "",
            pricesIncludeTax: true,
            printedItemCount: 1,
            taxCodes: [],
            adjustments: [],
            warnings: [],
            items: [
              {
                ...sample.items[0],
                description: "Tea",
                unitPrice: "5.50",
                lineTotal: "5.50",
                taxCode: "",
              },
            ],
          },
        },
      });
    }
    return route.abort(); // Never silently reach a provider from a mocked protocol case.
  });
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
  const image = await page.evaluate(
    ({ texts, zeroPurchase }) => {
      const canvas = document.createElement("canvas");
      canvas.width = 700;
      canvas.height = 1100;
      const context = canvas.getContext("2d")!;
      context.fillStyle = "white";
      context.fillRect(0, 0, 700, 1100);
      context.fillStyle = "black";
      context.font = "20px monospace";
      context.fillText("SYNTHETIC PROTOCOL FIXTURE", 30, 40);
      texts.forEach((text, index) => {
        const split = zeroPurchase && text.match(/^(.*) (\d[\d.,]*)$/);
        if (split) {
          context.fillText(split[1], 40, 110 + index * 65);
          context.textAlign = "right";
          context.fillText(split[2], 660, 110 + index * 65);
          context.textAlign = "left";
        } else context.fillText(text, 40, 110 + index * 65);
      });
      return canvas.toDataURL("image/png").split(",")[1];
    },
    { texts: rows, zeroPurchase },
  );
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  const select = page.getByRole("button", {
    name: "Assisted scan · This computer",
    exact: true,
  });
  await expect(select).toHaveAttribute("aria-pressed", "true");
  return {
    posts,
    select,
    scan: page.getByRole("button", {
      name: "Read receipt on this computer",
      exact: true,
    }),
  };
}
const confirm = (page: Page) =>
  page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
const coverage = (page: Page) =>
  page.getByRole("checkbox", {
    name: "I checked purchase list against the original",
    exact: true,
  });

test("automatic comparison recovers a missing free item with pending source and role review (mock protocol)", async ({
  page,
}, info) => {
  const { scan, posts } = await setup(
    page,
    [
      "MARKET",
      "Meal 1x 8.00 8.00",
      "Tea 1x 2.00 2.00",
      "Plastic bag 0",
      "TOTAL GBP 10.00",
      "Prices include tax",
    ],
    false,
    false,
    true,
  );
  await scan.click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(3);
  expect(posts.map((post) => post.path)).toEqual([
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
  expect(posts[1].body).toEqual(posts[0].body);
  const readSaved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("gather.receipt.v1")!));
  const before = await readSaved();
  const bag = before.receipt.items.find(
    (item: { description: string }) => item.description === "Plastic bag",
  );
  expect(bag).toMatchObject({
    quantity: "",
    unitPrice: "",
    lineTotal: "0",
    taxCode: "",
  });
  expect(before.receipt.adjustments).toEqual([]);
  for (const field of ["description", "lineTotal"])
    expect(before.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        itemId: bag.id,
        field,
        reason: "recovered",
        confirmedValue: "",
      }),
    );
  const card = page.getByTestId("review-item-2");
  await card
    .getByRole("button", { name: "View source for item 3", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByTestId("source-region")).toHaveCount(1);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: await qaArtifactPath(info, `zero-purchase-source-${width}.png`),
    });
  }
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  expect((await readSaved()).receipt).toEqual(before.receipt);
  await expect(coverage(page)).toHaveCount(0);
  await expectReviewAttention(page, confirm(page));
  await writeFile(
    await qaArtifactPath(info, "zero-purchase-review.json"),
    JSON.stringify(
      { receipt: before.receipt, posts: posts.map(({ path }) => path) },
      null,
      2,
    ),
    { flag: "wx" },
  );
});

test("a failed comparison retains optional financial source evidence without a checkbox gate (mock protocol)", async ({
  page,
}, info) => {
  const { scan, posts } = await setup(page, clear, true, true);
  await scan.click();
  const totalCheck = page.getByRole("checkbox", {
    name: "I checked printed total against the original",
    exact: true,
  });
  await expect(totalCheck).toHaveCount(0);
  await expect(coverage(page)).toHaveCount(0);
  await expectReviewAttention(page, confirm(page));
  await expect(totalCheck).toHaveCount(0);
  const before = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")!),
  );
  await page
    .locator(
      '.reader-notes:has(button[aria-label="View source for printed total"]) > summary',
    )
    .click();
  await page
    .getByRole("button", { name: "View source for printed total", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for printed total",
    exact: true,
  });
  await expect(dialog.getByTestId("source-region")).toHaveCount(1);
  await expect(
    dialog.getByRole("checkbox", {
      name: "I checked printed total against the original",
      exact: true,
    }),
  ).toHaveCount(0);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: await qaArtifactPath(info, `fallback-total-source-${width}.png`),
    });
  }
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  const after = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")!),
  );
  expect(after.receipt).toEqual(before.receipt);
  await expectReviewAttention(page, confirm(page));
  expect(posts.map((post) => post.path)).toEqual([
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
  expect(before.receipt.printedTotal).toBe("5.50");
});

test("configured automatic computer check invokes independent vision for a missing quantity (mock protocol)", async ({
  page,
}, info) => {
  const { posts, scan, select } = await setup(page, [
    "MARKET",
    "Tea 5.50",
    "TOTAL GBP 5.50",
  ]);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await select.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: await qaArtifactPath(info, `automatic-${width}.png`),
    });
  }
  const audit = await new AxeBuilder({ page }).analyze();
  expect(audit.violations).toEqual([]);
  await scan.click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(1);
  expect(posts.map((post) => post.path)).toEqual([
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
  expect(posts[1].body).toEqual(posts[0].body); // Original sections only; no first-model text or user context.
  expect(Object.keys(posts[1].body as object)).toEqual(["panels"]);
  await expect(
    page.getByText("Both local readings finished.", { exact: false }).first(),
  ).toBeVisible();
  await expectReviewAttention(page, confirm(page));
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")!),
  );
  expect(saved.receipt.reviewChecks).toContainEqual(
    expect.objectContaining({ field: "quantity", confirmedValue: "" }),
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await writeFile(
    await qaArtifactPath(info, "automatic-review.json"),
    JSON.stringify(
      {
        posts: posts.map(({ path }) => path),
        receipt: saved.receipt,
        axeViolations: audit.violations,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
});

test("a clear primary draft skips the second model and retains receipt-level review (mock protocol)", async ({
  page,
}) => {
  const { scan, posts } = await setup(page);
  await scan.click();
  await expect(coverage(page)).toHaveCount(0);
  expect(posts.map((post) => post.path)).toEqual(["/api/receipts/recognize"]);
  await expectReviewAttention(page, confirm(page));
  await expect(coverage(page)).toHaveCount(0);
  await expectReviewReady(page, confirm(page));
});

for (const mode of ["off", "always"])
  test(`the configured ${mode} policy controls the extra local reader (mock protocol)`, async ({
    page,
  }) => {
    const { scan, posts } = await setup(page, clear, false, false, false, mode);
    await scan.click();
    await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(1);
    expect(posts.map((post) => post.path)).toEqual([
      "/api/receipts/recognize",
      ...(mode === "always" ? ["/api/receipts/vision"] : []),
    ]);
  });

test("a failed automatic comparison preserves negative-line classification separately from purchase coverage (mock protocol)", async ({
  page,
}) => {
  const { scan, posts } = await setup(
    page,
    [
      "MARKET",
      "Groceries 1x 10.00 10.00",
      "Loyalty credit -2.00",
      "Prices include tax",
      "TOTAL GBP 8.00",
    ],
    true,
  );
  await scan.click();
  const classification = page.getByRole("checkbox", {
    name: "I checked receipt adjustments against the original",
    exact: true,
  });
  await expect(classification).toHaveCount(0);
  await expect(coverage(page)).toHaveCount(0);
  await expectReviewAttention(page, confirm(page));
  await expect(classification).toHaveCount(0);
  await expect(classification).toHaveCount(0);
  await expectReviewReady(page, confirm(page));
  expect(posts.map((post) => post.path)).toEqual([
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
});
