import { expect, test, type Page } from "./editor-fixture";
import { qaArtifactPath } from "./qa-artifacts";

// UI protocol only. Browser routes never contact OpenAI or use a real key.
async function setup(page: Page, enabled: boolean, succeeds = false) {
  let remaining = enabled ? 1 : 0,
    calls = 0;
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: { localModel: { configured: false, name: "PaddleOCR" } },
    }),
  );
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
    calls++;
    const body = route.request().postDataJSON();
    expect(body.consent).toBe(true);
    expect(body.useCredits).toBe(true);
    expect(Object.keys(body).sort()).toEqual([
      "consent",
      "panels",
      "useCredits",
    ]);
    expect(body.panels.length).toBeGreaterThan(0);
    remaining = 0;
    await route.fulfill(
      succeeds
        ? {
            json: {
              receipt: {
                merchant: "SYNTHETIC MARKET",
                date: "2026-11-04",
                currency: "GBP",
                subtotal: "5.00",
                printedTotal: "5.00",
                printedTax: "0.00",
                pricesIncludeTax: true,
                printedItemCount: 1,
                taxCodes: [{ code: "Z", rate: "0" }],
                items: [
                  {
                    description: "Synthetic tea",
                    quantity: "2",
                    unitPrice: "2.50",
                    lineTotal: "5.00",
                    discount: "0",
                    taxCode: "Z",
                    note: "Protocol fixture, not a model reading",
                    sourcePhotos: [1],
                  },
                ],
                adjustments: [],
                warnings: [],
              },
            },
          }
        : {
            status: 429,
            json: {
              error:
                "OpenAI could not read this receipt. The attempt remains used and may have used API credits. No automatic retry was made.",
            },
          },
    );
  });
  await page.goto("/");
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 700, 700);
    ctx.fillStyle = "black";
    ctx.font = "25px monospace";
    ["SYNTHETIC MARKET", "Tea 2x 2.50 5.00", "TOTAL GBP 5.00"].forEach(
      (line, i) => ctx.fillText(line, 30, 70 + i * 70),
    );
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-openai-ui.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await expect(page.locator(".selected-image")).toHaveCount(1);
  expect(calls).toBe(0);
  if (!enabled) {
    await expect(
      page.getByRole("button", {
        name: "Assisted scan · OpenAI credits · last resort",
        exact: true,
      }),
    ).toHaveCount(0);
    return { calls: () => calls };
  }
  await expect(
    page.getByRole("button", {
      name: "Assisted scan · OpenAI credits · last resort",
      exact: true,
    }),
  ).toHaveAttribute("aria-pressed", "false");
  await page
    .getByRole("button", {
      name: "Assisted scan · OpenAI credits · last resort",
      exact: true,
    })
    .click();
  return { calls: () => calls };
}

test("OpenAI stays disabled without an allowance and never selects itself", async ({
  page,
}) => {
  const fixture = await setup(page, false);
  await expect(
    page.getByRole("button", {
      name: "Read receipt with OpenAI credits",
      exact: true,
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("checkbox", {
      name: /^Send these receipt sections to OpenAI/,
    }),
  ).toHaveCount(0);
  expect(fixture.calls()).toBe(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

test("credit consent is required; failure preserves photos and refreshes the used allowance", async ({
  page,
}, info) => {
  const fixture = await setup(page, true);
  const scan = page.getByRole("button", {
    name: "Read receipt with OpenAI credits",
    exact: true,
  });
  await expect(scan).toBeDisabled();
  const consent = page.getByRole("checkbox", {
    name: /^Send these receipt sections to OpenAI/,
  });
  await consent.check();
  await scan.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "attempt remains used" }),
  ).toBeVisible();
  await expect(scan).toBeDisabled();
  await expect(consent).not.toBeChecked();
  await expect(page.locator(".selected-image")).toHaveCount(1);
  expect(fixture.calls()).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await qaArtifactPath(
      info,
      `openai-last-resort-failure-${info.project.name}.png`,
    ),
  });
  await page
    .getByRole("button", { name: "On-device scan", exact: true })
    .click();
  await expect(page.locator(".selected-image")).toHaveCount(1);
  expect(fixture.calls()).toBe(1);
});

test("a successful fake response reaches ordinary review with unchanged amounts", async ({
  page,
}, info) => {
  const fixture = await setup(page, true, true);
  await page
    .getByRole("checkbox", { name: /^Send these receipt sections to OpenAI/ })
    .check();
  await page
    .getByRole("button", {
      name: "Read receipt with OpenAI credits",
      exact: true,
    })
    .click();
  await expect(
    page.getByLabel("Item 1 line price", { exact: true }),
  ).toHaveValue("5.00");
  await page
    .getByRole("button", { name: "Edit details for item 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 1 purchased quantity", { exact: true }),
  ).toHaveValue("2");
  await expect(
    page.getByLabel("Item 1 unit price (optional)", { exact: true }),
  ).toHaveValue("2.50");
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "5.00",
  );
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeVisible();
  expect(fixture.calls()).toBe(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await qaArtifactPath(
      info,
      `openai-last-resort-review-${info.project.name}.png`,
    ),
  });
});
