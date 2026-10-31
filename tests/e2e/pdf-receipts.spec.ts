import { qaArtifactPath } from "./qa-artifacts";
import { expect, test, type Page } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const fixture = (name: string) => path.resolve("tests/fixtures/pdfs", name);
async function setup(page: Page, computer = false) {
  const requests = { posts: [] as string[], external: [] as string[] };
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    )
      return route.continue();
    requests.external.push(url.origin);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      requests.posts.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        localModel: { configured: computer, name: "PaddleOCR" },
        localVision: {
          configured: false,
          name: "Qwen3-VL 4B",
          maxPanels: 3,
          supportsBatches: true,
          maxReceiptPanels: 24,
        },
      },
    }),
  );
  await page.goto("/");
  return requests;
}

test("a digital purchase area can be reread by actual on-device OCR without changing its financial draft", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const requests = await setup(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("digital-two-page.pdf"));
  await page
    .getByRole("button", { name: "Read PDF text on this device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "View source for item 2", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for purchase 2",
  });
  const saved = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
  );
  await dialog
    .getByRole("button", { name: "Reread this purchase", exact: true })
    .click();
  await expect(dialog.getByText(/This reads on your device/)).toBeVisible();
  const started = Date.now();
  await dialog
    .getByRole("button", { name: "Read selected area", exact: true })
    .click();
  await expect(dialog.locator(".area-read-text")).toContainText("Milk", {
    timeout: 130000,
  });
  await expect(dialog.locator(".area-read-text")).toContainText("2.50");
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
    ),
  ).toEqual(saved);
  await expect(
    dialog.getByLabel("Item 2 line price", { exact: true }),
  ).toHaveValue("2.50");
  await expect(
    dialog.getByLabel("Item 2 purchased quantity", { exact: true }),
  ).toHaveValue("2");
  await mkdir("qa-artifacts", { recursive: true });
  await dialog.screenshot({
    path: await qaArtifactPath(
      info,
      `area-device-real-${info.project.name}.png`,
    ),
  });
  await writeFile(
    await qaArtifactPath(info, `area-device-real-${info.project.name}.json`),
    JSON.stringify(
      {
        synthetic: true,
        method:
          "actual installed browser Tesseract on a selected rendered PDF area",
        elapsedMs: Date.now() - started,
        timingScope:
          "Selected-area crop preparation and browser OCR only; reused imported PDF and existing caches; not full scan latency or phone hardware",
        recognized: await dialog.locator(".area-read-text").textContent(),
        draftUnchanged: true,
        ...requests,
      },
      null,
      2,
    ),
  );
  await dialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "View source for item 2", exact: true }),
  ).toHaveCount(0);
  const persisted = await page.evaluate(() =>
    localStorage.getItem("gather.receipt.v1")!,
  );
  expect(persisted).not.toContain("area-read");
  expect(JSON.parse(persisted).receipt.rawText).toBe("");
  expect(requests.posts).toEqual([]);
  expect(requests.external).toEqual([]);
});

test("real PDF text → original row areas → checked three-person split, without OCR or cloud requests", async ({
  page,
}, info) => {
  const requests = await setup(page);
  const started = Date.now();
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("digital-two-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "PDF text", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({
    path: await qaArtifactPath(info, `pdf-upload-${info.project.name}.png`),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Read PDF text on this device", exact: true })
    .click();
  const elapsedMs = Date.now() - started;
  await expect(
    page.getByLabel("Item 1 description", { exact: true }),
  ).toHaveValue("Milk");
  await expect(
    page.getByLabel("Item 2 description", { exact: true }),
  ).toHaveValue("Milk");
  await expect(
    page.getByLabel("Item 3 description", { exact: true }),
  ).toHaveValue("Bread");
  for (const index of [1, 2]) {
    await page
      .getByRole("button", {
        name: `Edit details for item ${index}`,
        exact: true,
      })
      .click();
    await expect(
      page.getByLabel(`Item ${index} purchased quantity`, { exact: true }),
    ).toHaveValue("2");
    await expect(
      page.getByLabel(`Item ${index} line price`, { exact: true }),
    ).toHaveValue("2.50");
  }
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "6.50",
  );
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", { name: "View source for item 2", exact: true })
    .click();
  await expect(page.getByTestId("source-region")).toHaveCount(1);
  await page.locator(".receipt-source-image").screenshot({
    path: await qaArtifactPath(info, `pdf-source-${info.project.name}.png`),
  });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "I checked purchase list against the original",
      exact: true,
    })
    .check();
  await expect(confirm).toBeEnabled();
  await page.screenshot({
    path: await qaArtifactPath(info, `pdf-review-${info.project.name}.png`),
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await confirm.click();
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
  for (const [index, total] of ["£2.17", "£2.17", "£2.16"].entries())
    await expect(page.getByTestId(`person-total-${index}`)).toHaveText(total);
  expect(requests).toEqual({ posts: [], external: [] });
  expect(await page.evaluate(() => "__receiptPdfExecuted" in globalThis)).toBe(
    false,
  );
  await expect.poll(() => page.workers().length).toBe(0);
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  await writeFile(
    await qaArtifactPath(info, `pdf-flow-${info.project.name}.json`),
    JSON.stringify(
      {
        synthetic: true,
        pages: 2,
        embeddedTextExtraction: true,
        financialEdits: 0,
        purchases: 3,
        distinctRepeatedMilks: 2,
        totalMinor: "650",
        sharesMinor: ["217", "217", "216"],
        elapsedMs,
        requests,
        workersRemaining: page.workers().length,
      },
      null,
      2,
    ),
  );
});

