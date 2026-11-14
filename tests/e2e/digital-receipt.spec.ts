import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { newState, newItem, receiptStamp } from "../../src/lib/model";
const text = `SYNTHETIC RESTAURANT
GBP
VAT: 123456789
QtyDish Amount
I Tori Kara Age 8.00
1 Tonkotsu Ramen 18.00
2 Spicy Tantan Tonkotsu Ramen 18.80 37.20
1 Cold Udon 6.50
1 Seared Salmon California Roll 22.00
1 Age Dashi Tofu 8.00
1 Chocolate Tart 5.50 L
1 Banana Fritters 5.50
Subtotal 110.70
Total to pay 110.70`;
async function read(page: Page, source = text) {
  await page.goto("/");
  await page.getByText("Already have receipt text?", { exact: true }).click();
  await page.getByLabel("Receipt text", { exact: true }).fill(source);
  await page
    .getByRole("button", { name: "Review this text", exact: true })
    .click();
}
const continueButton = (page: Page) =>
  page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
test("a digital receipt replaces the checklist and accepts the whole receipt once", async ({
  page,
}) => {
  await read(page);
  const receipt = page.getByRole("region", {
    name: "Digital receipt",
    exact: true,
  });
  await expect(receipt.getByTestId("digital-item-2")).toContainText(
    "£18.60 each",
  );
  await expect(receipt.getByTestId("digital-item-2")).toContainText("£37.20");
  await expect(receipt).toContainText("£110.70");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByText(/I checked .* against the original/)).toHaveCount(
    0,
  );
  await expect(page.getByLabel("Item 7 tax code", { exact: true })).toHaveCount(
    0,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: test.info().outputPath("digital-receipt.png"),
    fullPage: true,
  });
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
  const draft = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1") || "null"),
  );
  // Individual source confirmations are not silently fabricated by Continue.
  expect(
    draft.receipt.reviewChecks.some(
      (check: { confirmedValue: string }) => check.confirmedValue === "",
    ),
  ).toBe(true);
  expect(draft.reviewedStamp).not.toBe("");
});
test("one missing quantity opens its field and no source-checkbox maze follows", async ({
  page,
}) => {
  await read(page, text.replace("1 Chocolate Tart", "Chocolate Tart"));
  await continueButton(page).click();
  const quantity = page.getByLabel("Item 7 purchased quantity", {
    exact: true,
  });
  await expect(quantity).toBeFocused();
  await expect(quantity).toHaveAttribute("aria-invalid", "true");
  await quantity.fill("1");
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});
test("tap an item to correct a name without confirming unrelated fields", async ({
  page,
}) => {
  await read(page, text.replace("Cold Udon", "Cald Udon"));
  await page
    .getByRole("button", { name: "Edit item 4: Cald Udon", exact: true })
    .click();
  const name = page.getByLabel("Item 4 description", { exact: true });
  await expect(name).toBeFocused();
  await name.fill("Cold Udon");
  await expect(page.getByTestId("digital-item-3")).toContainText("Cold Udon");
  await expect(page.getByRole("checkbox", { name: /I checked/ })).toHaveCount(
    0,
  );
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});
test("explicitly edited inconsistent units still receive a focused correction", async ({
  page,
}) => {
  await read(page);
  await page.getByRole("button", { name: /^Edit item 3: Spicy/ }).click();
  const card = page.getByTestId("review-item-2");
  const details = card.getByRole("button", { name: /details for item 3/ });
  if ((await details.getAttribute("aria-expanded")) === "false")
    await details.click();
  const unit = page.getByLabel("Item 3 unit price (optional)", { exact: true });
  await unit.fill("18.80");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt
            .items[2].unitPriceEdited,
      ),
    )
    .toBe(true);
  await page.reload();
  await continueButton(page).click();
  await expect(unit).toHaveValue("18.80");
  await expect(unit).toBeFocused();
  await expect(unit).toHaveAttribute("aria-invalid", "true");
  await unit.fill("18.60");
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});

test("a previously saved scanned unit conflict is calculated without reviving checkbox gates", async ({
  page,
}) => {
  const state = newState();
  state.step = "review";
  state.receipt.source = "ocr";
  state.receipt.items = [
    {
      ...newItem(),
      description: "Ramen",
      quantity: "2",
      unitPrice: "18.80",
      lineTotal: "37.20",
    },
  ];
  state.receipt.subtotal = state.receipt.printedTotal = "37.20";
  state.receipt.reviewChecks = [
    {
      scope: "item",
      itemId: state.receipt.items[0].id,
      field: "unitPrice",
      reason: "source",
      other: "",
      confirmedValue: '"18.80"',
    },
  ];
  state.reviewedStamp = receiptStamp(state.receipt);
  await page.addInitScript(
    (state) => localStorage.setItem("gather.receipt.v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/");
  await expect(page.getByTestId("digital-item-0")).toContainText("£18.60 each");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});

test("real printed VAT codes still calculate added tax once", async ({
  page,
}) => {
  await read(
    page,
    `SYNTHETIC MARKET\nGBP\nPrices exclude tax\nQty Dish Amount\n1 Bread 10.00 A\n1 Milk 5.00 Z\nSubtotal 15.00\nA 20.00% 10.00 2.00\nZ 0.00% 5.00 0.00\nVAT amount 2.00\nTotal to pay 17.00`,
  );
  const receipt = page.getByRole("region", {
    name: "Digital receipt",
    exact: true,
  });
  await expect(receipt).toContainText("£17.00");
  await expect(receipt.locator(".receipt-totals")).toContainText("Tax£2.00");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});

test("correcting a missing quantity also calculates its conflicting scanned unit", async ({
  page,
}) => {
  const state = newState();
  state.step = "review";
  state.receipt.source = "ocr";
  state.receipt.items = [
    {
      ...newItem(),
      description: "Ramen",
      quantity: "",
      unitPrice: "18.80",
      lineTotal: "37.20",
    },
  ];
  state.receipt.subtotal = state.receipt.printedTotal = "37.20";
  await page.addInitScript(
    (state) => localStorage.setItem("gather.receipt.v1", JSON.stringify(state)),
    state,
  );
  await page.goto("/");
  await continueButton(page).click();
  const quantity = page.getByLabel("Item 1 purchased quantity", {
    exact: true,
  });
  await expect(quantity).toBeFocused();
  await quantity.fill("2");
  await expect(page.getByTestId("digital-item-0")).toContainText("£18.60 each");
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});

test("a missing currency receives focus before one receipt-level acceptance", async ({
  page,
}) => {
  await read(page, text.replace("\nGBP\n", "\n"));
  await expect(
    page.getByRole("button", { name: "Choose receipt currency", exact: true }),
  ).toBeVisible();
  await continueButton(page).click();
  const currency = page.getByLabel("Currency", { exact: true });
  await expect(currency).toBeFocused();
  await currency.selectOption("GBP");
  await expect(page.getByTestId("digital-item-2")).toContainText("£18.60 each");
  await continueButton(page).click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});
