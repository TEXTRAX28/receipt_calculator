// Offline same-pixel primary/independent comparison with genuine Azure word geometry.
// Azure and Qwen read the original pixels independently; no new model/API calls.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const geometryRun = process.argv[3] || "word-layout-v1";
assert(/^[\w-]+$/.test(geometryRun));
const base = resolve(root, "qa-artifacts/provider-review/azure-screening-v1");
const out = resolve(base, run);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputHashes = {},
  sources = {},
  loaded = {},
  frozen = new Map();
async function read(path, expected) {
  const bytes = await readFile(resolve(root, path));
  const digest = sha(bytes);
  if (expected) assert.equal(digest, expected, path);
  inputHashes[path] = digest;
  return bytes;
}
const json = async (path, expected) => JSON.parse(await read(path, expected));
const prefix = "qa-artifacts/provider-review/veryfi-screening-crops-v2";
const azurePrefix = "qa-artifacts/provider-review/azure-screening-v1";
const geometry = await json(azurePrefix + "/" + geometryRun + "/metadata.json");
assert(
  geometry.new_model_requests === 0 &&
    geometry.external_requests === 0 &&
    !geometry.application_engine_registered,
);
for (const [path, expected] of Object.entries(geometry.evidence_sha256))
  await read(path, expected);
const geometryRows = (
  await read(
    azurePrefix + "/" + geometryRun + "/recognition.jsonl",
    geometry.recognition_sha256,
  )
)
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const plan = await json(prefix + "/native-protocol-v1/plan.json");
const cloud = await json(prefix + "/run/plan.json");
assert(plan.cases.length === 6 && geometryRows.length === 6);
const paddlePrefix = "receipt_training/evaluation/runs/" + plan.paddle_run;
const paddleMeta = await json(paddlePrefix + "/metadata.json");
const paddleRows = (
  await read(paddlePrefix + "/ocr.jsonl", paddleMeta.ocr_sha256)
)
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
assert(paddleMeta.completed_at && paddleMeta.errors === 0);
const inputs = [];
for (const row of plan.cases) {
  const azure = geometryRows.find((entry) => entry.case === row.case);
  const paddle = paddleRows.find(
    (entry) => entry.receipt_id === row.receipt_id,
  );
  const context = cloud.cases.find((entry) => entry.case === row.case);
  assert(azure && paddle && context && azure.receipt_id === row.receipt_id);
  assert(
    azure.image_sha256 === row.crop_sha256 &&
      paddle.image_sha256 === row.crop_sha256,
  );
  const folder = "qa-artifacts/advanced-ocr/" + row.qwen_run;
  const meta = await json(folder + "/metadata.json");
  assert.equal(meta.request_sha256, row.request_sha256);
  assert(
    meta.exit_code === 0 &&
      meta.parsed_json &&
      !meta.error &&
      meta.images.length === 1,
  );
  assert.equal(meta.images[0].sha256, row.crop_sha256);
  const raw = await read(folder + "/stdout.txt", meta.stdout_sha256);
  const vision = JSON.parse(
    raw
      .toString("utf8")
      .replace(/\x1b\[[0-9;]*m/g, "")
      .trim(),
  );
  const parsed = await json(folder + "/model-output.json");
  assert.deepEqual(vision, parsed);
  inputs.push({
    row,
    azure: azure.recognition,
    paddle,
    currency: context.offline_context_currency,
    vision,
  });
}
await mkdir(out);
await mkdir(resolve(out, "source"));
for (const file of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(file)) continue;
  const path = "src/lib/" + file;
  const bytes = await readFile(resolve(root, path));
  sources[path] = sha(bytes);
  frozen.set(resolve(root, path).replaceAll("\\", "/"), {
    path,
    text: bytes.toString("utf8"),
  });
  await writeFile(resolve(out, "source", file), bytes, { flag: "wx" });
}
const runner = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "processor.mjs"), runner, { flag: "wx" });
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: resolve(root, "node_modules/.vite-" + run),
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-azure-word-replay",
      enforce: "pre",
      load(id) {
        const source = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!source) return null;
        loaded[source.path] = sources[source.path];
        return source.text;
      },
    },
  ],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during saved-response comparison");
};
const predictions = [],
  assembledRows = [];
