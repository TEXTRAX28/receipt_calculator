import { test, expect, type Page } from "@playwright/test";
import { qaArtifactPath } from "./qa-artifacts";
import { writeFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";

async function uploadTilted(page: Page) {
  await page.goto("/");
  const data = await page.evaluate(() => {
    const receipt = document.createElement("canvas");
    receipt.width = 700;
    receipt.height = 2600;
    const ctx = receipt.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, 700, 2600);
    ctx.fillStyle = "#111";
    ctx.font = "bold 38px monospace";
    for (const [text, y] of [
      ["LITTLE MARKET", 160],
      ["Currency GBP", 240],
      ["Milk 1x 2.50 2.50", 600],
      ["Apples 1x 3.00 3.00", 1300],
      ["TOTAL GBP 5.50", 2440],
      ["PRICES INCLUDE TAX", 2530],
    ] as const)
      ctx.fillText(text, 35, y);
    const original = ctx.getImageData(0, 0, 700, 2600).data;
    const photo = document.createElement("canvas");
    photo.width = 1000;
    photo.height = 3000;
    const out = photo.getContext("2d")!,
      pixels = out.createImageData(1000, 3000);
    // Independent analytic inverse: X=(500u-187.5v+250)/(1-.375v), Y=(1712.5v+100)/(1-.375v).
    // This test deliberately does not import the production transform.
    for (let y = 0; y < 3000; y++)
      for (let x = 0; x < 1000; x++) {
        const v = (y - 100) / (1712.5 + 0.375 * y),
          u = (x * (1 - 0.375 * v) + 187.5 * v - 250) / 500,
          i = (y * 1000 + x) * 4;
        if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
          const from =
            (Math.min(2599, Math.round(v * 2599)) * 700 +
              Math.min(699, Math.round(u * 699))) *
            4;
          pixels.data.set(original.subarray(from, from + 4), i);
        } else pixels.data.set([85, 72, 60, 255], i);
      }
    out.putImageData(pixels, 0, 0);
    const sideways = document.createElement("canvas");
    sideways.width = 3000;
    sideways.height = 1000;
    const rotate = sideways.getContext("2d")!;
    rotate.translate(3000, 0);
    rotate.rotate(Math.PI / 2);
    rotate.drawImage(photo, 0, 0);
    return sideways.toDataURL("image/png").split(",")[1];
  });
  await page.getByLabel("Upload receipt images").setInputFiles({
    name: "synthetic-tilted-sideways.png",
    mimeType: "image/png",
    buffer: Buffer.from(data, "base64"),
  });
  return (await page.locator(".selected-image img").getAttribute("src"))!;
}

