// Isolated official SDK. Local synthetic/capture inputs, no app API/env.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build, createServer, preview } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [tag, planTag] = process.argv.slice(2);
assert([tag, planTag].every((t) => /^[\w-]+$/.test(t || "")));
const captureIndex = process.argv.indexOf("--capture-study");
const captureTag = captureIndex < 0 ? null : process.argv[captureIndex + 1];
assert(captureTag === null || captureTag === "genuine-capture-read-v1");
const cohortIndex = process.argv.indexOf("--cohort-plan");
const cohortTag = cohortIndex < 0 ? null : process.argv[cohortIndex + 1];
assert(cohortTag === null || /^[\w-]+$/.test(cohortTag));
const studyIndex = process.argv.indexOf("--medium-study");
const studyTag = studyIndex < 0 ? null : process.argv[studyIndex + 1];
assert(
  studyTag === null || studyTag === "browser-paddle-medium-paired-plan-v1",
);
assert([captureTag, cohortTag, studyTag].filter(Boolean).length <= 1);
const production = process.argv.includes("--production");
assert(
  !production || !(captureTag || cohortTag || studyTag),
  "First production trial is synthetic only",
);
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const planPath = `qa-artifacts/${planTag}/plan.json`;
const raw = await readFile(resolve(root, planPath)),
  plan = JSON.parse(raw);
for (const model of plan.models)
  assert.equal(sha(await readFile(resolve(root, model.path))), model.sha256);
const env = resolve(
  root,
  "receipt_training/.cache/browser-paddle-sdk-v1/node_modules",
);
const sdk = resolve(env, "@paddleocr/paddleocr-js/dist/index.mjs");
const served = new Map(
  plan.models.map((model, i) => [
    `/models/${i}.tar`,
    resolve(root, model.path),
  ]),
);
for (const name of await readdir(resolve(env, "onnxruntime-web/dist")))
  if (/^[\w.-]+\.(wasm|mjs)$/.test(name))
    served.set("/ort/" + name, resolve(env, "onnxruntime-web/dist", name));
