import { expectReviewBlocked, expectReviewReady } from "./review-assertions";
import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`manual net-goods/gross-fee correction and split at ${width}px`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 900 });
    const posts: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "POST") posts.push(request.url());
    });
    await page.route("**/api/**", (route) =>
      route.fulfill({ json: { configured: false } }),
    );
    await page.goto("/");
    await page.getByRole("button", { name: "Enter manually" }).click();
    await page
      .getByRole("textbox", { name: "Merchant", exact: true })
      .fill("Western Towing — manual transcription");
    await page
      .getByRole("textbox", { name: "Printed total", exact: true })
      .fill("29.06");
    await page
      .getByLabel("Subtotal after item discounts (optional)", { exact: true })
      .fill("20.07");
    await page
      .getByLabel("Printed tax (optional check)", { exact: true })
      .fill("4.84");
    await page
      .getByRole("checkbox", { name: /^Item prices already include tax/ })
      .uncheck();
    await page
      .getByRole("textbox", { name: "Item 1 description", exact: true })
      .fill("Kartt spare wheel");
    await page
      .getByRole("textbox", { name: "Item 1 line price", exact: true })
      .fill("16.32");
    await page
      .getByRole("button", { name: "Add an item", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Item 2 description", exact: true })
      .fill("Kartt axle and pin");
    await page
      .getByRole("textbox", { name: "Item 2 line price", exact: true })
      .fill("3.75");
    await page
      .getByRole("button", { name: "Add discount, tax or charge", exact: true })
      .click();
    await page
      .getByLabel("Adjustment 1 label", { exact: true })
      .fill("Carriage (incl. VAT)");
    await page.getByLabel("Adjustment 1 amount", { exact: true }).fill("4.98");
    await page
      .getByRole("button", { name: "Add discount, tax or charge", exact: true })
      .click();
    await page
      .getByLabel("Adjustment 2 label", { exact: true })
      .fill("Full printed VAT");
    await page
      .getByLabel("Adjustment 2 type", { exact: true })
      .selectOption("tax");
    await page.getByLabel("Adjustment 2 amount", { exact: true }).fill("4.84");
    const confirm = page.getByRole("button", {
      name: "Confirm receipt & add people",
    });
    await expectReviewBlocked(page, confirm);
    await expect(page.locator(".summary-rows").first()).toContainText("£29.89");

    const included = page.getByRole("checkbox", {
      name: "Adjustment 1: fee already includes tax",
      exact: true,
    });
    await included.check();
    const rate = page.getByLabel("Adjustment 1 included tax rate (%)", {
      exact: true,
    });
    await expect(rate).toHaveAttribute("aria-invalid", "true");
    await expectReviewBlocked(page, confirm);
    await rate.fill("20");
    await expect(rate).not.toHaveAttribute("aria-invalid", "true");
    await expectReviewReady(page, confirm);
    await expect(page.locator(".summary-rows").first()).toContainText("£29.06");
    await expect(page.locator(".summary-rows").first()).toContainText(
      "Tax already in fees (included above)",
    );
    await expect(page.locator(".summary-rows").first()).toContainText("£0.83");
    await page
      .getByLabel("Adjustment 1 type", { exact: true })
      .selectOption("tip");
    await page
      .getByLabel("Adjustment 1 type", { exact: true })
      .selectOption("fee");
    await expect(included).not.toBeChecked();
    await expect(rate).toHaveCount(0);
    await expectReviewBlocked(page, confirm);
    await included.check();
    await rate.fill("20");
    await expectReviewReady(page, confirm);
    await page.reload();
    await expect(included).toBeChecked();
    await expect(rate).toHaveValue("20");
    await expect(
      page.getByLabel("Adjustment 1 amount", { exact: true }),
    ).toHaveValue("4.98");
    await expect(
      page.getByLabel("Adjustment 2 amount", { exact: true }),
    ).toHaveValue("4.84");

    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    if (width < 760)
      expect(
        await rate.evaluate((element) =>
          parseFloat(getComputedStyle(element).fontSize),
        ),
      ).toBeGreaterThanOrEqual(16);
    await page.screenshot({
      path: info.outputPath("fee-review.png"),
      fullPage: true,
    });
    await confirm.click();
    for (const name of ["Alice", "Bob"]) {
      await page
        .getByRole("textbox", { name: "Person’s name", exact: true })
        .fill(name);
      await page
        .getByRole("button", { name: "Add person", exact: true })
        .click();
    }
    await page.getByRole("button", { name: "Let’s share it" }).click();
    await page.getByRole("button", { name: "Share all equally" }).click();
    await expect(page.getByTestId("live-total-0")).toHaveText("£14.54");
    await expect(page.getByTestId("live-total-1")).toHaveText("£14.52");
    await page
      .getByRole("button", { name: "Finalize split", exact: true })
      .click();
    await expect(page.getByTestId("person-total-0")).toHaveText("£14.54");
    await expect(page.getByTestId("person-total-1")).toHaveText("£14.52");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: info.outputPath("fee-split.png"),
      fullPage: true,
    });
    expect(posts).toEqual([]);
  });

  for (const signed of [false, true]) {
    test(`explicit printed-tax ${signed ? "refund" : "charge"} stays single and preserves amounts at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      const posts: string[] = [];
      page.on("request", (request) => {
        if (request.method() === "POST") posts.push(request.url());
      });
      await page.route("**/api/**", (route) =>
        route.fulfill({ json: { configured: false } }),
      );
      await page.goto("/");
      await page.getByRole("button", { name: "Enter manually" }).click();
      const prefix = signed ? "-" : "";
      const net = `${prefix}5.00`,
        tax = `${prefix}0.40`,
        gross = `${prefix}5.40`;
      await page
        .getByLabel("Merchant", { exact: true })
        .fill("Synthetic tax entry");
      await page.getByLabel("Printed total", { exact: true }).fill(gross);
      await page
        .getByLabel("Subtotal after item discounts (optional)", { exact: true })
        .fill(net);
      await page
        .getByLabel("Item 1 description", { exact: true })
        .fill("Synthetic item");
      await page.getByLabel("Item 1 line price", { exact: true }).fill(net);
      const included = page.getByRole("checkbox", {
        name: /^Item prices already include tax/,
      });
      await included.uncheck();
      const usePrinted = page.getByLabel(
        "How should added tax be calculated?",
        {
          exact: true,
        },
      );
      await usePrinted.selectOption("printed");
      const addTax = page.getByRole("button", {
        name: "Add printed tax",
        exact: true,
      });
      await expect(addTax).toHaveCount(0);
      const printedTax = page.getByLabel("Printed tax (optional check)", {
        exact: true,
      });
      await printedTax.fill(tax);
      await usePrinted.selectOption("codes");
      await expect(addTax).toHaveCount(0);
      await usePrinted.selectOption("printed");
      const confirm = page.getByRole("button", {
        name: "Confirm receipt & add people",
        exact: true,
      });
      await expectReviewBlocked(page, confirm);
      const before = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!),
      );
      await addTax.focus();
      await page.keyboard.press("Enter");
      await expect(addTax).toHaveCount(0);
      await expect(
        page.getByLabel("Adjustment 1 amount", { exact: true }),
      ).toHaveValue(tax);
      await expectReviewReady(page, confirm);
      const after = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("gather.receipt.v1")!),
      );
      expect(after.receipt.items).toEqual(before.receipt.items);
      expect(after.receipt.printedTotal).toBe(gross);
      expect(after.receipt.printedTax).toBe(tax);
      expect(after.receipt.adjustments).toHaveLength(1);
      expect(after.receipt.adjustments[0]).toMatchObject({
        kind: "tax",
        amount: tax,
        allocation: "proportional",
      });
      await page.reload();
      await expect(addTax).toHaveCount(0);
      await expect(
        page.getByLabel("Adjustment 1 amount", { exact: true }),
      ).toHaveValue(tax);
      await included.check();
      await expect(addTax).toHaveCount(0);
      await expectReviewBlocked(page, confirm);
      await included.uncheck();
      await expectReviewReady(page, confirm);
      await printedTax.fill(`${prefix}0.60`);
      await expect(addTax).toHaveCount(0);
      await expect(
        page.getByLabel("Adjustment 1 amount", { exact: true }),
      ).toHaveValue(tax);
      await expectReviewBlocked(page, confirm);
      await printedTax.fill(tax);
      await expectReviewReady(page, confirm);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      expect(posts).toEqual([]);
    });
  }
}
