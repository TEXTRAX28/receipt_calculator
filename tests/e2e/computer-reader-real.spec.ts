import { test, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { appSchema } from "../../src/lib/model";
import { calculateReceipt } from "../../src/lib/engine";
import { money } from "../../src/lib/money";

test("real invalid-price recovery preserves source proposals on a phone", async ({
  page,
}) => {
  test.setTimeout(300000);
  const file = process.env.GATHER_LOCAL_RECOVERY_RECEIPT;
  test.skip(!file, "Supply the local recovery development receipt");
  const base = process.env.GATHER_LOCAL_MODEL_URL;
  const run = process.env.GATHER_LOCAL_RECOVERY_RUN || "";
  if (
    !base ||
    !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base) ||
    !/^[\w-]+$/.test(run)
  )
    throw new Error("Supply loopback model URL and a new private QA run name");
  const folder = path.resolve("qa-artifacts", run, "ui");
  await mkdir(folder);
  const bytes = await readFile(file!);
  const imageSha = createHash("sha256").update(bytes).digest("hex");
  expect(imageSha).toBe(
    "893039ec50d04a6d8d151ebfa47a98528f4e8cb5abfc0097183b64dafbd10895",
  );
  const blocked: string[] = [],
    posts: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === new URL(base).origin &&
      (request.method() !== "POST" ||
        ["/api/receipts/recognize", "/api/receipts/vision"].includes(
          url.pathname,
        ))
    )
      return route.continue();
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    blocked.push(url.origin + url.pathname);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "This computer", exact: true })
    .click();
  await page
    .getByLabel("Local vision comparison", { exact: true })
    .selectOption("always");
  await page
    .getByRole("combobox", { name: "Receipt currency (optional)", exact: true })
    .selectOption("IDR");
  await page.getByLabel("Upload receipt images").setInputFiles(file!);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/receipts/vision",
    { timeout: 260000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  const response = await responsePromise;
  const native = await response.json();
  const body = response.request().postData()!;
  expect(Object.keys(JSON.parse(body))).toEqual(["panels"]);
  for (const [index, panel] of JSON.parse(body).panels.entries())
    await writeFile(
      path.join(folder, `panel-${index + 1}.jpg`),
      Buffer.from(panel.data, "base64"),
      { flag: "wx" },
    );
  await writeFile(
    path.join(folder, "vision-response.json"),
    JSON.stringify(native, null, 2),
    { flag: "wx" },
  );
  await writeFile(
    path.join(folder, "response-status.json"),
    JSON.stringify({
      status: response.status(),
      elapsed_ms: Date.now() - started,
    }),
    { flag: "wx" },
  );
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 260000 });
  const elapsed = Date.now() - started;
  const state = appSchema.parse(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gather.receipt.v1")!),
    ),
  );
  expect(state.receipt.items).toHaveLength(5);
  const expected = [
    ["Lasagna", "45000"],
    ["Spaghetti ChickPesto", "55000"],
    ["BangBang Chick Wings", "49000"],
    ["Iced Cappuccino", "33000"],
    ["Gypsy Gelato Ice Tea", "39000"],
  ];
  const key = (text: string) =>
    text
      .replace(/^\d+\s+/, "")
      .toUpperCase()
      .replace(/[^\p{L}\p{N}]/gu, "");
  let recoveries = 0;
  const reviewed = [];
  for (const [name, price] of expected) {
    const index = state.receipt.items.findIndex(
      (item) => key(item.description) === key(name),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const item = state.receipt.items[index];
    expect(item.lineTotal).toBe(price);
    const original = native.receipt.items.find(
      (row: { description: string }) => key(row.description) === key(name),
    );
    expect(original).toBeDefined();
    let invalid = false;
    try {
      money(original.lineTotal, "IDR", true);
    } catch {
      invalid = true;
    }
    const checks = state.receipt.reviewChecks.filter(
      (check) => check.scope === "item" && check.itemId === item.id,
    );
    if (invalid) {
      recoveries++;
      expect(
        checks.some(
          (check) =>
            check.field === "lineTotal" &&
            check.reason === "recovered" &&
            check.confirmedValue === "",
        ),
      ).toBe(true);
      expect(
        checks.some(
          (check) =>
            check.field === "lineTotal" && check.other === original.lineTotal,
        ),
      ).toBe(true);
    }
    const input = page.getByLabel(`Item ${index + 1} line price`, {
      exact: true,
    });
    await expect(input).toHaveValue(price);
    reviewed.push({
      name: item.description,
      lineTotal: item.lineTotal,
      originalLineTotal: original.lineTotal,
      checks,
    });
  }
  expect(recoveries).toBeGreaterThan(0);
  const input = page.getByLabel("Item 1 line price", { exact: true });
  await input.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(folder, "phone-price.png") });
  const view = page.getByRole("button", {
    name: "View source for item 1",
    exact: true,
  });
  await view.click();
  await expect(
    page.getByRole("dialog", {
      name: "Receipt source for purchase 1",
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: path.join(folder, "phone-source.png") });
  await page
    .getByRole("dialog", { name: "Receipt source for purchase 1", exact: true })
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  ).toBeDisabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
  expect(blocked).toEqual([]);
  const calculation = calculateReceipt(state.receipt);
  expect(calculation.issues.length).toBeGreaterThan(0);
  await writeFile(
    path.join(folder, "result.json"),
    JSON.stringify(
      {
        scope:
          "One source-inspected development image, actual local Paddle/Qwen HTTP and Chrome phone emulation. Explicit IDR is post-extraction context, not a model hint. No financial edits, complete-financial or physical-phone claim.",
        image_sha256: imageSha,
        request_sha256: createHash("sha256").update(body).digest("hex"),
        elapsed_ms: elapsed,
        recoveries,
        reviewed,
        receipt: state.receipt,
        calculation,
        posts,
        blocked,
        external_requests: 0,
        financial_fields_edited: false,
      },
      (_, value) => (typeof value === "bigint" ? String(value) : value),
      2,
    ),
    { flag: "wx" },
  );
});

