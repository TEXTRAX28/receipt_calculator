// Replay hash-bound independent OCR and VLM evidence. No labels, image uploads or inference.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const project = fileURLToPath(new URL("../../", import.meta.url));
const training = resolve(project, "receipt_training");
const args = process.argv.slice(2);
const option = (name, fallback) =>
  args.includes(name) ? args[args.indexOf(name) + 1] : fallback;
const run = option("--run", "");
const split = option("--split", "development");
const selectedId = option("--id", null);
if (
  !/^[\w-]+$/.test(run) ||
  !["development", "evaluation"].includes(split) ||
  (selectedId && !/^[\w-]+$/.test(selectedId))
)
  throw new Error("Invalid replay selection");
const local = (name) => {
  const path = resolve(project, name);
  if (relative(project, path).startsWith(".."))
    throw new Error("Keep replay paths inside the project");
  return path;
};
const digest = (data) => createHash("sha256").update(data).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const rows = (bytes) =>
  bytes.toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
const runFolder = (name) => resolve(training, "evaluation/runs", name);
const manifestPath = local(
  option("--manifest", "receipt_training/manifest.jsonl"),
);
const manifestBytes = await readFile(manifestPath);
const visionFolder = runFolder("qwen-full-v2-verified-import");
const visionMeta = await readJson(resolve(visionFolder, "metadata.json"));
const visionBytes = await readFile(resolve(visionFolder, "structured.jsonl"));
if (digest(visionBytes) !== visionMeta.structured_sha256)
  throw new Error("Frozen vision evidence changed");
const vision = new Map(rows(visionBytes).map((row) => [row.receipt_id, row]));
const planPath = local("qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1.json");
const planBytes = await readFile(planPath);
if (digest(planBytes) !== visionMeta.predeclared_pilot_sha256)
  throw new Error("Frozen vision selection changed");
const cases = new Map(JSON.parse(planBytes).pilot.map((row) => [row.id, row]));
const ocrRuns = [];
for (const name of [
  "paddle-v6-full-development",
  "paddle-v6-full-evaluation",
  "paddle-v6-full-supplement",
]) {
  const folder = runFolder(name),
    meta = await readJson(resolve(folder, "metadata.json"));
  const bytes = await readFile(resolve(folder, "ocr.jsonl"));
  if (digest(bytes) !== meta.ocr_sha256 || !meta.completed_at)
    throw new Error("Frozen primary OCR evidence changed");
  ocrRuns.push({
    name,
    meta,
    rows: new Map(rows(bytes).map((row) => [row.receipt_id, row])),
  });
}
const records = rows(manifestBytes).filter(
  (row) =>
    row.split === split &&
    row.real_receipt &&
    row.included_in_pilot !== false &&
    vision.has(row.receipt_id) &&
    (!selectedId || selectedId === row.receipt_id),
);
if (!records.length) throw new Error("Empty replay selection");
const out = runFolder(run);
await mkdir(out);
await mkdir(resolve(out, "source"));
const library = local(option("--library", "src/lib"));
const names = (await readdir(library))
  .filter((name) => /[.](?:ts|mjs)$/.test(name))
  .sort();
const sourceHashes = {},
  frozen = new Map();
