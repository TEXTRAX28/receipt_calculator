import { expect, test, type Page } from "@playwright/test";
import { resolve } from "node:path";
import { prepareOpenAiRequest } from "../../server/openai-reader.mjs";

const scan = (page: Page) =>
  page.getByRole("button", {
    name: "Read receipt with OpenAI credits",
    exact: true,
  });
const consent = (page: Page) =>
  page.getByRole("checkbox", {
    name: /^Send these receipt sections to OpenAI/,
  });

async function uploadPhotos(page: Page, count: number) {
  const photo = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 850;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "28px monospace";
    context.fillText("SYNTHETIC CAFE", 32, 80);
    context.fillText("2 Ramen   18.80   37.20", 32, 160);
    context.fillText("TOTAL GBP 37.20", 32, 240);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles(
    Array.from({ length: count }, (_, index) => ({
      name: `test-receipt-${index + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(photo, "base64"),
    })),
  );
  await expect(page.locator(".selected-image")).toHaveCount(count);
}

// Fake responses exercise browser transport and review without using credits.
async function stubOpenAi(page: Page, fails = false) {
  const requests: { photo: number; part: number }[][] = [];
  let remaining = 1;
  await page.route("**/api/receipts/openai/config", (route) =>
    route.fulfill({
      json: {
        provider: "OpenAI",
        model: "gpt-6-astra",
        configured: remaining > 0,
        remaining,
        estimateGuardUsd: 0.6,
        availability: remaining ? "ready" : "exhausted",
      },
    }),
  );
  await page.route("**/api/receipts/openai", async (route) => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body).sort()).toEqual([
      "consent",
      "panels",
      "useCredits",
    ]);
    expect(body.consent).toBe(true);
    expect(body.useCredits).toBe(true);
    const panels = body.panels as {
      photo: number;
      part: number;
      data: string;
    }[];
    // Exercise the real adapter's JPEG and cost validation on browser output.
    expect(() => prepareOpenAiRequest(panels)).not.toThrow();
    requests.push(panels.map(({ photo, part }) => ({ photo, part })));
    remaining = 0;
    if (fails) {
      await route.fulfill({
        status: 429,
        json: { error: "OpenAI rate limit reached." },
      });
      return;
    }
    await route.fulfill({
      json: {
        receipt: {
          merchant: "SYNTHETIC CAFE",
          date: "",
          currency: "GBP",
          subtotal: "37.20",
          printedTotal: "37.20",
          printedTax: "",
          taxRegistrationNumber: "",
          pricesIncludeTax: true,
          printedItemCount: 1,
          taxCodes: [],
          items: [
            {
              description: "Ramen",
              quantity: "2",
              unitPrice: "18.80",
              lineTotal: "37.20",
              discount: "0",
              taxCode: "",
              note: "",
              sourcePhotos: [...new Set(panels.map((panel) => panel.photo))],
            },
          ],
          adjustments: [],
          warnings: [],
        },
      },
    });
  });
  return requests;
}

test("only OpenAI is offered, with a disabled scan when the server has no key", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await uploadPhotos(page, 1);
  await expect(page.getByRole("group", { name: "OpenAI scan" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /On-device scan|Assisted scan/ }),
  ).toHaveCount(0);
  await expect(
    page.getByText("Add a server-side OpenAI API key and restart Gather.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(scan(page)).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Enter manually", exact: true }),
  ).toBeEnabled();
  expect((await request.get("/api/receipts/providers")).status()).toBe(404);
  expect(
    (
      await request.post("/api/receipts/recognize", {
        data: {},
        headers: { origin: new URL(page.url()).origin },
      })
    ).status(),
  ).toBe(404);
});

test("ordered photos use a single authorized OpenAI request and preserve exact splits", async ({
  page,
}) => {
  const requests = await stubOpenAi(page);
  await page.goto("/");
  await uploadPhotos(page, 2);
  await expect(scan(page)).toBeDisabled();
  await consent(page).check();
  await page
    .getByRole("button", { name: "Move image 2 earlier", exact: true })
    .click();
  await expect(consent(page)).not.toBeChecked();
  await expect(scan(page)).toBeDisabled();
  expect(requests).toHaveLength(0);
  await consent(page).check();
  await scan(page).click();
  const receipt = page.getByRole("region", { name: "Digital receipt" });
  await expect(receipt).toContainText("£18.60 each");
  await expect(receipt).toContainText("£37.20");
  expect(requests).toEqual([
    [
      { photo: 1, part: 1 },
      { photo: 2, part: 1 },
    ],
  ]);
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
  for (const name of ["Alex", "Sam"]) {
    await page.getByLabel("Person’s name").fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Share all equally", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£18.60");
  await expect(page.getByTestId("person-total-1")).toHaveText("£18.60");
});

test("a text-bearing PDF sends its rendered pages through the OpenAI scan", async ({
  page,
}) => {
  const requests = await stubOpenAi(page);
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(resolve("tests/fixtures/pdfs/digital-two-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Read PDF text on this device" }),
  ).toHaveCount(0);
  await consent(page).check();
  await scan(page).click();
  await expect(
    page.getByRole("region", { name: "Digital receipt" }),
  ).toBeVisible();
  expect(requests).toEqual([
    [
      { photo: 1, part: 1 },
      { photo: 2, part: 1 },
    ],
  ]);
});

test("a failed scan keeps the photos and updates the allowance without retrying", async ({
  page,
}) => {
  const requests = await stubOpenAi(page, true);
  await page.goto("/");
  await uploadPhotos(page, 1);
  await consent(page).check();
  await scan(page).click();
  await expect(page.getByRole("alert")).toContainText(
    "OpenAI rate limit reached.",
  );
  await expect(
    page.getByText("The app’s OpenAI scan allowance is used up.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(consent(page)).not.toBeChecked();
  await expect(scan(page)).toBeDisabled();
  await expect(page.locator(".selected-image")).toHaveCount(1);
  expect(requests).toHaveLength(1);
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your receipt." }),
  ).toBeVisible();
});
