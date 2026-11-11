import { expect, test } from "./editor-fixture";

test("choosing currency after reading calculates units without confirming a repaired quantity", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Already have receipt text?", { exact: true }).click();
  await page.getByLabel("Receipt text", { exact: true })
    .fill(`SYNTHETIC RESTAURANT
QtyDish Amount
I Soup 8.00
1 Udon 6.50
2 Ramen 37.20
Total to pay: 51.70`);
  await page
    .getByRole("button", { name: "Review this text", exact: true })
    .click();
  const currency = page.getByLabel("Currency", { exact: true });
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(currency).toHaveValue("");
  await confirm.click();
  await expect(currency).toBeFocused();
  await currency.selectOption("GBP");
  await expect(page.getByTestId("review-item-0")).toContainText(
    "8.00 GBP each",
  );
  const ramen = page.getByTestId("review-item-2");
  await expect(ramen).toContainText("18.60 GBP each");
  await ramen
    .getByRole("button", { name: "Edit details for item 3", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 3 unit price (optional)", { exact: true }),
  ).toHaveValue("18.60");
  const source = page.getByTestId("review-item-0").getByRole("checkbox", {
    name: "I checked purchased quantity against the original",
    exact: true,
  });
  await expect(source).toHaveCount(0);
  await confirm.click();
  await expect(page.getByLabel("Person’s name", { exact: true })).toBeVisible();
});
