// Opt-in local-only development receipt. No cloud requests or financial edits.
import { test, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { calculateReceipt } from "../../src/lib/engine";
import { qaArtifactPath } from "./qa-artifacts";

test("original two-photo UK receipt through the enhanced app remains an unverified draft", async ({
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
      url.origin !== "http://127.0.0.1:4173" &&
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
  await page.goto("/");
  await page.getByLabel("Upload receipt images").setInputFiles(files);
  await page
    .getByRole("button", { name: "Enhanced on-device", exact: true })
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
          await page
            .getByRole("heading", { name: "A quick check, then we share." })
            .isVisible()
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
    page.getByRole("heading", { name: "A quick check, then we share." }),
  ).toBeVisible({ timeout: 1000 });
  const elapsed_ms = Date.now() - start;
  await expect(
    page.getByRole("textbox", { name: "Printed total", exact: true }),
  ).toHaveValue("176.78");
  const state = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("gather.receipt.v1")!),
  );
  expect(state.receipt.currency).toBe("GBP");
  expect(state.receipt.items.length).toBeGreaterThanOrEqual(18);
  expect(
    state.receipt.reviewChecks.some(
      (c: { scope: string; field: string; confirmedValue: string }) =>
        c.scope === "receipt" && c.field === "items" && !c.confirmedValue,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("button", {
      name: "Confirm receipt & add people",
      exact: true,
    }),
  ).toBeDisabled();
  await expect.poll(() => closed).toBe(1);
  expect(workers).toHaveLength(1);
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
  const calculation = calculateReceipt(state.receipt);
  expect(calculation.issues.length).toBeGreaterThan(0);
  const source_sha256: Record<string, string> = {};
  for (const path of [
    "src/App.tsx",
    "src/lib/paddle-browser.ts",
    "src/lib/paddle.worker.ts",
    "src/lib/paddle-layout.ts",
    "src/lib/receipt-layout.ts",
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
        noFinancialEdits: true,
        noChecksConfirmed: true,
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
