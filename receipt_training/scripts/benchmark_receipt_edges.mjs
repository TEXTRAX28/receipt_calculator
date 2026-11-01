// Local, frozen-code geometry study. No OCR/model call, key loading or upload.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
const pipeline = process.argv.includes("--pipeline");
if (!tag || !/^[a-z0-9-]{1,80}$/.test(tag))
  throw new Error("Choose a new study name");
const out = resolve(root, "qa-artifacts", tag);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const manifestBytes = await readFile(
  resolve(root, "receipt_training/manifest.jsonl"),
);
const entries = manifestBytes
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse)
  .filter((row) => row.real_receipt && row.file_path)
  .map((row) => ({
    id: row.receipt_id,
    path: resolve(root, "receipt_training", row.file_path),
    sha256: row.sha256,
    split: row.split,
  }));
for (const [id, path] of [
  [
    "user-original-totals",
    "C:/Users/natan/Downloads/WhatsApp Image 2026-10-28 at 16.23.45 (1).jpeg",
  ],
  [
    "user-original-items",
    "C:/Users/natan/Downloads/WhatsApp Image 2026-10-28 at 16.23.45.jpeg",
  ],
]) {
  const bytes = await readFile(path);
  entries.push({ id, path, sha256: sha(bytes), split: "supplement" });
}
const source = await readFile(resolve(root, "src/lib/receipt-edges.ts"));
const runner = await readFile(fileURLToPath(import.meta.url));
await mkdir(out);
await mkdir(resolve(out, "cases"));
await writeFile(resolve(out, "source.ts"), source, { flag: "wx" });
await writeFile(resolve(out, "runner.mjs"), runner, { flag: "wx" });
await writeFile(
  resolve(out, "selection.json"),
  JSON.stringify(entries, null, 2) + "\n",
  { flag: "wx" },
);
const loaded = [];
const library = new Map(),
  sourceHashes = {},
  loadedHashes = {};
if (pipeline) {
  await mkdir(resolve(out, "source"));
  for (const name of await readdir(resolve(root, "src/lib"))) {
    if (!/[.](ts|mjs)$/.test(name)) continue;
    const bytes = await readFile(resolve(root, "src/lib", name));
    library.set(resolve(root, "src/lib", name).replaceAll("\\", "/"), {
      name,
      bytes,
    });
    sourceHashes[name] = sha(bytes);
    await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
  }
}
const server = await createServer({
  root,
  configFile: false,
  envDir: out,
  cacheDir: resolve(root, "node_modules/.vite-" + tag),
  server: {
    host: "127.0.0.1",
    port: 0,
    strictPort: true,
    hmr: false,
    watch: null,
    fs: {
      deny: [
        "**/.env*",
        "**/.git/**",
        "**/receipt_training/**",
        "**/qa-artifacts/**",
      ],
    },
  },
  plugins: [
    {
      name: "frozen-edge-study",
      enforce: "pre",
      load(id) {
        const frozen = library.get(id.split("?")[0].replaceAll("\\", "/"));
        if (frozen) {
          loadedHashes[frozen.name] = sha(frozen.bytes);
          return frozen.bytes.toString("utf8");
        }
        if (
          id.replaceAll("\\", "/") !==
          resolve(root, "src/lib/receipt-edges.ts").replaceAll("\\", "/")
        )
          return;
        loaded.push(sha(source));
        return source.toString("utf8");
      },
      configureServer(service) {
        service.middlewares.use((req, res, next) => {
          if (req.url !== "/__receipt_edges") return next();
          res.setHeader("Content-Type", "text/html");
          res.end("<!doctype html><title>Local receipt geometry study</title>");
        });
      },
    },
  ],
});
let browser;
const results = [],
  blocked = [];