test("a long digital PDF retains all sixty purchases and uses its full-page source coordinates", async ({
  page,
}, info) => {
  const requests = await setup(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("long-digital.pdf"));
  await expect(
    page.getByRole("button", { name: "PDF text", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Read PDF text on this device", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 60 description", { exact: true }),
  ).toHaveValue("Product 60");
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "60.00",
  );
  await expect(
    page.getByLabel("Item 61 description", { exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "View source for item 60", exact: true })
    .click();
  await expect(page.getByTestId("source-region")).toHaveCount(1);
  const region = page.getByTestId("source-region");
  expect(Number(await region.getAttribute("y"))).toBeGreaterThan(1500);
  await page.locator(".receipt-source-image").screenshot({
    path: await qaArtifactPath(
      info,
      `pdf-long-source-${info.project.name}.png`,
    ),
  });
  expect(requests).toEqual({ posts: [], external: [] });
});

for (const name of ["scanned-one-page.pdf", "mixed-two-page.pdf"])
  test(`${name} keeps every rendered page and uses the image-reader protocol`, async ({
    page,
  }) => {
    const requests = await setup(page, true);
    const count = name.startsWith("mixed") ? 2 : 1;
    await page.route("**/api/receipts/recognize", (route) => {
      const inputs = route.request().postDataJSON().panels;
      expect(inputs).toHaveLength(count);
      const rows = [
        "Little Market",
        "Currency GBP",
        "Milk 2x 1.25 2.50",
        "Milk 2x 1.25 2.50",
        "Bread 1x 1.50 1.50",
        "TOTAL GBP 6.50",
        "PRICES INCLUDE TAX",
      ];
      return route.fulfill({
        json: {
          recognition: {
            engine: "paddle-ppocrv6-medium-onnx",
            panels: inputs.map(
              (input: { photo: number; part: number }, index: number) => ({
                ...input,
                data: undefined,
                width: 600,
                height: 840,
                words: [],
                lines: (index === count - 1
                  ? rows
                  : ["Selectable header", "Reference 2026"]
                ).map((text, row) => ({
                  text,
                  confidence: 0.99,
                  box: [0.1, 0.1 + row * 0.1, 0.9, 0.15 + row * 0.1],
                })),
              }),
            ),
          },
        },
      });
    });
    await page.getByLabel("Upload receipt images").setInputFiles(fixture(name));
    await expect(page.locator(".selected-image")).toHaveCount(count);
    await expect(
      page.getByRole("button", { name: "PDF text", exact: true }),
    ).toHaveCount(0);
    await page
      .getByRole("button", {
        name: "Read receipt on this computer",
        exact: true,
      })
      .click();
    await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
      "6.50",
    );
    expect(requests).toEqual({
      posts: ["/api/receipts/recognize"],
      external: [],
    });
  });

test("password, page-count, dimension and malformed failures retain earlier pages and release the worker", async ({
  page,
}) => {
  const requests = await setup(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("scanned-one-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(1);
  for (const [name, message] of [
    ["password-protected.pdf", /Password-protected/],
    ["thirteen-pages.pdf", /13 pages/],
    ["oversized-page.pdf", /dimensions/],
    ["oversized-image.pdf", /could not be read safely/],
  ] as const) {
    await page.getByLabel("Upload receipt images").setInputFiles(fixture(name));
    await expect(page.getByRole("alert")).toContainText(message);
    await expect(page.locator(".selected-image")).toHaveCount(1);
    await expect.poll(() => page.workers().length).toBe(0);
  }
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "broken.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7\nnot a valid PDF"),
  });
  await expect(page.getByRole("alert")).toContainText(
    /could not be read safely/,
  );
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect.poll(() => page.workers().length).toBe(0);
  expect(requests).toEqual({ posts: [], external: [] });
});

test("rotated PDF writing keeps its preview and offers image readers", async ({
  page,
}) => {
  const requests = await setup(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("rotated-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "PDF text", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "On-device", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual({ posts: [], external: [] });
});

test("canceling a first PDF import keeps the capture screen usable and stops its owned worker", async ({
  page,
}) => {
  const requests = await setup(page);
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*pdf.worker*.mjs", async (route) => {
    await pending;
    await route.continue().catch(() => {});
  });
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(fixture("digital-two-page.pdf"));
  await expect(
    page.getByRole("button", { name: "Cancel import", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Cancel import", exact: true })
    .click();
  release();
  await expect(page.getByRole("alert")).toContainText(/cancelled/);
  await expect(page.locator(".selected-image")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Upload receipt", exact: true }),
  ).toBeEnabled();
  await expect.poll(() => page.workers().length).toBe(0);
  expect(requests).toEqual({ posts: [], external: [] });
});
