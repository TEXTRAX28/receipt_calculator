import { requireAssistedPolicy } from "./assisted-policy";
import { expectReviewBlocked, expectReviewReady } from "./review-assertions";
import { test, expect } from "@playwright/test";
import { writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { qaArtifactPath } from "./qa-artifacts";
import { appSchema } from "../../src/lib/model";
import { calculateReceipt } from "../../src/lib/engine";
import { costcoDemo } from "../../src/lib/demo";
import { longRows } from "../fixtures/long-local-receipt";

// Opt-in local development evidence, not a blind receipt-accuracy benchmark.
test("real independent readers → original two-photo review → exact checked split", async ({
  page,
}, info) => {
  test.setTimeout(300000);
  const base = process.env.GATHER_LOCAL_COMPARISON_URL;
  const files: unknown = JSON.parse(
    process.env.GATHER_LOCAL_COSTCO_PHOTOS || "null",
  );
  if (
    !base ||
    !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base) ||
    !Array.isArray(files) ||
    files.length !== 2 ||
    files.some((file) => typeof file !== "string")
  )
    throw new Error(
      "Supply a loopback GATHER_LOCAL_COMPARISON_URL and exactly two approved local photo paths in GATHER_LOCAL_COSTCO_PHOTOS",
    );
  const external: string[] = [],
    posts: string[] = [];
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(new URL(base).origin) || /^(data:|blob:)/.test(url))
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST")
      posts.push(new URL(request.url()).pathname);
  });
  await page.goto(base);
  await page
    .getByLabel("Upload receipt images")
    .setInputFiles(files as string[]);
  await requireAssistedPolicy(page, "computer");
  await requireAssistedPolicy(page, "computer", "always");
  const nativeResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/receipts/vision") &&
      response.request().method() === "POST",
    { timeout: 260000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", { name: "Read receipt on this computer", exact: true })
    .click();
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
  const native = await (await nativeResponse).json();
  const financial = (receipt: typeof state.receipt) =>
    receipt.items.map((item) => [
      Number(item.quantity),
      Number(item.unitPrice),
      Number(item.lineTotal),
      Number(item.discount),
      item.taxCode,
    ]);
  const financialRowsMatch =
    JSON.stringify(financial(state.receipt)) ===
    JSON.stringify(financial(costcoDemo()));
  await writeFile(
    await qaArtifactPath(info, "independent-real-costco.json"),
    JSON.stringify(
      {
        scope:
          "One source-informed UK development receipt, local real installed models plus HTTP/browser; not blind or complete-cohort accuracy",
        elapsedMs,
        timingScope:
          "Scan button through both local models, preparation, independent comparison and editable review; excludes manual review and sharing",
        receipt: state.receipt,
        nativeReceipt: native.receipt,
        financialRowsMatch,
        finalMinor: String(calculation.total),
        issuePaths: calculation.issues.map((issue) => issue.path),
        postEndpoints: posts,
        externalBrowserRequests: external.length,
      },
      null,
      2,
    ) + "\n",
  );
  await expect(page.locator('[data-testid^="review-item-"]')).toHaveCount(18);
  expect(financialRowsMatch).toBe(true);
  expect(String(calculation.total)).toBe("17678");
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
  });
  await expectReviewBlocked(page, confirm);
  await page
    .getByRole("button", { name: "View source for item 4", exact: true })
    .click();
  const source = page.getByRole("dialog", {
    name: "Receipt source for purchase 4",
    exact: true,
  });
  await expect(source.getByTestId("source-region")).toHaveCount(4);
  await source
    .getByRole("button", { name: "Back to receipt", exact: true })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .locator(".verification-checks")
    .last()
    .screenshot({
      path: await qaArtifactPath(info, "independent-real-costco-review.png"),
    });
  // The test's image-checked development reference verifies the financial vector above.
  // These clicks exercise mandatory review; they do not assert that model agreement proves correctness.
  for (const checkbox of await page
    .locator(".verification-checks")
    .getByRole("checkbox")
    .all())
    if (await checkbox.isEnabled()) await checkbox.check();
  await expectReviewReady(page, confirm);
  await confirm.click();
  for (const name of ["Alice", "Bob", "Charlie"]) {
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
  for (const [index, total] of ["£58.93", "£58.93", "£58.92"].entries())
    await expect(page.getByTestId(`person-total-${index}`)).toHaveText(total);
  expect(external).toEqual([]);
  expect(posts).toEqual(["/api/receipts/recognize", "/api/receipts/vision"]);
  await writeFile(
    await qaArtifactPath(info, "independent-real-costco-split.json"),
    JSON.stringify(
      {
        elapsedMs,
        noFinancialEdits: true,
        reviewChecksExplicitlyConfirmed: state.receipt.reviewChecks.length,
        participants: ["58.93", "58.93", "58.92"],
        externalBrowserRequests: external.length,
        postEndpoints: posts,
      },
      null,
      2,
    ) + "\n",
  );
});

