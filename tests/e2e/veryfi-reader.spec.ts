import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { qaArtifactPath } from "./qa-artifacts";
import { VERYFI_NOTICE } from "../../src/lib/veryfi-schema.mjs";

// Synthetic UI/transport controls. No request reaches an external provider.
const text = "SYNTHETIC MARKET\nTea 1x 5.50 5.50\nTOTAL GBP 5.50";
async function picture(page: Page, name = "section.png") {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 700;
    canvas.height = 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 700, 700);
    ctx.fillStyle = "black";
    ctx.font = "25px monospace";
    [
      "SYNTHETIC PROTOCOL FIXTURE",
      "SYNTHETIC MARKET",
      "Tea 1x 5.50 5.50",
      "TOTAL GBP 5.50",
    ].forEach((row, i) => ctx.fillText(row, 40, 70 + i * 70));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return { name, mimeType: "image/png", buffer: Buffer.from(base64, "base64") };
}
async function configure(page: Page, allowance = 1) {
  const quota = { remaining: allowance };
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        localModel: { configured: false, name: "PaddleOCR" },
        veryfi: {
          configured: quota.remaining > 0,
          remaining: quota.remaining,
          maxPanels: 15,
        },
      },
    }),
  );
  return quota;
}
const consentName =
  "Send these receipt sections to Veryfi for this scan. I have read the data-use notice above.";

test("Veryfi consent, phone layout, source review and exact split (synthetic transport)", async ({
  page,
}, info) => {
  const quota = await configure(page);
  const packets: Record<string, unknown>[] = [];
  const otherReaders: string[] = [];
  page.on("request", (req) => {
    if (/\/api\/receipts\/(extract|recognize|vision)/.test(req.url()))
      otherReaders.push(req.url());
  });
  await page.route("**/api/receipts/veryfi", async (route) => {
    packets.push(route.request().postDataJSON());
    quota.remaining = 0;
    await route.fulfill({
      json: { text, cleanup: "provider-reported-success", remaining: 0 },
    });
  });
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await picture(page));
  await page.getByRole("button", { name: "Veryfi OCR", exact: true }).click();
  const scan = page.getByRole("button", {
    name: "Read receipt with Veryfi",
    exact: true,
  });
  await expect(scan).toBeDisabled();
  await expect(
    page.getByText(/may use submitted data to improve its proprietary models/),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: consentName, exact: true }).check();
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await scan.scrollIntoViewIfNeeded();
    const bounds = await scan.boundingBox();
    expect(bounds!.width).toBeLessThanOrEqual(width);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.screenshot({
      path: await qaArtifactPath(info, `veryfi-consent-${width}.png`),
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await scan.click();
  expect(packets).toHaveLength(1);
  expect(Object.keys(packets[0]).sort()).toEqual([
    "consent",
    "panels",
    "privacyNotice",
  ]);
  expect(packets[0]).toMatchObject({
    consent: true,
    privacyNotice: VERYFI_NOTICE,
  });
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "5.50",
  );
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expect(confirm).toBeDisabled();
  for (const field of [
    "purchase list",
    "receipt adjustments",
    "whether item prices include tax",
  ])
    await page
      .getByRole("checkbox", {
        name: `I checked ${field} against the original`,
        exact: true,
      })
      .check();
  await expect(confirm).toBeEnabled();
  await expect(page.locator(".grand-total strong")).toHaveText("£5.50");
  await page.reload();
  await expect(confirm).toBeEnabled();
  await page.getByLabel("Item 1 line price", { exact: true }).fill("5.49");
  await expect(confirm).toBeDisabled();
  await page.getByLabel("Item 1 line price", { exact: true }).fill("5.50");
  await page
    .getByRole("checkbox", {
      name: "I checked purchase list against the original",
      exact: true,
    })
    .check();
  await expect(confirm).toBeEnabled();
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
  for (const checkbox of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£2.75");
  await expect(page.getByTestId("person-total-1")).toHaveText("£2.75");
  expect(otherReaders).toEqual([]);
});

test("changing photos or providers resets Veryfi consent; a failed last attempt retains photos", async ({
  page,
}) => {
  const quota = await configure(page);
  let packets = 0;
  await page.route("**/api/receipts/veryfi", async (route) => {
    packets++;
    quota.remaining = 0;
    await route.fulfill({
      status: 502,
      json: {
        error: "Synthetic Veryfi failure. No automatic retry was made.",
        cleanup: "unknown",
      },
    });
  });
  await page.goto("/");
  const file = await picture(page);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles([file, { ...file, name: "footer.png" }]);
  await page.getByRole("button", { name: "Veryfi OCR", exact: true }).click();
  const consent = page.getByRole("checkbox", {
    name: consentName,
    exact: true,
  });
  const scan = page.getByRole("button", {
    name: "Read receipt with Veryfi",
    exact: true,
  });
  await consent.check();
  await page
    .getByRole("button", { name: "Move image 1 later", exact: true })
    .click();
  await expect(consent).not.toBeChecked();
  await expect(scan).toBeDisabled();
  await consent.check();
  await page.getByRole("button", { name: "On-device", exact: true }).click();
  await page.getByRole("button", { name: "Veryfi OCR", exact: true }).click();
  await expect(consent).not.toBeChecked();
  await consent.check();
  await scan.click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Synthetic Veryfi failure" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Deletion of any new provider record could not be confirmed",
    }),
  ).toBeVisible();
  await expect(page.locator(".selected-image")).toHaveCount(2);
  await expect(scan).toBeDisabled();
  await expect(consent).not.toBeChecked();
  await expect(consent).toBeDisabled();
  await expect(
    page.getByText(/allowance is unavailable or used up/),
  ).toBeVisible();
  expect(packets).toBe(1);
});

test("credentials without an app allowance do not expose a usable Veryfi reader", async ({
  page,
}) => {
  await configure(page, 0);
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Veryfi OCR", exact: true }),
  ).toHaveCount(0);
});
