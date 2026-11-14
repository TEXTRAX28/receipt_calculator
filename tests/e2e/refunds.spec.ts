import { expectReviewAttention, expectReviewReady } from "./review-assertions";
import { qaArtifactPath } from "./qa-artifacts";
import { expect, test, type Page } from "./editor-fixture";
import AxeBuilder from "@axe-core/playwright";
import { mkdir, readFile } from "node:fs/promises";

async function addPeople(page: Page, names: string[]) {
  await page
    .getByRole("button", { name: "Confirm receipt & add people", exact: true })
    .click();
  for (const name of names) {
    await page.getByLabel("Person’s name", { exact: true }).fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
}

test("phone refund controls → exact credit shares → honest export and private refresh", async ({
  page,
}, info) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .click();
  await page
    .getByLabel("Merchant", { exact: true })
    .fill("Synthetic return shop");
  await page.getByLabel("Printed total", { exact: true }).fill("10.00");
  await page
    .getByRole("button", {
      name: "Change sign (+/−) for Printed total",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Item 1 description", { exact: true })
    .fill("Returned groceries");
  await page.getByLabel("Item 1 line price", { exact: true }).fill("10.00");
  await page
    .getByRole("button", { name: "Mark as refund for item 1", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 1 line price", { exact: true }),
  ).toHaveValue("-10.00");
  await expect(
    page.getByLabel("Item 1 purchased quantity", { exact: true }),
  ).toHaveValue("1");
  await page
    .getByLabel("Item 1 unit price (optional)", { exact: true })
    .fill("10.00");
  await expectReviewReady(
    page,
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  );
  await mkdir("qa-artifacts", { recursive: true });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 900 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const sign = page.getByRole("button", {
      name: "Change sign (+/−) for Printed total",
      exact: true,
    });
    const bounds = await sign.boundingBox();
    expect(bounds!.width).toBeGreaterThanOrEqual(44);
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.locator(".metadata").screenshot({
      path: await qaArtifactPath(
        info,
        `refund-metadata-${info.project.name}-${width}.png`,
      ),
    });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await addPeople(page, ["Alice", "Bob", "Charlie"]);
  for (const checkbox of await page
    .getByTestId("assignment-item-0")
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  for (const [i, total] of ["−£3.34", "−£3.33", "−£3.33"].entries())
    await expect(page.getByTestId(`person-total-${i}`)).toHaveText(total);
  await expect(page.locator(".person-heading").first()).toContainText(
    "Credit share",
  );
  await page.screenshot({
    path: await qaArtifactPath(info, `refund-summary-${info.project.name}.png`),
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download summary", exact: true })
    .click();
  const summary = await readFile((await (await download).path())!, "utf8");
  expect(summary).toContain("refund credit share");
  expect(summary).toContain(
    "No reimbursement direction or original payer has been inferred",
  );
  await page.reload();
  await expect(page.getByTestId("person-total-0")).toHaveText("−£3.34");
  expect(
    JSON.parse(
      (await page.evaluate(() => localStorage.getItem("gather.receipt.v1")))!,
    ).receipt.items[0].lineTotal,
  ).toBe("-10.00");
});

test("mixed text purchases and returns require a shared-charge choice and keep individual credit ownership", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByText("Already have receipt text?", { exact: true }).click();
  await page
    .getByLabel("Receipt text", { exact: true })
    .fill(
      "Synthetic market\nGroceries 1x 10.00 10.00\nReturned bread 1x 5.00 -5.00\nTOTAL GBP 5.00",
    );
  await page
    .getByRole("button", { name: "Review this text", exact: true })
    .click();
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.getByLabel("Item 2 line price", { exact: true }),
  ).toHaveValue("-5.00");
  await page
    .getByRole("button", { name: "Add discount, tax or charge", exact: true })
    .click();
  await page
    .getByLabel("Adjustment 1 label", { exact: true })
    .fill("Shared fee");
  await page.getByLabel("Adjustment 1 amount", { exact: true }).fill("2.00");
  await page.getByLabel("Printed total", { exact: true }).fill("7.00");
  await expectReviewAttention(
    page,
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  );
  await expect(
    page.getByText(/This receipt mixes purchases and returns/).first(),
  ).toBeVisible();
  await page
    .getByLabel("Adjustment 1 allocation", { exact: true })
    .selectOption("equal-people");
  await addPeople(page, ["Alice", "Bob"]);
  await page
    .getByTestId("assignment-item-0")
    .getByRole("checkbox")
    .nth(0)
    .check();
  await page
    .getByTestId("assignment-item-1")
    .getByRole("checkbox")
    .nth(1)
    .check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£11.00");
  await expect(page.getByTestId("person-total-1")).toHaveText("−£4.00");
});
