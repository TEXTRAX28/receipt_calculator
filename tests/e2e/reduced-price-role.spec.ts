import { expect, test } from "@playwright/test";
import { reducedPriceFixture } from "../fixtures/reduced-price-role";
import { qaArtifactPath } from "./qa-artifacts";

test("a selling price mistaken for a discount needs both source checks before splitting (synthetic protocol)", async ({
  page,
}, info) => {
  const { raw, recognition } = reducedPriceFixture();
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.route("**/api/receipts/providers", (route) =>
    route.fulfill({
      json: {
        localModel: { configured: true, name: "PaddleOCR" },
        localVision: { configured: true, name: "Qwen3-VL 4B", maxPanels: 3 },
      },
    }),
  );
  let originalPanels: unknown;
  await page.route("**/api/receipts/recognize", (route) => {
    originalPanels = route.request().postDataJSON().panels;
    return route.fulfill({ json: { recognition } });
  });
  await page.route("**/api/receipts/vision", (route) => {
    const body = route.request().postDataJSON();
    expect(Object.keys(body)).toEqual(["panels"]);
    expect(body.panels).toEqual(originalPanels);
    return route.fulfill({ json: { receipt: raw } });
  });
  await page.goto("/");
  const png = await page.evaluate((panel) => {
    const canvas = document.createElement("canvas");
    canvas.width = panel.width;
    canvas.height = panel.height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "black";
    context.font = "24px monospace";
    for (const word of panel.words)
      context.fillText(
        word.text,
        word.box[0] * panel.width,
        word.box[1] * panel.height + 30,
        (word.box[2] - word.box[0]) * panel.width,
      );
    context.fillText("SYNTHETIC PROTOCOL FIXTURE", 100, 900);
    return canvas.toDataURL("image/png").split(",")[1];
  }, recognition.panels[0]);
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "reduced-price-role.png",
    mimeType: "image/png",
    buffer: Buffer.from(png, "base64"),
  });
  await page
    .getByLabel("Local vision comparison", { exact: true })
    .selectOption("always");
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByLabel("Item 1 line price", { exact: true }),
  ).toHaveValue("0.50");
  await expect(page.getByLabel("Item 1 discount", { exact: true })).toHaveValue(
    "0",
  );
  await expect(
    page.getByLabel("Item 1 purchased quantity", { exact: true }),
  ).toHaveValue("1");
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  const dialog = page.getByRole("dialog", {
    name: "Receipt source for purchase 1",
    exact: true,
  });
  await expect(dialog.getByTestId("source-region")).toHaveCount(2);
  await expect(
    dialog.getByText("Printed reduced selling price: 0.50", { exact: true }),
  ).toHaveCount(2);
  const checks = dialog.getByRole("checkbox", {
    name: /^I checked (?!item discount)/,
  });
  for (const check of await checks.all()) await check.check();
  // Leave the discount check pending even if its input is now zero.
  const discount = dialog.getByRole("checkbox", {
    name: "I checked item discount against the original",
    exact: true,
  });
  await expect(discount).not.toBeChecked();
  await dialog.getByRole("button", { name: "Back to receipt" }).click();
  await expect(confirm).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await qaArtifactPath(info, `reduced-role-${info.project.name}.png`),
    fullPage: true,
  });
  await page
    .getByRole("checkbox", {
      name: "I checked item discount against the original",
      exact: true,
    })
    .check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  for (const name of ["Alice", "Bob"]) {
    await page.getByRole("textbox", { name: "Person’s name" }).fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
  await page
    .getByRole("button", { name: "Whole receipt", exact: true })
    .click();
  for (const checkbox of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£0.25");
  await expect(page.getByTestId("person-total-1")).toHaveText("£0.25");
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
});
