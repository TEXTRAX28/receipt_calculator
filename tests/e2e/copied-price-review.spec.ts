import { expect, test } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { comparedRecognition } from "../fixtures/compared-receipt";
import { appSchema } from "../../src/lib/model";
import { qaArtifactPath } from "./qa-artifacts";

test("a copied price with a name disagreement stays linked to source and unconfirmed on a phone (mock protocol)", async ({
  page,
}, info) => {
  const rows = [
    "Market",
    "1 Roast Chicken 17,500",
    "PRICES INCLUDE TAX",
    "TOTAL IDR 17,500",
  ];
  const posts: string[] = [],
    external: string[] = [],
    errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) &&
      !["data:", "blob:"].includes(url.protocol)
    ) {
      external.push(url.origin);
      return route.abort();
    }
    if (request.method() === "POST") posts.push(url.pathname);
    if (url.pathname === "/api/receipts/providers")
      return route.fulfill({
        json: {
          localModel: { configured: true, name: "PaddleOCR" },
          localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
        },
      });
    if (url.pathname === "/api/receipts/recognize") {
      expect(Object.keys(request.postDataJSON())).toEqual(["panels"]);
      return route.fulfill({
        json: comparedRecognition([{ photo: 1, part: 1 }], rows),
      });
    }
    if (url.pathname === "/api/receipts/vision") {
      expect(Object.keys(request.postDataJSON())).toEqual(["panels"]);
      return route.fulfill({
        json: {
          receipt: {
            merchant: "Market",
            date: "",
            currency: "IDR",
            subtotal: "",
            printedTotal: "17500",
            printedTax: "",
            pricesIncludeTax: true,
            printedItemCount: 1,
            taxCodes: [],
            adjustments: [],
            warnings: [],
            items: [
              {
                description: "1 Roast Chieken",
                quantity: "1",
                unitPrice: "",
                lineTotal: "17.500",
                discount: "0",
                taxCode: "",
                note: "",
                sourcePhotos: [1],
              },
            ],
          },
        },
      });
    }
    if (
      url.pathname.startsWith("/api/") ||
      !["GET", "HEAD"].includes(request.method())
    )
      return route.abort();
    return route.continue();
  });
  await page.goto("/");
  const image = await page.evaluate((texts) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 1400;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, 700, 1400);
    context.fillStyle = "black";
    context.font = "28px monospace";
    texts.forEach((text, index) =>
      context.fillText(text, 56, ((index + 0.65) / (texts.length + 1)) * 1400),
    );
    return canvas.toDataURL("image/png").split(",")[1];
  }, rows);
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-copied-price.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByLabel("Local vision comparison", { exact: true })
    .selectOption("always");
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 1 line price", { exact: true }),
  ).toHaveValue("17500");
  const readState = async () =>
    appSchema.parse(
      await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!),
      ),
    );
  const state = await readState();
  expect(state.receipt.items[0].description).toBe("1 Roast Chieken");
  expect(state.receipt.items[0].unitPrice).toBe("");
  expect(state.receipt.reviewChecks).toContainEqual(
    expect.objectContaining({
      field: "lineTotal",
      reason: "recovered",
      other: "17.500",
      confirmedValue: "",
    }),
  );
  expect(
    state.receipt.reviewChecks.every((check) => !check.confirmedValue),
  ).toBe(true);
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for purchase 1",
    exact: true,
  });
  await expect(dialog.getByTestId("source-region")).toHaveCount(1);
  await dialog
    .getByText("Recognized text in this area", { exact: true })
    .click();
  await expect(
    dialog.getByText("1 Roast Chicken 17,500", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Previous invalid vision price: 17.500", { exact: true }),
  ).toBeVisible();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  const picture = await qaArtifactPath(info, "source-review.png");
  await page.screenshot({ path: picture });
  await dialog
    .getByRole("checkbox", {
      name: "I checked line price against the original",
      exact: true,
    })
    .check();
  await dialog
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expect(confirm).toBeDisabled();
  expect(
    (await readState()).receipt.reviewChecks.find(
      (check) => check.field === "lineTotal",
    )?.confirmedValue,
  ).not.toBe("");
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
  expect(external).toEqual([]);
  expect(errors).toEqual([]);
  await writeFile(
    await qaArtifactPath(info, "result.json"),
    JSON.stringify(
      {
        state,
        posts,
        external,
        errors,
        sourceScreenshot: picture,
        priceCheckedExplicitlyAndOtherChecksStillBlock: true,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
});