async function openGeometry(page: Page) {
  await page.getByRole("button", { name: "Crop image 1", exact: true }).click();
  await page
    .getByRole("button", { name: "Rotate or straighten", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Preview correction", exact: true }),
  ).toBeEnabled();
}
async function corner(page: Page, name: string, x: number, y: number) {
  const stage = page.locator(".geometry-stage");
  const handle = page.getByRole("button", {
    name: name + " corner",
    exact: true,
  });
  // On narrow screens the stage can be clipped by the scrolling dialog.
  // Bring the actual pointer target into view before taking its coordinates.
  await handle.scrollIntoViewIfNeeded();
  const box = (await handle.boundingBox())!,
    rect = (await stage.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    rect.x + (rect.width * x) / 100,
    rect.y + (rect.height * y) / 100,
    { steps: 3 },
  );
  await page.mouse.up();
}

test("real local correction preserves long receipt ends and requires source review before an exact split", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  test.skip(
    !(await page.evaluate(
      () =>
        typeof OffscreenCanvas === "function" &&
        typeof createImageBitmap === "function",
    )),
    "This browser build lacks correction image APIs; original-photo and trimming recovery are tested separately. Perspective correction remains unverified here.",
  );
  const posts: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  const original = await uploadTilted(page);
  await openGeometry(page);
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: "Rotate right 90°", exact: true })
      .click();
  await corner(page, "Top left", 25, 3.3);
  await corner(page, "Top right", 75, 3.3);
  await corner(page, "Bottom right", 90, 96.7);
  await corner(page, "Bottom left", 10, 96.7);
  await expect(page.getByRole("alert")).toHaveCount(0);
  const accessibility = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
  await page
    .getByRole("dialog")
    .screenshot({ path: await qaArtifactPath(info, "geometry-controls.png") });
  const topLeft = page.getByRole("button", {
    name: "Top left corner",
    exact: true,
  });
  await topLeft.focus();
  await expect(topLeft).toHaveAttribute("aria-pressed", "true");
  const horizontal = page.getByRole("slider", {
    name: "Top left horizontal percent",
    exact: true,
  });
  const dragged = Number(await horizontal.inputValue());
  // Pointer coordinates can round to a CSS pixel; the keyboard change is exact.
  expect(Math.abs(dragged - 25)).toBeLessThanOrEqual(1);
  await topLeft.press("ArrowRight");
  await expect(horizontal).toHaveValue(
    String(Math.round((dragged + 1) * 10) / 10),
  );
  await topLeft.press("ArrowLeft");
  await expect(horizontal).toHaveValue(String(dragged));
  await page
    .getByRole("button", { name: "Preview correction", exact: true })
    .click();
  await expect(
    page.getByRole("img", { name: "Corrected receipt preview", exact: true }),
  ).toBeVisible({ timeout: 35000 });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.screenshot({
    path: await qaArtifactPath(info, "geometry-preview.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Apply correction", exact: true })
    .click();
  await expect(page.locator(".selected-image")).toContainText("corrected");
  await expect(page.locator(".selected-image img")).toHaveAttribute(
    "src",
    original,
  );
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
  const uneditedNames = await page
    .getByRole("textbox", { name: /^Item \d+ description$/ })
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement).value),
    );
  const uneditedItems = [];
  for (const item of [1, 2]) {
    const details = page.getByRole("button", {
      name: new RegExp(`^(?:Edit|Hide) details for item ${item}$`),
    });
    if ((await details.getAttribute("aria-expanded")) !== "true")
      await details.click();
    uneditedItems.push({
      description: uneditedNames[item - 1],
      quantity: await page
        .getByLabel(`Item ${item} purchased quantity`, { exact: true })
        .inputValue(),
      unitPrice: await page
        .getByLabel(`Item ${item} unit price (optional)`, { exact: true })
        .inputValue(),
      lineTotal: await page
        .getByLabel(`Item ${item} line price`, { exact: true })
        .inputValue(),
    });
  }
  await writeFile(
    await qaArtifactPath(info, "native-ocr-observation.json"),
    JSON.stringify(
      {
        names: uneditedNames,
        items: uneditedItems,
        expectedNames: ["Milk", "Apples"],
        exactNames: uneditedNames.filter(
          (name, i) => name === ["Milk", "Apples"][i],
        ).length,
        manualCorrectionsToFollow: ["Item 2 description -> Apples"],
        privateUploads: 0,
      },
      null,
      2,
    ),
  );
  await expect(
    page.getByLabel("Item 1 line price", { exact: true }),
  ).toHaveValue("2.50");
  await expect(
    page.getByLabel("Item 2 line price", { exact: true }),
  ).toHaveValue("3.00");
  expect(uneditedItems).toEqual([
    {
      description: "Milk",
      quantity: "1",
      unitPrice: "2.50",
      lineTotal: "2.50",
    },
    {
      description: "~ Apples",
      quantity: "1",
      unitPrice: "3.00",
      lineTotal: "3.00",
    },
  ]);
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("button", { name: "View receipt image 1", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Corrected receipt, enlarged for review",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Original photo", exact: true })
    .click();
  await expect(
    page.getByRole("img", {
      name: "Original receipt, enlarged for review",
      exact: true,
    }),
  ).toHaveAttribute("src", original);
  await page
    .getByRole("button", { name: "Corrected copy", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .screenshot({ path: await qaArtifactPath(info, "geometry-source.png") });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page
    .getByRole("button", { name: "View source for item 2", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByTestId("uncertain-word-region").first(),
  ).toBeVisible();
  await page.getByRole("dialog").screenshot({
    path: await qaArtifactPath(info, "device-uncertain-word-source.png"),
  });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  // Explicit human correction after source inspection; do not count it as OCR accuracy.
  await page.getByLabel("Item 2 description", { exact: true }).fill("Apples");
  await expect(
    page.getByLabel("Item 2 description", { exact: true }),
  ).toHaveValue("Apples");
  // The white outside margin fixed the native unit-price error; do not repair it here.
  await expect(
    page.getByLabel("Item 2 unit price (optional)", { exact: true }),
  ).toHaveValue("3.00");
  await expect(confirm).toBeDisabled();
  // These known synthetic values were asserted and compared with the source above.
  // Checking them is explicit simulated human review, never an OCR accuracy gain.
  for (const field of [
    "description",
    "purchased quantity",
    "unit price",
    "line price",
    "printed total",
    "whether item prices include tax",
  ])
    for (const check of await page
      .getByRole("checkbox", {
        name: `I checked ${field} against the original`,
        exact: true,
      })
      .all())
      await check.check();
  await page
    .getByRole("checkbox", {
      name: "I checked purchase list against the original",
      exact: true,
    })
    .check();
  await expect(confirm).toBeEnabled();
  await confirm.click();
  for (const name of ["Alice", "Bob"]) {
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
  for (const check of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await check.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  await expect(page.getByTestId("person-total-0")).toHaveText("£2.75");
  await expect(page.getByTestId("person-total-1")).toHaveText("£2.75");
  expect(posts).toEqual([]);
});

test("unsupported photo correction preserves the original and keeps trimming usable", async ({
  page,
}, info) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, "OffscreenCanvas", {
      configurable: true,
      value: undefined,
    });
  });
  const workers: string[] = [],
    posts: string[] = [];
  page.on("worker", (worker) => {
    if (/image-geometry\.worker/.test(worker.url())) workers.push(worker.url());
  });
  page.on("request", (request) => {
    if (request.method() === "POST") posts.push(request.url());
  });
  const original = await uploadTilted(page);
  await openGeometry(page);
  await page
    .getByRole("button", { name: "Preview correction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText(
    "Photo correction is unavailable in this browser. Use trimming or take a flatter photo.",
  );
  await expect(
    page.getByRole("img", { name: "Corrected receipt preview", exact: true }),
  ).toHaveCount(0);
  await expect(page.locator(".selected-image img")).toHaveAttribute(
    "src",
    original,
  );
  expect(workers).toEqual([]);
  await page.getByRole("button", { name: "Back to trim", exact: true }).click();
  const trim = page.getByRole("slider", {
    name: "Trim left percent",
    exact: true,
  });
  await trim.focus();
  await trim.press("ArrowRight");
  await expect(trim).toHaveValue("1");
  await page.getByRole("dialog").screenshot({
    path: await qaArtifactPath(info, "unsupported-correction-trim.png"),
  });
  await page.getByRole("button", { name: "Apply crop", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".selected-image")).toContainText("cropped");
  await expect(page.locator(".selected-image")).not.toContainText("corrected");
  await expect(page.locator(".selected-image img")).toHaveAttribute(
    "src",
    original,
  );
  await expect(
    page.getByRole("button", {
      name: "Read receipt on this device",
      exact: true,
    }),
  ).toBeEnabled();
  expect(posts).toEqual([]);
});

