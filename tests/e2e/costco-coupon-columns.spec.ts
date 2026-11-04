import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { couponColumnFixture } from "../fixtures/costco-coupon-columns";
import { qaArtifactPath } from "./qa-artifacts";

test("joined and fragmented coupons retain their original source regions and required review (mock protocol)", async ({
  page,
}, info) => {
  const sample = couponColumnFixture();
  const posts: { path: string; body: unknown }[] = [];
  await page.route("**/api/receipts/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/providers"))
      return route.fulfill({
        json: {
          localModel: { configured: true, name: "PaddleOCR" },
          localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
        },
      });
    const body = route.request().postDataJSON();
    posts.push({ path, body });
    if (path.endsWith("/recognize")) {
      expect(body.panels).toHaveLength(1);
      return route.fulfill({
        json: { recognition: sample.recognition, warnings: [] },
      });
    }
    if (path.endsWith("/vision"))
      return route.fulfill({ json: { receipt: sample.draft } });
    return route.abort();
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "This computer", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const image = await page.evaluate((panel) => {
    const canvas = document.createElement("canvas");
    canvas.width = panel.width;
    canvas.height = panel.height;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "black";
    ctx.font = "24px monospace";
    ctx.fillText("SYNTHETIC PROTOCOL FIXTURE", 40, 30);
    for (const word of panel.words)
      ctx.fillText(
        word.text,
        word.box[0] * panel.width,
        word.box[3] * panel.height - 5,
      );
    return canvas.toDataURL("image/png").split(",")[1];
  }, sample.panel);
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-coupon-columns.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  expect(posts.map(({ path }) => path)).toEqual([
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
  expect(posts[1].body).toEqual(posts[0].body);
  const readSaved = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem("gather.receipt.v1")!));
  const before = await readSaved();
  expect(
    before.receipt.items.map(
      (item: { description: string; discount: string }) => [
        item.description,
        item.discount,
      ],
    ),
  ).toEqual([
    ["Canvas backpack", "5.00"],
    ["Duck eggs", "1.00"],
  ]);
  for (const [index, regions] of [
    [1, 3],
    [2, 4],
  ]) {
    await page
      .getByRole("button", {
        name: `View source for item ${index}`,
        exact: true,
      })
      .click();
    const dialog = page.getByRole("dialog", {
      name: `Receipt source for purchase ${index}`,
      exact: true,
    });
    await expect(dialog.getByTestId("source-region")).toHaveCount(regions);
    await expect(
      dialog.getByRole("checkbox", {
        name: "I checked item discount against the original",
        exact: true,
      }),
    ).not.toBeChecked();
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: await qaArtifactPath(
          info,
          `coupon-column-source-${index}-${width}.png`,
        ),
      });
    }
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
  expect((await readSaved()).receipt).toEqual(before.receipt);
  // This fixture needs per-item discount review, not a purchase-list check.
  // Confirming one recovered coupon must leave the other coupon unconfirmed.
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  const firstSource = page.getByRole("dialog", {
    name: "Receipt source for purchase 1",
    exact: true,
  });
  await firstSource
    .getByRole("checkbox", {
      name: "I checked item discount against the original",
      exact: true,
    })
    .check();
  await firstSource
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  const afterFirst = await readSaved();
  expect(afterFirst.receipt.items).toEqual(before.receipt.items);
  const discountChecks = (itemId: string) =>
    afterFirst.receipt.reviewChecks.filter(
      (check: { scope: string; field: string; itemId?: string }) =>
        check.scope === "item" &&
        check.field === "discount" &&
        check.itemId === itemId,
    );
  const firstChecks = discountChecks(before.receipt.items[0].id);
  const secondChecks = discountChecks(before.receipt.items[1].id);
  expect(firstChecks.length).toBeGreaterThan(0);
  expect(secondChecks.length).toBeGreaterThan(0);
  expect(
    firstChecks.every(
      (check: { confirmedValue: string }) => !!check.confirmedValue,
    ),
  ).toBe(true);
  expect(
    secondChecks.every(
      (check: { confirmedValue: string }) => check.confirmedValue === "",
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeDisabled();
  await writeFile(
    await qaArtifactPath(info, "coupon-column-review.json"),
    JSON.stringify(
      {
        receipt: before.receipt,
        paths: posts.map(({ path }) => path),
        native_inference_calls: 0,
        private_uploads: 0,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
});
