import { test, expect, type Page } from "./editor-fixture";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";

async function photo(page: Page, kind: "sharp" | "blur" | "dark" | "small") {
  const data = await page.evaluate((variant) => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = variant === "small" ? 300 : 700;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = variant === "dark" ? "#242424" : "white";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = variant === "dark" ? "#868686" : "black";
    ctx.font = `${variant === "small" ? 15 : 30}px monospace`;
    [
      "LITTLE MARKET",
      "Milk 1x 2.00 2.00",
      "Bread 1x 1.50 1.50",
      "TOTAL GBP 3.50",
    ].forEach((text, i) =>
      ctx.fillText(text, canvas.width / 10, canvas.height * (0.15 + i * 0.1)),
    );
    if (variant === "blur") {
      // Resampling creates blurred pixels even where Canvas2D.filter is absent.
      const reduced = document.createElement("canvas");
      reduced.width = reduced.height = 70;
      reduced.getContext("2d")!.drawImage(canvas, 0, 0, 70, 70);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(reduced, 0, 0, canvas.width, canvas.height);
    }
    return canvas.toDataURL("image/png").split(",")[1];
  }, kind);
  return {
    name: `synthetic-${kind}.png`,
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  };
}

test("local photo advice identifies different capture problems and follows photo order", async ({
  page,
}, info) => {
  const uploads: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") uploads.push(request.url());
  });
  await page.goto("/");
  const files = await Promise.all(
    (["sharp", "blur", "dark", "small"] as const).map((kind) =>
      photo(page, kind),
    ),
  );
  await page.getByLabel("Upload receipt images").setInputFiles(files);
  const checks = page.getByRole("status", { name: "Photo checks" });
  await expect(checks).toContainText("Image 2: Text may be blurred");
  await expect(checks).toContainText("Image 3: The photo looks very dark");
  await expect(checks).toContainText("Image 4: The image is small");
  await expect(checks).not.toContainText("Image 1:");
  await page
    .getByRole("button", { name: "Move image 2 earlier", exact: true })
    .click();
  await expect(checks).toContainText("Image 1: Text may be blurred");
  await page
    .getByRole("button", { name: "Remove image 1", exact: true })
    .click();
  await expect(checks).not.toContainText("Text may be blurred");
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await checks.boundingBox();
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  expect(uploads).toEqual([]);
  await mkdir("qa-artifacts/capture-guidance", { recursive: true });
  await checks.screenshot({
    path: `qa-artifacts/capture-guidance/${info.project.name}-advice.png`,
  });
});

test("crop checks use its original native resolution while the original preview remains available", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(await photo(page, "sharp"));
  await expect(page.getByRole("status", { name: "Photo checks" })).toHaveCount(
    0,
  );
  const source = await page
    .getByAltText("Receipt preview 1", { exact: true })
    .getAttribute("src");
  await page.getByRole("button", { name: "Crop image 1", exact: true }).click();
  await page
    .getByRole("slider", { name: "Trim left percent", exact: true })
    .press("End");
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByRole("status", { name: "Photo checks" }),
  ).toContainText("Image 1: The image is small");
  await expect(
    page.getByAltText("Receipt preview 1", { exact: true }),
  ).toHaveAttribute("src", source!);
});
