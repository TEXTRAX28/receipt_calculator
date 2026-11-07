import { expectReviewBlocked, expectReviewReady } from "./review-assertions";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

async function manual(page: Page, price = "10.00", merchant = "Little Market") {
  await page.goto("/");
  await page.getByRole("button", { name: "Enter manually" }).click();
  await page
    .getByRole("textbox", { name: "Merchant", exact: true })
    .fill(merchant);
  await page
    .getByRole("textbox", { name: "Printed total", exact: true })
    .fill(price);
  await page
    .getByRole("textbox", { name: "Item 1 description", exact: true })
    .fill("Shared groceries");
  await page
    .getByRole("textbox", { name: "Item 1 line price", exact: true })
    .fill(price);
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
}
async function people(page: Page, names = ["Alice", "Bob", "Charlie"]) {
  for (const name of names) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
}
async function selectAll(page: Page) {
  const card = page.getByTestId("assignment-item-0");
  for (let i = 0; i < 3; i++) await card.getByRole("checkbox").nth(i).check();
  return card;
}

test("unknown currency stays unpriced until explicitly selected, including the existing default", async ({
  page,
}, info) => {
  await page.goto("/");
  await page.getByText("Already have receipt text?", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Receipt text", exact: true })
    .fill("Little Market\nMilk 1x 2.00 2.00\nTOTAL 2.00");
  await page
    .getByRole("button", { name: "Review this text", exact: true })
    .click();
  const currency = page.getByRole("combobox", {
    name: "Currency",
    exact: true,
  });
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expect(currency).toHaveValue("");
  await expect(currency).toHaveAttribute("aria-invalid", "true");
  await expectReviewBlocked(page, confirm);
  await expect(page.locator(".item-cost")).toHaveText("—");
  await expect(page.locator(".grand-total strong")).toHaveText("—");
  await page.reload();
  await expect(currency).toHaveValue("");
  await expectReviewBlocked(page, confirm);
  await expect(
    page.getByRole("textbox", { name: "Item 1 line price", exact: true }),
  ).toHaveValue("2.00");
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await currency.boundingBox())!.width).toBeGreaterThanOrEqual(220);
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await mkdir("qa-artifacts", { recursive: true });
  await page.locator(".metadata").screenshot({
    path: `qa-artifacts/currency-metadata-${info.project.name}.png`,
  });
  await page.screenshot({
    path: `qa-artifacts/currency-unresolved-${info.project.name}.png`,
    fullPage: true,
  });
  await currency.selectOption("GBP");
  await expect(currency).not.toHaveAttribute("aria-invalid", "true");
  await expect(page.locator(".item-cost")).toHaveText("£2.00");
  await expectReviewReady(page, confirm);
  await confirm.click();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Good things are better shared." }),
  ).toBeVisible();
});
test("manual entry → review → people → equal sharing → export and refresh", async ({
  page,
}) => {
  await manual(page);
  await people(page);
  await selectAll(page);
  await expect(page.getByTestId("live-total-0")).toHaveText("£3.34");
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every penny has a home." }),
  ).toBeVisible();
  await expect(page.getByTestId("person-total-0")).toHaveText("£3.34");
  await expect(page.getByTestId("person-total-1")).toHaveText("£3.33");
  await expect(page.getByTestId("person-total-2")).toHaveText("£3.33");
  await page.locator(".person-breakdown").first().locator("summary").click();
  await expect(page.locator(".breakdown-lines").first()).toContainText(
    "Shared groceries",
  );
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download summary" }).click();
  await expect((await downloaded).suggestedFilename()).toBe(
    "gather-summary.txt",
  );
  await page.reload();
  await expect(page.getByTestId("person-total-0")).toHaveText("£3.34");
  await expect(
    page.getByRole("button", { name: "Finalize checked split" }),
  ).toBeEnabled();
});
test("quantity 1/3/5 is rejected and corrected to valid 1/3/4", async ({
  page,
}) => {
  await manual(page, "16.00");
  await people(page);
  const card = await selectAll(page);
  await card
    .getByLabel("Split method", { exact: true })
    .selectOption("quantity");
  await card
    .getByRole("textbox", { name: "Units per purchased pack" })
    .fill("8");
  for (const [name, value] of [
    ["Alice", "1"],
    ["Bob", "3"],
    ["Charlie", "5"],
  ])
    await card
      .getByRole("textbox", { name: `Units for ${name}`, exact: false })
      .fill(value);
  await expect(card).toContainText("1 units too many");
  await expectReviewBlocked(
    page,
    page.getByRole("button", { name: "Finalize split", exact: true }),
  );
  await expect(
    card.getByRole("textbox", { name: "Units for Charlie", exact: false }),
  ).toHaveValue("5");
  await card
    .getByRole("textbox", { name: "Units for Charlie", exact: false })
    .fill("4");
  await expect(page.getByTestId("live-total-0")).toHaveText("£2.00");
  await expect(page.getByTestId("live-total-1")).toHaveText("£6.00");
  await expect(page.getByTestId("live-total-2")).toHaveText("£8.00");
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every penny has a home." }),
  ).toBeVisible();
});
test("ratio and percentage share methods have distinct validation", async ({
  page,
}) => {
  await manual(page, "18.00");
  await people(page);
  const card = await selectAll(page);
  await card.getByLabel("Split method", { exact: true }).selectOption("ratio");
  for (const [name, value] of [
    ["Alice", "1"],
    ["Bob", "3"],
    ["Charlie", "5"],
  ])
    await card
      .getByRole("textbox", { name: `Weight for ${name}`, exact: false })
      .fill(value);
  for (const [i, value] of ["£2.00", "£6.00", "£10.00"].entries())
    await expect(page.getByTestId(`live-total-${i}`)).toHaveText(value);
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Finalize split", exact: true }),
  );
  await card
    .getByLabel("Split method", { exact: true })
    .selectOption("percent");
  for (const [name, value] of [
    ["Alice", "20"],
    ["Bob", "30"],
    ["Charlie", "49"],
  ])
    await card
      .getByRole("textbox", { name: `Percent for ${name}`, exact: false })
      .fill(value);
  await expect(card).toContainText("Percentages must total exactly 100%");
  await card
    .getByRole("textbox", { name: "Percent for Charlie", exact: false })
    .fill("50");
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Finalize split", exact: true }),
  );
});
test("whole-receipt sharing ignores previous item shares", async ({ page }) => {
  await manual(page);
  await people(page);
  await selectAll(page);
  await page
    .getByRole("button", { name: "Whole receipt", exact: true })
    .click();
  const card = page.getByTestId("whole-assignment");
  await card
    .getByRole("checkbox", { name: "Alice (person 1)", exact: true })
    .check();
  await expect(page.getByTestId("live-total-0")).toHaveText("£10.00");
  await expect(page.getByTestId("live-total-1")).toHaveText("£0.00");
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£10.00");
});
test("Costco demo retains repeated chickens, discounts and correct tax total", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Try the Costco demo" }).click();
  await expect(
    page.getByText("COSTCO DEMO · NOT AN OCR RESULT", { exact: true }),
  ).toBeVisible();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(18);
  await expect(page.getByTestId("review-item-3")).toContainText("£7.49");
  await expect(page.locator(".grand-total")).toContainText("£176.78");
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
  await people(page);
  await page.getByRole("button", { name: "Share all equally" }).click();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Every penny has a home." }),
  ).toBeVisible();
  await expect(page.locator(".completion-banner")).toContainText("£176.78");
});
test("edits after assignment invalidate review; removing people recalculates safely", async ({
  page,
}) => {
  await manual(page);
  await people(page);
  await selectAll(page);
  await page.getByRole("button", { name: "Review", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Item 1 line price", exact: true })
    .fill("12.00");
  await expectReviewBlocked(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
  await page
    .getByRole("textbox", { name: "Printed total", exact: true })
    .fill("12.00");
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Remove person 2" }).click();
  await page.getByRole("button", { name: "Let’s share it" }).click();
  await expect(page.getByTestId("live-total-0")).toHaveText("£6.00");
  await expect(page.getByTestId("live-total-1")).toHaveText("£6.00");
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Finalize split", exact: true }),
  );
});
test("duplicate names and hostile markup remain separate inert text", async ({
  page,
}) => {
  let triggered = false;
  page.on("dialog", () => {
    triggered = true;
  });
  await manual(page, "10.00", "<img src=x onerror=alert(1)>");
  await people(page, [
    "<script>alert(1)</script>",
    "<script>alert(1)</script>",
  ]);
  const card = page.getByTestId("assignment-item-0");
  await card.getByRole("checkbox").first().check();
  await expect(page.getByTestId("live-total-0")).toHaveText("£10.00");
  await expect(page.getByTestId("live-total-1")).toHaveText("£0.00");
  await expect(page.locator('img[src="x"]')).toHaveCount(0);
  expect(triggered).toBe(false);
});
test("pasted text with missing quantity stays reviewable and blocks confirmation", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Already have receipt text?").click();
  await page
    .getByRole("textbox", { name: "Receipt text", exact: true })
    .fill("Neighbourhood Market\nMilk £2.50\nApples £3.00\nTOTAL £5.50");
  await page.getByRole("button", { name: "Review this text" }).click();
  await expectReviewBlocked(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
  await page
    .getByRole("button", {
      name: "Confirm all missing purchased quantities as 1",
    })
    .click();
  await expect(page.getByTestId("review-item-0")).toContainText(
    "2.50 GBP each",
  );
  await expect(page.getByTestId("review-item-1")).toContainText(
    "3.00 GBP each",
  );
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
});
test("rejects malformed, spoofed and excessive uploads without a scan", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "evil.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from('<svg onload="alert(1)">not a photograph</svg>'),
  });
  await expect(page.getByRole("alert")).toContainText("file signature");
  await expect(
    page.getByRole("button", { name: "Read receipt on this device" }),
  ).toHaveCount(0);
  await page.getByLabel("Upload receipt images").setInputFiles(
    Array.from({ length: 13 }, (_, i) => ({
      name: `${i}.jpg`,
      mimeType: "image/jpeg",
      buffer: Buffer.from("invalid"),
    })),
  );
  await expect(page.getByRole("alert")).toContainText("at most 12");
});
test("privacy dialog, keyboard escape, reset and responsive layout", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Privacy first", exact: false })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "The on-device reader uses English OCR",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await manual(page);
  await people(page);
  await selectAll(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete / reset receipt" }).click();
  await expect(
    page.getByRole("heading", { name: "Big shop. Little maths." }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt.items
          .length,
    ),
  ).toBe(0);
});
test("main screens pass automated WCAG A/AA checks", async ({ page }) => {
  await page.goto("/");
  let report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(report.violations).toEqual([]);
  await manual(page);
  await people(page);
  await selectAll(page);
  report = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(report.violations).toEqual([]);
});
test("no external service requests or receipt uploads during ordinary sharing", async ({
  page,
}) => {
  const requests: string[] = [];
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (
      !request
        .url()
        .startsWith(new URL(test.info().project.use.baseURL!).origin) &&
      !request.url().startsWith("data:")
    )
      requests.push(request.url());
    if (request.method() !== "GET") uploads.push(request.url());
  });
  await manual(page);
  await people(page);
  await selectAll(page);
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  expect(requests).toEqual([]);
  expect(uploads).toEqual([]);
});
