// Saved actual OCR only. No label reads, new OCR, model, image editing or network.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const freshRun = process.argv[3];
assert(!freshRun || /^[\w-]+$/.test(freshRun));
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const inputs = {};
async function read(name) {
  const raw = await readFile(resolve(root, name));
  inputs[name] = sha(raw);
  return raw;
}
const json = async (name) => JSON.parse(await read(name));
const before = "qa-artifacts/ocr-invoice-v1/before";
const sources = {
  before: await json(before + "/source-sha256.json"),
  after: {},
};
for (const name of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(name)) continue;
  const path = "src/lib/" + name,
    raw = await readFile(resolve(root, path));
  sources.after[path] = sha(raw);
  await mkdir(dirname(resolve(out, "after", path)), { recursive: true });
  await writeFile(resolve(out, "after", path), raw, { flag: "wx" });
}
const frameManifest = await json(
  "qa-artifacts/ocr-invoice-v1/reconstructed-frames.json",
);
const scans = [];
for (const frame of frameManifest.frames) {
  assert.equal(sha(await read(frame.path)), frame.sha256);
  const reading = await json(
    `receipt_training/evaluation/runs/public-scans-on-device-v2/${frame.id}.json`,
  );
  assert(!reading.error && reading.ocr.reads.length === 1);
  scans.push({ frame, reading });
}
const native = (
  await read(
    "receipt_training/evaluation/runs/tesseract-source-original50-v4/paired.jsonl",
  )
)
  .toString()
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
assert.equal(native.length, 50);
const fresh = [];
if (freshRun) {
  const folder = `receipt_training/evaluation/runs/${freshRun}`;
  const plan = await json(folder + "/plan.json");
  const meta = await json(folder + "/metadata.json");
  assert(meta.source_unchanged && meta.external_receipt_uploads === 0);
  for (const source of plan.documents) {
    const reading = await json(`${folder}/${source.id}.json`);
    assert(!reading.error && reading.input_sha256 === source.sha256);
    fresh.push(reading);
  }
}
const predictions = [],
  loaded = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in saved OCR replay");
};
const stringify = (value) =>
  JSON.stringify(value, (_, value) =>
    typeof value === "bigint" ? String(value) : value,
  );
try {
  for (const variant of ["before", "after"]) {
    const frozen = new Map();
    loaded[variant] = {};
    for (const [path, expected] of Object.entries(sources[variant])) {
      const raw = await readFile(
        resolve(
          root,
          variant === "before" ? before : `qa-artifacts/${run}/after`,
          path,
        ),
      );
      assert.equal(sha(raw), expected);
      frozen.set(resolve(root, path).replaceAll("\\", "/"), {
        path,
        text: raw.toString("utf8"),
      });
    }
    const server = await createServer({
      root,
      configFile: false,
      envDir: false,
      appType: "custom",
      logLevel: "error",
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [
        {
          name: "frozen-ocr-invoice",
          enforce: "pre",
          load(id) {
            const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
            if (!file) return null;
            loaded[variant][file.path] = sources[variant][file.path];
            return file.text;
          },
        },
      ],
    });
    try {
      const { devicePanel, deviceRecognition } = await server.ssrLoadModule(
        "/src/lib/device-evidence.ts",
      );
      const { parseReceiptWithSources } =
        await server.ssrLoadModule("/src/lib/parser.ts");
      const { reviewDeviceReading } = await server.ssrLoadModule(
        "/src/lib/device-review.ts",
      );
      const { calculateReceipt } =
        await server.ssrLoadModule("/src/lib/engine.ts");
      for (const { frame, reading } of scans) {
        const raw = reading.ocr.reads[0];
        const panel = devicePanel(
          raw,
          raw.text,
          frame.width,
          frame.height,
          1,
          1,
        );
        assert(panel.complete && panel.panel);
        const output = {
          text: panel.rows.map((row) => row.text).join("\n"),
          recognition: deviceRecognition([panel.panel]),
          sourceLines: panel.rows.map((row) => row.source),
        };
        const parsed = parseReceiptWithSources(output);
        parsed.receipt.source = "ocr";
        const receipt = reviewDeviceReading(
          parsed.receipt,
          parsed.sources,
          output.sourceLines,
          output.recognition,
          parsed.fieldSources,
        );
        predictions.push({
          id: frame.id,
          receipt_id: frame.id,
          cohort: "public-scans",
          variant,
          ...parsed,
          receipt,
          calculation: calculateReceipt(receipt),
          retained_sdk_sha256: sha(Buffer.from(stringify(raw))),
          source_complete: panel.complete,
        });
      }
      for (const row of native) {
        const output = row.after;
        assert(output.text && output.recognition && output.sourceLines);
        const parsed = parseReceiptWithSources(output);
        const receipt = reviewDeviceReading(
          parsed.receipt,
          parsed.sources,
          output.sourceLines,
          output.recognition,
          parsed.fieldSources,
          output.sourceConflicts,
          output.joinedSectionRows,
        );
        predictions.push({
          receipt_id: row.receipt_id,
          image_sha256: row.image_sha256,
          split: row.split,
          cohort: "original50-device",
          variant,
          ...parsed,
          receipt,
          calculation: calculateReceipt(receipt),
        });
      }
      if (variant === "after")
        for (const reading of fresh) {
          for (const state of ["state", "reviewed_state"]) {
            if (!reading[state]) continue;
            const receipt = reading[state].receipt;
            predictions.push({
              id: reading.id,
              receipt_id: reading.id,
              cohort: "fresh-ui",
              variant: state,
              receipt,
              calculation: calculateReceipt(receipt),
              elapsed_ms: reading.elapsed_ms,
            });
          }
        }
      for (const path of [
        "src/lib/parser.ts",
        "src/lib/device-evidence.ts",
        "src/lib/engine.ts",
      ])
        assert.equal(loaded[variant][path], sources[variant][path]);
    } finally {
      await server.close();
    }
  }
} finally {
  globalThis.fetch = originalFetch;
}
const write = (name, value) =>
  writeFile(resolve(out, name), stringify(value) + "\n", { flag: "wx" });
// Use exclusive files throughout: historical evidence cannot be overwritten.
const lines = Buffer.from(predictions.map(stringify).join("\n") + "\n");
await writeFile(resolve(out, "predictions.ndjson"), lines, { flag: "wx" });
const self = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
await write("metadata.json", {
  scope:
    "Same saved SDK observations, interpreted by frozen before/after code. Three public scans rebuild actual SDK ownership; original fifty retain their historical normalized source metadata, which lacks wordRows. Reconstructed JPEGs only establish current dimensions and integrity, not equality to unrecorded historical encoded JPEGs. No reference labels, date/currency hints, OCR calls or merchant edits.",
  source_sha256: sources,
  loaded_frozen_source_sha256: loaded,
  input_sha256: inputs,
  runner_sha256: sha(self),
  predictions_sha256: sha(lines),
  prediction_views: predictions.length,
  new_ocr_jobs: 0,
  model_calls: 0,
  external_requests: 0,
  fresh_ui_run: freshRun || null,
});
console.log(
  stringify({
    prediction_views: predictions.length,
    new_ocr_jobs: 0,
    scans: predictions
      .filter((row) => row.cohort === "public-scans")
      .map((row) => ({
        id: row.id,
        variant: row.variant,
        merchant: row.receipt.merchant,
        products: row.receipt.items.length,
        discrepancy: row.calculation.discrepancy,
        issues: row.calculation.issues.length,
      })),
  }),
);
