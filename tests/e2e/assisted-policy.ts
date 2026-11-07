import { expect, type Page } from "@playwright/test";
import { assistedLabels } from "../../src/lib/scanner-policy";

/** Opt-in model trials configure their isolated server, rather than hidden UI modes. */
export async function requireAssistedPolicy(
  page: Page,
  reader: "computer" | "vision",
  mode?: "off" | "auto" | "always",
) {
  const response = await page.request.get(
    new URL("/api/receipts/providers", page.url()).href,
  );
  expect(response.ok()).toBe(true);
  const config = await response.json();
  if (
    (config.assistedReader || "computer") !== reader ||
    (mode && (config.localCheckMode || "off") !== mode)
  )
    throw new Error(
      `This opt-in trial requires an isolated server with RECEIPT_ASSISTED_READER=${reader}${mode ? ` and LOCAL_OCR_CHECK_MODE=${mode}` : ""}. Restart that server before running the trial. No extraction was started.`,
    );
  const choice = page.getByRole("button", {
    name: `Assisted scan · ${assistedLabels[reader]}`,
    exact: true,
  });
  await expect(choice).toBeVisible();
  if ((await choice.getAttribute("aria-pressed")) !== "true")
    await choice.click();
}
