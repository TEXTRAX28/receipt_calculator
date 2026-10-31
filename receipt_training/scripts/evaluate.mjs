// Run the existing browser image preparation, OCR, parser and money engine unchanged.
// No label file is read here. All receipt network traffic is restricted to loopback.
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, access, readdir } from "node:fs/promises";
import { resolve, dirname, relative, isAbsolute } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createServer, loadEnv } from "vite";
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
const prepareOnly = args.includes("--prepare-only");
const ocrRun = option("--ocr-run", null);
if (ocrRun && (!/^[\w-]+$/.test(ocrRun) || prepareOnly)) throw new Error("Choose one valid OCR input run");
const structuredRun = option("--structured-run", null);
if (structuredRun && (!/^[\w-]+$/.test(structuredRun) || ocrRun || prepareOnly)) throw new Error("Choose one OCR or structured input run");
const candidateRun = ocrRun || structuredRun;
const httpLocal = args.includes("--http-local");
if (httpLocal && (candidateRun || prepareOnly || sourceRun)) throw new Error("Use --http-local with the current source and original images, without replay options");
const recognitionLayout = args.includes("--recognition-layout");
if (recognitionLayout && !ocrRun) throw new Error("Recognition layout requires a frozen --ocr-run");
let candidateMetadata;
let candidateById;
if (candidateRun) {
  candidateMetadata = JSON.parse(await readFile(resolve(root, "evaluation/runs", candidateRun, "metadata.json"), "utf8"));
  const bytes = await readFile(resolve(root, "evaluation/runs", candidateRun, structuredRun ? "structured.jsonl" : "ocr.jsonl"));
  if (!candidateMetadata.completed_at || createHash("sha256").update(bytes).digest("hex") !== (structuredRun ? candidateMetadata.structured_sha256 : candidateMetadata.ocr_sha256))
    throw new Error("Candidate run is incomplete or changed");
  candidateById = new Map(bytes.toString().trim().split(/\r?\n/).map(JSON.parse).map((r) => [r.receipt_id, r]));
}
if (!Number.isInteger(limit) || limit < 1) throw new Error("Invalid --limit");
const out = resolve(root, "evaluation/runs", runName);
if (await access(out).then(() => true, () => false))
  throw new Error("Run already exists. Preserve it and choose a new --run name.");
await mkdir(dirname(out), { recursive: true });
await mkdir(out);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const manifestPath = resolve(root, option("--manifest", "manifest.jsonl"));
if (!manifestPath.startsWith(root + "/") && !manifestPath.startsWith(root + "\\"))
  throw new Error("Manifest must stay inside receipt_training");
const manifestBytes = await readFile(manifestPath);
const records = manifestBytes.toString().trim().split(/\r?\n/).map(JSON.parse)
  .filter((record) => record.split === split && (!candidateById || candidateById.has(record.receipt_id)) && (args.includes("--include-controls") || (record.real_receipt && record.included_in_pilot !== false))).slice(0, limit);
const library = resolve(project, "src/lib");
const paths = sourceRun
  ? Object.keys(JSON.parse(await readFile(resolve(root, "evaluation/runs", sourceRun, "metadata.json"), "utf8")).source_sha256)
  : (await readdir(library, { recursive: true, withFileTypes: true }))
      .filter((entry) => entry.isFile() && /\.(?:ts|mjs)$/.test(entry.name))
      .map((entry) => relative(library, resolve(entry.parentPath, entry.name)).replaceAll("\\", "/")).sort();
