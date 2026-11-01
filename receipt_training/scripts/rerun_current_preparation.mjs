// Six original sources rejected only by historical rounded panel dimensions.
// Actual current preparation + local orchestration. No labels, cloud or retries.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer, loadEnv } from "vite";
import { chromium } from "@playwright/test";
import { createLocalModelReader } from "../../server/local-ocr.mjs";
import { createLocalVisionReader } from "../../server/local-vision.mjs";
import { createReceiptApi } from "../../server/receipt-api.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2],
  selected = process.argv[3];
assert(/^[\w-]+$/.test(run || ""));
if (selected) assert(/^[\w-]+$/.test(selected));
const output = resolve(root, "receipt_training/evaluation/runs", run);
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (name) => readFile(name, "utf8").then(JSON.parse);
const writeJson = (path, data) =>
  writeFile(path, JSON.stringify(data, null, 2) + "\n", { flag: "wx" });
const local = loadEnv("development", root, "LOCAL_");
const env = {
  ...process.env,
  LOCAL_OCR_PYTHON: local.LOCAL_OCR_PYTHON || "",
  GEMINI_API_KEY: "",
  VERYFI_CLIENT_ID: "",
  VERYFI_BEARER_KEY: "",
  VERYFI_ALLOWANCE_ID: "",
  VERYFI_DOCUMENT_LIMIT: "0",
};
assert(env.LOCAL_OCR_PYTHON, "Use the already installed local OCR Python");

