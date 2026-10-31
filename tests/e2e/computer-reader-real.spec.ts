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

/** Supplemental development receipt, already used by the demo/parser; never a holdout. */
test("real two-photo Costco receipt → automatic financial fields → exact split", async ({
  page,
}) => {
  test.setTimeout(240000);
  const privateFiles = process.env.GATHER_LOCAL_COSTCO_PHOTOS;
  test.skip(
    !privateFiles,
    "Supply the two private Costco photo paths as a JSON array.",
  );
  const files: unknown = JSON.parse(privateFiles!);
  if (
    !Array.isArray(files) ||
    files.length !== 2 ||
    files.some((f) => typeof f !== "string")
  )
    throw new Error(
      "GATHER_LOCAL_COSTCO_PHOTOS must contain exactly two local photo paths",
    );
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
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(files as string[]);
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(18);
  // Observed financial truth from the supplied images; no edits/corrections below.
  const rows = [
    [/SPAM/i, "14.99", "Z", "0"],
    [/JW TUN\/OIL/i, "9.99", "Z", "0"],
    [/MEDIUM EGGS/i, "9.99", "Z", "0"],
    [/CHICKEN SKEWER/i, "9.49", "Z", "2.00"],
    [/ROWSE HONEY 1.36KG/i, "5.99", "Z", "0"],
    [/BELVEDERE VOD/i, "23.99", "A", "1.60"],
    [/MEADOWCHURN/i, "5.49", "Z", "0"],
    [/SCOTCH SCOURER/i, "5.29", "A", "0"],
    [/FERRERO ROCHER/i, "10.99", "A", "0"],
    [/KINDER BUENO/i, "9.79", "A", "1.80"],
    [/PRAWN WONTON SOUP/i, "11.59", "Z", "0"],
    [/PARMAREGGIO/i, "19.03", "Z", "0"],
    [/BABY PLUM TOMS/i, "4.99", "Z", "0"],
    [/GARLIC 1KG/i, "5.49", "Z", "0"],
    [/PLASTIC CONT/i, "7.99", "A", "0"],
    [/KS ROTISS CHICKEN/i, "3.99", "A", "0"],
    [/KS ROTISS CHICKEN/i, "3.99", "A", "0"],
    [/SPONTEX CLOTHS/i, "6.99", "A", "1.50"],
  ] as const;
  for (const [index, [description, price, code, discount]] of rows.entries()) {
    const n = index + 1;
    const item = page.getByTestId(`review-item-${index}`);
    await expect(
      item.getByRole("textbox", { name: `Item ${n} description`, exact: true }),
    ).toHaveValue(description);
    await expect(
      item.getByRole("textbox", { name: `Item ${n} line price`, exact: true }),
    ).toHaveValue(price);
    await item
      .getByRole("button", { name: `Edit details for item ${n}`, exact: true })
      .click();
    await expect(
      item.getByRole("textbox", {
        name: `Item ${n} purchased quantity`,
        exact: true,
      }),
    ).toHaveValue("1");
    await expect(
      item.getByRole("textbox", {
        name: `Item ${n} unit price (optional)`,
        exact: true,
      }),
    ).toHaveValue(price);
    await expect(
      item.getByRole("textbox", { name: `Item ${n} discount`, exact: true }),
    ).toHaveValue(discount);
    await expect(
      item.getByLabel(`Item ${n} tax code`, { exact: true }),
    ).toHaveValue(code);
  }
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("176.78");
  await expect(
    page.getByRole("textbox", {
      name: "Subtotal after item discounts (optional)",
      exact: true,
    }),
  ).toHaveValue("163.16");
  await expect(
    page.getByRole("textbox", {
      name: "Printed tax (optional check)",
      exact: true,
    }),
  ).toHaveValue("13.62");
  await expect(page.getByText(/Matched 2 overlapping purchases/)).toBeVisible();
  await expect(
    page.getByText(/Different final totals were read/),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Confirm receipt & add people", exact: true })
    .click();
  for (const name of ["Alice", "Bob", "Charlie"]) {
    await page
      .getByRole("textbox", { name: "Person’s name", exact: true })
      .fill(name);
    await page.getByRole("button", { name: "Add person", exact: true }).click();
  }
  await page
    .getByRole("button", { name: "Let’s share it", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Whole receipt", exact: true })
    .click();
  for (const box of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await box.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-1")).toHaveText("£58.93");
  await expect(page.getByTestId("person-total-2")).toHaveText("£58.92");
  expect(posts).toEqual(["/api/receipts/recognize"]);
  expect(external).toEqual([]);
});
