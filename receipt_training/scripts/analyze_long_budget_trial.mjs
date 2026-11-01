// Offline verification only, against the same frozen parser/verifier and fresh OCR.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const out = resolve(root, "qa-artifacts", run);
const original = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1",
);
const originalPlan = JSON.parse(
  await readFile(resolve(original, "plan.json"), "utf8"),
);
const plan = JSON.parse(await readFile(resolve(out, "plan.json"), "utf8"));
const meta = JSON.parse(
  await readFile(
    resolve(root, "qa-artifacts/advanced-ocr", run, "metadata.json"),
    "utf8",
  ),
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
assert(
  meta.exit_code === 0 && meta.parsed_json && !meta.decoder_schema_warning,
);
const raw = await readFile(
  resolve(root, "qa-artifacts/advanced-ocr", run, "stdout.txt"),
);
assert.equal(sha(raw), meta.stdout_sha256);
const draft = aiReceiptSchema.parse(JSON.parse(raw));
assert(
  draft.warnings.length <= 4 &&
    draft.items.every(
      (item) =>
        item.note === "" && item.sourcePhotos.every((photo) => photo === 1),
    ),
);
const itemFolder = resolve(original, plan.original_receipt_id);
const primary = JSON.parse(
  await readFile(resolve(itemFolder, "ocr-response.json"), "utf8"),
);
const result = JSON.parse(
  await readFile(resolve(itemFolder, "result.json"), "utf8"),
);
const panels = result.panels.map((panel, index) => ({
  ...panel,
  photo: 1,
  part: index + 1,
}));
const frozen = new Map(),
  loaded = {};
for (const [name, expected] of Object.entries(originalPlan.source_sha256)) {
  if (!name.startsWith("src/lib/")) continue;
  const bytes = await readFile(resolve(original, "source", name));
  assert.equal(sha(bytes), expected);
  frozen.set(resolve(root, name).replaceAll("\\", "/"), {
    name,
    source: bytes.toString("utf8"),
    sha256: expected,
  });
}
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: resolve(root, "node_modules/.vite-" + run + "-analysis"),
  server: {
    middlewareMode: true,
    hmr: false,
    watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
  },
  plugins: [
    {
      name: "frozen-long-budget-analysis",
      enforce: "pre",
      load(id) {
        const found = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!found) return null;
        loaded[found.name] = found.sha256;
        return found.source;
      },
    },
  ],
});
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during analysis");
};
try {
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const recognition = validateRecognition(primary.recognition, panels);
  for (const [name, context] of [
    ["auto", undefined],
    ["context-idr", { currency: "IDR" }],
  ]) {
    const value = verifyIndependentReadings(draft, recognition, context);
    await writeFile(
      resolve(out, `verified-${name}.json`),
      JSON.stringify(
        {
          ...value,
          calculation: calculateReceipt(value.receipt),
          scope:
            name === "auto"
              ? "No supplied currency context"
              : "Explicit post-extraction IDR context from dataset geography; never sent to the model and not automatic currency accuracy",
        },
        (_, value) => (typeof value === "bigint" ? String(value) : value),
        2,
      ) + "\n",
      { flag: "wx" },
    );
  }
  for (const name of [
    "src/lib/verify-readings.ts",
    "src/lib/engine.ts",
    "src/lib/parser.ts",
  ])
    assert.equal(loaded[name], originalPlan.source_sha256[name]);
  await writeFile(
    resolve(out, "analysis.json"),
    JSON.stringify(
      {
        loaded_frozen_source_sha256: loaded,
        native_output_sha256: sha(raw),
        source_primary_sha256: sha(
          await readFile(resolve(itemFolder, "ocr-response.json")),
        ),
        analyzer_sha256: sha(await readFile(fileURLToPath(import.meta.url))),
        cloud_requests: 0,
        new_model_requests: 0,
        model_native_rows: draft.items.length,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  await writeFile(
    resolve(out, "source", "analysis.mjs"),
    await readFile(fileURLToPath(import.meta.url)),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      model_native_rows: draft.items.length,
      frozen_modules: Object.keys(loaded).length,
      new_model_requests: 0,
    }),
  );
} finally {
  globalThis.fetch = previousFetch;
  await server.close();
}