if (!selected) {
  await mkdir(output);
  const sourceHashes = {};
  async function freeze(path) {
    const bytes = await readFile(resolve(root, path));
    sourceHashes[path] = digest(bytes);
    const target = resolve(output, "source", path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }
  async function walk(path) {
    for (const item of await readdir(resolve(root, path), {
      withFileTypes: true,
    })) {
      const name = path + "/" + item.name;
      if (item.isDirectory()) await walk(name);
      else if (/\.(ts|tsx|css|py|mjs|json)$/.test(name)) await freeze(name);
    }
  }
  await walk("src");
  await walk("server");
  for (const name of [
    "receipt_training/scripts/rerun_current_preparation.mjs",
    "receipt_training/scripts/setup_vision_candidate.py",
    "receipt_training/evaluation/vision-candidate-manifest.json",
    "package-lock.json",
    "receipt_training/manifest.jsonl",
    "receipt_training/evaluation/advanced-automatic-local-v1.json",
  ])
    await freeze(name);
  const prior = await json(
    resolve(
      root,
      "receipt_training/evaluation/advanced-automatic-local-v1.json",
    ),
  );
  const manifest = (
    await readFile(resolve(root, "receipt_training/manifest.jsonl"), "utf8")
  )
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  const records = prior.original_50.current_transport_rejected_ids.map((id) =>
    manifest.find((row) => row.receipt_id === id),
  );
  assert.equal(records.length, 6);
  for (const row of records) {
    assert(row && row.external_processing_allowed === false);
    assert.equal(
      digest(await readFile(resolve(root, "receipt_training", row.file_path))),
      row.sha256,
    );
  }
  const plan = {
    scope:
      "Exactly six original receipts whose old prepared panels exceeded the current pixel guard. Each source receives one fresh current-preparation automatic local reading; primary-only reference reuses that same OCR response through the actual primary reader, without another model call.",
    records,
    source_sha256: sourceHashes,
    sealed_at: new Date().toISOString(),
    rate_limit_scope:
      "Each case has its own fresh worker/API instance with the unmodified two-per-minute and ten-per-hour limits. At most two real local model POSTs per instance. This is independent-case extraction testing, not shared-server throughput or quota testing.",
    api_cost: "0",
    cloud_requests: 0,
    automatic_retries: 0,
    label_files_read: false,
  };
  await writeJson(resolve(output, "plan.json"), plan);
  const cases = [];
  for (const record of records) {
    const child = spawn(
      process.execPath,
      [fileURLToPath(import.meta.url), run, record.receipt_id],
      { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (bytes) => {
      stdout += bytes.toString();
    });
    child.stderr.on("data", (bytes) => {
      stderr += bytes.toString();
    });
    const [code, signal] = await once(child, "close");
    const folder = resolve(output, record.receipt_id);
    await writeFile(resolve(folder, "worker-stdout.log"), stdout, {
      flag: "wx",
    });
    await writeFile(resolve(folder, "worker-stderr.log"), stderr, {
      flag: "wx",
    });
    const meta = await json(resolve(folder, "metadata.json"));
    cases.push({
      receipt_id: record.receipt_id,
      exit_code: code,
      signal,
      http: meta.http,
      comparison_complete: meta.comparison_complete ?? false,
      error: meta.error ?? null,
      elapsed_ms: meta.elapsed_ms ?? null,
      metadata_sha256: digest(await readFile(resolve(folder, "metadata.json"))),
    });
    console.log(JSON.stringify(cases.at(-1)));
  }
  let unchanged = true;
  for (const [path, expected] of Object.entries(sourceHashes))
    if (digest(await readFile(resolve(root, path))) !== expected)
      unchanged = false;
  await writeJson(resolve(output, "metadata.json"), {
    ...plan,
    cases,
    source_unchanged: unchanged,
    completed_at: new Date().toISOString(),
  });
  if (!unchanged || cases.some((row) => row.error || !row.comparison_complete))
    process.exitCode = 1;
} else {
  for (const key of [
    "GEMINI_API_KEY",
    "VERYFI_CLIENT_ID",
    "VERYFI_BEARER_KEY",
    "VERYFI_ALLOWANCE_ID",
  ])
    process.env[key] = "";
  const plan = await json(resolve(output, "plan.json"));
  const record = plan.records.find((row) => row.receipt_id === selected);
  assert(record);
  const folder = resolve(output, selected);
  await mkdir(folder);
  const meta = {
    receipt_id: selected,
    image_sha256: record.sha256,
    split: record.split,
    started_at: new Date().toISOString(),
    node: process.version,
    http: [],
    native_processes: [],
    blocked_requests: [],
    api_cost: "0",
    cloud_requests: 0,
    automatic_retries: 0,
    primary_reference_saved_response_reads: 0,
  };
  let server, browser, localReader, localVision;
  const pending = [],
    loadedHashes = {};
  const observeSpawn = (program, args, options) => {
    const processRecord = {
      stage: /llama-mtmd-cli/.test(program)
        ? "vision-inference"
        : args.some((arg) => /setup_vision_candidate.py$/.test(arg))
          ? "asset-verification"
          : args.some((arg) => /local_image_guard.py$/.test(arg))
            ? "image-guard"
            : "primary-worker",
      program: basename(program),
      started_at: new Date().toISOString(),
      pid: null,
      stderr_diagnostics: [],
      stdout_bytes: 0,
    };
    meta.native_processes.push(processRecord);
    const started = performance.now(),
      child = spawn(program, args, options);
    processRecord.pid = child.pid;
    const hash = createHash("sha256");
    let carry = "";
    child.stdout?.on("data", (bytes) => {
      processRecord.stdout_bytes += bytes.length;
      hash.update(bytes);
    });
    child.stderr?.on("data", (bytes) => {
      carry += bytes.toString("utf8");
      const lines = carry.split(/\r?\n/);
      carry = lines.pop().slice(-4096);
      for (const line of lines)
        if (
          /^(?:ggml_vulkan:|llama_perf_|llama_model_load|load_tensors:|clip_model_load|clip_model_loader:|mtmd_.*:|common_init_from_params:)/.test(
            line,
          ) &&
          processRecord.stderr_diagnostics.length < 150
        )
          processRecord.stderr_diagnostics.push(line.slice(0, 1500));
    });
    child.once("close", (code, signal) =>
      Object.assign(processRecord, {
        elapsed_ms: Math.round(performance.now() - started),
        exit_code: code,
        signal,
        stdout_sha256: hash.digest("hex"),
        completed_at: new Date().toISOString(),
      }),
    );
    return child;
  };
  try {
    localReader = createLocalModelReader({
      python: env.LOCAL_OCR_PYTHON,
      engine: "paddle-v6",
      spawnWorker: observeSpawn,
    });
    localVision = createLocalVisionReader({
      python: env.LOCAL_OCR_PYTHON,
      enabled: true,
      spawnProcess: observeSpawn,
    });
    assert(localReader.configured && localVision.configured);
    const api = createReceiptApi({ apiKey: "", localReader, localVision });
    const frozen = new Map();
    for (const [name, expected] of Object.entries(plan.source_sha256)) {
      const bytes = await readFile(resolve(output, "source", name));
      assert.equal(digest(bytes), expected);
      if (name.startsWith("src/"))
        frozen.set(resolve(root, name).replaceAll("\\", "/"), {
          name,
          source: bytes.toString("utf8"),
        });
    }
    server = await createServer({
      root,
      configFile: false,
      appType: "custom",
      cacheDir: resolve(root, "node_modules/.vite-" + run + "-" + selected),
      server: {
        host: "127.0.0.1",
        port: 0,
        strictPort: false,
        hmr: false,
        fs: {
          deny: [
            "**/.env*",
            "**/.git/**",
            "**/qa-artifacts/**",
            "**/receipt_training/**",
            "**/private-receipts/**",
          ],
        },
        watch: {
          ignored: [
            "**/receipt_training/**",
            "**/qa-artifacts/**",
            "**/graphify-out/**",
          ],
        },
      },
      plugins: [
        {
          name: "frozen-native-source",
          enforce: "pre",
          load(id) {
            const source = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
            if (!source) return null;
            loadedHashes[source.name] = digest(source.source);
            return source.source;
          },
          configureServer(vite) {
            vite.middlewares.use(api);
            vite.middlewares.use((req, res, next) => {
              if (req.url !== "/__current_preparation") return next();
              res.setHeader("Content-Type", "text/html");
              res.end(
                "<!doctype html><title>Local original-receipt check</title><body>Private local extraction</body>",
              );
            });
          },
        },
      ],
    });
    await server.listen();
    const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
    browser = await chromium.launch({ channel: "chrome", headless: true });
    meta.browser = browser.version();
    const context = await browser.newContext({ serviceWorkers: "block" });
    const page = await context.newPage();
    const allowedPosts = new Set();
    let prepared = null;
    await page.route("**/*", (route) => {
      const request = route.request(),
        url = new URL(request.url());
      const allowed =
        url.origin === origin &&
        (request.method() === "GET" ||
          (request.method() === "POST" &&
            ["/api/receipts/recognize", "/api/receipts/vision"].includes(
              url.pathname,
            ) &&
            !allowedPosts.has(url.pathname)));
      if (!allowed) {
        meta.blocked_requests.push({
          origin: url.origin,
          path: url.pathname,
          method: request.method(),
        });
        return route.abort();
      }
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        assert.deepEqual(Object.keys(body), ["panels"]);
        const panels = body.panels.map(({ photo, part, data, ...extra }) => {
          assert.deepEqual(extra, {});
          return { photo, part, sha256: digest(Buffer.from(data, "base64")) };
        });
        if (prepared) assert.deepEqual(panels, prepared);
        else prepared = panels;
        allowedPosts.add(url.pathname);
      }
      return route.continue();
    });
    page.on("response", (response) => {
      if (response.request().method() !== "POST") return;
      const event = {
        path: new URL(response.url()).pathname,
        status: response.status(),
        at: new Date().toISOString(),
        request_sha256: digest(response.request().postData()),
      };
      meta.http.push(event);
      pending.push(
        (async () => {
          const bytes = await response.body();
          event.response_sha256 = digest(bytes);
          await writeFile(
            resolve(
              folder,
              event.path.endsWith("recognize")
                ? "ocr-response.json"
                : "vision-response.json",
            ),
            bytes,
            { flag: "wx" },
          );
        })(),
      );
    });
    await page.goto(origin + "/__current_preparation");
    const bytes = await readFile(
      resolve(root, "receipt_training", record.file_path),
    );
    assert.equal(digest(bytes), record.sha256);
    const result = await page.evaluate(
      async ({ encoded }) => {
        const { prepareImage, readingBlobs } =
          await import("/src/lib/images.ts");
        const { extractComparedReceipt } =
          await import("/src/lib/compared-reader.ts");
        const { extractWithLocalModel } =
          await import("/src/lib/local-model.ts");
        const { parseReceiptWithSources } = await import("/src/lib/parser.ts");
        const { calculateReceipt } = await import("/src/lib/engine.ts");
        const started = performance.now();
        const image = await prepareImage(
          new File(
            [Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))],
            "receipt.jpg",
            { type: "image/jpeg" },
          ),
        );
        const preparationMs = performance.now() - started;
        const panels = [];
        for (const blob of readingBlobs(image)) {
          const bitmap = await createImageBitmap(blob),
            bytes = new Uint8Array(await blob.arrayBuffer());
          let binary = "";
          for (let offset = 0; offset < bytes.length; offset += 16384)
            binary += String.fromCharCode(
              ...bytes.subarray(offset, offset + 16384),
            );
          panels.push({
            width: bitmap.width,
            height: bitmap.height,
            data: btoa(binary),
          });
          bitmap.close();
        }
        const progress = [],
          originalFetch = window.fetch.bind(window);
        let saved = null,
          requestBody = null,
          reference = false,
          cachedReads = 0;
        window.fetch = async (url, init) => {
          if (reference) {
            if (
              url !== "./api/receipts/recognize" ||
              init.body !== requestBody ||
              ++cachedReads !== 1
            )
              throw new Error("Invalid saved primary reference transport");
            return new Response(JSON.stringify(saved), {
              status: 200,
              headers: { "content-type": "application/json" },
            });
          }
          const response = await originalFetch(url, init);
          if (url === "./api/receipts/recognize" && response.ok) {
            saved = await response.clone().json();
            requestBody = init.body;
          }
          return response;
        };
        try {
          const reading = await extractComparedReceipt(
            [image],
            AbortSignal.timeout(270000),
            (status) =>
              progress.push({
                status,
                elapsed_ms: Math.round(performance.now() - started),
              }),
            undefined,
            "auto",
          );
          const elapsedMs = performance.now() - started;
          reference = true;
          const primary = await extractWithLocalModel(
            [image],
            new AbortController().signal,
            () => {},
          );
          const parsed = parseReceiptWithSources(primary);
          parsed.receipt.source = "ocr";
          parsed.receipt.warnings = [
            ...parsed.receipt.warnings,
            ...primary.warnings,
          ].slice(0, 60);
          return JSON.parse(
            JSON.stringify(
              {
                panels,
                progress,
                preparation_ms: Math.round(preparationMs),
                elapsed_ms: Math.round(elapsedMs),
                cached_reads: cachedReads,
                comparison_complete: reading.comparisonComplete,
                comparison_attempted: reading.comparisonAttempted,
                decision: reading.decision,
                auto: {
                  receipt: reading.receipt,
                  calculation: calculateReceipt(reading.receipt),
                },
                primary: {
                  receipt: parsed.receipt,
                  calculation: calculateReceipt(parsed.receipt),
                },
              },
              (_, value) => (typeof value === "bigint" ? String(value) : value),
            ),
          );
        } finally {
          window.fetch = originalFetch;
          URL.revokeObjectURL(image.url);
        }
      },
      { encoded: bytes.toString("base64") },
    );
    await Promise.all(pending);
    meta.primary_reference_saved_response_reads = result.cached_reads;
    for (const [index, panel] of result.panels.entries()) {
      assert(
        panel.width * panel.height <= 4_000_000 &&
          panel.width <= 3200 &&
          panel.height <= 3200,
      );
      const bytes = Buffer.from(panel.data, "base64");
      await writeFile(resolve(folder, `panel-${index + 1}.jpg`), bytes, {
        flag: "wx",
      });
      Object.assign(panel, { sha256: digest(bytes), bytes: bytes.length });
      delete panel.data;
    }
    assert.deepEqual(
      result.panels.map((panel, index) => ({
        photo: 1,
        part: index + 1,
        sha256: panel.sha256,
      })),
      prepared,
    );
    assert.deepEqual(meta.blocked_requests, []);
    meta.comparison_complete = result.comparison_complete;
    meta.elapsed_ms = result.elapsed_ms;
    meta.preparation_ms = result.preparation_ms;
    meta.panels = result.panels;
    meta.timing_scope =
      "Current image preparation plus actual local OCR/vision HTTP, cold reader startup/asset checks, deterministic browser verification and observation overhead. Warm OS/GPU caches and case order differ. Not shared-server throughput; comparison primary reference reuses the same OCR response and is excluded from elapsed time.";
    await writeJson(resolve(folder, "result.json"), result);
    if (!result.comparison_complete) process.exitCode = 1;
  } catch (error) {
    meta.error = String(error);
    process.exitCode = 1;
  } finally {
    await Promise.allSettled(pending);
    await browser?.close();
    await localReader?.dispose();
    await localVision?.dispose();
    await server?.close();
    meta.loaded_frozen_source_sha256 = loadedHashes;
    meta.completed_at = new Date().toISOString();
    await writeJson(resolve(folder, "metadata.json"), meta);
  }
}
