// Local original-image/provider/parser baseline. Expected receipt values are not loaded.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
assert(/^[\w-]+$/.test(tag || ""));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const write = (name, data) =>
  writeFile(resolve(out, name), JSON.stringify(data, null, 2) + "\n", {
    flag: "wx",
  });
const inventoryPath = "qa-artifacts/public-refund-costco-v1/sources.json";
const inventoryBytes = await readFile(resolve(root, inventoryPath));
const inventory = JSON.parse(inventoryBytes);
assert.equal(inventory.files.length, 2);
assert.equal(inventory.private_upload_authorized, false);
const inputHashes = { [inventoryPath]: sha(inventoryBytes) };
for (const input of inventory.files) {
  const path = resolve(root, input.path);
  assert(
    path.startsWith(resolve(root, "qa-artifacts/public-refund-costco-v1")),
  );
  const bytes = await readFile(path);
  assert.equal(sha(bytes), input.sha256);
  inputHashes[input.path] = input.sha256;
}

const frozen = new Map(),
  sources = {},
  loaded = {};
for (const directory of ["src/lib", "scripts"])
  for (const name of await readdir(resolve(root, directory))) {
    if (
      !(directory === "src/lib" && /\.(?:ts|mjs)$/.test(name)) &&
      !(directory === "scripts" && name === "enhanced-ocr-assets.json")
    )
      continue;
    const path = directory + "/" + name;
    const bytes = await readFile(resolve(root, path));
    frozen.set(resolve(root, path).replaceAll("\\", "/"), { path, bytes });
    sources[path] = sha(bytes);
    await mkdir(dirname(resolve(out, "source", path)), { recursive: true });
    await writeFile(resolve(out, "source", path), bytes, { flag: "wx" });
  }
