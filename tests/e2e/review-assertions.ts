import { expect, type Locator, type Page } from "@playwright/test";

/** Continue is actionable: invalid drafts stay on this step and reveal the correction. */
export async function expectReviewBlocked(page: Page, button: Locator) {
  await expect(button).toBeEnabled();
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
