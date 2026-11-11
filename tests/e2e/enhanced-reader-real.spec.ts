import { expectReviewAttention } from "./review-assertions";
// Opt-in local-only development receipt. No cloud requests or financial edits.
import { test, expect } from "./editor-fixture";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calculateReceipt } from "../../src/lib/engine";
import { qaArtifactPath } from "./qa-artifacts";

const cropPhotos = process.env.GATHER_ENHANCED_CROP_TEST === "1";
test(`${cropPhotos ? "cropped" : "original"} two-photo UK receipt through the enhanced app remains an unverified draft`, async ({
  page,
}, info) => {
  test.setTimeout(180000);
  const tag = process.env.GATHER_ENHANCED_RUN_TAG;
  if (tag && !/^[\w-]+$/.test(tag))
    throw new Error("Use a simple private run tag");
  const artifact = (name: string) =>
    tag
      ? Promise.resolve(resolve("qa-artifacts", tag, name))
      : qaArtifactPath(info, name);
  const sha = (raw: Uint8Array) =>
    createHash("sha256").update(raw).digest("hex");
  const manifestPath =
    "receipt_training/annotations/private/supplement-manifest.jsonl";
  const bytes = await readFile(manifestPath);
  const record = bytes
    .toString("utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line))
    .find((r) => r.receipt_id === "supplement-user-uk-20261026-group");
  expect(record.external_processing_allowed).toBe(false);
  expect(record.source_files).toHaveLength(2);
  const inputs: Record<string, string> = { [manifestPath]: sha(bytes) };
  const files = [];
  for (const source of record.source_files) {
    const path = "receipt_training/" + source.file_path,
      raw = await readFile(path);
    expect(sha(raw)).toBe(source.sha256);
    inputs[path] = sha(raw);
    files.push(resolve(path));
  }
  const external: string[] = [],
    writes: string[] = [],
    errors: string[] = [],
    workers: string[] = [];
  let closed = 0;
  await page.context().route("**/*", (route) => {
    const r = route.request(),
      url = new URL(r.url());
    if (
      url.origin !== new URL(test.info().project.use.baseURL!).origin &&
      !["data:", "blob:"].includes(url.protocol)
    ) {
      external.push(url.origin);
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(r.method())) {
      writes.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 500)));
  page.on("worker", (worker) => {
    workers.push(worker.url());
    worker.on("close", () => closed++);
  });
  // Passive observation only: every original Blob/message reaches the real
  // worker unchanged. Retain exact local model inputs and raw SDK replies.
  await page.addInitScript(() => {
    type Capture = {
      worker: number;
      id: number;
      mime: string;
      dataUrl?: string;
      reply?: unknown;
    };
    const observed = {
      calls: [] as Capture[],
      pending: [] as Promise<void>[],
      workers: 0,
    };
    (
      window as unknown as { enhancedAreaCapture: typeof observed }
    ).enhancedAreaCapture = observed;
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      ordinal: number;
      constructor(url: string | URL, options?: WorkerOptions) {
        super(url, options);
        this.ordinal = /paddle\.worker/.test(String(url))
          ? ++observed.workers
          : 0;
        if (this.ordinal)
          this.addEventListener("message", (event: MessageEvent) => {
            const call = observed.calls.find(
              (c) => c.worker === this.ordinal && c.id === event.data?.id,
            );
            if (call) call.reply = event.data;
          });
      }
      postMessage(
        message: unknown,
        options?: Transferable[] | StructuredSerializeOptions,
      ) {
        const value = message as { id?: number; type?: string; blob?: Blob };
        if (
          this.ordinal &&
          value?.type === "read" &&
          value.blob instanceof Blob &&
          Number.isInteger(value.id)
        ) {
          const call: Capture = {
            worker: this.ordinal,
            id: value.id!,
            mime: value.blob.type,
          };
          observed.calls.push(call);
          observed.pending.push(
            new Promise<void>((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => {
                call.dataUrl = String(reader.result);
                resolve();
              };
              reader.onerror = () =>
                reject(new Error("Could not preserve test input"));
              reader.readAsDataURL(value.blob!);
            }),
          );
        }
        if (Array.isArray(options)) super.postMessage(message, options);
        else super.postMessage(message, options);
      }
    };
  });
  await page.goto("/");
  await page.getByLabel("Upload receipt images").setInputFiles(files);
  await expect(page.locator(".selected-image")).toHaveCount(2);
  const crops = [];
  if (cropPhotos) {
    for (let photo = 1; photo <= 2; photo++) {
      await page
        .getByRole("button", { name: `Crop image ${photo}`, exact: true })
        .click();
      await page
        .getByRole("button", { name: "Find receipt edges", exact: true })
        .click();
      await expect(
        page.getByText(/Suggested frame\. Check every corner/),
      ).toBeVisible();
      crops.push(
        await page.getByRole("slider").evaluateAll((nodes) =>
          nodes.map((node) => ({
            label: node.getAttribute("aria-label"),
            value: (node as HTMLInputElement).value,
          })),
        ),
      );
      await page
        .getByRole("button", { name: "Apply crop", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Apply crop", exact: true }),
      ).toHaveCount(0);
    }
  }
  await page
    .getByRole("button", { name: "On-device scan", exact: true })
    .click();
  await expect(page.locator(".selected-image")).toHaveCount(2);
  const start = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this device", exact: true })
    .click();
  await expect
    .poll(
      async () => {
        if (
          await page.getByRole("heading", { name: "Your receipt." }).isVisible()
        )
          return "review";
        return (await page.getByRole("alert").allTextContents()).some((text) =>
          /enhanced reader|120 seconds/i.test(text),
        )
          ? "failed"
          : "working";
      },
      { timeout: 130000 },
    )
    .not.toBe("working");
  await expect(
    page.getByRole("heading", { name: "Your receipt." }),
  ).toBeVisible({ timeout: 1000 });
  const elapsed_ms = Date.now() - start;
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("176.78");
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")!),
  );
  // Preserve the actual draft and SDK observations even if a later assertion fails.
  const initialCaptures = await page.evaluate(async () => {
    const capture = (
      window as unknown as {
        enhancedAreaCapture: { calls: unknown[]; pending: Promise<void>[] };
      }
    ).enhancedAreaCapture;
    await Promise.all(capture.pending);
    return capture.calls;
  });
  await writeFile(
    await artifact("initial-scan.json"),
    JSON.stringify(
      {
        receipt: state.receipt,
        modelCalls: initialCaptures,
        elapsed_ms,
        cropPhotos,
        crops,
        input_sha256: inputs,
        external,
        writes,
        errors,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  expect(state.receipt.currency).toBe("GBP");
  expect(state.receipt.items).toHaveLength(18);
  expect(
    state.receipt.reviewChecks.every(
      (c: { confirmedValue: string }) => !c.confirmedValue,
    ),
  ).toBe(true);
  if (cropPhotos) {
    expect(state.receipt.warnings).toContainEqual(
      expect.stringMatching(/Matched overlapping sections in a long photo/),
    );
    expect(state.receipt.warnings).toContainEqual(
      expect.stringMatching(/overlapping sections disagree/),
    );
  }
  expect(
    state.receipt.items.filter(
      (item: { description: string }) =>
        item.description.trim().replace(/\s+/g, " ") === "KS ROTISS CHICKEN",
    ),
  ).toHaveLength(2);
  expect(state.receipt.items.at(-1)).toMatchObject({
    lineTotal: "6.99",
    discount: "1.50",
  });
  expect(
    state.receipt.items.at(-1).description.trim().replace(/\s+/g, " "),
  ).toBe("SPONTEX CLOTHS 24P");
  expect(state.receipt.warnings).toContainEqual(
    expect.stringMatching(/Matched 2 overlapping purchases in photos 1 and 2/),
  );
  expect(
    state.receipt.reviewChecks.some(
      (c: { scope: string; field: string; confirmedValue: string }) =>
        c.scope === "receipt" && c.field === "items" && !c.confirmedValue,
    ),
  ).toBe(true);
  await expectReviewAttention(
    page,
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  );
  await expect.poll(() => closed).toBe(cropPhotos ? 3 : 1);
  expect(workers).toHaveLength(cropPhotos ? 3 : 1);
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(page.viewportSize()!.width);
  await page.screenshot({
    path: await artifact("real-review.png"),
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "View source for item 1", exact: true })
    .click();
  await expect(
    page.getByRole("dialog").getByTestId("source-region").first(),
  ).toBeVisible();
  await page.screenshot({ path: await artifact("real-source.png") });
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  const alternateSources = [];
  if (cropPhotos) {
    await page
      .getByRole("button", { name: "View source for item 12", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const sections = dialog.locator(".source-section-picker button");
    await expect(sections).toHaveCount(2);
    for (let section = 0; section < 2; section++) {
      await sections.nth(section).click();
      await expect(dialog.getByTestId("source-region").first()).toBeVisible();
      alternateSources.push({
        label: await sections.nth(section).textContent(),
        text: await dialog.locator(".source-text pre").textContent(),
        regions: await dialog
          .getByTestId("source-region")
          .evaluateAll((nodes) => nodes.map((node) => node.outerHTML)),
      });
    }
    await page.screenshot({ path: await artifact("overlap-source.png") });
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
  const areaReadings = [];
  const areaTargets = cropPhotos
    ? []
    : [
        {
          name: "vat-legend",
          source: "View source for tax code rates",
          trigger: "Reread this area",
        },
        {
          name: "chicken-skewer",
          source: "View source for item 4",
          trigger: "Reread this purchase",
        },
        {
          name: "baby-plum-tomatoes",
          source: "View source for item 13",
          trigger: "Reread this purchase",
        },
      ];
  for (const [i, target] of areaTargets.entries()) {
    await page
      .getByRole("button", { name: target.source, exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    const originalHighlights = await dialog
      .getByTestId("source-region")
      .evaluateAll((nodes) => nodes.map((node) => node.outerHTML));
    await dialog
      .getByRole("button", { name: target.trigger, exact: true })
      .click();
    await expect(dialog.getByText(/with the enhanced reader/)).toBeVisible();
    const bounds = await dialog.getByRole("slider").evaluateAll((nodes) =>
      nodes.map((node) => ({
        label: node.getAttribute("aria-label"),
        value: (node as HTMLInputElement).value,
      })),
    );
    const areaStart = Date.now();
    await dialog
      .getByRole("button", { name: "Read selected area", exact: true })
      .click();
    await expect(dialog.locator(".area-read-text")).toBeVisible({
      timeout: 130000,
    });
    const text = await dialog.locator(".area-read-text").textContent();
    expect(text?.trim()).toBeTruthy();
    await expect.poll(() => closed).toBe(i + 2);
    expect(
      await page.evaluate(
        () => JSON.parse(localStorage.getItem("gather.receipt.v1")!).receipt,
      ),
    ).toEqual(state.receipt);
    expect(
      await dialog
        .getByTestId("source-region")
        .evaluateAll((nodes) => nodes.map((node) => node.outerHTML)),
    ).toEqual(originalHighlights);
    areaReadings.push({
      ...target,
      bounds,
      text,
      elapsed_ms: Date.now() - areaStart,
      draftUnchanged: true,
      originalHighlightsUnchanged: true,
    });
    await dialog.locator(".area-read-result").scrollIntoViewIfNeeded();
    await page.screenshot({
      path: await artifact(`${target.name}-reread.png`),
    });
    await dialog
      .getByRole("button", { name: "Back to receipt", exact: true })
      .click();
  }
  await expectReviewAttention(
    page,
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  );
  expect(workers).toHaveLength(cropPhotos ? 3 : 4);
  expect(closed).toBe(cropPhotos ? 3 : 4);
  expect(workers.filter((url) => /paddle\.worker/.test(url))).toHaveLength(
    cropPhotos ? 1 : 4,
  );
  expect(external).toEqual([]);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  const captures = await page.evaluate(async () => {
    const capture = (
      window as unknown as {
        enhancedAreaCapture: {
          calls: {
            worker: number;
            id: number;
            mime: string;
            dataUrl?: string;
            reply?: unknown;
          }[];
          pending: Promise<void>[];
        };
      }
    ).enhancedAreaCapture;
    await Promise.all(capture.pending);
    return capture.calls;
  });
  expect(captures).toHaveLength(cropPhotos ? 4 : 5);
  const modelInputs = [];
  for (const capture of captures) {
    const { dataUrl, ...observation } = capture;
    expect(capture.mime).toBe("image/jpeg");
    expect(capture.reply).toMatchObject({ id: capture.id, ok: true });
    const raw = Buffer.from(dataUrl!.split(",")[1], "base64");
    const path = await artifact(
      `model-input-${capture.worker}-${capture.id}.jpg`,
    );
    await writeFile(path, raw, { flag: "wx" });
    modelInputs.push({
      ...observation,
      path,
      sha256: sha(raw),
      bytes: raw.length,
    });
  }
  await writeFile(
    await artifact("area-readings.json"),
    JSON.stringify(
      {
        areaReadings,
        modelInputs,
        noFinancialEdits: true,
        noChecksConfirmed: true,
        passiveWorkerObservation: true,
        external,
        writes,
        errors,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  const calculation = calculateReceipt(state.receipt);
  expect(calculation.total).toBe(17678n);
  expect(calculation.discrepancy).toBe(0n);
  expect(calculation.issues.length).toBeGreaterThan(0);
  const source_sha256: Record<string, string> = {};
  for (const path of [
    "src/App.tsx",
    "src/ReceiptAreaReader.tsx",
    "src/ReceiptSource.tsx",
    "src/lib/paddle-browser.ts",
    "src/lib/paddle.worker.ts",
    "src/lib/paddle-layout.ts",
    "src/lib/receipt-layout.ts",
    "src/lib/window-overlap.ts",
    "src/lib/parser.ts",
    "src/lib/engine.ts",
    "scripts/enhanced-ocr-assets.json",
    "package-lock.json",
    "tests/e2e/enhanced-reader-real.spec.ts",
  ])
    source_sha256[path] = sha(await readFile(path));
  await writeFile(
    await artifact("result.json"),
    JSON.stringify(
      {
        receipt_id: record.receipt_id,
        image_sha256: record.sha256,
        record,
        receipt: state.receipt,
        calculation,
        elapsed_ms,
        cropPhotos,
        crops,
        alternateSources,
        noFinancialEdits: true,
        noChecksConfirmed: true,
        areaReadings,
        workers,
        closed,
        external,
        writes,
        errors,
        input_sha256: inputs,
        source_sha256,
        timing_scope:
          "Actual production UI scan-to-review plus observation overhead; excludes upload/preparation, server/browser startup. One familiar development transaction; no handset or full-cohort latency claim.",
        scope:
          "Actual two-photo receipt through production app/SDK worker. Cloud and HTTP writes blocked. Financial draft recorded without editing or confirming; source highlights tested. Images and this private QA output remain local and ignored by Git.",
      },
      (_, value) => (typeof value === "bigint" ? String(value) : value),
      2,
    ) + "\n",
    { flag: "wx" },
  );
});
