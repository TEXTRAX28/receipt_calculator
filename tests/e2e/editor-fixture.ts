import { test as base } from "@playwright/test";
export * from "@playwright/test";

/** Older financial/source scenarios exercise the explicit editing view.
 * The default receipt-first surface is covered separately in digital-receipt.
 */
export const test = base.extend<{ receiptEditingView: void }>({
  receiptEditingView: [
    async ({ page }, use) => {
      await page.addLocatorHandler(
        page.locator("#receipt-editor:not([open]) > summary"),
        async (summary) => {
          await summary.click();
        },
      );
      await use();
    },
    { auto: true },
  ],
});
