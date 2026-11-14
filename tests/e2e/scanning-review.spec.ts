import { expect, test, type Page } from "./editor-fixture";
import AxeBuilder from "@axe-core/playwright";

// Synthetic transcription exercises the real parser and form, not OCR accuracy.
const menu = `SYNTHETIC RESTAURANT
GBP
VAT No.: 123456789
QtyDish Amount
I Tori Karaage 8.00
1 Tonkotsu Ramen 18.00
2 Spicy Tantan Tonkotsu ramen 18.60 37.20
1 Cold Udon 6.50
1 Salmon Roll 22.00
1 Tofu 8.00
Chocolate Tart 5.50
1 Banana Fritters 5.50
Subtotal: 110.70
Total to pay: 110.70`;
const confirm = (page: Page) =>
  page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
async function textReceipt(page: Page) {
  await page.goto("/");
  await page.getByText("Already have receipt text?", { exact: true }).click();
  await page.getByLabel("Receipt text", { exact: true }).fill(menu);
  await page
    .getByRole("button", { name: "Review this text", exact: true })
    .click();
}
async function withinViewport(page: Page) {
  // Smooth scrolling is allowed, but its final target must be usable on a phone.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const rect = document.activeElement?.getBoundingClientRect();
        return !!rect && rect.top >= 0 && rect.bottom <= innerHeight;
      }),
    )
    .toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
}
test("restaurant quantities, tax metadata and correction-to-finalization journey", async ({
  page,
}) => {
  await textReceipt(page);
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(8);
  await expect(
    page.getByLabel("Printed tax (optional check)", { exact: true }),
  ).toHaveValue("");
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "110.70",
  );
  await expect(page.getByLabel("Printed tax details")).toContainText(
    "123456789",
  );
  await expect(
    page.getByLabel("Item 3 description", { exact: true }),
  ).toHaveValue("Spicy Tantan Tonkotsu ramen");
  await expect(
    page.getByLabel("Item 3 purchased quantity", { exact: true }),
  ).toHaveValue("2");
  await expect(page.getByTestId("review-item-2")).toContainText(
    "18.60 GBP each",
  );
  const quantity = page.getByLabel("Item 7 purchased quantity", {
    exact: true,
  });
  await expect(quantity).toBeVisible();
  await expect(quantity).toHaveValue("");
  await confirm(page).click();
  await expect(quantity).toBeFocused();
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByTestId("review-item-6")).toContainText(
    /Enter a number|quantity/i,
  );
  await withinViewport(page);
  await page.screenshot({
    path: test.info().outputPath("quantity-correction.png"),
  });
  await quantity.fill("1");
  await expect(page.getByTestId("review-item-6")).toContainText(
    "5.50 GBP each",
  );
  const recovered = page.getByTestId("review-item-0").getByRole("checkbox", {
    name: "I checked purchased quantity against the original",
    exact: true,
  });
  await expect(recovered).toHaveCount(0);
  await withinViewport(page);
  await expect(recovered).toHaveCount(0);
  await confirm(page).click();
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
  const name = page.getByLabel("Person’s name", { exact: true });
  await expect(name).toBeFocused();
  await expect(name).toHaveAttribute("aria-invalid", "true");
  await name.fill("Alice");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(
    page
      .getByTestId("assignment-item-0")
      .getByRole("checkbox", { name: "Alice", exact: false }),
  ).toBeFocused();
  for (let index = 0; index < 8; index++)
    await page
      .getByTestId(`assignment-item-${index}`)
      .getByRole("checkbox", { name: "Alice", exact: false })
      .check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.locator("#screen-title")).toHaveText(
    "Every penny has a home.",
  );
  await expect(page.locator(".workspace")).toContainText("£110.70");
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
});

test("Continue expands a hidden invalid unit price and focuses it after earlier fields are corrected", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await page.getByLabel("Printed total", { exact: true }).fill("37.20");
  const description = page.getByLabel("Item 1 description", { exact: true });
  await description.fill("Ramen");
  await page.getByLabel("Item 1 line price", { exact: true }).fill("37.20");
  await page.getByLabel("Item 1 purchased quantity", { exact: true }).fill("2");
  const item = page.getByTestId("review-item-0");
  const expand = item.getByRole("button", { name: /details for item 1/ });
  if ((await expand.getAttribute("aria-expanded")) === "false")
    await expand.click();
  const unit = page.getByLabel("Item 1 unit price (optional)", { exact: true });
  await unit.fill("18.50");
  await expand.click();
  await confirm(page).click();
  await expect(unit).toBeFocused();
  await expect(unit).toHaveAttribute("aria-invalid", "true");
  await expect(item).toContainText("quantity × unit price differs");
  await withinViewport(page);
  await page.screenshot({
    path: test.info().outputPath("unit-price-correction.png"),
  });
  await unit.fill("18.60");
  await confirm(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});

test("Continue focuses an invalid tax rate rather than its code label or downstream totals", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await page.getByLabel("Printed total", { exact: true }).fill("12.00");
  await page.getByLabel("Item 1 description", { exact: true }).fill("Soup");
  await page.getByLabel("Item 1 line price", { exact: true }).fill("10.00");
  await page
    .getByRole("checkbox", { name: /^Item prices already include tax/ })
    .uncheck();
  await page
    .getByLabel("How should added tax be calculated?", { exact: true })
    .selectOption("codes");
  await page.getByRole("button", { name: "Add tax code", exact: true }).click();
  await page.getByLabel("Tax code 1", { exact: true }).fill("A");
  await page.getByLabel("Item 1 tax code", { exact: true }).selectOption("A");
  await confirm(page).click();
  const rate = page.getByLabel("Rate % for code 1", { exact: true });
  await expect(rate).toBeFocused();
  await expect(rate).toHaveAttribute("aria-invalid", "true");
  await withinViewport(page);
  await rate.fill("20");
  await confirm(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});

test("Finalize focuses the missing person's share while preserving an earlier valid value", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await page.getByLabel("Printed total", { exact: true }).fill("10.00");
  await page.getByLabel("Item 1 description", { exact: true }).fill("Soup");
  await page.getByLabel("Item 1 line price", { exact: true }).fill("10.00");
  await confirm(page).click();
  for (const name of ["Alice", "Bob"]) {
    await page.getByLabel("Person’s name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Share all equally", exact: true })
    .click();
  const card = page.getByTestId("assignment-item-0");
  await card
    .getByLabel("Split method", { exact: true })
    .selectOption("percent");
  const alice = card.getByLabel(/^Percent for Alice/);
  const bob = card.getByLabel(/^Percent for Bob/);
  await alice.fill("60");
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(bob).toBeFocused();
  await expect(alice).toHaveValue("60");
  await withinViewport(page);
  await bob.fill("40");
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£6.00");
  await expect(page.getByTestId("person-total-1")).toHaveText("£4.00");
});