for (const path of [
  "package-lock.json",
  "receipt_training/scripts/benchmark_refund_receipts.mjs",
]) {
  const bytes = await readFile(resolve(root, path));
  sources[path] = sha(bytes);
  await mkdir(dirname(resolve(out, "source", path)), { recursive: true });
  await writeFile(resolve(out, "source", path), bytes, { flag: "wx" });
}
const assetHashes = {};
const enhanced = JSON.parse(
  await readFile(resolve(root, "scripts/enhanced-ocr-assets.json")),
);
for (const file of [...enhanced.models, ...enhanced.runtime]) {
  const path = "public/ocr-enhanced/" + file.file;
  const bytes = await readFile(resolve(root, path));
  assert.equal(bytes.length, file.bytes);
  assert.equal(sha(bytes), file.sha256);
  assetHashes[path] = file.sha256;
}
for (const name of await readdir(resolve(root, "public/ocr"))) {
  const path = "public/ocr/" + name;
  assetHashes[path] = sha(await readFile(resolve(root, path)));
}
await write("starting.json", {
  pid: process.pid,
  source_sha256: sources,
  input_sha256: inputHashes,
});
if (process.argv[3] === "--await-observer") {
  const started = Date.now();
  while (true) {
    try {
      const ready = JSON.parse(
        await readFile(resolve(out, "observer-ready.json")),
      );
      assert.equal(ready.root_pid, process.pid);
      break;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert(Date.now() - started < 15000, "Memory observer did not start");
    await new Promise((done) => setTimeout(done, 100));
  }
}

const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  optimizeDeps: {
    entries: ["src/lib/ocr.ts", "src/lib/paddle-browser.ts"],
    include: ["tesseract.js", "zod", "@techstark/opencv-js", "clipper-lib"],
    exclude: ["@paddleocr/paddleocr-js"],
  },
  cacheDir: resolve(out, "vite-cache"),
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-refund-baseline",
      enforce: "pre",
      load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) return;
        loaded[file.path] = sha(file.bytes);
        return file.bytes.toString("utf8");
      },
      configureServer(service) {
        service.middlewares.use((req, res, next) => {
          if (req.url !== "/__refund_baseline") return next();
          res.setHeader("content-type", "text/html");
          res.end(
            "<!doctype html><title>Local receipt-provider baseline</title>",
          );
        });
      },
    },
  ],
});
let browser, context;
const requests = { writes: [], external: [] },
  observations = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (!["GET", "HEAD"].includes(request.method())) {
      requests.writes.push(url.pathname);
      return route.abort();
    }
    if (url.origin !== origin) {
      requests.external.push(url.origin);
      return route.abort();
    }
    return route.continue();
  });
  for (const provider of ["basic", "enhanced"])
    for (const input of inventory.files) {
      const page = await context.newPage();
      await page.addInitScript(() => {
        const RealWorker = window.Worker;
        window.__studyWorkers = [];
        window.Worker = class extends RealWorker {
          constructor(...args) {
            super(...args);
            this.studyEntry = { url: String(args[0]), terminated: false };
            this.addEventListener("error", (event) => {
              this.studyEntry.error = String(
                event.message || "Worker error",
              ).slice(0, 500);
            });
            window.__studyWorkers.push(this.studyEntry);
          }
          terminate() {
            this.studyEntry.terminated = true;
            return super.terminate();
          }
        };
      });
      await page.goto(origin + "/__refund_baseline");
      const bytes = await readFile(resolve(root, input.path));
      const result = await page.evaluate(
        async ({ encoded, provider }) => {
          const { prepareImage, readingBlobs } =
            await import("/src/lib/images.ts");
          const { localOcrProvider } = await import("/src/lib/ocr.ts");
          const { enhancedOcrProvider } =
            await import("/src/lib/paddle-browser.ts");
          const { parseReceiptWithSources } =
            await import("/src/lib/parser.ts");
          const { reviewDeviceReading } =
            await import("/src/lib/device-review.ts");
          const { calculateReceipt } = await import("/src/lib/engine.ts");
          const { collectReceiptEvidence } =
            await import("/src/lib/receipt-evidence.ts");
          const digest = async (blob) =>
            [
              ...new Uint8Array(
                await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
              ),
            ]
              .map((x) => x.toString(16).padStart(2, "0"))
              .join("");
          const begin = performance.now();
          let image;
          const frames = [];
          try {
            const raw = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
            image = await prepareImage(
              new File([raw], "receipt.webp", { type: "image/webp" }),
            );
            for (const [part, blob] of readingBlobs(image).entries()) {
              const bytes = new Uint8Array(await blob.arrayBuffer());
              let binary = "";
              for (let i = 0; i < bytes.length; i += 16384)
                binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
              frames.push({
                photo: 1,
                part: part + 1,
                sha256: await digest(blob),
                bytes: bytes.length,
                data: btoa(binary),
              });
            }
            const preparation_ms = performance.now() - begin;
            const readBegin = performance.now();
            const output = await (
              provider === "basic" ? localOcrProvider : enhancedOcrProvider
            ).extract([image], new AbortController().signal, () => {});
            const reading_ms = performance.now() - readBegin;
            const predictions = [];
            for (const mode of ["automatic", "supplied-USD"]) {
              const parsed = parseReceiptWithSources(
                output,
                mode === "automatic" ? undefined : { currency: "USD" },
              );
              parsed.receipt.source = "ocr";
              parsed.receipt.warnings = [
                ...parsed.receipt.warnings,
                ...(output.warnings || []),
              ].slice(0, 60);
              const receipt = reviewDeviceReading(
                parsed.receipt,
                parsed.sources,
                output.sourceLines || [],
                output.recognition,
                parsed.fieldSources,
                output.sourceConflicts,
                output.joinedSectionRows,
              );
              const evidence = collectReceiptEvidence(
                receipt,
                output.text,
                parsed.sources,
                output.sourceLines || [],
                output.recognition,
                [image],
                parsed.fieldSources,
                output.sourceAlternatives,
              );
              predictions.push({
                mode,
                receipt,
                calculation: calculateReceipt(receipt),
                sources: parsed.sources,
                fieldSources: parsed.fieldSources,
                evidence,
              });
            }
            return JSON.parse(
              JSON.stringify(
                {
                  output,
                  predictions,
                  frames,
                  preparation_ms,
                  reading_ms,
                  elapsed_ms: performance.now() - begin,
                  quality: image.quality,
                  workers: window.__studyWorkers,
                },
                (_, value) =>
                  typeof value === "bigint" ? String(value) : value,
              ),
            );
          } catch (error) {
            return {
              error: String(error).slice(0, 500),
              frames,
              elapsed_ms: performance.now() - begin,
              workers: window.__studyWorkers,
            };
          } finally {
            if (image) URL.revokeObjectURL(image.url);
          }
        },
        { encoded: bytes.toString("base64"), provider },
      );
      for (const frame of result.frames || []) {
        const raw = Buffer.from(frame.data, "base64");
        assert.equal(sha(raw), frame.sha256);
        const name = `${provider}-${input.kind}-part-${frame.part}.jpg`;
        await writeFile(resolve(out, name), raw, { flag: "wx" });
        delete frame.data;
        frame.path = `qa-artifacts/${tag}/${name}`;
      }
      const observation = {
        provider,
        input_kind: input.kind,
        image_sha256: input.sha256,
        ...result,
      };
      observations.push(observation);
      await write(`${provider}-${input.kind}.json`, observation);
      console.log(
        JSON.stringify({
          provider,
          input: input.kind,
          error: result.error || null,
          sections: result.output?.rawSections?.length,
          products: result.predictions?.[0].receipt.items.length,
        }),
      );
      await page.close();
    }
  assert.deepEqual(requests, { writes: [], external: [] });
  for (const [path, expected] of Object.entries({
    ...sources,
    ...inputHashes,
    ...assetHashes,
  }))
    assert.equal(sha(await readFile(resolve(root, path))), expected, path);
  await write("metadata.json", {
    source_sha256: sources,
    loaded_frozen_source_sha256: loaded,
    input_sha256: inputHashes,
    asset_sha256: assetHashes,
    requests,
    browser: browser.version(),
    observations: observations.map(
      ({ provider, input_kind, error, elapsed_ms, reading_ms, workers }) => ({
        provider,
        input_kind,
        error: error || null,
        elapsed_ms,
        reading_ms,
        workers,
      }),
    ),
    provider_api_requests: 0,
    model_downloads: 0,
    expected_values_loaded: false,
    viewport: { width: 390, height: 844 },
    scope:
      "Four actual local provider calls on two related public original images, unchanged native preparation and mandatory review. Core browser API pipeline, not full UI workflow, phone hardware or complete-receipt accuracy.",
  });
} finally {
  await context?.close();
  await browser?.close();
  await server.close();
}
