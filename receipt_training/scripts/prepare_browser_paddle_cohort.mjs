// Original fifty, current app preparation, paired Tesseract encoded image hashes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
assert(/^[\w-]+$/.test(tag || ""));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const hashes = {};
async function read(name, expected) {
  const raw = await readFile(resolve(root, name));
  if (expected) assert.equal(sha(raw), expected, name);
  hashes[name] = sha(raw);
  return raw;
}
const rows = (raw) =>
  raw.toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
const manifest = rows(await read("receipt_training/manifest.jsonl"));
const records = manifest.filter(
  (r) => r.real_receipt && r.included_in_pilot !== false,
);
assert.equal(records.length, 50);
const paired = rows(
  await read(
    "receipt_training/evaluation/runs/tesseract-source-original50-v4/paired.jsonl",
  ),
);
assert.equal(paired.length, 50);
const frozenSource = "qa-artifacts/genuine-capture-read-v1";
const frozenMeta = JSON.parse(await read(frozenSource + "/metadata.json"));
const frozen = new Map(),
  loaded = {};
for (const [path, expected] of Object.entries(frozenMeta.source_sha256)) {
  const raw = await read(frozenSource + "/source/" + path, expected);
  assert.equal(
    sha(await read(path)),
    expected,
    "App changed since comparison snapshot",
  );
  frozen.set(resolve(root, path).replaceAll("\\", "/"), { path, raw });
}
const write = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
await writeFile(
  resolve(out, "runner.mjs"),
  await readFile(fileURLToPath(import.meta.url)),
  { flag: "wx" },
);
await write("preregistered.json", {
  recorded_at: new Date().toISOString(),
  records: records.map((r) => r.receipt_id),
  sdk_version: "0.4.2",
  models: "PP-OCRv6_tiny_det + PP-OCRv6_tiny_rec",
  parameters: { backend: "wasm", threads: 1, detector_max_side: 960 },
  scope:
    "Original fifty, unchanged v5 truth/scorer; current original-image preparation, no cropping/deskewing or OCR tuning. Same country context modes applied only after extraction. Familiar development/evaluation splits, not a new blind holdout. No private external upload.",
});
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  logLevel: "error",
  cacheDir: resolve(out, "vite-cache"),
  server: {
    host: "127.0.0.1",
    port: 0,
    hmr: false,
    watch: null,
    fs: { deny: ["**/.env*", "**/.git/**"] },
  },
  plugins: [
    {
      name: "frozen-original50-preparation",
      enforce: "pre",
      load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) return;
        loaded[file.path] = sha(file.raw);
        return file.raw.toString("utf8");
      },
      configureServer(service) {
        service.middlewares.use((req, res, next) => {
          if (req.url !== "/__prepare50") return next();
          res.setHeader("content-type", "text/html");
          res.end("<!doctype html><title>Local receipt preparation</title>");
        });
      },
    },
  ],
});
let browser;
const cases = [],
  requests = { writes: [], external: [] },
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
    const r = route.request(),
      url = new URL(r.url());
    if (url.origin !== origin) {
      requests.external.push(url.origin);
      return route.abort();
    }
    if (!["GET", "HEAD"].includes(r.method())) {
      requests.writes.push(url.pathname);
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(String(error).slice(0, 500)));
  await page.goto(origin + "/__prepare50");
  for (const record of records) {
    const raw = await read(
      "receipt_training/" + record.file_path,
      record.sha256,
    );
    const prepared = await page.evaluate(
      async ({ data, type }) => {
        const { prepareImage, readingBlobs, inspectImage } =
          await import("/src/lib/images.ts");
        const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
        const image = await prepareImage(
          new File([bytes], "local-source", { type }),
        );
        try {
          const frames = [];
          for (const [i, blob] of readingBlobs(image).entries()) {
            const raw = new Uint8Array(await blob.arrayBuffer());
            const size = inspectImage(raw, blob.type, blob.size);
            let binary = "";
            for (let n = 0; n < raw.length; n += 32768)
              binary += String.fromCharCode(...raw.subarray(n, n + 32768));
            frames.push({
              photo: 1,
              part: i + 1,
              width: size.width,
              height: size.height,
              bytes: blob.size,
              data: btoa(binary),
            });
          }
          return {
            frames,
            windows: image.readingWindows,
            quality: image.quality,
          };
        } finally {
          URL.revokeObjectURL(image.url);
        }
      },
      {
        data: raw.toString("base64"),
        type: /\.webp$/i.test(record.file_path)
          ? "image/webp"
          : /\.png$/i.test(record.file_path)
            ? "image/png"
            : "image/jpeg",
      },
    );
    const previous = paired.find((r) => r.receipt_id === record.receipt_id);
    assert(previous && previous.image_sha256 === record.sha256);
    assert.equal(prepared.frames.length, previous.after.panels.length);
    const frames = [];
    for (const [index, { data, ...frame }] of prepared.frames.entries()) {
      assert(frame.width * frame.height <= 4_000_000);
      const bytes = Buffer.from(data, "base64"),
        digest = sha(bytes);
      assert.equal(
        digest,
        previous.after.panels[index].sha256,
        "Fresh preparation differs from paired Tesseract pixels",
      );
      const name = `${record.receipt_id}-photo-1-part-${frame.part}.jpg`;
      await writeFile(resolve(out, name), bytes, { flag: "wx" });
      frames.push({
        ...frame,
        sha256: digest,
        path: `qa-artifacts/${tag}/${name}`,
      });
    }
    cases.push({
      receipt_id: record.receipt_id,
      image_sha256: record.sha256,
      frames,
      preparations: [
        { photo: 1, windows: prepared.windows, quality: prepared.quality },
      ],
    });
    console.log(
      JSON.stringify({
        prepared: cases.length,
        id: record.receipt_id,
        panels: frames.length,
      }),
    );
  }
  assert.equal(cases.length, 50);
  assert.deepEqual(requests, { writes: [], external: [] });
  assert.equal(errors.length, 0);
  await write("input-plan.json", {
    cases: records.map((record) => ({ record })),
    variants: ["original"],
    input_sha256: hashes,
  });
  await write("capture-input.json", {
    source: `qa-artifacts/${tag}`,
    cases,
    source_sha256: frozenMeta.source_sha256,
    input_sha256: hashes,
    paired_encoded_hashes_match: true,
    browser: browser.version(),
    loaded_frozen_source_sha256: loaded,
    requests,
    errors,
    completed_at: new Date().toISOString(),
  });
} finally {
  await browser?.close();
  await server.close();
}
