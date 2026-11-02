import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile, writeFile } from "node:fs/promises";
import { qaArtifactPath } from "./qa-artifacts";

declare global {
  interface Window {
    __cameraTest: {
      scene: "paper" | "dark" | "blur" | "blank" | "baseline";
      requests: MediaStreamConstraints[];
      streams: MediaStream[];
      blobs: { url: string; type: string; bytes: number }[];
      revoked: string[];
      release?: () => void;
    };
  }
}

async function camera(
  page: Page,
  mode: "normal" | "denied" | "pending" | "missing" = "normal",
  baseline = false,
) {
  const png = baseline
    ? (await readFile("tests/fixtures/paddle-synthetic.png")).toString("base64")
    : "";
  await page.addInitScript(
    ({ mode, png }) => {
      const state: Window["__cameraTest"] = {
        scene: png ? "baseline" : "paper",
        requests: [],
        streams: [],
        blobs: [],
        revoked: [],
      };
      window.__cameraTest = state;
      const createUrl = URL.createObjectURL.bind(URL),
        revokeUrl = URL.revokeObjectURL.bind(URL);
      URL.createObjectURL = (blob) => {
        const url = createUrl(blob);
        if (blob instanceof Blob)
          state.blobs.push({ url, type: blob.type, bytes: blob.size });
        return url;
      };
      URL.revokeObjectURL = (url) => {
        state.revoked.push(url);
        revokeUrl(url);
      };
      const bitmap = new Image();
      const loaded = png
        ? new Promise<void>((done) => {
            bitmap.onload = () => done();
            bitmap.src = "data:image/png;base64," + png;
          })
        : Promise.resolve();
      const makeStream = async () => {
        await loaded;
        const canvas = document.createElement("canvas");
        canvas.width = png ? 700 : 720;
        canvas.height = png ? 600 : 1080;
        const context = canvas.getContext("2d")!;
        function draw() {
          context.filter = "none";
          context.fillStyle =
            state.scene === "dark"
              ? "#222"
              : state.scene === "paper"
                ? "#333"
                : "white";
          context.fillRect(0, 0, canvas.width, canvas.height);
          if (state.scene === "baseline") {
            context.drawImage(bitmap, 0, 0);
            return;
          }
          if (state.scene === "blank") return;
          if (state.scene === "paper") {
            context.fillStyle = "white";
            context.fillRect(150, 20, 420, 1040);
          }
          context.fillStyle = state.scene === "dark" ? "#888" : "black";
          context.font = "28px monospace";
          if (state.scene === "blur") context.filter = "blur(5px)";
          for (let i = 0; i < 15; i++)
            context.fillText(
              "Sample receipt row",
              state.scene === "paper" ? 175 : 130,
              85 + i * 64,
            );
          context.filter = "none";
          // Distinct corner pixels prove capture keeps the whole frame, not the guide.
          if (state.scene === "paper")
            for (const [color, x, y] of [
              ["red", 0, 0],
              ["blue", 700, 0],
              ["lime", 0, 1060],
              ["yellow", 700, 1060],
            ] as const) {
              context.fillStyle = color;
              context.fillRect(x, y, 20, 20);
            }
        }
        draw();
        const stream = canvas.captureStream(10);
        state.streams.push(stream);
        const interval = setInterval(() => {
          if (
            stream.getTracks().every((track) => track.readyState === "ended")
          ) {
            clearInterval(interval);
            return;
          }
          draw();
        }, 100);
        return stream;
      };
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
        configurable: true,
        value:
          mode === "missing"
            ? undefined
            : async (constraints: MediaStreamConstraints) => {
                state.requests.push(constraints);
                if (mode === "denied")
                  throw new DOMException(
                    "Synthetic permission denial",
                    "NotAllowedError",
                  );
                if (mode === "pending")
                  await new Promise<void>((done) => {
                    state.release = done;
                  });
                return makeStream();
              },
      });
    },
    { mode, png },
  );
  const external: string[] = [],
    writes: string[] = [],
    errors: string[] = [];
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (
      !["data:", "blob:"].includes(url.protocol) &&
      url.origin !== "http://127.0.0.1:4173"
    ) {
      external.push(url.origin);
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      writes.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  expect(await page.evaluate(() => window.__cameraTest.requests.length)).toBe(
    0,
  );
  return { external, writes, errors };
}