test("real row-first native comparison preserves printed prices and blocks unsupported fields on a phone", async ({
  page,
}) => {
  test.setTimeout(300000);
  const file = process.env.GATHER_LOCAL_ROW_FIRST_RECEIPT;
  test.skip(!file, "Supply the local row-first development receipt");
  const base = process.env.GATHER_LOCAL_MODEL_URL;
  const run = process.env.GATHER_LOCAL_ROW_FIRST_RUN || "";
  if (
    !base ||
    !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base) ||
    !/^[\w-]+$/.test(run)
  )
    throw new Error(
      "Supply a loopback model URL and a new private QA run name",
    );
  const folder = path.resolve("qa-artifacts", run, "ui");
  await mkdir(folder);
  const bytes = await readFile(file!);
  const imageSha = createHash("sha256").update(bytes).digest("hex");
  expect(imageSha).toBe(
    "a7efa7596757d7916c5e454e8bd98e3371cdf476ac737a269693804484cfc193",
  );
  const blocked: string[] = [],
    posts: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === new URL(base).origin &&
      (request.method() !== "POST" ||
        ["/api/receipts/recognize", "/api/receipts/vision"].includes(
          url.pathname,
        ))
    )
      return route.continue();
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    blocked.push(url.origin + url.pathname);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "This computer", exact: true })
    .click();
  await page
    .getByLabel("Local vision comparison", { exact: true })
    .selectOption("always");
  await page
    .getByRole("combobox", { name: "Receipt currency (optional)", exact: true })
    .selectOption("IDR");
  await page.getByLabel("Upload receipt images").setInputFiles(file!);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/receipts/vision",
    { timeout: 260000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  const response = await responsePromise;
  const native = await response.json();
  const body = response.request().postData()!;
  expect(Object.keys(JSON.parse(body))).toEqual(["panels"]);
  const panels = JSON.parse(body).panels;
  for (const [index, panel] of panels.entries())
    await writeFile(
      path.join(folder, `panel-${index + 1}.jpg`),
      Buffer.from(panel.data, "base64"),
      { flag: "wx" },
    );
  await writeFile(
    path.join(folder, "vision-response.json"),
    JSON.stringify(native, null, 2),
    { flag: "wx" },
  );
  await writeFile(
    path.join(folder, "response-status.json"),
    JSON.stringify({
      status: response.status(),
      request_sha256: createHash("sha256").update(body).digest("hex"),
      elapsed_ms: Date.now() - started,
    }),
    { flag: "wx" },
  );
  expect(response.status()).toBe(200);
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 260000 });
  const elapsedMs = Date.now() - started;
  const state = appSchema.parse(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gather.receipt.v1")!),
    ),
  );
  const calculation = calculateReceipt(state.receipt);
  expect(state.receipt.items).toHaveLength(22);
  const expected = [
    ["Tahu Goreng", "2", "36000"],
    ["Tempe Goreng", "2", "36000"],
    ["Bbk Panggang Sam", "3", "366000"],
    ["Hot Tea", "2", "44000"],
  ];
  const reviewed = [];
  for (const [name, quantity, lineTotal] of expected) {
    const index = state.receipt.items.findIndex(
      (item) => item.description.toLowerCase() === name.toLowerCase(),
    );
    expect(index).toBeGreaterThanOrEqual(0);
    const item = state.receipt.items[index];
    expect(item).toMatchObject({ quantity, lineTotal });
    const checks = state.receipt.reviewChecks.filter(
      (check) => check.scope === "item" && check.itemId === item.id,
    );
    expect(
      checks.some(
        (check) =>
          check.field === "quantity" &&
          check.reason === "source" &&
          check.confirmedValue === "",
      ),
    ).toBe(true);
    expect(
      checks.some(
        (check) =>
          check.field === "unitPrice" &&
          check.reason === "unsupported" &&
          check.confirmedValue === "",
      ),
    ).toBe(true);
    const card = page.getByTestId(`review-item-${index}`);
    await expect(
      page.getByLabel(`Item ${index + 1} line price`, { exact: true }),
    ).toHaveValue(lineTotal);
    reviewed.push({
      description: item.description,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      lineTotal: item.lineTotal,
      checks,
    });
    if (name === "Hot Tea") {
      await card.scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(folder, "phone-review.png") });
    }
  }
  await expect(
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  ).toBeDisabled();
  expect(calculation.issues.length).toBeGreaterThan(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
  expect(blocked).toEqual([]);
  await writeFile(
    path.join(folder, "result.json"),
    JSON.stringify(
      {
        scope:
          "One source-inspected development receipt, actual installed Paddle and native Qwen with HTTP/UI on desktop Chrome phone emulation. Currency supplied after extraction; no blind holdout, complete financial success or physical-phone claim.",
        image_sha256: imageSha,
        request_sha256: createHash("sha256").update(body).digest("hex"),
        posts,
        blocked,
        elapsed_ms: elapsedMs,
        receipt: state.receipt,
        reviewed,
        calculation,
        external_requests: 0,
        financial_fields_edited: false,
      },
      (_, value) => (typeof value === "bigint" ? String(value) : value),
      2,
    ),
    { flag: "wx" },
  );
});