const sourceHashes = {};
const frozenSources = new Map();
for (const file of paths) {
  if (!/^[\w./-]+\.(?:ts|mjs)$/.test(file) || relative(library, resolve(library, file)).startsWith(".."))
    throw new Error("Invalid frozen library source path");
  const data = await readFile(sourceRun ? resolve(root, "evaluation/runs", sourceRun, "source", file) : resolve(project, "src/lib", file));
  sourceHashes[file] = sha(data);
  frozenSources.set(resolve(project, "src/lib", file).replaceAll("\\", "/"), data.toString());
  await mkdir(dirname(resolve(out, "source", file)), { recursive: true });
  await writeFile(resolve(out, "source", file), data);
}
let localReader, makeReceiptApi, runtimeRoot;
const runtimeHashes = {}, probes = [], workerStarts = [];
const runtimeSnapshot = resolve(out, "runtime-source");
let pythonMetadata, dependencyLockHash;
if (httpLocal) {
  const env = loadEnv("development", project, "");
  const python = env.LOCAL_OCR_PYTHON || "", engine = env.LOCAL_OCR_ENGINE || "paddle-v6";
  if (!isAbsolute(python) || !["paddle-v6", "doctr"].includes(engine))
    throw new Error("Configure an absolute LOCAL_OCR_PYTHON path and a supported LOCAL_OCR_ENGINE before a live benchmark");
  const runtimeFiles = ["server/receipt-api.mjs", "server/extraction-instructions.mjs", "server/local-ocr.mjs", "server/local-model-manifest.json", "server/local_ocr_worker.py", "server/local_ocr_models.py"];
  for (const name of runtimeFiles) {
    const bytes = await readFile(resolve(project, name));
    runtimeHashes[name] = sha(bytes);
    await mkdir(dirname(resolve(runtimeSnapshot, name)), { recursive: true });
    await writeFile(resolve(runtimeSnapshot, name), bytes);
  }
  for (const name of paths.filter((name) => name.endsWith(".mjs"))) {
    const bytes = await readFile(resolve(out, "source", name)), relativeName = `src/lib/${name}`;
    runtimeHashes[relativeName] = sha(bytes);
    await mkdir(dirname(resolve(runtimeSnapshot, relativeName)), { recursive: true });
    await writeFile(resolve(runtimeSnapshot, relativeName), bytes);
  }
  const { createLocalModelReader } = await import(pathToFileURL(resolve(runtimeSnapshot, "server/local-ocr.mjs")));
  ({ createReceiptApi: makeReceiptApi } = await import(pathToFileURL(resolve(runtimeSnapshot, "server/receipt-api.mjs"))));
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(?:SystemRoot|Windir|Path|PathExt|Temp|Tmp)$/i.test(key)));
  const dependencyNames = engine === "doctr" ? ["Pillow", "numpy", "python-doctr", "torch", "torchvision"] : ["Pillow", "numpy", "onnxruntime", "paddleocr", "paddlex"];
  pythonMetadata = JSON.parse(execFileSync(python, ["-I", "-c", "import sys,json,importlib.metadata as m; print(json.dumps({'python':sys.version,'packages':{n:m.version(n) for n in json.loads(sys.argv[1])}}))", JSON.stringify(dependencyNames)], { cwd: project, env: cleanEnv, windowsHide: true, encoding: "utf8" }));
  dependencyLockHash = sha(await readFile(resolve(project, "package-lock.json")));
  const probeSource = resolve(project, "receipt_training/scripts/observe_process_memory.py");
  await mkdir(resolve(out, "resources"));
  await writeFile(resolve(out, "resources/observe_process_memory.py"), await readFile(probeSource));
  runtimeRoot = resolve(runtimeSnapshot, "private-receipts/runtime");
  localReader = createLocalModelReader({ python, engine, cacheRoot: resolve(root, ".cache"), runtimeRoot,
    spawnWorker(program, workerArgs, options) {
      const child = spawn(program, workerArgs, options);
      const file = resolve(out, `resources/worker-${workerStarts.length + 1}.json`);
      workerStarts.push({ pid: child.pid, started_at: new Date().toISOString(), memory_file: relative(out, file).replaceAll("\\", "/") });
      const probe = spawn(python, [probeSource, "--pid", String(child.pid), "--output", file], { cwd: project, env: options.env, windowsHide: true, stdio: "ignore" });
      const done = new Promise((resolveDone) => { probe.once("error", resolveDone); probe.once("close", resolveDone); });
      probes.push({ probe, done, file });
      return child;
    },
  });
  if (!localReader.configured) throw new Error("The configured local model is unavailable; no live inference result can be claimed");
}
const configBytes = await readFile(resolve(root, "evaluation/config.json"));
const runnerBytes = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "evaluate.mjs"), runnerBytes);
const metadata = {
  provider: httpLocal ? `live-local-HTTP-${localReader.name}` : prepareOnly ? "frozen-image-preparation-only" : candidateRun ? candidateMetadata.adapter : "existing-localOcrProvider", split, runName,
  candidate_run: candidateRun,
  candidate_ocr_sha256: candidateMetadata?.ocr_sha256,
  candidate_structured_sha256: candidateMetadata?.structured_sha256,
  recognition_assembly: recognitionLayout || httpLocal ? "source-region-layout" : "legacy-text-window-join",
  cached_evidence_scope: candidateRun ? "Frozen model evidence replay, not a live HTTP/decode gate replay. Earlier preview rounding can exceed today's exact pixel budget; those source pixels and model outputs remain unchanged." : null,
  started_at: new Date().toISOString(), node: process.version,
  manifest_sha256: sha(manifestBytes), config_sha256: sha(configBytes), source_sha256: sourceHashes,
  evaluation_runner_sha256: sha(runnerBytes),
  runtime_source_sha256: httpLocal ? runtimeHashes : undefined,
  python_environment: pythonMetadata, node_dependency_lock_sha256: dependencyLockHash,
  local_http_requests: 0,
  backend_isolation: httpLocal ? "Fresh API middleware instance per receipt as independent integration cases, reusing one model worker. Host/origin/body/decode gates run; burst/quota behavior is tested separately in the normal application, not measured by this isolated-case benchmark." : undefined,
  manifest_path: manifestPath,
  source_commit: execFileSync("git", ["rev-parse", "HEAD"], { cwd: project, encoding: "utf8" }).trim(),
  source_includes_uncommitted_work: true,
  source_served_from_frozen_snapshot: true,
  source_snapshot_from_run: sourceRun,
  selected_ids: records.map((r) => r.receipt_id),
  timing_scope: httpLocal ? "Browser original-image preparation, real local HTTP/body/JPEG/decode/native model recognition, layout parsing, financial reconciliation and browser RPC. First scan includes model startup; later scans reuse the worker. Excludes model preflight and server/browser startup. Per-case quota state isolated; not a bulk throughput test." : structuredRun ? "Precomputed fresh vision CLI process/model loading, image encoding and generation plus browser structured validation/reconciliation/RPC; excludes initial preparation/download/asset verification. Not a baseline end-to-end latency comparison." : ocrRun ? "Precomputed local model inference plus browser parsing/reconciliation/RPC; excludes image preparation and model startup. Not a baseline end-to-end latency comparison." : prepareOnly ? "Frozen browser image preparation and panel export/RPC only" : "per-receipt browser preparation, new OCR worker, OCR, parser, reconciliation and RPC; excludes server/browser startup",
  api_requests: 0, api_cost: "0", api_cost_currency: "USD", compute_cost: null,
};
await writeFile(resolve(out, "metadata.json"), JSON.stringify(metadata, null, 2));
execFileSync(process.execPath, ["scripts/prepare-ocr.mjs"], { cwd: project, stdio: "pipe" });
const server = await createServer({
  configFile: false, root: project, logLevel: "error", cacheDir: resolve(out, "vite-cache"),
  server: { host: "127.0.0.1", port: 5268, strictPort: true, hmr: false,
    watch: { ignored: ["**/receipt_training/.cache/**", "**/receipt_training/evaluation/runs/**", "**/qa-artifacts/**"] } },
  optimizeDeps: { noDiscovery: true, include: ["zod", "tesseract.js"] },
  plugins: [{ name: "frozen-receipt-source", enforce: "pre", load(id) {
    return frozenSources.get(id.split("?")[0].replaceAll("\\", "/")) ?? null;
  } }, { name: "receipt-evaluation-page", configureServer(vite) {
    vite.middlewares.use((req, res, next) => {
      if (httpLocal && req.url?.startsWith("/api/receipts/")) {
        if (req.method === "POST" && req.url === "/api/receipts/recognize") metadata.local_http_requests++;
        // Separate integration cases use fresh quota state; the production API has no bypass option.
        void makeReceiptApi({ apiKey: "", localReader })(req, res, next);
        return;
      }
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
    const candidate = candidateById?.get(record.receipt_id);
    if (candidate && candidate.image_sha256 !== record.sha256) throw new Error("Candidate uses different source image bytes");
    const inputs = record.source_files || [{ file_path: record.file_path, sha256: record.sha256 }];
    if (!inputs.length || inputs.length > 12) throw new Error("Invalid photo group");
    const photos = [];
    for (const input of inputs) {
      const path = resolve(root, input.file_path);
      if (!path.startsWith(root + "/") && !path.startsWith(root + "\\")) throw new Error("Receipt must stay inside receipt_training");
      const bytes = await readFile(path);
      if (sha(bytes) !== input.sha256) throw new Error(`Checksum mismatch: ${record.receipt_id}`);
      const mime = /\.webp$/i.test(path) ? "image/webp" : /\.png$/i.test(path) ? "image/png" : "image/jpeg";
      photos.push({ base64: bytes.toString("base64"), mime });
    }
    const started = performance.now();
    let prediction;
    try {
      prediction = await page.evaluate(async ({ photos, id, prepareOnly, candidate, recognitionLayout, adapter, structured, httpLocal }) => {
        const { prepareImage, readingBlobs } = await import("/src/lib/images.ts");
        const { localOcrProvider, joinDetailText } = await import("/src/lib/ocr.ts");
        const { parseReceiptText, PHOTO_SEPARATOR } = await import("/src/lib/parser.ts");
        const { calculateReceipt } = await import("/src/lib/engine.ts");
        const images = [];
        try {
          if (candidate?.error) return { error: candidate.error, failed_stage: "recognition" };
          if (!candidate) {
            for (const [index, photo] of photos.entries()) {
              images.push(await prepareImage(new File([Uint8Array.from(atob(photo.base64), (c) => c.charCodeAt(0))], `${id}-${index}`, { type: photo.mime })));
            }
          }
          if (prepareOnly) {
            const preparedPanels = [];
            for (const [photo_index, image] of images.entries()) {
              for (const [panel_index, blob] of readingBlobs(image).entries()) {
                const bitmap = await createImageBitmap(blob);
                const bytes = new Uint8Array(await blob.arrayBuffer());
                let binary = "";
                for (let start = 0; start < bytes.length; start += 8192)
                  binary += String.fromCharCode(...bytes.subarray(start, start + 8192));
                preparedPanels.push({ photo_index, panel_index, width: bitmap.width, height: bitmap.height, base64: btoa(binary) });
                bitmap.close();
              }
            }
            return { preparedPanels };
          }
          if (candidate && structured) {
            try {
              const { receiptFromAi } = await import("/src/lib/gemini.ts");
              const receipt = receiptFromAi(candidate.receipt);
              const supplied = new Set(candidate.source_photos);
              if (candidate.receipt.items.some((item) => item.sourcePhotos.some((photo) => !supplied.has(photo))))
                throw new Error("Structured output refers to a photograph that was not supplied");
              // Attribute the shared postprocessor's brand-only review messages correctly.
              // No extracted financial field, source reference or uncertainty is repaired.
              receipt.warnings = receipt.warnings.map((s) => s.replaceAll("Gemini", "The vision model"));
              const calculation = calculateReceipt(receipt);
              return JSON.parse(JSON.stringify({ receipt, calculation, extraction_warnings: candidate.receipt.warnings, reading_panels: candidate.reading_panels, structured_postprocessor: "receiptFromAi; brand-only warning labels adjusted" }, (_, value) => typeof value === "bigint" ? value.toString() : value));
            } catch (error) {
              return { error: String(error).slice(0, 1000), failed_stage: "structured-validation", reading_panels: candidate.reading_panels };
            }
          }
          let extracted;
          if (candidate && recognitionLayout) {
            const { assembleRecognition } = await import("/src/lib/receipt-layout.ts");
            const panels = candidate.panels.map(({ photo_index, panel_index, width, height, words, lines }) => ({
              photo: photo_index + 1, part: panel_index + 1, width, height, words, lines,
            }));
            // Hash-bound offline OCR evidence is not an upload. Do not alter legacy
            // panel dimensions to masquerade as a current live request-gate test.
            const assembled = assembleRecognition({ engine: adapter, panels });
            extracted = { text: assembled.text, warnings: assembled.warnings };
          } else if (candidate) {
            const grouped = new Map();
            for (const panel of [...candidate.panels].sort((a, b) => a.photo_index - b.photo_index || a.panel_index - b.panel_index)) {
              const list = grouped.get(panel.photo_index) || [];
              list.push(panel.lines.map((line) => line.text).join("\n"));
              grouped.set(panel.photo_index, list);
            }
            extracted = { text: [...grouped.values()].map(joinDetailText).join(`\n${PHOTO_SEPARATOR}\n`), warnings: [] };
          } else if (httpLocal) {
            const { extractWithLocalModel } = await import("/src/lib/local-model.ts");
            extracted = await extractWithLocalModel(images, new AbortController().signal, () => {});
          } else extracted = await localOcrProvider.extract(images, new AbortController().signal, () => {});
          const evidence = { extraction_warnings: extracted.warnings || [], reading_panels: candidate ? candidate.panels.length : images.reduce((n, image) => n + readingBlobs(image).length, 0), cached_panels_over_current_pixel_limit: candidate ? candidate.panels.some((p) => p.width * p.height > 4_000_000) : false, local_recognition: httpLocal ? extracted.recognition : undefined };
          try {
            const receipt = parseReceiptText(extracted);
            if (httpLocal) receipt.warnings = [...receipt.warnings, ...(extracted.warnings || [])].slice(0, 60);
            const calculation = calculateReceipt(receipt);
            return JSON.parse(JSON.stringify({ receipt, calculation, ...evidence }, (_, value) => typeof value === "bigint" ? value.toString() : value));
          } catch (error) {
            return { ...evidence, error: String(error).slice(0, 1000), extracted_text: extracted.text, failed_stage: "parse" };
          }
        } finally { images.forEach((image) => URL.revokeObjectURL(image.url)); }
      }, { photos, id: record.receipt_id, prepareOnly, candidate, recognitionLayout, adapter: candidateMetadata?.adapter, structured: !!structuredRun, httpLocal });
    } catch (error) {
      prediction = { error: String(error).slice(0, 1000) };
    }
    if (prediction.preparedPanels) {
      await mkdir(resolve(out, "panels"), { recursive: true });
      prediction.panels = [];
      for (const [index, { base64, ...panel }] of prediction.preparedPanels.entries()) {
        const bytes = Buffer.from(base64, "base64");
        const file_path = `panels/${predictions.length + 1}-${index + 1}.jpg`;
        await writeFile(resolve(out, file_path), bytes);
        prediction.panels.push({ ...panel, file_path, sha256: sha(bytes) });
      }
      delete prediction.preparedPanels;
    }
    prediction = { receipt_id: record.receipt_id, group_id: record.group_id, image_sha256: record.sha256, elapsed_ms: Math.round(performance.now() - started) + (candidate?.inference_ms || 0), ...prediction };
    predictions.push(prediction);
    await writeFile(resolve(out, "predictions.jsonl"), predictions.map((p) => JSON.stringify(p)).join("\n") + "\n");
    console.log(`${predictions.length}/${records.length} ${record.receipt_id}: ${prediction.error ? "error" : prepareOnly ? `${prediction.panels.length} panels` : `${prediction.receipt.items.length} rows`}, ${prediction.elapsed_ms}ms`);
  }
  metadata.blocked_external_origins = [...new Set(blockedRequests)];
  metadata.completed_at = new Date().toISOString();
  metadata.source_unchanged = true;
  for (const file of paths) {
    if (sha(await readFile(resolve(project, "src/lib", file))) !== sourceHashes[file]) metadata.source_unchanged = false;
  }
  metadata.predictions_sha256 = sha(await readFile(resolve(out, "predictions.jsonl")));
  if (httpLocal) {
    await localReader.dispose();
    await Promise.all(probes.map(async ({ probe, done }) => {
      let timer;
      await Promise.race([done, new Promise((resolveDone) => { timer = setTimeout(() => { probe.kill(); resolveDone(); }, 5000); })]);
      clearTimeout(timer);
    }));
    metadata.model_workers = await Promise.all(workerStarts.map(async (worker, index) => ({ ...worker, memory: await readFile(probes[index].file, "utf8").then(JSON.parse, () => ({ error: "memory observer did not finish" })) })));
    metadata.temporary_jobs_remaining = await readdir(runtimeRoot).then((files) => files.length, (error) => {
      if (error.code === "ENOENT") return 0;
      metadata.temporary_cleanup_check_error = "Temporary job directory could not be inspected";
      return null;
    });
    metadata.runtime_source_unchanged = true;
    for (const [name, expected] of Object.entries(runtimeHashes)) {
      if (sha(await readFile(resolve(project, name))) !== expected) metadata.runtime_source_unchanged = false;
    }
    metadata.node_parent_current_rss_bytes = process.memoryUsage().rss;
    metadata.browser_process_memory_measured = false;
  }
  await writeFile(resolve(out, "metadata.json"), JSON.stringify(metadata, null, 2));
  if (!metadata.source_unchanged) console.log("Project source changed during inference; this run used the saved frozen source throughout.");
} finally {
  await localReader?.dispose();
  await browser?.close();
  await server.close();
}
