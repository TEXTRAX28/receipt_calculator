import { test, expect } from "@playwright/test";

/** Opt-in real installed model, local HTTP only; synthetic source, no cloud. */
test("real computer reader → review → people → exact split", async ({
  page,
}) => {
  test.setTimeout(180000);
  const base = process.env.GATHER_LOCAL_MODEL_URL;
  if (!base || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base))
    throw new Error(
      "Supply a loopback GATHER_LOCAL_MODEL_URL with the installed model enabled",
    );
  const external: string[] = [];
  const posts: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (
      url.startsWith(new URL(base).origin) ||
      url.startsWith("data:") ||
      url.startsWith("blob:")
    )
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "This computer", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const image = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 850;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, 1000, 850);
    ctx.fillStyle = "black";
    ctx.font = "bold 40px monospace";
    [
      "LITTLE MARKET",
      "28/10/2026",
      "",
      "Milk 1x 2.50 2.50",
      "Apples 1x 3.00 3.00",
      "",
      "TOTAL GBP 5.50",
    ].forEach((line, i) => ctx.fillText(line, 60, 90 + i * 80));
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-real-model.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(2);
  await expect(
    page.getByRole("textbox", { name: "Merchant", exact: true }),
  ).toHaveValue(/LITTLE MARKET/i);
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("5.50");
  await page
    .getByRole("button", { name: "Confirm receipt & add people" })
    .click();
  for (const name of ["Alice", "Bob"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page.getByRole("button", { name: "Let’s share it" }).click();
  for (let i = 0; i < 2; i++) {
    const item = page.getByTestId(`assignment-item-${i}`);
    await item.getByRole("checkbox").nth(0).check();
    await item.getByRole("checkbox").nth(1).check();
  }
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£2.75");
  await expect(page.getByTestId("person-total-1")).toHaveText("£2.75");
  expect(posts).toEqual(["/api/receipts/recognize"]);
  expect(external).toEqual([]);
});