const trackStates = (page: Page) =>
  page.evaluate(() =>
    window.__cameraTest.streams.map((stream) =>
      stream.getTracks().map((track) => track.readyState),
    ),
  );
async function open(page: Page) {
  await page.getByRole("button", { name: "Take a photo", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Capture photo", exact: true }),
  ).toBeVisible();
}

test("live guidance, explicit full-frame capture, review and consecutive receipt sections", async ({
  page,
}, info) => {
  const network = await camera(page);
  const saved = await page.evaluate(() =>
    localStorage.getItem("gather.receipt.v1"),
  );
  await open(page);
  const dialog = page.getByRole("dialog", { name: "Frame your receipt" });
  await expect(dialog).toContainText("Photo 1.");
  await expect(dialog.locator(".camera-paper-guide")).toBeVisible();
  expect(
    await page.evaluate(() => window.__cameraTest.requests[0]),
  ).toMatchObject({
    audio: false,
    video: { facingMode: { ideal: "environment" } },
  });
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await dialog.evaluate(
        (element) => element.scrollWidth <= element.clientWidth,
      ),
    ).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(width);
    await page.screenshot({
      path: await qaArtifactPath(info, `camera-viewport-${width}.png`),
    });
    await expect(
      page.getByRole("button", { name: "Capture photo", exact: true }),
    ).toBeInViewport({ ratio: 1 });
  }
  expect(
    (
      await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
        .analyze()
    ).violations,
  ).toEqual([]);
  await dialog.screenshot({
    path: await qaArtifactPath(info, "camera-live.png"),
  });
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Check your photo" }),
  ).toBeVisible();
  expect(await trackStates(page)).toEqual([["ended"]]);
  await expect(
    page.getByAltText("Receipt preview 1", { exact: true }),
  ).toHaveCount(0);
  const pixels = await page
    .getByAltText("Photo to check before adding")
    .evaluate(async (element: HTMLImageElement) => {
      await element.decode();
      const image = await createImageBitmap(element);
      const original = window.__cameraTest.blobs.find(
        (blob) => blob.url === element.src,
      )!;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const corners = [
        [5, 5],
        [715, 5],
        [5, 1075],
        [715, 1075],
      ].map(([x, y]) =>
        Array.from(ctx.getImageData(x, y, 1, 1).data).slice(0, 3),
      );
      const result = {
        width: image.width,
        height: image.height,
        type: original.type,
        corners,
      };
      image.close();
      return result;
    });
  expect(pixels).toMatchObject({
    width: 720,
    height: 1080,
    type: "image/jpeg",
  });
  await expect(
    page.getByRole("button", { name: "Use photo", exact: true }),
  ).toBeFocused();
  for (const [index, expected] of [
    [255, 0, 0],
    [0, 0, 255],
    [0, 255, 0],
    [255, 255, 0],
  ].entries())
    pixels.corners[index].forEach((value, color) =>
      expect(Math.abs(value - expected[color])).toBeLessThan(15),
    );
  await page.getByRole("button", { name: "Inspect text", exact: true }).click();
  const inspection = page.getByRole("region", { name: /Photo inspection/ });
  expect(
    await inspection.evaluate(
      (e) => e.scrollWidth > e.clientWidth && e.scrollHeight > e.clientHeight,
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Fit photo", exact: true }).click();
  await page.getByRole("dialog").screenshot({
    path: await qaArtifactPath(info, "camera-photo-review.png"),
  });
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await expect(
    page.getByAltText("Receipt preview 1", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Take a photo", exact: true }),
  ).toBeFocused();
  await open(page);
  await expect(page.getByRole("dialog")).toContainText("Photo 2.");
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await expect(
    page.getByAltText("Receipt preview 2", { exact: true }),
  ).toBeVisible();
  expect(await trackStates(page)).toEqual([["ended"], ["ended"]]);
  expect(
    await page.evaluate(
      () =>
        window.__cameraTest.blobs.filter((blob) =>
          window.__cameraTest.revoked.includes(blob.url),
        ).length,
    ),
  ).toBeGreaterThanOrEqual(2);
  expect(
    await page.evaluate(() => localStorage.getItem("gather.receipt.v1")),
  ).toBe(saved);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
  await writeFile(
    await qaArtifactPath(info, "camera-capture.json"),
    JSON.stringify(
      {
        scope:
          "Generated canvas media stream replaces hardware only. Actual video, advisory analysis, JPEG capture, review and image import. No OCR or financial edits.",
        pixels,
        tracks: await trackStates(page),
        ...network,
      },
      null,
      2,
    ),
  );
});

test("live guidance distinguishes dark, blurred and blank frames without preventing chosen capture", async ({
  page,
}) => {
  const network = await camera(page);
  await open(page);
  const advice = page.getByRole("status", { name: "Camera guidance" });
  await page.evaluate(() => {
    window.__cameraTest.scene = "dark";
  });
  await expect(advice).toContainText("More light");
  await page.evaluate(() => {
    window.__cameraTest.scene = "blur";
  });
  await expect(advice).toContainText("may be blurred");
  await page.evaluate(() => {
    window.__cameraTest.scene = "blank";
  });
  await expect(advice).toContainText("Text is hard to see");
  await expect(page.locator(".camera-paper-guide")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Capture photo", exact: true }),
  ).toBeEnabled();
  await page.keyboard.press("Escape");
  expect(await trackStates(page)).toEqual([["ended"]]);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
});

test("retake, hidden-page pause, restart and close stop each owned stream", async ({
  page,
}) => {
  const network = await camera(page);
  await open(page);
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Retake", exact: true }).click();
  await expect.poll(() => trackStates(page)).toEqual([["ended"], ["live"]]);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      value: true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect(
    page.getByRole("status", { name: "Camera guidance" }),
  ).toContainText("Camera paused");
  expect(await trackStates(page)).toEqual([["ended"], ["ended"]]);
  await page.evaluate(() => {
    Reflect.deleteProperty(document, "hidden");
  });
  await page
    .getByRole("button", { name: "Start camera again", exact: true })
    .click();
  await expect
    .poll(() => trackStates(page))
    .toEqual([["ended"], ["ended"], ["live"]]);
  await page.getByRole("button", { name: "Close camera", exact: true }).click();
  expect(await trackStates(page)).toEqual([["ended"], ["ended"], ["ended"]]);
  await expect(
    page.getByRole("button", { name: "Take a photo", exact: true }),
  ).toBeFocused();
  await expect(
    page.getByAltText("Receipt preview 1", { exact: true }),
  ).toHaveCount(0);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
});

for (const mode of ["denied", "missing"] as const)
  test(`camera ${mode} keeps the device photo picker available`, async ({
    page,
  }) => {
    const network = await camera(page, mode);
    await page
      .getByRole("button", { name: "Take a photo", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText(
      mode === "denied" ? "wasn’t allowed" : "unavailable here",
    );
    const chooser = page.waitForEvent("filechooser");
    await page
      .getByRole("button", { name: "Choose or take a photo", exact: true })
      .click();
    await (await chooser).setFiles("tests/fixtures/paddle-synthetic.png");
    await expect(
      page.getByAltText("Receipt preview 1", { exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect(await page.evaluate(() => window.__cameraTest.requests.length)).toBe(
      mode === "denied" ? 1 : 0,
    );
    expect(network).toEqual({ external: [], writes: [], errors: [] });
  });

for (const expire of [false, true])
  test(`a ${expire ? "timed-out" : "closed"} permission request stops its late stream`, async ({
    page,
  }) => {
    const network = await camera(page, "pending");
    if (expire) await page.clock.install();
    await page
      .getByRole("button", { name: "Take a photo", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.__cameraTest.requests.length))
      .toBe(1);
    if (expire) {
      await page.clock.fastForward(16000);
      await expect(page.getByRole("alert")).toContainText("hasn’t started");
    } else await page.keyboard.press("Escape");
    await page.evaluate(() => window.__cameraTest.release?.());
    await expect.poll(() => trackStates(page)).toEqual([["ended"]]);
    await expect(
      page.getByRole("button", { name: "Capture photo", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByAltText("Receipt preview 1", { exact: true }),
    ).toHaveCount(0);
    expect(network).toEqual({ external: [], writes: [], errors: [] });
  });

test("closed JPEG capture cannot add a late photo", async ({ page }) => {
  const network = await camera(page);
  await open(page);
  await page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
      window.__cameraTest.release = () =>
        original.call(this, callback, type, quality);
    };
  });
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await expect(
    page.getByRole("status", { name: "Camera guidance" }),
  ).toContainText("Saving your photo");
  await page.keyboard.press("Escape");
  await page.evaluate(() => window.__cameraTest.release?.());
  expect(await trackStates(page)).toEqual([["ended"]]);
  await expect(page.getByAltText("Photo to check before adding")).toHaveCount(
    0,
  );
  await expect(
    page.getByAltText("Receipt preview 1", { exact: true }),
  ).toHaveCount(0);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
});

test("camera tracks stop if the capture screen unmounts", async ({ page }) => {
  const network = await camera(page);
  await open(page);
  // Route/state replacement while a modal is open exercises React cleanup.
  await page
    .getByRole("button", { name: "Enter manually", exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible();
  expect(await trackStates(page)).toEqual([["ended"]]);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
});

test("the twelfth photo reaches the import limit without requesting another camera", async ({
  page,
}) => {
  const network = await camera(page);
  const buffer = await readFile("tests/fixtures/paddle-synthetic.png");
  await page.getByLabel("Upload receipt images").setInputFiles(
    Array.from({ length: 11 }, (_, i) => ({
      name: `section-${i + 1}.png`,
      mimeType: "image/png",
      buffer,
    })),
  );
  await expect(
    page.getByAltText("Receipt preview 11", { exact: true }),
  ).toBeVisible();
  await open(page);
  await expect(page.getByRole("dialog")).toContainText("Photo 12.");
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await expect(
    page.getByAltText("Receipt preview 12", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Take a photo", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Remove image 12", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Take a photo", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Take a photo", exact: true }),
  ).not.toBeFocused();
  expect(await page.evaluate(() => window.__cameraTest.requests.length)).toBe(
    1,
  );
  expect(await trackStates(page)).toEqual([["ended"]]);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
});

test("captured synthetic photo reaches real enhanced OCR and exact equal split", async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const network = await camera(page, "normal", true);
  await open(page);
  await page
    .getByRole("button", { name: "Capture photo", exact: true })
    .click();
  await page.getByRole("button", { name: "Use photo", exact: true }).click();
  await expect(
    page.getByAltText("Receipt preview 1", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Enhanced on-device", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 130000 });
  const receipt = await page.evaluate(
    () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
  );
  expect(receipt.printedTotal).toBe("6.00");
  expect(receipt.items).toHaveLength(2);
  expect(receipt.items[0]).toMatchObject({
    description: "Soup",
    quantity: "2",
    unitPrice: "1.25",
    lineTotal: "2.50",
  });
  expect(receipt.items[1]).toMatchObject({
    description: "Rice",
    quantity: "1",
    unitPrice: "3.50",
    lineTotal: "3.50",
  });
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeDisabled();
  for (const check of await page
    .locator(".verification-checks")
    .getByRole("checkbox")
    .all())
    if (await check.isEnabled()) await check.check();
  await page
    .getByRole("button", { name: "Confirm receipt & add people", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Person’s name", exact: true })
    .fill("Ari");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Person’s name", exact: true })
    .fill("Bo");
  await page.getByRole("button", { name: "Add person", exact: true }).click();
  await page.getByRole("button", { name: "Let’s share it" }).click();
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
  await expect(page.getByTestId("person-total-0")).toHaveText("£3.00");
  await expect(page.getByTestId("person-total-1")).toHaveText("£3.00");
  expect(await trackStates(page)).toEqual([["ended"]]);
  expect(network).toEqual({ external: [], writes: [], errors: [] });
  await page.screenshot({
    path: await qaArtifactPath(info, "camera-real-ocr-split.png"),
    fullPage: true,
  });
  await writeFile(
    await qaArtifactPath(info, "camera-real-ocr.json"),
    JSON.stringify(
      {
        scope:
          "Only camera hardware is replaced by a generated stream of the fixed synthetic receipt. Actual JPEG capture, import, enhanced worker, parser and UI. Source review checkboxes are automated, not independent human verification.",
        receipt,
        state: await page.evaluate(() =>
          JSON.parse(localStorage.getItem("gather.receipt.v1")!),
        ),
        financialEdits: 0,
        ...network,
      },
      null,
      2,
    ),
  );
});
