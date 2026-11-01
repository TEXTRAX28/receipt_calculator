// Frozen real verifier/calculator over saved independent OCR and native drafts.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const folder = resolve(root, "qa-artifacts", run);
const output = resolve(folder, "postprocess");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plan = await readJson(resolve(folder, "plan.json"));
const execution = await readJson(resolve(folder, "execution.json"));
assert(
  execution.source_unchanged &&
    execution.calls.length === 8 &&
    execution.calls.every((call) => call.accepted),
);
assert(execution.cloud_requests === 0 && execution.automatic_retries === 0);
await mkdir(output);
const frozen = new Map(),
  loaded = {},
  inputHashes = {};
for (const [name, expected] of Object.entries(plan.source_sha256)) {
  if (!name.startsWith("src/lib/")) continue;
  const bytes = await readFile(resolve(folder, "source", name));
  assert.equal(sha(bytes), expected);
  frozen.set(resolve(root, name).replaceAll("\\", "/"), {
    name,
    expected,
    text: bytes.toString("utf8"),
  });
}
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  logLevel: "error",
  cacheDir: resolve(root, `node_modules/.vite-${run}-postprocess`),
  server: {
    middlewareMode: true,
    hmr: false,
    watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
  },
  plugins: [
    {
      name: "frozen-literal-total-postprocess",
      enforce: "pre",
      load(id) {
        const source = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!source) return null;
        loaded[source.name] = source.expected;
        return source.text;
      },
    },
  ],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during postprocessing");
};
const rows = [];
try {
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  for (const [index, call] of execution.calls.entries()) {
    const item = plan.cases.find((item) => item.id === call.id);
    const primaryBytes = await readFile(resolve(root, item.primary));
    assert.equal(sha(primaryBytes), plan.input_sha256[item.primary]);
    const recognition = validateRecognition(
      JSON.parse(primaryBytes).recognition,
      item.panels,
    );
    const draftPath = resolve(folder, `${index + 1}-normalized.json`);
    const draftBytes = await readFile(draftPath);
    inputHashes[`${index + 1}-normalized.json`] = sha(draftBytes);
    const draft = JSON.parse(draftBytes);
    for (const mode of ["auto", "selected-context"]) {
      const currency = { GB: "GBP", ID: "IDR", TW: "TWD" }[item.record.country];
      assert(currency);
      const value = verifyIndependentReadings(
        draft,
        recognition,
        mode === "auto" ? undefined : { currency },
      );
      rows.push({
        receipt_id: item.id,
        image_sha256: item.record.sha256,
        split: item.record.split,
        variant: call.variant,
        mode,
        ...value,
        calculation: calculateReceipt(value.receipt),
        elapsed_ms: call.native_ms,
        timing_scope:
          "Reference native CLI model load/encoding/generation from the same saved inference, shared across both post-extraction context views. Excludes preparation/setup/postprocessing; not separately measured workflow latency.",
        context_scope:
          mode === "auto"
            ? "No supplied currency context"
            : "Explicit post-extraction currency from dataset country; never sent to the model and not automatic currency accuracy",
      });
    }
  }
  for (const name of [
    "src/lib/verify-readings.ts",
    "src/lib/engine.ts",
    "src/lib/parser.ts",
  ])
    assert.equal(loaded[name], plan.source_sha256[name]);
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
await writeFile(
  resolve(output, "predictions.jsonl"),
  rows
    .map((row) =>
      JSON.stringify(row, (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    )
    .join("\n") + "\n",
  { flag: "wx" },
);
await writeFile(
  resolve(output, "postprocessor.mjs"),
  await readFile(fileURLToPath(import.meta.url)),
  { flag: "wx" },
);
await writeFile(
  resolve(output, "metadata.json"),
  JSON.stringify(
    {
      loaded_frozen_source_sha256: loaded,
      input_sha256: inputHashes,
      predictions: rows.length,
      independent_native_calls: 8,
      new_model_requests: 0,
      cloud_requests: 0,
      receipt_values_repaired: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    predictions: rows.length,
    independent_native_calls: 8,
    new_model_requests: 0,
  }),
);
