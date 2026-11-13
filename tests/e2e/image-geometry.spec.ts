import { test, expect, type Page } from "./editor-fixture";
import { qaArtifactPath } from "./qa-artifacts";

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
      name: "Enter manually",
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