test("reset and cancellation discard corrections; unavailable worker keeps trimming usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // This test exercises worker ownership with a stub, independent of native image APIs.
    if (typeof OffscreenCanvas !== "function")
      Object.defineProperty(window, "OffscreenCanvas", {
        value: function () {},
      });
    if (typeof createImageBitmap !== "function")
      Object.defineProperty(window, "createImageBitmap", {
        value: function () {},
      });
    const Original = window.Worker;
    (window as unknown as { geometryTestMode: string }).geometryTestMode =
      "late";
    window.Worker = class extends Original {
      constructor(url: string | URL, options?: WorkerOptions) {
        if (!String(url).includes("image-geometry.worker")) {
          super(url, options);
          return;
        }
        const fake = {
          onmessage: null as ((e: MessageEvent) => void) | null,
          onerror: null as (() => void) | null,
          postMessage() {
            setTimeout(() => {
              if (
                (window as unknown as { geometryTestMode: string })
                  .geometryTestMode === "error"
              )
                fake.onerror?.();
              else
                fake.onmessage?.({
                  data: {
                    preview: new Blob(["late"], { type: "image/jpeg" }),
                    width: 800,
                    height: 1200,
                    quality: { flags: [] },
                  },
                } as MessageEvent);
            }, 700);
          },
          terminate() {},
        };
        return fake as unknown as Worker;
      }
    };
  });
  const original = await uploadTilted(page);
  await openGeometry(page);
  await page
    .getByRole("button", { name: "Top left corner", exact: true })
    .press("ArrowRight");
  await page
    .getByRole("button", { name: "Reset corrections", exact: true })
    .click();
  await expect(
    page.getByRole("slider", {
      name: "Top left horizontal percent",
      exact: true,
    }),
  ).toHaveValue("0");
  await page
    .getByRole("button", { name: "Preview correction", exact: true })
    .click();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(900);
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(page.locator(".selected-image")).not.toContainText("corrected");
  await expect(page.locator(".selected-image img")).toHaveAttribute(
    "src",
    original,
  );
  await openGeometry(page);
  await page.evaluate(() => {
    (window as unknown as { geometryTestMode: string }).geometryTestMode =
      "error";
  });
  await page
    .getByRole("button", { name: "Preview correction", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Photo correction is unavailable",
  );
  await page.getByRole("button", { name: "Back to trim", exact: true }).click();
  await expect(
    page.getByRole("slider", { name: "Trim left percent", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Apply crop", exact: true }),
  ).toBeEnabled();
});