try {
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      blocked.push(route.request().url());
      return route.abort();
    }
    return route.continue();
  });
  const page = await context.newPage();
  await page.goto(origin + "/__receipt_edges");
  for (const entry of entries) {
    if (!/^[a-z0-9-]+$/.test(entry.id))
      throw new Error("Unexpected source identifier");
    const bytes = await readFile(entry.path);
    if (sha(bytes) !== entry.sha256 || bytes.length > 12 * 1024 * 1024)
      throw new Error("Input changed or exceeds photo bound");
    const result = await page.evaluate(
      async ({ base64, pipeline, mime }) => {
        const raw = Uint8Array.from(atob(base64), (letter) =>
          letter.charCodeAt(0),
        );
        const bitmap = await createImageBitmap(new Blob([raw]));
        try {
          if (bitmap.width * bitmap.height > 25_000_000)
            throw new Error("Decode pixel bound");
          const canvas = document.createElement("canvas");
          const scale = Math.min(
            1,
            640 / Math.max(bitmap.width, bitmap.height),
          );
          canvas.width = Math.round(bitmap.width * scale);
          canvas.height = Math.round(bitmap.height * scale);
          const ctx = canvas.getContext("2d", { willReadFrequently: true });
          ctx.fillStyle = "#fff";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
          const patch = ctx.getImageData(0, 0, canvas.width, canvas.height);
          let suggestion,
            kernel_ms = null,
            preview_preparation_ms = null,
            edge_preview_ms = null;
          if (pipeline) {
            const { prepareImage } = await import("/src/lib/images.ts");
            const { suggestReceiptEdges } =
              await import("/src/lib/edge-preview.ts");
            const start = performance.now();
            const prepared = await prepareImage(
              new File([raw], "receipt", { type: mime }),
            );
            preview_preparation_ms = performance.now() - start;
            try {
              const before = performance.now();
              suggestion = await suggestReceiptEdges(
                prepared.blob,
                new AbortController().signal,
              );
              edge_preview_ms = performance.now() - before;
            } finally {
              URL.revokeObjectURL(prepared.url);
            }
          } else {
            const { findReceiptEdges } =
              await import("/src/lib/receipt-edges.ts");
            const start = performance.now();
            suggestion = findReceiptEdges(patch);
            kernel_ms = performance.now() - start;
          }
          if (suggestion) {
            const b = suggestion.bounds;
            ctx.lineWidth = 3;
            ctx.strokeStyle = "#18b900";
            ctx.strokeRect(
              (canvas.width * b.left) / 100,
              (canvas.height * b.top) / 100,
              (canvas.width * (100 - b.left - b.right)) / 100,
              (canvas.height * (100 - b.top - b.bottom)) / 100,
            );
          }
          return {
            suggestion,
            kernel_ms,
            preview_preparation_ms,
            edge_preview_ms,
            source_width: bitmap.width,
            source_height: bitmap.height,
            sampled_width: canvas.width,
            sampled_height: canvas.height,
            overlay: canvas.toDataURL("image/png").split(",")[1],
          };
        } finally {
          bitmap.close();
        }
      },
      {
        base64: bytes.toString("base64"),
        pipeline,
        mime: /[.]webp$/i.test(entry.path)
          ? "image/webp"
          : /[.]png$/i.test(entry.path)
            ? "image/png"
            : "image/jpeg",
      },
    );
    const { overlay, ...metrics } = result;
    const overlayBytes = Buffer.from(overlay, "base64");
    await writeFile(resolve(out, "cases", entry.id + ".png"), overlayBytes, {
      flag: "wx",
    });
    results.push({
      id: entry.id,
      input_sha256: entry.sha256,
      split: entry.split,
      ...metrics,
      overlay_sha256: sha(overlayBytes),
    });
    await writeFile(
      resolve(out, "cases", entry.id + ".json"),
      JSON.stringify(results.at(-1)) + "\n",
      { flag: "wx" },
    );
  }
  if (
    pipeline
      ? ![
          "images.ts",
          "image-quality.ts",
          "edge-preview.ts",
          "receipt-edges.worker.ts",
          "receipt-edges.ts",
        ].every((name) => loadedHashes[name] === sourceHashes[name])
      : !loaded.length || loaded.some((hash) => hash !== sha(source))
  )
    throw new Error("Frozen source not used");
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify(
      {
        results,
        source_sha256: sha(source),
        runner_sha256: sha(runner),
        manifest_sha256: sha(manifestBytes),
        loaded_frozen_source_sha256: loaded,
        source_module_sha256: sourceHashes,
        loaded_frozen_module_sha256: loadedHashes,
        pipeline_includes_preview_and_real_worker: pipeline,
        browser: browser.version(),
        new_model_requests: 0,
        new_external_requests: 0,
        blocked_external_requests: blocked,
        scope:
          "Every real-photo record in the existing manifest plus two original user receipt sections. Source-informed development study, no new holdout or financial/OCR accuracy claim. Kernel timing excludes preparation/decode and is not handset performance.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output: relative(root, out),
      receipts: results.length,
      suggestions: results.filter((row) => row.suggestion).length,
      new_external_requests: 0,
    }),
  );
} finally {
  await browser?.close();
  await server.close();
}
