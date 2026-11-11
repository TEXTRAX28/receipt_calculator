import { expectReviewAttention, expectReviewReady } from "./review-assertions";
import { expect, test, type Page } from "./editor-fixture";
import { planVisionBatches } from "../../src/lib/vision-plan.mjs";
import {
  longDraft,
  longRecognition,
  longRows,
} from "../fixtures/long-local-receipt";

async function setup(page: Page, count = 4, standalone = false) {
  const rows =
    count === 4
      ? longRows
      : Array.from({ length: count }, (_, index) => [
          ...(index === 0 ? ["Little Market", "Currency GBP"] : []),
          `Product ${index + 1} 1x 1.00 1.00`,
          ...(index === count - 1
            ? [`TOTAL GBP ${count}.00`, "PRICES INCLUDE TAX"]
            : []),
        ]);
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        assistedReader: standalone ? "vision" : "computer",
        localCheckMode: "always",
        localModel: { configured: true, name: "PaddleOCR" },
        localVision: {
          configured: true,
          name: "Qwen3-VL 4B",
          maxPanels: 3,
          maxReceiptPanels: 24,
          supportsBatches: true,
        },
      },
    }),
  );
  await page.route("**/api/receipts/recognize", (route) => {
    const panels = route.request().postDataJSON().panels;
    expect(panels.map((panel: { photo: number }) => panel.photo)).toEqual(
      Array.from({ length: count }, (_, index) => index + 1),
    );
    const recognition =
      count === 4
        ? longRecognition()
        : {
            engine: "paddle-ppocrv6-medium-onnx",
            panels: rows.map((texts, index) => {
              const lines = texts.map((text, row) => ({
                text,
                confidence: 0.99,
                box: [0.1, 0.1 + row * 0.2, 0.9, 0.18 + row * 0.2],
              }));
              return {
                photo: index + 1,
                part: 1,
                width: 700,
                height: 700,
                lines,
                words: lines,
              };
            }),
          };
    return route.fulfill({ json: { recognition } });
  });
  await page.goto("/");
  const images = await page.evaluate(
    (rows) =>
      rows.map((texts) => {
        const canvas = document.createElement("canvas");
        canvas.width = 700;
        canvas.height = 700;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, 700, 700);
        context.fillStyle = "black";
        context.font = "24px monospace";
        context.fillText("SYNTHETIC PROTOCOL FIXTURE", 20, 40);
        texts.forEach((text, index) =>
          context.fillText(text, 65, 115 + index * 140),
        );
        return canvas.toDataURL("image/png").split(",")[1];
      }),
    rows,
  );
  await page.getByLabel("Upload receipt images").setInputFiles(
    images.map((image, index) => ({
      name: `section-${index + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    })),
  );
  await page
    .getByRole("button", {
      name: standalone
        ? "Assisted scan · Local vision"
        : "Assisted scan · This computer",
      exact: true,
    })
    .click();
  return page.getByRole("button", {
    name: standalone
      ? "Read receipt with local vision"
      : "Read receipt on this computer",
    exact: true,
  });
}
function stream(count = 4) {
  const plan = planVisionBatches(count);
  return [
    { type: "start", batches: plan.length, sections: count },
    ...plan.flatMap((indices: number[], index: number) => {
      const receipt =
        count === 4
          ? longDraft(indices)
          : {
              merchant: indices.includes(0) ? "Little Market" : "",
              date: "",
              currency:
                indices.includes(0) || indices.includes(count - 1) ? "GBP" : "",
              subtotal: "",
              printedTotal: indices.includes(count - 1) ? `${count}.00` : "",
              printedTax: "",
              pricesIncludeTax: indices.includes(count - 1) ? true : null,
              printedItemCount: null,
              taxCodes: [],
              adjustments: [],
              warnings: [],
              items: indices.map((index) => ({
                description: `Product ${index + 1}`,
                quantity: "1",
                unitPrice: "1.00",
                lineTotal: "1.00",
                discount: "0",
                taxCode: "",
                note: "",
                sourcePhotos: [index + 1],
              })),
            };
      return [
        { type: "reading", index: index + 1, indices },
        { type: "batch", index: index + 1, indices, receipt },
      ];
    }),
    { type: "done", batches: plan.length },
  ];
}

for (const count of [4, 12])
  test(`${count} original photos → bounded local batches → reviewed exact split (mock protocol)`, async ({
    page,
  }) => {
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST")
        posts.push(new URL(request.url()).pathname);
    });
    await page.route("**/api/receipts/vision-batches", (route) => {
      const body = route.request().postDataJSON();
      expect(Object.keys(body)).toEqual(["panels"]);
      expect(body.panels).toHaveLength(count);
      return route.fulfill({
        contentType: "application/x-ndjson",
        body:
          stream(count)
            .map((value) => JSON.stringify(value))
            .join("\n") + "\n",
      });
    });
    await (await setup(page, count, count === 12)).click();
    await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(
      count === 4 ? 6 : 12,
    );
    const confirm = page.getByRole("button", {
      name: "Confirm receipt & add people",
    });
    await expectReviewAttention(page, confirm);
    if (count === 4) {
      const positions: string[] = [];
      for (const index of [4, 5]) {
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
        await expect(dialog.getByTestId("source-region")).toHaveCount(1);
        positions.push(
          (await dialog.getByTestId("source-region").getAttribute("y"))!,
        );
        await dialog
          .getByRole("button", { name: "Back to receipt", exact: true })
          .click();
      }
      expect(new Set(positions).size).toBe(2);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await expect(
      page.getByRole("checkbox", { name: /^I checked/ }),
    ).toHaveCount(0);
    await expectReviewReady(page, confirm);
    await confirm.click();
    for (const name of ["Alice", "Bob"]) {
      await page
        .getByRole("textbox", { name: "Person’s name", exact: true })
        .fill(name);
      await page
        .getByRole("button", { name: "Add person", exact: true })
        .click();
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
    for (const index of [0, 1])
      await expect(page.getByTestId(`person-total-${index}`)).toHaveText(
        count === 4 ? "£9.75" : "£6.00",
      );
    expect(posts).toEqual([
      "/api/receipts/recognize",
      "/api/receipts/vision-batches",
    ]);
  });
test("an unsupported tax table remains editable when prices include tax", async ({
  page,
}) => {
  await page.route("**/api/receipts/vision-batches", (route) => {
    const values = stream();
    const second = values.find(
      (value) =>
        value.type === "batch" && "index" in value && value.index === 2,
    ) as { receipt: ReturnType<typeof longDraft> };
    second.receipt.taxCodes = [{ code: "A", rate: "20" }];
    second.receipt.items[0].taxCode = "A";
    return route.fulfill({
      contentType: "application/x-ndjson",
      body: values.map((value) => JSON.stringify(value)).join("\n") + "\n",
    });
  });
  await (await setup(page)).click();
  await expect(
    page.getByRole("button", { name: "Remove tax code 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Remove tax code 1", exact: true })
    .click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt
          .pricesIncludeTax,
    ),
  ).toBe(true);
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expectReviewAttention(page, confirm);
  await expect(
    page.getByRole("checkbox", {
      name: "I checked purchase list against the original",
      exact: true,
    }),
  ).toHaveCount(0);
  await expectReviewReady(page, confirm);
});

test("a stopped long-receipt stream keeps the first draft explicitly unverified and retains every photo", async ({
  page,
}) => {
  await page.route("**/api/receipts/vision-batches", (route) =>
    route.fulfill({
      contentType: "application/x-ndjson",
      body:
        stream()
          .slice(0, 3)
          .map((value) => JSON.stringify(value))
          .join("\n") + "\n",
    }),
  );
  await (await setup(page)).click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(6);
  await expectReviewAttention(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
  await expect(
    page.getByText(/extra comparison could not/i).first(),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expect(page.locator(".selected-image")).toHaveCount(4);
});
