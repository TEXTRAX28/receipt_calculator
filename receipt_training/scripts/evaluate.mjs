// Run the existing browser image preparation, OCR, parser and money engine unchanged.
// No label file is read here. All receipt network traffic is restricted to loopback.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const project = resolve(root, "..");
const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(name);
  return index < 0 ? fallback : args[index + 1];
};
const split = option("--split", "development");
if (!["development", "evaluation"].includes(split)) throw new Error("Choose --split development or evaluation");
const runName = option("--run", `local-${split}`);
if (!/^[\w-]+$/.test(runName)) throw new Error("Use a simple run name");
const sourceRun = option("--source-run", null);
if (sourceRun && !/^[\w-]+$/.test(sourceRun)) throw new Error("Invalid source run");
const limit = Number(option("--limit", "1000"));
if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid --limit");
const out = resolve(root, "evaluation/runs", runName);
if (await access(resolve(out, "metadata.json")).then(() => true, () => false))
  throw new Error("Run already exists. Preserve it and choose a new --run name.");
await mkdir(out, { recursive: true });
const sha = (data) => createHash("sha256").update(data).digest("hex");
const manifestBytes = await readFile(resolve(root, "manifest.jsonl"));
const records = manifestBytes.toString().trim().split(/\r?\n/).map(JSON.parse)
  .filter((record) => record.split === split && record.real_receipt && record.included_in_pilot !== false).slice(0, limit);
const paths = ["images.ts", "ocr.ts", "parser.ts", "model.ts", "engine.ts", "money.ts", "scan-limits.mjs"];
const sourceHashes = {};
const frozenSources = new Map();
for (const file of paths) {
  const data = await readFile(sourceRun ? resolve(root, "evaluation/runs", sourceRun, "source", file) : resolve(project, "src/lib", file));
  sourceHashes[file] = sha(data);
  frozenSources.set(resolve(project, "src/lib", file).replaceAll("\\", "/"), data.toString());
  await mkdir(resolve(out, "source"), { recursive: true });
  await writeFile(resolve(out, "source", file), data);
}
const configBytes = await readFile(resolve(root, "evaluation/config.json"));
const metadata = {
  provider: "existing-localOcrProvider", split, runName,
  started_at: new Date().toISOString(), node: process.version,
  manifest_sha256: sha(manifestBytes), config_sha256: sha(configBytes), source_sha256: sourceHashes,
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim(),
  source_includes_uncommitted_work: true,
  source_served_from_frozen_snapshot: true,
  source_snapshot_from_run: sourceRun,
  selected_ids: records.map((r) => r.receipt_id),
  timing_scope: "per-receipt browser preparation, new OCR worker, OCR, parser, reconciliation and RPC; excludes server/browser startup",
  api_requests: 0, api_cost: "0", api_cost_currency: "USD", compute_cost: null,
};
await writeFile(resolve(out, "metadata.json"), JSON.stringify(metadata, null, 2));
execFileSync(process.execPath, ["scripts/prepare-ocr.mjs"], { cwd: project, stdio: "pipe" });
const server = await createServer({
  configFile: false, root: project, logLevel: "error",
  server: { host: "127.0.0.1", port: 5268, strictPort: true, hmr: false },
  optimizeDeps: { noDiscovery: true, include: ["zod", "tesseract.js"] },
  plugins: [{ name: "frozen-receipt-source", enforce: "pre", load(id) {
    return frozenSources.get(id.split("?")[0].replaceAll("\\", "/")) ?? null;
  } }, { name: "receipt-evaluation-page", configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (req.url !== "/__receipt_evaluation") return next();
      res.setHeader("content-type", "text/html");
      res.end("<!doctype html><title>Local receipt evaluation</title><body>Private local OCR evaluation</body>");
    });
  } }],
});
let browser;
const predictions = [];
try {
  await server.listen();
  try { browser = await chromium.launch({ channel: "chrome", headless: true }); }
  catch { browser = await chromium.launch({ headless: true }); }
  metadata.browser = browser.version();
  const context = await browser.newContext({ serviceWorkers: "block" });
  const blockedRequests = [];
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:5268") return route.continue();
    blockedRequests.push(url.origin);
    return route.abort("blockedbyclient");
  });
  const page = await context.newPage();
  await page.goto("http://127.0.0.1:5268/__receipt_evaluation");
  for (const record of records) {
    const bytes = await readFile(resolve(root, record.file_path));
    if (sha(bytes) !== record.sha256) throw new Error(`Checksum mismatch: ${record.receipt_id}`);
    const mime = record.file_path.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const started = performance.now();
    let prediction;
    try {
      prediction = await page.evaluate(async ({ base64, mime, id }) => {
        const { prepareImage, readingBlobs } = await import("/src/lib/images.ts");
        const { localOcrProvider } = await import("/src/lib/ocr.ts");
        const { parseReceiptText } = await import("/src/lib/parser.ts");
        const { calculateReceipt } = await import("/src/lib/engine.ts");
        const image = await prepareImage(new File([Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))], id, { type: mime }));
        try {
          const extracted = await localOcrProvider.extract([image], new AbortController().signal, () => {});
          const receipt = parseReceiptText(extracted);
          const calculation = calculateReceipt(receipt);
          return JSON.parse(JSON.stringify({ receipt, calculation, extraction_warnings: extracted.warnings || [], reading_panels: readingBlobs(image).length }, (_, value) => typeof value === "bigint" ? value.toString() : value));
        } finally { URL.revokeObjectURL(image.url); }
      }, { base64: bytes.toString("base64"), mime, id: record.receipt_id });
    } catch (error) {
      prediction = { error: String(error).slice(0, 1000) };
    }
    prediction = { receipt_id: record.receipt_id, group_id: record.group_id, image_sha256: record.sha256, elapsed_ms: Math.round(performance.now() - started), ...prediction };
    predictions.push(prediction);
    await writeFile(resolve(out, "predictions.jsonl"), predictions.map((p) => JSON.stringify(p)).join("\n") + "\n");
    console.log(`${predictions.length}/${records.length} ${record.receipt_id}: ${prediction.error ? "error" : `${prediction.receipt.items.length} rows`}, ${prediction.elapsed_ms}ms`);
  }
  metadata.blocked_external_origins = [...new Set(blockedRequests)];
  metadata.completed_at = new Date().toISOString();
  metadata.source_unchanged = true;
  for (const file of paths) {
    if (sha(await readFile(resolve(project, "src/lib", file))) !== sourceHashes[file]) metadata.source_unchanged = false;
  }
  metadata.predictions_sha256 = sha(await readFile(resolve(out, "predictions.jsonl")));
  await writeFile(resolve(out, "metadata.json"), JSON.stringify(metadata, null, 2));
  if (!metadata.source_unchanged) console.log("Project source changed during inference; this run used the saved frozen source throughout.");
} finally {
  await browser?.close();
  await server.close();
}
