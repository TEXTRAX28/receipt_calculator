import { test, expect, type Page } from "./editor-fixture";
import { qaArtifactPath } from "./qa-artifacts";

async function upload(page: Page, paper = true) {
  await page.goto("/");
  const image = await page.evaluate((paper) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1100;
    canvas.height = 1600;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = paper ? "#50453d" : "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (paper) {
      ctx.fillStyle = "#f5f1e9";
      ctx.fillRect(250, 0, 600, 1600);
    }
    ctx.fillStyle = "#111";
    ctx.font = "bold 36px monospace";
    for (const [text, y] of [
      ["LITTLE MARKET", 80],
      ["Milk 1x 2.50 2.50", 350],
      ["Apples 1x 3.00 3.00", 470],
      ["TOTAL GBP 5.50", 1500],
    ] as const)
      ctx.fillText(text, 280, y);
    return canvas.toDataURL("image/png").split(",")[1];
  }, paper);
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-paper.png",
    mimeType: "image/png",
    buffer: Buffer.from(image, "base64"),
  });
  const original = await page
    .locator(".selected-image img")
    .getAttribute("src");
  await page.getByRole("button", { name: "Crop image 1", exact: true }).click();
  return original;
}

test("local edge preview preserves long receipt ends, original photo and real OCR", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  const original = await upload(page);
  await page
    .getByRole("button", { name: "Find receipt edges", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Suggested frame");
  const left = page.getByRole("slider", {
    name: "Trim left percent",
    exact: true,
  });
  expect(Number(await left.inputValue())).toBeGreaterThan(10);
  await expect(
    page.getByRole("slider", { name: "Trim top percent", exact: true }),
  ).toHaveValue("0");
  await expect(
    page.getByRole("slider", { name: "Trim bottom percent", exact: true }),
  ).toHaveValue("0");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: await qaArtifactPath(info, `receipt-edges-${info.project.name}.png`),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".selected-image img")).toHaveAttribute(
    "src",
    original!,
  );
  await expect(page.locator(".selected-image")).toContainText("cropped");
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(page.getByLabel("Printed total", { exact: true })).toHaveValue(
    "5.50",
    { timeout: 130000 },
  );
  await expect(
    page.getByLabel("Item 1 description", { exact: true }),
  ).toHaveValue("Milk");
  await expect(
    page.getByLabel("Item 2 description", { exact: true }),
  ).toHaveValue("Apples");
  expect(posts).toEqual([]);
});

test("unclear edges keep the existing manual frame", async ({ page }) => {
  await upload(page, false);
  const left = page.getByRole("slider", {
    name: "Trim left percent",
    exact: true,
  });
  await left.press("Home");
  await left.press("ArrowRight");
  await page
    .getByRole("button", { name: "Find receipt edges", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "Couldn’t clearly separate",
  );
  await expect(left).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Apply crop", exact: true }),
  ).toBeEnabled();
});

test("reset cancels a pending edge worker and a late response cannot replace manual edits", async ({
  page,
}) => {
  await upload(page);
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*receipt-edges.worker*", async (route) => {
    await held;
    await route.continue().catch(() => {}); // The owned worker can already be terminated.
  });
  const request = page.waitForRequest((r) =>
    r.url().includes("receipt-edges.worker"),
  );
  await page
    .getByRole("button", { name: "Find receipt edges", exact: true })
    .click();
  await request;
  await page.getByRole("button", { name: "Reset crop", exact: true }).click();
  const left = page.getByRole("slider", {
    name: "Trim left percent",
    exact: true,
  });
  await left.press("ArrowRight");
  release();
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      ),
  );
  await expect(left).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Find receipt edges", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".selected-image")).not.toContainText("cropped");
});

test("an unavailable edge worker leaves manual cropping usable", async ({
  page,
}) => {
  await upload(page);
  await page.route("**/*receipt-edges.worker*", (route) =>
    route.abort("failed"),
  );
  const left = page.getByRole("slider", {
    name: "Trim left percent",
    exact: true,
  });
  await left.press("Home");
  await left.press("ArrowRight");
  await page
    .getByRole("button", { name: "Find receipt edges", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Adjust the frame manually",
  );
  await expect(left).toHaveValue("1");
  await expect(
    page.getByRole("button", { name: "Apply crop", exact: true }),
  ).toBeEnabled();
});