test("real leading-count receipt preserves its row price and source review on a phone", async ({
  page,
}) => {
  test.setTimeout(180000);
  const file = process.env.GATHER_LOCAL_LEADING_RECEIPT;
  test.skip(
    !file,
    "Supply the local development receipt for this measured regression",
  );
  const base = process.env.GATHER_LOCAL_MODEL_URL;
  const run = process.env.GATHER_LOCAL_LEADING_RUN || "";
  if (
    !base ||
    !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base) ||
    !/^[\w-]+$/.test(run)
  )
    throw new Error(
      "Supply a loopback model URL and a new private QA run name",
    );
  const folder = path.resolve("qa-artifacts", run);
  await mkdir(folder);
  const bytes = await readFile(file!);
  const imageSha = createHash("sha256").update(bytes).digest("hex");
  expect(imageSha).toBe(
    "a7efa7596757d7916c5e454e8bd98e3371cdf476ac737a269693804484cfc193",
  );
  const blocked: string[] = [],
    posts: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === new URL(base).origin &&
      (request.method() !== "POST" ||
        url.pathname === "/api/receipts/recognize")
    )
      return route.continue();
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    blocked.push(url.origin + url.pathname);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await page
    .getByRole("button", { name: "This computer", exact: true })
    .click();
  const comparison = page.getByLabel("Local vision comparison", {
    exact: true,
  });
  if (await comparison.isVisible()) await comparison.selectOption("off");
  await page
    .getByRole("combobox", { name: "Receipt currency (optional)", exact: true })
    .selectOption("IDR");
  await page.getByLabel("Upload receipt images").setInputFiles(file!);
  const responsePromise = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/receipts/recognize",
    { timeout: 130000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  const response = await responsePromise;
  expect(response.status()).toBe(200);
  const recognized = await response.json();
  const body = response.request().postData()!;
  expect(Object.keys(JSON.parse(body))).toEqual(["panels"]);
  await writeFile(
    path.join(folder, "ocr-response.json"),
    JSON.stringify(recognized, null, 2),
    { flag: "wx" },
  );
  const panels = JSON.parse(body).panels;
  for (const [index, panel] of panels.entries())
    await writeFile(
      path.join(folder, `panel-${index + 1}.jpg`),
      Buffer.from(panel.data, "base64"),
      { flag: "wx" },
    );
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  const elapsedMs = Date.now() - started;
  const items = [];
  const cards = page.locator('[data-testid^="review-item-"]');
  for (let index = 1; index <= (await cards.count()); index++) {
    const more = page.getByRole("button", {
      name: `Edit details for item ${index}`,
      exact: true,
    });
    if (await more.count()) await more.click();
    items.push({
      description: await page
        .getByLabel(`Item ${index} description`, { exact: true })
        .inputValue(),
      quantity: await page
        .getByLabel(`Item ${index} purchased quantity`, { exact: true })
        .inputValue(),
      unitPrice: await page
        .getByLabel(`Item ${index} unit price (optional)`, { exact: true })
        .inputValue(),
      lineTotal: await page
        .getByLabel(`Item ${index} line price`, { exact: true })
        .inputValue(),
    });
  }
  const teaIndex = items.findIndex((item) =>
    /hot\s*tea/i.test(item.description),
  );
  expect(teaIndex).toBeGreaterThanOrEqual(0);
  expect(items[teaIndex]).toMatchObject({
    quantity: "2",
    unitPrice: "",
    lineTotal: "44000",
  });
  const tea = cards.nth(teaIndex);
  const checks = tea.getByRole("checkbox");
  expect(await checks.count()).toBeGreaterThan(0);
  for (const check of await checks.all()) await expect(check).not.toBeChecked();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await tea.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(folder, "phone-review.png") });
  expect(posts).toEqual(["/api/receipts/recognize"]);
  expect(blocked).toEqual([]);
  await writeFile(
    path.join(folder, "result.json"),
    JSON.stringify(
      {
        scope:
          "One real installed Paddle/native HTTP/UI development regression on desktop Chrome phone emulation. IDR supplied explicitly after extraction, never sent to the backend. Not a complete financial success, untouched holdout or physical-phone measurement.",
        image_sha256: imageSha,
        request_sha256: createHash("sha256").update(body).digest("hex"),
        posts,
        blocked,
        elapsed_ms: elapsedMs,
        items,
        hot_tea_index: teaIndex,
        hot_tea_pending_source_checks: await checks.count(),
        financial_fields_edited: false,
        external_requests: 0,
        completed_at: new Date().toISOString(),
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
});

test("real scanned PDF → installed computer OCR → exact split", async ({
  page,
}) => {
  test.setTimeout(180000);
  const base = process.env.GATHER_LOCAL_MODEL_URL;
  if (!base || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base))
    throw new Error(
      "Supply a loopback GATHER_LOCAL_MODEL_URL with the installed model enabled",
    );
  const requests = { posts: [] as string[], external: [] as string[] };
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      url.origin === new URL(base).origin &&
      (request.method() !== "POST" ||
        url.pathname === "/api/receipts/recognize")
    )
      return route.continue();
    if (["data:", "blob:"].includes(url.protocol)) return route.continue();
    requests.external.push(url.origin + url.pathname);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      requests.posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await expect(
    page.getByRole("button", { name: "This computer", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  const comparison = page.getByLabel("Local vision comparison", {
    exact: true,
  });
  if (await comparison.isVisible()) await comparison.selectOption("off");
  const started = Date.now();
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(path.resolve("tests/fixtures/pdfs/scanned-one-page.pdf"));
  await expect(page.locator(".selected-image")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "PDF text", exact: true }),
  ).toHaveCount(0);
  const response = page.waitForResponse(
    (value) =>
      value.request().method() === "POST" &&
      new URL(value.url()).pathname === "/api/receipts/recognize",
    { timeout: 130000 },
  );
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
  const result = await response;
  const recognized = await result.json();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  const elapsedMs = Date.now() - started;
  const items = [];
  const cards = page.locator('[data-testid^="review-item-"]');
  for (let index = 1; index <= (await cards.count()); index++) {
    const more = page.getByRole("button", {
      name: `Edit details for item ${index}`,
      exact: true,
    });
    if (await more.count()) await more.click();
    items.push({
      description: await page
        .getByLabel(`Item ${index} description`, { exact: true })
        .inputValue(),
      quantity: await page
        .getByLabel(`Item ${index} purchased quantity`, { exact: true })
        .inputValue(),
      unitPrice: await page
        .getByLabel(`Item ${index} unit price (optional)`, { exact: true })
        .inputValue(),
      lineTotal: await page
        .getByLabel(`Item ${index} line price`, { exact: true })
        .inputValue(),
    });
  }
  const printedTotal = await page
    .getByLabel("Printed total", { exact: true })
    .inputValue();
  const expected = [
    {
      description: "Milk",
      quantity: "2",
      unitPrice: "1.25",
      lineTotal: "2.50",
    },
    {
      description: "Milk",
      quantity: "2",
      unitPrice: "1.25",
      lineTotal: "2.50",
    },
    {
      description: "Bread",
      quantity: "1",
      unitPrice: "1.50",
      lineTotal: "1.50",
    },
  ];
  const moneyMatches =
    JSON.stringify(items) === JSON.stringify(expected) &&
    printedTotal === "6.50";
  await mkdir("qa-artifacts/advanced-ocr", { recursive: true });
  const output = {
    synthetic: true,
    actualInstalledModel: true,
    mocked: false,
    financialEdits: 0,
    elapsedMs,
    httpStatus: result.status(),
    recognized,
    items,
    printedTotal,
    moneyMatches,
    requests,
    finalSplitVerified: false,
  };
  await writeFile(
    "qa-artifacts/advanced-ocr/pdf-real-scan-desktop.json",
    JSON.stringify(output, null, 2),
  );
  expect(result.status()).toBe(200);
  expect(moneyMatches).toBe(true);
  expect(requests).toEqual({
    posts: ["/api/receipts/recognize"],
    external: [],
  });
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
  for (const index of [0, 1])
    await expect(page.getByTestId(`person-total-${index}`)).toHaveText("£3.25");
  output.finalSplitVerified = true;
  await writeFile(
    "qa-artifacts/advanced-ocr/pdf-real-scan-desktop.json",
    JSON.stringify(output, null, 2),
  );
});

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
  const inputHashes = await Promise.all(
    (files as string[]).map(async (file) =>
      createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    ),
  );
  const requestPanelHashes: string[][] = [];
  page.on("request", (request) => {
    if (request.method() === "POST")
      requestPanelHashes.push(
        request
          .postDataJSON()
          .panels.map((panel: { data: string }) =>
            createHash("sha256")
              .update(Buffer.from(panel.data, "base64"))
              .digest("hex"),
          ),
      );
  });
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
  await expect(
    page.getByRole("button", { name: /^View source for item \d+$/ }),
  ).toHaveCount(18);
  const chickenAreas: string[][] = [];
  for (const itemNumber of [16, 17]) {
    await page
      .getByRole("button", {
        name: `View source for item ${itemNumber}`,
        exact: true,
      })
      .click();
    const source = page.getByRole("dialog", {
      name: `Receipt source for purchase ${itemNumber}`,
    });
    await expect(source.getByTestId("source-region")).toHaveCount(2);
    chickenAreas.push(
      await source
        .getByTestId("source-region")
        .evaluateAll((regions) =>
          regions.map((region) => region.getAttribute("y")!),
        ),
    );
    await source
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
  expect(chickenAreas[0]).not.toEqual(chickenAreas[1]);
  await page
    .getByRole("button", { name: "View source for item 18", exact: true })
    .click();
  const clothSource = page.getByRole("dialog", {
    name: "Receipt source for purchase 18",
  });
  await expect(clothSource.getByTestId("source-region")).toHaveCount(4);
  await clothSource
    .getByText("Recognized text in this area", { exact: true })
    .click();
  await expect(clothSource.locator("pre")).toContainText(/1\.50\s*-?\s*A/);
  await expect(clothSource.locator("pre")).not.toContainText(
    /Tran\s*ID|Merchant\s*ID|Card:/i,
  );
  await clothSource.screenshot({
    path: `qa-artifacts/receipt-source-real-${test.info().project.name}.png`,
  });
  const beforeReread = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
  );
  await clothSource
    .getByRole("button", { name: "Reread this purchase", exact: true })
    .click();
  const areaStarted = Date.now();
  const areaResponse = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/receipts/recognize",
    { timeout: 130000 },
  );
  await clothSource
    .getByRole("button", { name: "Read selected area", exact: true })
    .click();
  await expect(clothSource.locator(".area-read-text")).toContainText(
    /SPONTEX/i,
    { timeout: 130000 },
  );
  await expect(clothSource.locator(".area-read-text")).toContainText("6.99");
  await expect(clothSource.locator(".area-read-text")).toContainText("1.50");
  const areaResult = await areaResponse;
  expect(areaResult.status()).toBe(200);
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
    ),
  ).toEqual(beforeReread);
  const areaOutcome = {
    actualInstalledModel: true,
    uniqueDevelopmentTransaction: 1,
    elapsedMs: Date.now() - areaStarted,
    timingScope:
      "Area crop preparation, installed PaddleOCR HTTP recognition and browser rendering; initial full receipt scan excluded, warm worker/caches; not a representative latency or phone-hardware measurement",
    selectedPurchase: 18,
    recognizedText: await clothSource.locator(".area-read-text").textContent(),
    recognition: await areaResult.json(),
    draftUnchangedAfterReread: true,
    financialEdits: 0,
    finalSplitVerified: false,
    inputHashes,
    requestPanelHashes,
    posts,
    external,
  };
  await clothSource.screenshot({
    path: `qa-artifacts/area-reader-costco-${test.info().project.name}.png`,
  });
  await clothSource
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
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
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/recognize"]);
  expect(external).toEqual([]);
  areaOutcome.finalSplitVerified = true;
  await mkdir("qa-artifacts", { recursive: true });
  await writeFile(
    `qa-artifacts/area-reader-costco-${test.info().project.name}.json`,
    JSON.stringify(areaOutcome, null, 2),
  );
});
