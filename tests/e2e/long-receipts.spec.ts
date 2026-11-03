import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
import { aiCostcoDraft } from "../fixtures/ai-receipt";

async function picture(page: Page, tall = false) {
  const base64 = await page.evaluate((isTall) => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = isTall ? 4400 : 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#111";
    ctx.font = "bold 32px monospace";
    ctx.fillText("LITTLE MARKET", 45, 80);
    const count = isTall ? 40 : 2;
    for (let index = 0; index < count; index++)
      ctx.fillText(
        `${index === 0 ? "Milk" : index === count - 1 ? "Bread" : `Item${String(index + 1).padStart(2, "0")}`} 1x 1.00 1.00`,
        45,
        180 + index * 90,
      );
    ctx.fillText(`TOTAL GBP ${count}.00`, 45, canvas.height - 110);
    return canvas.toDataURL("image/png").split(",")[1];
  }, tall);
  return {
    name: tall ? "tall-synthetic.png" : "synthetic-section.png",
    mimeType: "image/png",
    buffer: Buffer.from(base64, "base64"),
  };
}
async function configureMockGemini(page: Page) {
  // These routes test the UI contract, not a paid/live model or extraction accuracy.
  await page.route("**/api/receipts/config", (route) =>
    route.fulfill({
      json: {
        configured: true,
        provider: "Gemini",
        model: "test-fixture-model",
      },
    }),
  );
}

test("Gemini setup is honest when no key is configured and sends no photos", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.route("**/api/receipts/config", (route) =>
    route.fulfill({
      json: {
        configured: false,
        provider: "Gemini",
        model: "gemini-3.8-flash",
      },
    }),
  );
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  let uploads = 0;
  page.on("request", (request) => {
    if (request.method() === "POST") uploads++;
  });
  await page.getByRole("button", { name: "Gemini AI", exact: true }).click();
  await expect(
    page.getByText(
      "Gemini needs a server API key and a scan allowance before scanning.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Read receipt with Gemini" }),
  ).toBeDisabled();
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Gemini AI", exact: true }),
  ).toBeEnabled();
  await mkdir("qa-artifacts", { recursive: true });
  await page
    .locator(".reader-choice")
    .screenshot({ path: `qa-artifacts/${info.project.name}-gemini-setup.png` });
  await page
    .getByText("Connect Gemini on this computer", { exact: true })
    .click();
  await expect(
    page.getByText("GEMINI_API_KEY=", { exact: true }),
  ).toBeVisible();
  expect(uploads).toBe(0);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await page.getByRole("button", { name: "On-device", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read receipt on this device" }),
  ).toBeEnabled();
});

test("ordered photos → explicit Gemini consent → structured review → exact finalized split (mock provider)", async ({
  page,
}, info) => {
  await configureMockGemini(page);
  const packets: {
    consent: boolean;
    panels: { photo: number; part: number; data: string }[];
  }[] = [];
  await page.route("**/api/receipts/extract", async (route) => {
    packets.push(route.request().postDataJSON());
    await route.fulfill({ json: { receipt: aiCostcoDraft() } });
  });
  await page.goto("/");
  const file = await picture(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles([file, { ...file, name: "footer.png" }]);
  const first = await page
    .locator(".selected-image img")
    .nth(0)
    .getAttribute("src");
  const second = await page
    .locator(".selected-image img")
    .nth(1)
    .getAttribute("src");
  await page
    .getByRole("button", { name: "Move image 1 later", exact: true })
    .click();
  await expect(page.locator(".selected-image img").nth(0)).toHaveAttribute(
    "src",
    second!,
  );
  await expect(page.locator(".selected-image img").nth(1)).toHaveAttribute(
    "src",
    first!,
  );
  await page
    .getByRole("button", { name: "Move image 1 later", exact: true })
    .click();
  await page.getByRole("button", { name: "Gemini AI", exact: true }).click();
  const scan = page.getByRole("button", {
    name: "Read receipt with Gemini",
    exact: true,
  });
  await expect(scan).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "Send these receipt photos to Google Gemini for this scan",
    })
    .check();
  await expect(scan).toBeEnabled();
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  const viewport = page.viewportSize()!;
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(viewport.width);
  await mkdir("qa-artifacts", { recursive: true });
  await page.locator(".reader-choice").screenshot({
    path: `qa-artifacts/${info.project.name}-gemini-reader.png`,
  });
  await scan.click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible();
  expect(packets).toHaveLength(1);
  expect(packets[0].consent).toBe(true);
  expect(packets[0].panels.map((panel) => panel.photo)).toEqual([1, 2]);
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(18);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("176.78");
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
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
  await expect(page.getByTestId("person-total-0")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-1")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-2")).toHaveText("£58.92");
});

test("twelve photos are accepted, a thirteenth is rejected, and consent resets after reordering", async ({
  page,
}) => {
  await configureMockGemini(page);
  await page.goto("/");
  const file = await picture(page);
  await page.getByLabel("Upload receipt images").setInputFiles(
    Array.from({ length: 12 }, (_, index) => ({
      ...file,
      name: `section-${index + 1}.png`,
    })),
  );
  await expect(page.locator(".selected-image")).toHaveCount(12);
  await page.getByRole("button", { name: "Gemini AI", exact: true }).click();
  const consent = page.getByRole("checkbox", {
    name: "Send these receipt photos to Google Gemini for this scan",
  });
  await consent.check();
  await page
    .getByRole("button", { name: "Move image 2 earlier", exact: true })
    .click();
  await expect(consent).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Read receipt with Gemini" }),
  ).toBeDisabled();
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles({ ...file, name: "one-too-many.png" });
  await expect(page.getByRole("alert")).toContainText(
    "at most 12 images or PDF pages",
  );
  await expect(page.locator(".selected-image")).toHaveCount(12);
});

test("Gemini quota failure keeps photos and offers the on-device reader (mock provider)", async ({
  page,
}) => {
  await configureMockGemini(page);
  await page.route("**/api/receipts/extract", (route) =>
    route.fulfill({
      status: 429,
      json: {
        error: "Gemini's usage limit was reached. Use the on-device reader.",
      },
    }),
  );
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  await page.getByRole("button", { name: "Gemini AI", exact: true }).click();
  await page
    .getByRole("checkbox", {
      name: "Send these receipt photos to Google Gemini for this scan",
    })
    .check();
  await page.getByRole("button", { name: "Read receipt with Gemini" }).click();
  await expect(page.getByRole("alert")).toContainText("usage limit");
  await expect(
    page.getByRole("button", { name: "Preview image 1" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "On-device", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Read receipt on this device" }),
  ).toBeEnabled();
});

test("a tall photograph creates readable overlapping panels and real OCR reaches its footer", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page, true));
  await expect(page.locator(".selected-image")).toContainText(/\d+ sections/);
  await page
    .getByRole("button", { name: "Read receipt on this device" })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("40.00");
  await expect(
    page.getByText("A tall photo was read in overlapping detail sections.", {
      exact: false,
    }),
  ).toBeVisible();
  const names = await page
    .getByRole("textbox", { name: /^Item \d+ description$/ })
    .evaluateAll((inputs) =>
      inputs.map((input) => (input as HTMLInputElement).value),
    );
  expect(names).toHaveLength(40);
  expect(names.some((name) => /Milk/i.test(name))).toBe(true);
  expect(names.some((name) => /Bread/i.test(name))).toBe(true);
  await expect(
    page.getByRole("checkbox", {
      name: "I checked purchase list against the original",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  ).toBeDisabled();
});
