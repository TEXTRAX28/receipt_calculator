import { test, expect, type Page } from "./editor-fixture";
async function receiptImage(page: Page) {
  const data = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 850;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, 1000, 850);
    context.fillStyle = "#000";
    context.font = "bold 40px monospace";
    const lines = [
      "LITTLE MARKET",
      "28/10/2026",
      "",
      "Milk 1x 2.50 2.50",
      "Apples 1x 3.00 3.00",
      "",
      "TOTAL GBP 5.50",
    ];
    lines.forEach((line, i) => context.fillText(line, 60, 90 + i * 80));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  return {
    name: "synthetic-receipt.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}
test("cropping is accessible, preserves the original and still performs real OCR", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await receiptImage(page));
  await page.getByRole("button", { name: "Crop image 1", exact: true }).click();
  const slider = page.getByRole("slider", {
    name: "Trim right percent",
    exact: true,
  });
  await slider.press("Home");
  for (let i = 0; i < 5; i++) await slider.press("ArrowRight");
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".selected-image")).toContainText("cropped");
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your receipt." }),
  ).toBeVisible({ timeout: 130000 });
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("5.50");
  await expect(
    page.getByRole("button", { name: "View receipt image 1", exact: true }),
  ).toBeVisible();
});
test("real local OCR reads an image without uploading it", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  await page.goto("/");
  const external: string[] = [];
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (
      !request
        .url()
        .startsWith(new URL(test.info().project.use.baseURL!).origin) &&
      !request.url().startsWith("data:") &&
      !request.url().startsWith("blob:")
    )
      external.push(request.url());
    if (!["GET", "HEAD"].includes(request.method()))
      uploads.push(request.url());
  });
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await receiptImage(page));
  const scan = page.getByRole("button", {
    name: "Read receipt on this device",
  });
  await expect(scan).toBeEnabled();
  await scan.click();
  await expect(
    page.getByRole("heading", { name: "Your receipt." }),
  ).toBeVisible({ timeout: 130000 });
  await expect(
    page.getByText("Receipt ready to review.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Merchant", exact: true }),
  ).toHaveValue(/LITTLE MARKET/i);
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("5.50");
  await expect(
    page.getByRole("button", { name: "View original receipt image 1" }),
  ).toBeVisible();
  expect(external).toEqual([]);
  expect(uploads).toEqual([]);
});
test("missing OCR assets gives a recovery path, not fake extraction", async ({
  page,
}) => {
  test.setTimeout(180000);
  await page.goto("/");
  await page.route("**/ocr-enhanced/**", (route) => route.abort("failed"));
  await page.route("**/ocr/**", (route) => route.abort("failed"));
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await receiptImage(page));
  await page
    .getByRole("button", { name: "Read receipt on this device" })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    /could not start|Scanning took longer/,
    { timeout: 130000 },
  );
  await expect(
    page.getByRole("button", { name: "Enter manually" }),
  ).toBeEnabled();
  await expect(page.getByText("OCR finished.", { exact: false })).toHaveCount(
    0,
  );
});
test("repeated submission is disabled and cancellation keeps the receipt image", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/ocr-enhanced/**", (route) => route.abort("failed"));
  await page.route("**/ocr/worker.min.js", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await route.continue();
  });
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await receiptImage(page));
  await page
    .getByRole("button", { name: "Read receipt on this device" })
    .click();
  await expect(page.locator(".scan-controls .button-primary")).toBeDisabled();
  await page.getByRole("button", { name: "Cancel scan" }).click();
  await expect(page.getByRole("alert")).toContainText(/cancelled/);
  await expect(
    page.getByRole("button", { name: "Preview image 1" }),
  ).toBeVisible();
});
