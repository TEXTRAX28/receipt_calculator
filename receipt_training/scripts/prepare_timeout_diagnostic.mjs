// Current two-photo pixels and production model contract; diagnostics only.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { z } from "zod";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
await mkdir(resolve(out, "source"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const hashes = {},
  frozen = new Map(),
  loaded = {},
  blocked = [];
for (const name of (await readdir(resolve(root, "src/lib"))).filter((name) =>
  /\.(ts|mjs)$/.test(name),
)) {
  const path = "src/lib/" + name,
    bytes = await readFile(resolve(root, path));
  hashes[path] = sha(bytes);
  frozen.set(resolve(root, path).replaceAll("\\", "/"), {
    path,
    text: bytes.toString("utf8"),
  });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
}
for (const path of [
  "package-lock.json",
  "server/extraction-instructions.mjs",
  "server/local-vision.mjs",
  "receipt_training/scripts/prepare_timeout_diagnostic.mjs",
  "receipt_training/scripts/benchmark_vision_cli.py",
  "receipt_training/scripts/vision_cli_text.py",
  "receipt_training/evaluation/vision-candidate-manifest.json",
  "receipt_training/annotations/private/supplement-manifest.jsonl",
]) {
  const bytes = await readFile(resolve(root, path));
  hashes[path] = sha(bytes);
  const target = resolve(out, "runtime-source", path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
const record = (
  await readFile(
    resolve(
      root,
      "receipt_training/annotations/private/supplement-manifest.jsonl",
    ),
    "utf8",
  )
)
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse)
  .find((row) => row.receipt_id === "supplement-user-uk-20261026-group");
assert(
  record &&
    record.external_processing_allowed === false &&
    record.source_files.length === 2,
);
const inputs = [];
for (const source of record.source_files) {
  const bytes = await readFile(
    resolve(root, "receipt_training", source.file_path),
  );
  assert.equal(sha(bytes), source.sha256);
  inputs.push(bytes.toString("base64"));
}
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  cacheDir: resolve(root, "node_modules/.vite-" + run),
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
    watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
  },
  plugins: [
    {
      name: "frozen-timeout-source",
      enforce: "pre",
      load(id) {
        const source = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!source) return null;
        loaded[source.path] = sha(source.text);
        return source.text;
      },
      configureServer(vite) {
        vite.middlewares.use((req, res, next) => {
          if (req.url !== "/__prepare") return next();
          res.setHeader("Content-Type", "text/html");
          res.end("<!doctype html><title>Private local preparation</title>");
        });
      },
    },
  ],
});
let browser;
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  await page.route("**/*", (route) => {
    const req = route.request();
    if (new URL(req.url()).origin === origin && req.method() === "GET")
      return route.continue();
    blocked.push({ method: req.method(), origin: new URL(req.url()).origin });
    return route.abort();
  });
  await page.goto(origin + "/__prepare");
  const panels = await page.evaluate(async (inputs) => {
    const { prepareImage, readingBlobs } = await import("/src/lib/images.ts");
    const panels = [];
    for (const [photo, encoded] of inputs.entries()) {
      const image = await prepareImage(
        new File(
          [Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0))],
          "receipt.jpg",
          { type: "image/jpeg" },
        ),
      );
      for (const [part, blob] of readingBlobs(image).entries()) {
        const bitmap = await createImageBitmap(blob),
          bytes = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 16384)
          binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 16384),
          );
        panels.push({
          photo: photo + 1,
          part: part + 1,
          width: bitmap.width,
          height: bitmap.height,
          data: btoa(binary),
        });
        bitmap.close();
      }
      URL.revokeObjectURL(image.url);
    }
    return panels;
  }, inputs);
  assert.equal(panels.length, 2);
  assert.deepEqual(blocked, []);
  for (const [index, panel] of panels.entries()) {
    const bytes = Buffer.from(panel.data, "base64");
    assert(panel.width * panel.height <= 4_000_000);
    await writeFile(resolve(out, `panel-${index + 1}.jpg`), bytes, {
      flag: "wx",
    });
    panel.path = relative(
      root,
      resolve(out, `panel-${index + 1}.jpg`),
    ).replaceAll("\\", "/");
    panel.sha256 = sha(bytes);
    delete panel.data;
  }
  const schema = z.toJSONSchema(aiReceiptSchema);
  schema.properties.items.items.properties.note = { type: "string", const: "" };
  schema.properties.warnings.maxItems = 4;
  const request = {
    images: panels.map((panel) => panel.path),
    schema,
    prompt:
      RECEIPT_INSTRUCTIONS +
      panels
        .map(
          (panel, index) =>
            `\nImage ${index + 1} is original photo ${panel.photo}, detail panel ${panel.part}.`,
        )
        .join(""),
    context: 8192,
    max_tokens: 4000,
    image_tokens: 1536,
    gpu_layers: "auto",
    require_clean_schema: true,
    verbose: true,
  };
  await writeFile(
    resolve(out, "request.json"),
    JSON.stringify(request, null, 2),
    { flag: "wx" },
  );
  await writeFile(
    resolve(out, "plan.json"),
    JSON.stringify(
      {
        scope:
          "One same-source current two-photo diagnostic, no annotations or OCR supplied. Production model/prompt/schema/budgets; verbose logging and a research-only 180-second CLI limit differ. The app's 120-second limits stay unchanged. A diagnostic success does not prove current app success.",
        source_sha256: hashes,
        loaded_source_sha256: loaded,
        record,
        panels,
        browser: browser.version(),
        blocked_requests: blocked,
        request_sha256: sha(await readFile(resolve(out, "request.json"))),
        sealed_at: new Date().toISOString(),
        cloud_requests: 0,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      run,
      panels: panels.map(({ width, height }) => ({ width, height })),
      cloud_requests: 0,
    }),
  );
} finally {
  await browser?.close();
  await server.close();
}
