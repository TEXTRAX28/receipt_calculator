import { expect, type Locator, type Page } from "@playwright/test";

/** Hard errors block; reading uncertainty remains visible as an advisory note. */
export async function expectReviewAttention(page: Page, button: Locator) {
  await expect(button).toBeEnabled();
  if ((await page.locator(".issue-box, .allocation-error").count()) === 0) {
    await expect(page.locator(".reader-notes").first()).toBeAttached();
    return;
  }
  await button.click();
  await expect(button).toBeVisible();
  await expect(page.locator(".validation-target")).toHaveCount(1);
  await expect(
    page.locator(".issue-box, .allocation-error").first(),
  ).toBeVisible();
}

export async function expectReviewReady(page: Page, button: Locator) {
  await expect(button).toBeEnabled();
  await expect(page.locator(".issue-box")).toHaveCount(0);
}