const loadedHashes = {};
const targetLibrary = resolve(project, "src/lib").replaceAll("\\", "/");
for (const name of names) {
  const bytes = await readFile(resolve(library, name));
  sourceHashes[name] = digest(bytes);
  frozen.set(
    resolve(project, "src/lib", name).replaceAll("\\", "/"),
    bytes.toString("utf8"),
  );
  await writeFile(resolve(out, "source", name), bytes);
}
const runner = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "evaluate.mjs"), runner);
const config = await readFile(resolve(training, "evaluation/config.json"));
const dependencyLock = await readFile(resolve(project, "package-lock.json"));
await writeFile(resolve(out, "package-lock.json"), dependencyLock);
const metadata = {
  provider: "PaddleOCR + independent Qwen3-VL frozen-evidence replay",
  split,
  source_sha256: sourceHashes,
  source_served_from_frozen_snapshot: true,
  source_snapshot_origin: relative(project, library).replaceAll("\\", "/"),
  manifest_sha256: digest(manifestBytes),
  config_sha256: digest(config),
  evaluation_runner_sha256: digest(runner),
  package_lock_sha256: digest(dependencyLock),
  node: process.version,
  frozen_vision_sha256: digest(visionBytes),
  frozen_plan_sha256: digest(planBytes),
  paired_inputs: [],
  started_at: new Date().toISOString(),
  api_requests: 0,
  api_cost: "0",
  compute_cost: null,
  native_inference_requests: 0,
  timing_scope:
    "Browser verification/reconciliation replay and RPC only, using retained model evidence; excludes every OCR/model call, loading, preparation and download. Not an OCR or hybrid end-to-end latency measurement.",
};
const server = await createServer({
  root: project,
  configFile: false,
  cacheDir: resolve(project, "node_modules", ".vite-independent-" + run),
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    hmr: false,
    fs: {
      deny: [
        "**/.env*",
        "**/.git/**",
        "**/qa-artifacts/**",
        "**/receipt_training/**",
        "**/private-receipts/**",
        "**/graphify-out/**",
      ],
    },
    watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
  },
  optimizeDeps: { noDiscovery: true, include: ["zod", "tesseract.js"] },
  plugins: [
    {
      name: "frozen-independent-source",
      enforce: "pre",
      load(id) {
        const path = id.split("?")[0].replaceAll("\\", "/");
        const source = frozen.get(path);
        if (source === undefined) return null;
        loadedHashes[path.slice(targetLibrary.length + 1)] = digest(source);
        return source;
      },
    },
    {
      name: "private-replay-page",
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.url !== "/__independent_replay") return next();
          res.setHeader("Content-Type", "text/html");
          res.end(
            "<!doctype html><title>Local verification replay</title><body>Private local verification replay</body>",
          );
        });
      },
    },
  ],
});
const predictions = [],
  blocked = [];
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin && route.request().method() === "GET")
      return route.continue();
    blocked.push({ origin: url.origin, method: route.request().method() });
    return route.abort();
  });
  const page = await context.newPage();
  await page.goto(origin + "/__independent_replay");
  metadata.browser = browser.version();
  for (const record of records) {
    const id = record.receipt_id,
      candidate = vision.get(id),
      entry = cases.get(id);
    const requestBytes = await readFile(local(entry.request));
    if (digest(requestBytes) !== entry.request_sha256)
      throw new Error("Sealed vision request changed");
    const request = JSON.parse(requestBytes);
    const paired = ocrRuns.find(
      (run) =>
        run.meta.panel_run === request.source_panel_run && run.rows.has(id),
    );
    if (!paired)
      throw new Error("No exact paired primary OCR source for " + id);
    const ocr = paired.rows.get(id);
    if (
      candidate.image_sha256 !== record.sha256 ||
      ocr.image_sha256 !== candidate.image_sha256
    )
      throw new Error("Source transaction bytes differ");
    const panelManifest = await readFile(
      resolve(runFolder(request.source_panel_run), "predictions.jsonl"),
    );
    if (
      digest(panelManifest) !== request.source_panel_manifest_sha256 ||
      digest(panelManifest) !== paired.meta.panel_manifest_sha256
    )
      throw new Error("Frozen panel inventories differ");
    const source = rows(panelManifest).find((row) => row.receipt_id === id);
    const expected = source.panels.map((panel) => panel.sha256);
    if (
      JSON.stringify(expected) !==
        JSON.stringify(ocr.panels.map((panel) => panel.sha256)) ||
      request.images.length !== expected.length
    )
      throw new Error("Independent readers used different image panels");
    for (const [index, image] of request.images.entries())
      if (digest(await readFile(local(image))) !== expected[index])
        throw new Error("Source panel pixels changed");
    const recognition = {
      engine: paired.meta.adapter,
      panels: ocr.panels.map(
        ({ photo_index, panel_index, width, height, words, lines }) => ({
          photo: photo_index + 1,
          part: panel_index + 1,
          width,
          height,
          words,
          lines,
        }),
      ),
    };
    const started = performance.now();
    const prediction = await page.evaluate(
      async ({ receipt, recognition }) => {
        try {
          const { verifyIndependentReadings } =
            await import("/src/lib/verify-readings.ts");
          const { calculateReceipt } = await import("/src/lib/engine.ts");
          const result = verifyIndependentReadings(receipt, recognition);
          const calculation = calculateReceipt(result.receipt);
          return JSON.parse(
            JSON.stringify(
              {
                receipt: result.receipt,
                calculation,
                corrections: result.corrections.length,
                removed_adjustments: result.removedAdjustments.length,
                matched_purchases: result.matchedPurchases,
                ocr_purchases: result.ocrPurchases,
                vision_purchases: result.originalVisionPurchases,
              },
              (_, value) =>
                typeof value === "bigint" ? value.toString() : value,
            ),
          );
        } catch (error) {
          return {
            error: String(error).slice(0, 600),
            failed_stage: "independent-verification-replay",
          };
        }
      },
      { receipt: candidate.receipt, recognition },
    );
    predictions.push({
      receipt_id: id,
      image_sha256: candidate.image_sha256,
      ...prediction,
      elapsed_ms: Math.round(performance.now() - started),
    });
    metadata.paired_inputs.push({
      receipt_id: id,
      ocr_run: paired.name,
      ocr_sha256: paired.meta.ocr_sha256,
      vision_request_sha256: entry.request_sha256,
      source_panel_manifest_sha256: request.source_panel_manifest_sha256,
      panel_sha256: expected,
    });
  }
} finally {
  await browser?.close();
  await server.close();
}
metadata.completed_at = new Date().toISOString();
metadata.loaded_frozen_source_sha256 = loadedHashes;
if (
  loadedHashes["verify-readings.ts"] !== sourceHashes["verify-readings.ts"] ||
  loadedHashes["engine.ts"] !== sourceHashes["engine.ts"]
)
  throw new Error(
    "The browser did not load the intended frozen verifier and calculator",
  );
metadata.blocked_external_requests = blocked;
metadata.predictions_sha256 = digest(
  Buffer.from(predictions.map((row) => JSON.stringify(row)).join("\n") + "\n"),
);
await writeFile(
  resolve(out, "predictions.jsonl"),
  predictions.map((row) => JSON.stringify(row)).join("\n") + "\n",
);
await writeFile(
  resolve(out, "metadata.json"),
  JSON.stringify(metadata, null, 2),
);
if (blocked.length) throw new Error("Unexpected replay network traffic");
console.log(
  JSON.stringify({
    run,
    receipts: predictions.length,
    processing_errors: predictions.filter((row) => row.error).length,
    recovered_coupons: predictions.reduce(
      (sum, row) => sum + (row.corrections || 0),
      0,
    ),
    native_inference_requests: 0,
    external_requests: 0,
  }),
);