const write = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const inputs = { [planPath]: sha(raw) };
async function input(path, expected) {
  assert(!path.includes("..") && !path.startsWith("/") && !path.includes(":"));
  const bytes = await readFile(resolve(root, path));
  if (expected) assert.equal(sha(bytes), expected, path);
  inputs[path] = sha(bytes);
  return bytes;
}
const captureCases = [];
if (captureTag) {
  assert(plan.models.every((model) => model.name.startsWith("PP-OCRv6_tiny_")));
  const source = `qa-artifacts/${captureTag}`;
  const metadata = JSON.parse(await input(`${source}/metadata.json`));
  for (const entry of metadata.cases.filter((c) => c.variant === "original")) {
    assert(/^[\w-]+$/.test(entry.receipt_id));
    const prepared = JSON.parse(
      await input(`${source}/${entry.receipt_id}-original.json`),
    );
    assert(!prepared.error && !prepared.reused_original);
    for (const frame of prepared.frames) {
      assert(frame.path.startsWith(source + "/"));
      assert(frame.width * frame.height <= 4_000_000);
      assert(frame.width <= 4000 && frame.height <= 4000);
      const bytes = await input(frame.path, frame.sha256);
      assert.equal(bytes.length, frame.bytes);
      assert(bytes.length <= 6 * 1024 * 1024);
    }
    captureCases.push({
      receipt_id: prepared.receipt_id,
      image_sha256: prepared.image_sha256,
      frames: prepared.frames,
    });
  }
  assert.equal(captureCases.length, 4);
  assert.equal(
    captureCases.reduce((n, c) => n + c.frames.length, 0),
    5,
  );
  await write("capture-input.json", { source, cases: captureCases });
}
if (cohortTag) {
  assert(plan.models.every((model) => model.name.startsWith("PP-OCRv6_tiny_")));
  const source = `qa-artifacts/${cohortTag}`;
  const cohort = JSON.parse(await input(source + "/capture-input.json"));
  assert(cohort.paired_encoded_hashes_match && cohort.cases.length === 50);
  for (const entry of cohort.cases) {
    assert(/^[\w-]+$/.test(entry.receipt_id));
    for (const frame of entry.frames) {
      assert(frame.path.startsWith(source + "/"));
      assert(
        frame.width * frame.height <= 4_000_000 &&
          frame.width <= 4000 &&
          frame.height <= 4000,
      );
      const bytes = await input(frame.path, frame.sha256);
      assert.equal(bytes.length, frame.bytes);
      assert(bytes.length <= 6 * 1024 * 1024);
    }
    captureCases.push(entry);
  }
  await write("capture-input.json", { source, cases: captureCases });
}
if (studyTag) {
  const source = `qa-artifacts/${studyTag}`;
  const study = JSON.parse(await input(source + "/study-plan.json"));
  assert.equal(study.study_id, "browser-paddle-medium-paired-v1");
  const arm = study.models.find((m) => m.plan_path === planPath);
  assert(arm && arm.plan_sha256 === sha(raw));
  assert.deepEqual(
    plan.models.map((m) => m.name),
    [`PP-OCRv6_${arm.size}_det`, `PP-OCRv6_${arm.size}_rec`],
  );
  assert.equal(study.cases.length, 7);
  assert.equal(
    study.cases.reduce((n, c) => n + c.frames.length, 0),
    8,
  );
  for (const entry of study.cases) {
    assert(/^[\w-]+$/.test(entry.receipt_id));
    for (const frame of entry.frames) {
      assert(frame.path.startsWith("qa-artifacts/"));
      assert(frame.width * frame.height <= 4_000_000);
      assert(frame.width <= 4000 && frame.height <= 4000);
      const bytes = await input(frame.path, frame.sha256);
      assert.equal(bytes.length, frame.bytes);
      assert(bytes.length <= 6 * 1024 * 1024);
    }
    // Only image metadata reaches prediction; no labels or previous OCR.
    captureCases.push({
      receipt_id: entry.receipt_id,
      image_sha256: entry.image_sha256,
      frames: entry.frames,
    });
  }
  await write("capture-input.json", { source, cases: captureCases });
}
const dependencyLock = await input(
  "receipt_training/.cache/browser-paddle-sdk-v1/package-lock.json",
);
await writeFile(resolve(out, "dependency-lock.json"), dependencyLock, {
  flag: "wx",
});
await writeFile(
  resolve(out, "runner.mjs"),
  await readFile(fileURLToPath(import.meta.url)),
  { flag: "wx" },
);
await write("starting.json", {
  pid: process.pid,
  started_at: new Date().toISOString(),
  plan_path: planPath,
  plan_sha256: sha(raw),
  synthetic_only: !(captureTag || cohortTag || studyTag),
  capture_source: captureTag || cohortTag || studyTag,
  production_bundle: production,
  input_sha256: inputs,
});
console.log(JSON.stringify({ started: tag, pid: process.pid }));
if (process.argv.includes("--await-observer")) {
  const deadline = Date.now() + 60000;
  while (true) {
    try {
      await readFile(resolve(out, "observer-ready.json"));
      break;
    } catch {}
    assert(Date.now() < deadline, "Memory observer was not started");
    await new Promise((done) => setTimeout(done, 100));
  }
}
const settings = {
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  cacheDir: resolve(out, "vite-cache"),
  resolve: {
    alias: {
      "@probe-paddle": sdk,
      "@techstark/opencv-js": resolve(
        env,
        "@techstark/opencv-js/dist/opencv.js",
      ),
      "js-yaml": resolve(env, "js-yaml/dist/js-yaml.mjs"),
      "clipper-lib": resolve(env, "clipper-lib/clipper.js"),
    },
  },
  optimizeDeps: {
    exclude: ["@probe-paddle"],
    include: ["@techstark/opencv-js", "clipper-lib"],
  },
  server: {
    host: "127.0.0.1",
    port: 0,
    hmr: false,
    watch: null,
    fs: { deny: ["**/.env*", "**/.git/**"] },
  },
  plugins: [
    {
      name: "local-sdk-probe",
      configureServer(service) {
        service.middlewares.use(async (req, res, next) => {
          if (req.url === "/__paddle_probe") {
            res.setHeader("content-type", "text/html");
            res.end(
              "<!doctype html><title>Local browser OCR compatibility</title>",
            );
            return;
          }
          const path = served.get((req.url || "").split("?")[0]);
          if (!path) return next();
          if (!["GET", "HEAD"].includes(req.method)) {
            res.statusCode = 405;
            res.end();
            return;
          }
          const info = await stat(path);
          res.setHeader("content-length", info.size);
          res.setHeader(
            "content-type",
            path.endsWith(".wasm")
              ? "application/wasm"
              : path.endsWith(".mjs")
                ? "application/javascript"
                : "application/x-tar",
          );
          if (req.method === "HEAD") res.end();
          else createReadStream(path).pipe(res);
        });
      },
    },
  ],
};
let server;
let entry = "/__paddle_probe";
if (production) {
  settings.plugins[0].configurePreviewServer =
    settings.plugins[0].configureServer;
  const html = resolve(out, "production-probe.html");
  await writeFile(
    html,
    '<!doctype html><title>Production browser OCR compatibility</title><script type="module" src="./production-entry.mjs"></script>',
    { flag: "wx" },
  );
  await writeFile(
    resolve(out, "production-entry.mjs"),
    'import { PaddleOCR } from "@probe-paddle"; globalThis.__paddleFactory = PaddleOCR;\n',
    { flag: "wx" },
  );
  const bundle = resolve(out, "bundle");
  await build({
    ...settings,
    publicDir: false,
    build: {
      outDir: bundle,
      emptyOutDir: false,
      assetsInlineLimit: 0,
      reportCompressedSize: false,
      rollupOptions: { input: html },
    },
  });
  const emitted = {};
  async function list(dir, prefix = "") {
    for (const file of await readdir(dir, { withFileTypes: true })) {
      const name = prefix + file.name,
        path = resolve(dir, file.name);
      if (file.isDirectory()) await list(path, name + "/");
      else {
        const bytes = await readFile(path);
        emitted[name] = { bytes: bytes.length, sha256: sha(bytes) };
      }
    }
  }
  await list(bundle);
  await write("production-bundle.json", {
    emitted,
    scope:
      "Isolated production build of official SDK entry and its workers. Static model/WASM assets remain exact same local allowlist; no root dependency or app changes.",
  });
  const service = await preview({
    ...settings,
    publicDir: false,
    build: { outDir: bundle },
    preview: { host: "127.0.0.1", port: 0, strictPort: true },
  });
  server = {
    httpServer: service.httpServer,
    listen: async () => {},
    close: () =>
      new Promise((done, reject) =>
        service.httpServer.close((error) => (error ? reject(error) : done())),
      ),
  };
  entry = `/qa-artifacts/${tag}/production-probe.html`;
} else server = await createServer(settings);
let browser;
const requests = { external: [], writes: [], reads: [] },
  errors = [];
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.route("**/*", (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.origin !== origin) {
      requests.external.push(url.origin);
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(request.method())) {
      requests.writes.push(url.pathname);
      return route.abort();
    }
    requests.reads.push(url.pathname);
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 500)));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 500));
  });
  await page.goto(origin + entry);
  if (production)
    await page.waitForFunction(() => !!globalThis.__paddleFactory);
  await write("phase.json", {
    phase: "sdk-import-initialize",
    entered_at: new Date().toISOString(),
  });
  const result = await page.evaluate(
    async ({ sdkUrl, modelNames }) => {
      let ocr;
      const started = performance.now();
      try {
        const PaddleOCR =
          globalThis.__paddleFactory ||
          (await import(/* @vite-ignore */ sdkUrl)).PaddleOCR;
        ocr = await PaddleOCR.create({
          worker: true,
          textDetectionModelName: modelNames[0],
          textRecognitionModelName: modelNames[1],
          textDetectionModelAsset: { url: "/models/0.tar" },
          textRecognitionModelAsset: { url: "/models/1.tar" },
          textDetectionBatchSize: 1,
          textRecognitionBatchSize: 1,
          ortOptions: {
            backend: "wasm",
            numThreads: 1,
            simd: true,
            wasmPaths: new URL("/ort/", location.origin).href,
          },
        });
        const initialized_ms = performance.now() - started;
        const canvas = document.createElement("canvas");
        canvas.width = 700;
        canvas.height = 600;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "white";
        ctx.fillRect(0, 0, 700, 600);
        ctx.fillStyle = "black";
        ctx.font = "30px monospace";
        for (const [text, y] of [
          ["BROWSER TEST MARKET", 70],
          ["Currency GBP", 125],
          ["Soup 2x 1.25 2.50", 215],
          ["Rice 1x 3.50 3.50", 295],
          ["TOTAL GBP 6.00", 405],
          ["PRICES INCLUDE TAX", 475],
        ])
          ctx.fillText(text, 30, y);
        const input = await new Promise((done) =>
          canvas.toBlob(done, "image/png"),
        );
        const reading = await ocr.predict(input, {
          textDetLimitSideLen: 960,
          textDetLimitType: "max",
        });
        return {
          initialized_ms,
          elapsed_ms: performance.now() - started,
          initialization: ocr.getInitializationSummary(),
          reading,
          synthetic: canvas.toDataURL("image/png").split(",")[1],
        };
      } catch (error) {
        return {
          error: String(error).slice(0, 2000),
          elapsed_ms: performance.now() - started,
        };
      } finally {
        // Retained only for this owned local benchmark; disposed below.
        globalThis.__probeOcr = ocr;
      }
    },
    {
      sdkUrl: "/@fs/" + sdk.replaceAll("\\", "/"),
      modelNames: plan.models.map((m) => m.name),
    },
  );
  if (result.synthetic) {
    const bytes = Buffer.from(result.synthetic, "base64");
    await writeFile(resolve(out, "synthetic.png"), bytes, { flag: "wx" });
    result.synthetic_sha256 = sha(bytes);
    delete result.synthetic;
  }
  await write("result.json", {
    ...result,
    errors,
    requests,
    browser: browser.version(),
    model_downloads: 0,
    receipt_uploads: 0,
    synthetic_only: true,
    production_bundle: production,
    initialization_timing_scope: production
      ? "SDK entry preloaded by production page; SDK import/page load excluded from initialized_ms. Whole guarded runtime includes build and browser startup."
      : "Dynamic import plus SDK initialization; no build in runtime.",
    completed_at: new Date().toISOString(),
  });
  console.log(
    JSON.stringify({
      error: result.error || null,
      elapsed_ms: result.elapsed_ms,
      rows: result.reading?.[0]?.items?.length,
      external_attempts: requests.external.length,
    }),
  );
  if (result.error) process.exitCode = 1;
  else if (captureTag || cohortTag || studyTag) {
    assert.equal(result.reading?.length, 1);
    assert.deepEqual(
      result.reading[0].items.map((item) => item.text),
      [
        "BROWSER TEST MARKET",
        "Currency GBP",
        "Soup 2x 1.25 2.50",
        "Rice 1x 3.50 3.50",
        "TOTAL GBP 6.00",
        "PRICES INCLUDE TAX",
      ],
      "Synthetic compatibility gate failed; private inputs were not read by SDK",
    );
    const cases = [];
    for (const entry of captureCases) {
      const panels = [],
        started = performance.now();
      let error = null;
      for (const frame of entry.frames) {
        const bytes = await input(frame.path, frame.sha256);
        const predicted = await page.evaluate(
          async ({ data, width, height }) => {
            const started = performance.now();
            try {
              const input = new Blob(
                [Uint8Array.from(atob(data), (c) => c.charCodeAt(0))],
                { type: "image/jpeg" },
              );
              const decoded = await createImageBitmap(input);
              const matches =
                decoded.width === width && decoded.height === height;
              decoded.close();
              if (!matches)
                throw new Error("Decoded dimensions differ from frozen input");
              const reading = await globalThis.__probeOcr.predict(input, {
                textDetLimitSideLen: 960,
                textDetLimitType: "max",
              });
              return { reading, elapsed_ms: performance.now() - started };
            } catch (error) {
              return {
                error: String(error).slice(0, 2000),
                elapsed_ms: performance.now() - started,
              };
            }
          },
          {
            data: bytes.toString("base64"),
            width: frame.width,
            height: frame.height,
          },
        );
        const filename = `${entry.receipt_id}-photo-${frame.photo}-part-${frame.part}.json`;
        await write(filename, { frame, ...predicted });
        panels.push({
          frame,
          result: filename,
          result_sha256: sha(await readFile(resolve(out, filename))),
        });
        console.log(
          JSON.stringify({
            receipt_id: entry.receipt_id,
            photo: frame.photo,
            part: frame.part,
            elapsed_ms: predicted.elapsed_ms,
            regions: predicted.reading?.[0]?.items?.length,
            error: predicted.error || null,
          }),
        );
        if (predicted.error) {
          error = predicted.error;
          break;
        }
      }
      cases.push({
        ...entry,
        panels,
        error,
        elapsed_ms: performance.now() - started,
      });
      await write(`${entry.receipt_id}.json`, cases.at(-1));
      if (error) {
        process.exitCode = 1;
        break;
      }
    }
    await write("capture-results.json", {
      cases,
      input_sha256: inputs,
      errors,
      requests,
      engine:
        plan.models[0].name === "PP-OCRv6_medium_det"
          ? "paddle-ppocrv6-medium-browser-wasm"
          : "paddle-ppocrv6-tiny-browser-wasm",
      sdk_version: "0.4.2",
      ort_version: "1.31.1",
      browser: browser.version(),
      initialization: result.initialization,
      initialized_ms: result.initialized_ms,
      parameters: {
        backend: "wasm",
        numThreads: 1,
        detLimitSideLen: 960,
        detLimitType: "max",
      },
      scope:
        "Fixed familiar receipt cohort, unchanged prepared original JPEG hashes checked against paired reader inputs. Warm local browser worker after synthetic compatibility check. No labels or currency hints supplied to recognizer. Not a phone/Safari test, provider promotion or complete upload-to-split journey.",
      external_receipt_uploads: 0,
      external_model_downloads_during_probe: 0,
      completed_at: new Date().toISOString(),
    });
  }
  await page.evaluate(async () => {
    await globalThis.__probeOcr?.dispose();
    delete globalThis.__probeOcr;
  });
} catch (error) {
  await write("failure.json", {
    error: String(error).slice(0, 2000),
    errors,
    requests,
    production_bundle: production,
    completed_at: new Date().toISOString(),
  });
  throw error;
} finally {
  await browser?.close();
  await server.close();
}
