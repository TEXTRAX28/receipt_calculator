import { expectReviewReady } from "./review-assertions";
import { test, expect, type Page } from "./editor-fixture";
import { mkdir } from "node:fs/promises";

async function fitsPhone(page: Page) {
  const issues = await page.evaluate((viewportWidth) => {
    const problems: string[] = [];
    if (document.documentElement.scrollWidth > viewportWidth)
      problems.push(
        `Page is ${document.documentElement.scrollWidth}px wide in a ${viewportWidth}px viewport`,
      );
    for (const control of document.querySelectorAll<HTMLInputElement>(
      'input:not([type="checkbox"]):not([type="file"]), select, textarea',
    )) {
      const box = control.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const style = getComputedStyle(control);
      if (style.visibility === "hidden" || style.display === "none") continue;
      if (box.left < -1 || box.right > viewportWidth + 1)
        problems.push(
          `Control outside viewport: ${control.getAttribute("aria-label") || control.id}`,
        );
      if (parseFloat(style.fontSize) < 16)
        problems.push(
          `Small form text: ${control.getAttribute("aria-label") || control.id} (${style.fontSize})`,
        );
    }
    return problems;
  }, page.viewportSize()!.width);
  expect(issues).toEqual([]);
}

for (const width of [320, 360, 390, 430]) {
  test(`phone ${width}px: readable forms and complete sharing workflow`, async ({
    page,
  }, info) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await fitsPhone(page);
    await page.getByRole("button", { name: "Try the Costco demo" }).click();
    await page
      .getByRole("button", { name: "Edit details for item 1", exact: true })
      .click();
    await fitsPhone(page);
    const targets = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLButtonElement>("button")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return !el.disabled && r.width > 1 && r.height > 1;
        })
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width < 43 || r.height < 43;
        })
        .map((el) => ({
          name: el.getAttribute("aria-label") || el.textContent?.trim(),
          width: el.getBoundingClientRect().width,
          height: el.getBoundingClientRect().height,
        })),
    );
    expect(targets).toEqual([]);
    await page
      .getByRole("button", { name: "Confirm receipt & add people" })
      .click();
    for (const name of [
      width === 320
        ? "AlexandraWithAVeryLongUnbrokenDisplayName12345"
        : "Alice",
      "Bob",
      "Charlie",
    ]) {
      await page
        .getByRole("textbox", { name: "Person’s name", exact: true })
        .fill(name);
      await page
        .getByRole("button", { name: "Add person", exact: true })
        .click();
    }
    await fitsPhone(page);
    await page.getByRole("button", { name: "Let’s share it" }).click();
    await page.getByRole("button", { name: "Share all equally" }).click();
    const item = page.getByTestId("assignment-item-0");
    await item
      .getByLabel("Split method", { exact: true })
      .selectOption("quantity");
    await item
      .getByRole("textbox", { name: "Units per purchased pack" })
      .fill("6");
    for (const [i, value] of ["1", "2", "3"].entries())
      await item
        .getByRole("textbox", {
          name: new RegExp(`Units for .*person ${i + 1}`),
        })
        .fill(value);
    await fitsPhone(page);
    await page
      .getByRole("button", { name: "Finalize split", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Every penny has a home." }),
    ).toBeVisible();
    await page.locator(".person-breakdown").first().locator("summary").click();
    await fitsPhone(page);
    await mkdir("qa-artifacts", { recursive: true });
    if (width === 390) {
      await page.screenshot({
        path: `qa-artifacts/phone-390-${info.project.name}-summary.png`,
        fullPage: true,
      });
      await page.screenshot({
        path: `qa-artifacts/phone-390-${info.project.name}-viewport.png`,
        fullPage: false,
      });
    }
  });
}

test("phone landscape: receipt editor fits with readable inputs", async ({
  page,
}) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.getByRole("button", { name: "Try the Costco demo" }).click();
  await page
    .getByRole("button", { name: "Edit details for item 1", exact: true })
    .click();
  // Form readability is checked for touch devices; desktop landscape keeps desktop typography.
  if (await page.evaluate(() => matchMedia("(pointer: coarse)").matches))
    await fitsPhone(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expectReviewReady(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
});
