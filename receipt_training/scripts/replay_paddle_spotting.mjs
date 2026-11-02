// Current frozen parser for retained same-image text/control readings. No inference.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = resolve(root, "qa-artifacts/paddle-spotting-pilot-v1");
const out = resolve(base, "postprocess-v1");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputHashes = {};
async function read(path, expected) {
  const bytes = await readFile(resolve(root, path));
  if (expected) assert.equal(sha(bytes), expected, path);
  inputHashes[path] = sha(bytes);
  return bytes;
}
const meta = JSON.parse(
  await read(
    "qa-artifacts/paddle-spotting-pilot-v1/postprocess-v1/metadata.json",
  ),
);
for (const [path, digest] of Object.entries(meta.input_sha256))
  await read(path, digest);
const views = JSON.parse(
  await read(
    "qa-artifacts/paddle-spotting-pilot-v1/postprocess-v1/inputs.json",
  ),
);
const frozen = new Map(),
  loaded = {};
for (const [path, digest] of Object.entries(meta.source_sha256)) {
  const bytes = await readFile(resolve(base, "source", path));
  assert.equal(sha(bytes), digest, path);
  frozen.set(resolve(root, path).replaceAll("\\", "/"), {
    path,
    text: bytes.toString("utf8"),
  });
}
const fetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in offline spotting replay");
};
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: resolve(out, "vite-cache"),
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-spotting-replay",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!entry) return null;
        loaded[entry.path] = meta.source_sha256[entry.path];
        return entry.text;
      },
    },
  ],
});
const predictions = [];
try {
  const { parseReceiptWithSources, PHOTO_SEPARATOR } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { joinDetailText } = await server.ssrLoadModule("/src/lib/ocr.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { newReceipt } = await server.ssrLoadModule("/src/lib/model.ts");
  for (const view of views) {
    const grouped = new Map();
    for (const panel of [...view.panels].sort(
      (a, b) => a.photo_index - b.photo_index || a.panel_index - b.panel_index,
    )) {
      const parts = grouped.get(panel.photo_index) || [];
      parts.push(panel.text);
      grouped.set(panel.photo_index, parts);
    }
    const text = [...grouped.values()]
      .map(joinDetailText)
      .join(`\n${PHOTO_SEPARATOR}\n`);
    for (const mode of ["automatic", "known-currency"]) {
      const currency = { GB: "GBP", TW: "TWD", ID: "IDR" }[view.record.country];
      assert(currency);
      const row = {
        receipt_id: view.receipt_id,
        image_sha256: view.record.sha256,
        variant: view.variant,
        cohort: view.cohort,
        control: view.control,
        mode,
        record: view.record,
        elapsed_ms: 0,
        timing_scope:
          "Offline text assembly/parser/validation replay; not scanner latency",
      };
      try {
        if (view.failures.length)
          throw new Error(
            "Located-output validation failed; incomplete receipt is withheld",
          );
        Object.assign(
          row,
          parseReceiptWithSources(
            text,
            mode === "automatic" ? undefined : { currency },
          ),
        );
        row.calculation = calculateReceipt(row.receipt);
      } catch (error) {
        row.error =
          error instanceof Error ? error.message : "Text pipeline failed";
        row.receipt = newReceipt();
        row.calculation = calculateReceipt(row.receipt);
      }
      predictions.push(row);
    }
  }
} finally {
  await server.close();
  globalThis.fetch = fetch;
}
for (const path of ["src/lib/parser.ts", "src/lib/ocr.ts", "src/lib/engine.ts"])
  assert.equal(loaded[path], meta.source_sha256[path]);
const bytes = Buffer.from(
  predictions
    .map((row) =>
      JSON.stringify(row, (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    )
    .join("\n") + "\n",
);
await writeFile(resolve(out, "predictions.jsonl"), bytes, { flag: "wx" });
const self = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
await writeFile(
  resolve(out, "replay-metadata.json"),
  JSON.stringify(
    {
      input_sha256: inputHashes,
      source_sha256: meta.source_sha256,
      loaded_frozen_source_sha256: loaded,
      runner_sha256: sha(self),
      predictions_sha256: sha(bytes),
      prediction_views: predictions.length,
      node: process.version,
      new_model_requests: 0,
      external_requests: 0,
      geometry_confidence_available: false,
      explicit_currency_after_extraction_only: true,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    prediction_views: predictions.length,
    error_views: predictions.filter((row) => row.error).length,
    new_model_requests: 0,
  }),
);