test("real four-section local vision completes bounded batches and retains actual repeated purchases", async ({
  page,
}, info) => {
  test.setTimeout(420000);
  const base = process.env.GATHER_LOCAL_COMPARISON_URL;
  if (!base || !/^http:\/\/127\.0\.0\.1:\d+\/?$/.test(base))
    throw new Error("Supply a loopback GATHER_LOCAL_COMPARISON_URL");
  const external: string[] = [],
    posts: string[] = [];
  const packets: {
    path: string;
    body: { panels: { photo: number; part: number; data: string }[] };
  }[] = [];
  await page.route("**/*", (route) => {
    const request = route.request(),
      url = request.url();
    if (
      /^(data:|blob:)/.test(url) ||
      (new URL(url).origin === new URL(base).origin &&
        (request.method() === "GET" ||
          (request.method() === "POST" &&
            [
              "/api/receipts/recognize",
              "/api/receipts/vision-batches",
            ].includes(new URL(url).pathname))))
    )
      return route.continue();
    external.push(url);
    return route.abort();
  });
  page.on("request", (request) => {
    if (request.method() === "POST") {
      posts.push(new URL(request.url()).pathname);
      packets.push({
        path: new URL(request.url()).pathname,
        body: request.postDataJSON(),
      });
    }
  });
  await page.goto(base);
  await page.evaluate(() => {
    const target = window as typeof window & {
      __longVisionProbe?: { text: string; done: boolean; error: string };
    };
    const probe = { text: "", done: false, error: "" };
    target.__longVisionProbe = probe;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await original(...args),
        input = args[0];
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.endsWith("/api/receipts/vision-batches")) {
        const copy = response.clone();
        void (async () => {
          if (!copy.body) throw new Error("Missing stream body");
          const reader = copy.body.getReader(),
            decoder = new TextDecoder();
          let bytes = 0;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            bytes += next.value.length;
            if (bytes > 1024 * 1024)
              throw new Error("Stream exceeded observer limit");
            probe.text += decoder.decode(next.value, { stream: true });
          }
          probe.text += decoder.decode();
          probe.done = true;
        })().catch((error) => {
          probe.error = String(error);
          probe.done = true;
        });
      }
      return response;
    };
  });
  const photos = await page.evaluate(
    (rows) =>
      rows.map((texts) => {
        const canvas = document.createElement("canvas");
        canvas.width = 1000;
        canvas.height = 750;
        const context = canvas.getContext("2d")!;
        context.fillStyle = "white";
        context.fillRect(0, 0, 1000, 750);
        context.fillStyle = "black";
        context.font = "18px monospace";
        context.fillText("SYNTHETIC LONG RECEIPT / LOCAL MODEL CHECK", 40, 35);
        context.font = "bold 38px monospace";
        texts.forEach((text, index) =>
          context.fillText(text, 60, 130 + index * 150),
        );
        return canvas.toDataURL("image/png").split(",")[1];
      }),
    longRows,
  );
  await page.getByLabel("Upload receipt images").setInputFiles(
    photos.map((image, index) => ({
      name: `long-synthetic-${index + 1}.png`,
      mimeType: "image/png",
      buffer: Buffer.from(image, "base64"),
    })),
  );
  await requireAssistedPolicy(page, "vision");
  const response = page.waitForResponse(
    (result) => result.url().endsWith("/api/receipts/vision-batches"),
    { timeout: 400000 },
  );
  const started = Date.now();
  await page
    .getByRole("button", {
      name: "Read receipt with local vision",
      exact: true,
    })
    .click();
  await expect(
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 400000 });
  const elapsedMs = Date.now() - started;
  const state = appSchema.parse(
    await page.evaluate(() =>
      JSON.parse(localStorage.getItem("gather.receipt.v1")!),
    ),
  );
  const result = await response;
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __longVisionProbe?: { done: boolean } })
            .__longVisionProbe?.done,
      ),
    )
    .toBe(true);
  const probe = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __longVisionProbe: { text: string; done: boolean; error: string };
        }
      ).__longVisionProbe,
  );
  const body = probe.text;
  const events = body
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const calculation = calculateReceipt(state.receipt),
    expected = [2, 1.5, 3, 4, 4, 5];
  const moneyRowsMatch =
    state.receipt.items.length === expected.length &&
    state.receipt.items.every(
      (item, index) =>
        Number(item.quantity) === 1 &&
        Number(item.unitPrice) === expected[index] &&
        Number(item.lineTotal) === expected[index] &&
        Number(item.discount) === 0,
    );
  const evidence = {
    synthetic: true,
    uniqueReceipts: 1,
    sourcePhotos: 4,
    elapsedMs,
    timingScope:
      "All preparation, actual primary OCR, two fresh native model contexts, complete stream, source joining and editable review; excludes manual checks and sharing",
    httpStatus: result.status(),
    bodyObserverError: probe.error,
    batchCount: events.filter((event) => event.type === "batch").length,
    completeStream: events.at(-1)?.type === "done",
    moneyRowsMatch,
    receipt: state.receipt,
    events,
    finalMinor: String(calculation.total),
    issuePaths: calculation.issues.map((issue) => issue.path),
    externalBrowserRequests: external.length,
    postEndpoints: posts,
    noEdits: true,
    accuracyScope:
      "One predeclared synthetic receipt; not original-cohort or complete-receipt accuracy",
  };
  expect(packets).toHaveLength(2);
  expect(packets[1].body).toEqual(packets[0].body);
  expect(Object.keys(packets[0].body)).toEqual(["panels"]);
  const sha = (bytes: Buffer) =>
    createHash("sha256").update(bytes).digest("hex");
  const prepared = [];
  for (const [index, panel] of packets[0].body.panels.entries()) {
    const bytes = Buffer.from(panel.data, "base64");
    const path = await qaArtifactPath(info, `long-panel-${index + 1}.jpg`);
    await writeFile(path, bytes, { flag: "wx" });
    prepared.push({
      photo: panel.photo,
      part: panel.part,
      path,
      sha256: sha(bytes),
    });
  }
  await writeFile(
    await qaArtifactPath(info, "long-vision-real-four.json"),
    JSON.stringify({ ...evidence, prepared }, null, 2) + "\n",
    { flag: "wx" },
  );
  expect(evidence.completeStream).toBe(true);
  expect(evidence.batchCount).toBe(2);
  expect(moneyRowsMatch).toBe(true);
  expect(String(calculation.total)).toBe("1950");
  expect(
    state.receipt.items.filter((item) => /chicken/i.test(item.description)),
  ).toHaveLength(2);
  await expectReviewBlocked(
    page,
    page.getByRole("button", { name: "Confirm receipt & add people" }),
  );
  expect(external).toEqual([]);
  expect(posts).toEqual([
    "/api/receipts/recognize",
    "/api/receipts/vision-batches",
  ]);
  for (const checkbox of await page
    .locator(".verification-checks")
    .getByRole("checkbox")
    .all())
    if (await checkbox.isEnabled()) await checkbox.check();
  const confirm = page.getByRole("button", {
    name: "Confirm receipt & add people",
    exact: true,
  });
  await expectReviewReady(page, confirm);
  await confirm.click();
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
  for (const checkbox of await page
    .getByTestId("whole-assignment")
    .getByRole("checkbox")
    .all())
    await checkbox.check();
  await page
    .getByRole("button", { name: "Finalize split", exact: true })
    .click();
  for (const index of [0, 1, 2])
    await expect(page.getByTestId(`person-total-${index}`)).toHaveText("£6.50");
  await writeFile(
    await qaArtifactPath(info, "long-vision-split.json"),
    JSON.stringify(
      {
        noFinancialEdits: true,
        participants: ["6.50", "6.50", "6.50"],
        totalMinor: "1950",
        externalBrowserRequests: external.length,
        postEndpoints: posts,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
});