try {
  const { recognitionSchema, validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { receiptFromAi } = await server.ssrLoadModule("/src/lib/gemini.ts");
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const input of inputs) {
    const paddle = validateRecognition(
      {
        engine: paddleMeta.adapter,
        panels: input.paddle.panels.map(({ width, height, words, lines }) => ({
          photo: 1,
          part: 1,
          width,
          height,
          words,
          lines,
        })),
      },
      [{ photo: 1, part: 1 }],
    );
    // Only the reusable panel contract is applied. Azure keeps its real, currently
    // unregistered vendor identity; this is not an accepted app/API response.
    assert.equal(
      input.azure.engine,
      "azure-document-intelligence-prebuilt-receipt-word-layout",
    );
    const azure = {
      ...input.azure,
      panels: recognitionSchema.shape.panels.parse(input.azure.panels),
    };
    const assembled = {
      paddle: assembleRecognition(paddle),
      azure: assembleRecognition(azure),
    };
    assembledRows.push({
      case: input.row.case,
      receipt_id: input.row.receipt_id,
      azure: assembled.azure,
      paddle: assembled.paddle,
    });
    for (const [mode, context] of [
      ["automatic", undefined],
      ["known-currency", { currency: input.currency }],
    ]) {
      const primary = [
        ["paddle", parseReceiptWithSources(assembled.paddle.text, context)],
        [
          "azure-word-layout",
          parseReceiptWithSources(assembled.azure.text, context),
        ],
        [
          "qwen",
          { receipt: receiptFromAi(input.vision, "Local vision", context) },
        ],
        [
          "paddle+qwen",
          verifyIndependentReadings(input.vision, paddle, context),
        ],
        [
          "azure-word-layout+qwen",
          verifyIndependentReadings(input.vision, azure, context),
        ],
      ];
      for (const [method, value] of primary) {
        const receipt = value.receipt;
        const before = calculateReceipt(receipt);
        receipt.reviewChecks.push({
          scope: "receipt",
          field: "items",
          reason: "coverage",
          other:
            "Research crop comparison requires complete source verification",
          confirmedValue: "",
        });
        predictions.push({
          case: input.row.case,
          receipt_id: input.row.receipt_id,
          method,
          mode,
          context: context || null,
          receipt,
          calculation: calculateReceipt(receipt),
          calculation_before_research_check: before,
          sources: value.sources || null,
          corrections: value.corrections || null,
          priceRecoveries: value.priceRecoveries || [],
          removedAdjustments: value.removedAdjustments || null,
          source_crop_sha256: input.row.crop_sha256,
          trusted: false,
        });
      }
    }
  }
  for (const path of [
    "src/lib/parser.ts",
    "src/lib/verify-readings.ts",
    "src/lib/receipt-layout.ts",
  ])
    assert.equal(loaded[path], sources[path]);
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
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
await writeFile(
  resolve(out, "assembled.json"),
  JSON.stringify(assembledRows, null, 2) + "\n",
  { flag: "wx" },
);
await writeFile(
  resolve(out, "metadata.json"),
  JSON.stringify(
    {
      scope:
        "Six identical PNG crops, saved independent Azure OCR, Paddle OCR and Qwen vision. Same frozen current parsing/verification for every method. No new inference, labels or native Azure fields enter extraction. Existing Qwen generation predates row-first change; no current-Qwen profile claim.",
      input_sha256: inputHashes,
      source_sha256: sources,
      loaded_frozen_source_sha256: loaded,
      processor_sha256: sha(runner),
      predictions_sha256: sha(bytes),
      predictions: predictions.length,
      new_model_requests: 0,
      external_requests: 0,
      application_engine_registered: false,
      context_scope:
        "Predeclared screen currency supplied only after extraction, equally to every method; not automatic currency accuracy or source verification.",
      geometry_scope:
        "Real word polygons/confidence projected by the unchanged local reading_lines helper. Panel schema validated; unique Azure vendor identity retained only in offline research, without aliasing a local engine. Derived line confidence is minimum real word confidence, not a new score.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    receipts: 6,
    predictions: predictions.length,
    new_model_requests: 0,
    external_requests: 0,
  }),
);
