import { expectReviewBlocked, expectReviewReady } from "./review-assertions";
import { expect, test } from "@playwright/test";
import { qaArtifactPath } from "./qa-artifacts";

test("reduced-price products preserve missing money and require source checks before sharing", async ({
  page,
}, info) => {
  // Synthetic text; the later 0.50 is explicit human correction, not OCR recovery.
  await page.goto("/");
  await page.getByText("Already have receipt text?", { exact: true }).click();
  await page
    .getByLabel("Receipt text", { exact: true })
    .fill(
      "Neighbourhood Market\n6 JAM DOUGHNUTS\nREDUCED PRICE\n6 JAM DOUGHNUTS\nREDUCED PRICE £0.55\nTOTAL £1.05",
    );
  await page
    .getByRole("button", { name: "Review this text", exact: true })
    .click();
  const price = (number: number) =>
    page.getByLabel(`Item ${number} line price`, { exact: true });
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  const checks = page.getByRole("checkbox", {
    name: "I checked line price against the original",
    exact: true,
  });
  for (const number of [1, 2]) {
    await expect(
      page.getByLabel(`Item ${number} description`, { exact: true }),
    ).toHaveValue("6 JAM DOUGHNUTS");
    await expect(
      page.getByLabel(`Item ${number} purchased quantity`, { exact: true }),
    ).toHaveValue("");
  }
  await expect(price(1)).toHaveValue("");
  await expect(price(2)).toHaveValue("0.55");
  // The blank required price blocks through arithmetic validation; its source
  // check becomes applicable only after a value has been entered.
  await expect(checks).toHaveCount(1);
  await expectReviewBlocked(page, confirm);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await qaArtifactPath(info, `reduced-price-${info.project.name}.png`),
    fullPage: true,
  });

  await page
    .getByRole("button", {
      name: "Confirm all missing purchased quantities as 1",
    })
    .click();
  await price(1).fill("0.50");
  await expect(checks).toHaveCount(2);
  // A balanced total alone cannot bypass either product/price association check.
  await expectReviewBlocked(page, confirm);
  await checks.nth(0).check();
  await expectReviewBlocked(page, confirm);
  await checks.nth(1).check();
  await expectReviewReady(page, confirm);
  await page.reload();
  await expect(price(1)).toHaveValue("0.50");
  await expect(checks.nth(0)).toBeChecked();
  await expect(checks.nth(1)).toBeChecked();
  await expectReviewReady(page, confirm);
  await price(2).fill("0.54");
  // Explicit human edits record a correction; arithmetic still rejects the
  // one-penny mismatch independently of that verification stamp.
  await expect(checks.nth(1)).toBeChecked();
  await expectReviewBlocked(page, confirm);
  await price(2).fill("0.55");
  await expectReviewReady(page, confirm);
  await checks.nth(1).uncheck();
  await expectReviewBlocked(page, confirm);
});
