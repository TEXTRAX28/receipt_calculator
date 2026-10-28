import { test, expect } from "@playwright/test";
import { costcoDemo } from "../../src/lib/demo";

/** Opt-in local QA. The private image path comes from the environment and is never committed. */
test("real Costco photograph → transparent correction → exact finalized split", async ({
  page,
}) => {
  test.setTimeout(240000);
  const file = process.env.GATHER_REAL_RECEIPT;
  test.skip(
    !file,
    "Supply a local private receipt path to run this explicit manual-correction exercise.",
  );
  await page.goto("/");
  await page.getByLabel("Upload receipt images").setInputFiles(file!);
  await page.getByRole("button", { name: "Crop image 1", exact: true }).click();
  for (const [edge, count] of [
    ["left", 20],
    ["right", 23],
  ] as const) {
    const slider = page.getByRole("slider", {
      name: `Trim ${edge} percent`,
      exact: true,
    });
    await slider.press("Home");
    for (let i = 0; i < count; i++) await slider.press("ArrowRight");
  }
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  const count = await page.locator('[data-testid^="review-item-"]').count();
  console.log(
    `Private-photo OCR produced ${count} purchase rows; the following steps are explicit manual correction, not claimed OCR accuracy.`,
  );
  expect(count).toBeGreaterThan(0);
  const expected = costcoDemo();
  // Correct using only the visible review controls, with the original photograph still accessible.
  while (await page.locator('[data-testid^="review-item-"]').count()) {
    const row = page.getByTestId("review-item-0");
    const expand = row.getByRole("button", {
      name: "Edit details for item 1",
      exact: true,
    });
    if (await expand.isVisible()) await expand.click();
    await row
      .getByRole("button", { name: "Remove this purchase line", exact: true })
      .click();
  }
  while (
    await page
      .getByRole("button", { name: "Remove adjustment 1", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Remove adjustment 1", exact: true })
      .click();
  await page
    .getByRole("textbox", { name: "Merchant", exact: true })
    .fill("Costco");
  await page
    .getByLabel("Receipt date (optional)", { exact: true })
    .fill("2026-10-26");
  await page.getByLabel("Currency", { exact: true }).selectOption("GBP");
  await page
    .getByRole("textbox", { name: "Printed total", exact: true })
    .fill("176.78");
  await page
    .getByRole("textbox", {
      name: "Subtotal after item discounts (optional)",
      exact: true,
    })
    .fill("163.16");
  await page
    .getByRole("textbox", { name: "Printed tax (optional check)", exact: true })
    .fill("13.62");
  await page
    .getByRole("checkbox", {
      name: "Item prices already include tax",
      exact: false,
    })
    .uncheck();
  await page
    .getByLabel("How should added tax be calculated?", { exact: true })
    .selectOption("codes");
  while (
    await page
      .getByRole("button", { name: "Remove tax code 1", exact: true })
      .count()
  )
    await page
      .getByRole("button", { name: "Remove tax code 1", exact: true })
      .click();
  for (const [i, code] of expected.taxCodes.entries()) {
    await page
      .getByRole("button", { name: "Add tax code", exact: true })
      .click();
    await page.getByLabel(`Tax code ${i + 1}`, { exact: true }).fill(code.code);
    await page
      .getByRole("textbox", { name: `Rate % for code ${i + 1}`, exact: true })
      .fill(code.rate);
  }
  for (const [i, item] of expected.items.entries()) {
    await page
      .getByRole("button", { name: "Add an item", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: `Item ${i + 1} description`, exact: true })
      .fill(item.description);
    await page
      .getByRole("textbox", { name: `Item ${i + 1} line price`, exact: true })
      .fill(item.lineTotal);
    await page
      .getByRole("textbox", { name: `Item ${i + 1} discount`, exact: true })
      .fill(item.discount);
    await page
      .getByLabel(`Item ${i + 1} tax code`, { exact: true })
      .selectOption(item.taxCode);
  }
  await expect(
    page.getByRole("button", { name: "View receipt image 1", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm receipt & add people", exact: true })
    .click();
  for (const name of ["Alice", "Bob", "Charlie"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Whole receipt", exact: true })
    .click();
  for (const box of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await box.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-1")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-2")).toHaveText("£58.92");
});
