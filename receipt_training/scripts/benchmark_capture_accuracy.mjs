// Real app preparation and browser OCR, local-only, on preregistered photo frames.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [tag, planTag] = process.argv.slice(2);
assert([tag, planTag].every((name) => /^[\w-]+$/.test(name || "")));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const planBytes = await readFile(
  resolve(root, "qa-artifacts", planTag, "plan.json"),
);
const plan = JSON.parse(planBytes);
assert(plan.recorded_before_new_ocr && plan.cases.length === 4);
const inputHashes = {};
for (const [name, expected] of Object.entries(plan.input_sha256)) {
  const raw = await readFile(resolve(root, name));
  assert.equal(sha(raw), expected, name);
  inputHashes[name] = expected;
}
const frozen = new Map(),
  sources = {},
  loaded = {};
for (const name of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(name)) continue;
  const path = "src/lib/" + name,
    raw = await readFile(resolve(root, path));
  sources[path] = sha(raw);
  frozen.set(resolve(root, path).replaceAll("\\", "/"), { path, raw });
  await mkdir(dirname(resolve(out, "source", path)), { recursive: true });
  await writeFile(resolve(out, "source", path), raw, { flag: "wx" });
}
for (const path of [
  "src/ImageGeometry.tsx",
  "src/App.tsx",
  "package-lock.json",
]) {
  const raw = await readFile(resolve(root, path));
  sources[path] = sha(raw);
  await mkdir(dirname(resolve(out, "source", path)), { recursive: true });
  await writeFile(resolve(out, "source", path), raw, { flag: "wx" });
}
const self = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
await writeFile(resolve(out, "input-plan.json"), planBytes, { flag: "wx" });
const write = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  cacheDir: resolve(out, "vite-cache"),
  server: { host: "127.0.0.1", port: 0, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-capture-study",
      enforce: "pre",
      load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) return;
        loaded[file.path] = sha(file.raw);
        return file.raw.toString("utf8");
      },
      configureServer(service) {
        service.middlewares.use((req, res, next) => {
          if (req.url !== "/__capture_accuracy") return next();
          res.setHeader("content-type", "text/html");
          res.end(
            "<!doctype html><title>Local receipt capture measurement</title>",
          );
        });
      },
    },
  ],
});
let browser;
const results = [],
  requests = { writes: [], external: [] };
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
  const page = await context.newPage();
  await page.goto(origin + "/__capture_accuracy");
  for (const [index, entry] of plan.cases.entries()) {
    const record = entry.record;
    assert(
      record.external_processing_allowed === false &&
        record.split === "development",
    );
    const photos = [];
    for (const source of record.source_files || [record]) {
      const raw = await readFile(
        resolve(root, "receipt_training", source.file_path),
      );
      assert.equal(sha(raw), source.sha256);
      photos.push({
        data: raw.toString("base64"),
        sha256: source.sha256,
        type: /\.png$/i.test(source.file_path) ? "image/png" : "image/jpeg",
      });
    }
    const variants =
      index % 2
        ? ["original", "manual-straighten", "auto-crop"]
        : plan.variants;
    let original;
    for (const variant of variants) {
      const started = Date.now();
      const reading = await page.evaluate(
        async ({ photos, geometry, variant, currency }) => {
          const {
            prepareImage,
            cropImage,
            readingBlobs,
            planReadingWindows,
            inspectImage,
          } = await import("/src/lib/images.ts");
          const { suggestReceiptEdges } =
            await import("/src/lib/edge-preview.ts");
          const { straightenImage } =
            await import("/src/lib/geometry-client.ts");
          const { localOcrProvider } = await import("/src/lib/ocr.ts");
          const { parseReceiptWithSources } =
            await import("/src/lib/parser.ts");
          const { reviewDeviceReading } =
            await import("/src/lib/device-review.ts");
          const { requireCorrectedPhotoReview } =
            await import("/src/lib/capture-review.ts");
          const { calculateReceipt } = await import("/src/lib/engine.ts");
          const { collectReceiptEvidence } =
            await import("/src/lib/receipt-evidence.ts");
          const digest = async (blob) =>
            [
              ...new Uint8Array(
                await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()),
              ),
            ]
              .map((n) => n.toString(16).padStart(2, "0"))
              .join("");
          const images = [],
            preparations = [],
            frames = [];
          let changed = variant === "original";
          const begin = performance.now();
          try {
            for (const [index, photo] of photos.entries()) {
              const bytes = Uint8Array.from(atob(photo.data), (c) =>
                c.charCodeAt(0),
              );
              let image = await prepareImage(
                new File([bytes], `source-${index}`, { type: photo.type }),
              );
              images.push(image);
              const before = performance.now();
              let correction = null;
              if (variant === "auto-crop") {
                correction = await suggestReceiptEdges(
                  image.blob,
                  new AbortController().signal,
                );
                if (correction) {
                  image = await cropImage(image, correction.bounds);
                  changed = true;
                }
              } else if (variant === "manual-straighten" && geometry) {
                correction = geometry[index];
                const result = await straightenImage(
                  image,
                  correction,
                  new AbortController().signal,
                );
                image = {
                  ...image,
                  ocrBlob: result.preview,
                  panels: result.panels,
                  quality: result.quality,
                  geometry: correction,
                  crop: undefined,
                  readingWindows: planReadingWindows(
                    result.width,
                    result.height,
                    true,
                  ),
                };
                changed = true;
              }
              images[index] = image;
              if ((await digest(image.sourceBlob)) !== photo.sha256)
                throw new Error("Original photo changed");
              preparations.push({
                photo: index + 1,
                correction,
                correction_ms: performance.now() - before,
                quality: image.quality,
                windows: image.readingWindows,
              });
              for (const [part, blob] of readingBlobs(image).entries()) {
                const raw = new Uint8Array(await blob.arrayBuffer());
                const size = inspectImage(raw, blob.type, blob.size);
                let binary = "";
                for (let at = 0; at < raw.length; at += 32768)
                  binary += String.fromCharCode(
                    ...raw.subarray(at, at + 32768),
                  );
                frames.push({
                  photo: index + 1,
                  part: part + 1,
                  width: size.width,
                  height: size.height,
                  bytes: blob.size,
                  sha256: await digest(blob),
                  data: btoa(binary),
                });
              }
            }
            const preparation_ms = performance.now() - begin;
            if (!changed)
              return { abstained: true, preparations, preparation_ms };
            const scan = performance.now();
            const output = await localOcrProvider.extract(
              images,
              new AbortController().signal,
              () => {},
            );
            const reading_ms = performance.now() - scan;
            const predictions = [];
            for (const mode of ["automatic", "known-currency"]) {
              const parsed = parseReceiptWithSources(
                output,
                mode === "automatic" ? undefined : { currency },
              );
              parsed.receipt.source = "ocr";
              parsed.receipt.warnings = [
                ...parsed.receipt.warnings,
                ...(output.warnings || []),
              ].slice(0, 60);
              const reviewed = reviewDeviceReading(
                parsed.receipt,
                parsed.sources,
                output.sourceLines || [],
                output.recognition,
                parsed.fieldSources,
                output.sourceConflicts,
                output.joinedSectionRows,
              );
              const receipt = requireCorrectedPhotoReview(
                reviewed,
                images.some((image) => !!image.geometry),
              );
              const evidence = collectReceiptEvidence(
                receipt,
                output.text,
                parsed.sources,
                output.sourceLines || [],
                output.recognition,
                images,
                parsed.fieldSources,
                output.sourceAlternatives,
              );
              predictions.push({
                mode,
                ...parsed,
                receipt,
                calculation: calculateReceipt(receipt),
                source_summary: {
                  items_with_regions: Object.keys(evidence?.items || {}).length,
                  fields_with_regions: Object.keys(evidence?.fields || {}),
                },
              });
            }
            return JSON.parse(
              JSON.stringify(
                {
                  output,
                  predictions,
                  preparations,
                  frames,
                  preparation_ms,
                  reading_ms,
                  elapsed_ms: performance.now() - begin,
                  abstained: false,
                },
                (_, value) =>
                  typeof value === "bigint" ? String(value) : value,
              ),
            );
          } catch (error) {
            return {
              error: String(error).slice(0, 500),
              preparations,
              elapsed_ms: performance.now() - begin,
            };
          } finally {
            for (const image of images) URL.revokeObjectURL(image.url);
          }
        },
        {
          photos,
          geometry: entry.geometry,
          variant,
          currency: { GB: "GBP", ID: "IDR", TW: "TWD" }[record.country],
        },
      );
      if (reading.abstained) {
        assert(original);
        reading.predictions = original.predictions;
        reading.output = original.output;
        reading.reused_original = true;
        reading.new_ocr_sections = 0;
      } else
        reading.new_ocr_sections = reading.output?.rawSections?.length || 0;
      if (variant === "original") original = reading;
      for (const frame of reading.frames || []) {
        const name = `${record.receipt_id}-${variant}-photo-${frame.photo}-part-${frame.part}.jpg`;
        const raw = Buffer.from(frame.data, "base64");
        assert.equal(sha(raw), frame.sha256);
        await writeFile(resolve(out, name), raw, { flag: "wx" });
        delete frame.data;
        frame.path = `qa-artifacts/${tag}/${name}`;
      }
      const result = {
        receipt_id: record.receipt_id,
        image_sha256: record.sha256,
        variant,
        wall_ms: Date.now() - started,
        ...reading,
      };
      results.push(result);
      await write(`${record.receipt_id}-${variant}.json`, result);
      console.log(
        JSON.stringify({
          id: record.receipt_id,
          variant,
          error: result.error || null,
          abstained: !!result.abstained,
          ocr_sections: result.new_ocr_sections,
          products: result.predictions?.[0].receipt.items.length,
        }),
      );
    }
  }
  assert.deepEqual(requests, { writes: [], external: [] });
  const unchanged = (
    await Promise.all(
      Object.entries(sources).map(
        async ([name, expected]) =>
          sha(await readFile(resolve(root, name))) === expected,
      ),
    )
  ).every(Boolean);
  assert(unchanged);
  await write("metadata.json", {
    source_sha256: sources,
    loaded_frozen_source_sha256: loaded,
    input_sha256: inputHashes,
    input_plan_sha256: sha(planBytes),
    runner_sha256: sha(self),
    browser: browser.version(),
    source_unchanged: unchanged,
    cases: results.map(
      ({
        receipt_id,
        variant,
        error,
        abstained,
        reused_original,
        new_ocr_sections,
        elapsed_ms,
      }) => ({
        receipt_id,
        variant,
        error: error || null,
        abstained: !!abstained,
        reused_original: !!reused_original,
        new_ocr_sections,
        elapsed_ms,
      }),
    ),
    actual_ocr_sections: results.reduce(
      (sum, result) => sum + result.new_ocr_sections,
      0,
    ),
    requests,
    completed_at: new Date().toISOString(),
    physical_phone: false,
    model_api_calls: 0,
    automatic_retries: 0,
    scope:
      "Actual browser app helpers/owned workers and English Tesseract on four preregistered familiar development transactions. This internal harness is not a full UI click journey, blind holdout or geometry-only causal experiment. Original and no-correction reuse are explicit; supplied currency context is applied after extraction only.",
    timing_scope:
      "Per-option validated preparation/correction, local OCR, parsing/source checks and evidence. Fresh worker per receipt; shared browser asset cache. Different panel counts/contrast/resolution are part of the options; not controlled reader/model speed or handset performance.",
  });
  if (results.some((row) => row.error)) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
