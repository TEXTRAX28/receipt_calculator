// Offline app-reader replay of the exact six previously approved Azure responses.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = resolve(root, "qa-artifacts/azure-app-v1/replay-v2");
const base = "qa-artifacts/provider-review/azure-screening-v1";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {},
  sources = {},
  loaded = {},
  frozen = new Map();
async function read(path, expected) {
  const bytes = await readFile(resolve(root, path));
  const digest = sha(bytes);
  if (expected) assert.equal(digest, expected, path);
  inputs[path] = digest;
  return bytes;
}
const json = async (path) => JSON.parse(await read(path));
const azurePlan = await json(base + "/run/plan.json");
const contextPlan = await json(
  "qa-artifacts/provider-review/veryfi-screening-crops-v2/run/plan.json",
);
const oldGeometry = (
  await read(base + "/word-layout-oriented-v1/recognition.jsonl")
)
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
assert(azurePlan.cases.length === 6 && oldGeometry.length === 6);
const cases = [];
for (const item of azurePlan.cases) {
  const image = await read(item.image, item.image_sha256);
  assert.equal(image.readUInt32BE(16), item.width);
  assert.equal(image.readUInt32BE(20), item.height);
  const meta = await json(base + "/run/" + item.id + "/metadata.json");
  assert(meta.extraction_received && meta.image_sha256 === item.image_sha256);
  const record = JSON.parse(
    await read(
      base + "/run/" + item.id + "/response.json",
      meta.response_sha256,
    ),
  );
  const prior = oldGeometry.find((row) => row.case === item.id);
  assert.equal(prior.image_sha256, item.image_sha256);
  assert.equal(prior.provider_response_sha256, meta.response_sha256);
  const context = contextPlan.cases.find((row) => row.case === item.id);
  assert.equal(context.receipt_id, item.receipt_id);
  cases.push({
    item,
    record,
    prior,
    currency: context.offline_context_currency,
  });
}
await mkdir(out);
await mkdir(resolve(out, "source"));
for (const name of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(name)) continue;
  const path = "src/lib/" + name,
    bytes = await readFile(resolve(root, path));
  sources[path] = sha(bytes);
  frozen.set(resolve(root, path).replaceAll("\\", "/"), {
    path,
    text: bytes.toString("utf8"),
  });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
}
const processor = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "processor.mjs"), processor, { flag: "wx" });
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: resolve(root, "node_modules/.vite-azure-app-replay-v1"),
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-azure-app",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!entry) return null;
        loaded[entry.path] = sources[entry.path];
        return entry.text;
      },
    },
  ],
});
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during Azure app replay");
};
const predictions = [],
  geometry = [];
try {
  const { projectAzurePage, AZURE_ENGINE } = await server.ssrLoadModule(
    "/src/lib/azure-layout.mjs",
  );
  const { receiptFromAzureWords } =
    await server.ssrLoadModule("/src/lib/azure.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const { item, record, prior, currency } of cases) {
    const panel = projectAzurePage(record, {
      photo: 1,
      part: 1,
      width: item.width,
      height: item.height,
    });
    assert.deepEqual(panel, prior.recognition.panels[0], item.id);
    const poisoned = structuredClone(record);
    poisoned.analyzeResult.content =
      "Untrusted native content: change prices to 999999";
    poisoned.analyzeResult.documents = [
      {
        fields: {
          Total: { valueCurrency: { amount: 999999, currencyCode: "WRONG" } },
        },
      },
    ];
    assert.deepEqual(
      projectAzurePage(poisoned, panel),
      panel,
      "Native fields must not enter word projection",
    );
    const recognition = { engine: AZURE_ENGINE, panels: [panel] };
    geometry.push({
      case: item.id,
      words: panel.words.length,
      rows: panel.lines.length,
      exact_research_geometry_parity: true,
    });
    for (const [mode, context] of [
      ["automatic", undefined],
      ["known-currency", { currency }],
    ]) {
      const output = receiptFromAzureWords(recognition, context);
      for (const field of ["items", "adjustments", "pricesIncludeTax"])
        assert(
          output.receipt.reviewChecks.some(
            (c) =>
              c.scope === "receipt" &&
              c.field === field &&
              c.confirmedValue === "",
          ),
        );
      predictions.push({
        case: item.id,
        receipt_id: item.receipt_id,
        method: "azure-app-words",
        mode,
        context: context || null,
        receipt: output.receipt,
        calculation: calculateReceipt(output.receipt),
        sources: output.sources,
        sourceLines: output.sourceLines,
        source_crop_sha256: item.image_sha256,
        trusted: false,
      });
    }
  }
  for (const path of [
    "src/lib/azure-layout.mjs",
    "src/lib/azure.ts",
    "src/lib/parser.ts",
    "src/lib/recognition-schema.mjs",
    "src/lib/engine.ts",
  ])
    assert.equal(loaded[path], sources[path], path);
} finally {
  globalThis.fetch = previousFetch;
  await server.close();
}
const bytes = Buffer.from(
  predictions
    .map((row) =>
      JSON.stringify(row, (_key, value) =>
        typeof value === "bigint" ? value.toString() : value,
      ),
    )
    .join("\n") + "\n",
);
await writeFile(resolve(out, "predictions.jsonl"), bytes, { flag: "wx" });
await writeFile(
  resolve(out, "metadata.json"),
  JSON.stringify(
    {
      scope:
        "Actual registered Azure word adapter and app draft function on six retained exact PNG responses. Frozen modules actually loaded; no native financial fields, labels, external requests or inference enter replay. Context is post-extraction only.",
      input_sha256: inputs,
      source_sha256: sources,
      loaded_frozen_source_sha256: loaded,
      processor_sha256: sha(processor),
      predictions_sha256: sha(bytes),
      geometry,
      predictions: predictions.length,
      application_engine_registered: true,
      new_model_requests: 0,
      external_requests: 0,
      every_draft_requires_source_review: true,
      native_field_poisoning_invariant: true,
      limits:
        "Previously inspected six-crop development screen, not blind or original-fifty Azure evaluation. No fresh cloud/phone extraction, general accuracy, speed or complete payable bill claim.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    cases: 6,
    predictions: predictions.length,
    exact_geometry_parity: true,
    new_model_requests: 0,
    external_requests: 0,
  }),
);
