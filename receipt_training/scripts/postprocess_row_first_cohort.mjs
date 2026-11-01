// Reuse all original controls and candidates under the same frozen verifier.
// Currency context is supplied only after extraction; no model/network calls.
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
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const plan = await readJson(resolve(folder, "plan.json"));
const execution = await readJson(resolve(folder, "execution.json"));
assert(execution.source_unchanged && execution.calls.length === 48);
assert(execution.cloud_requests === 0 && execution.automatic_retries === 0);
assert(plan.cases.length === 50);
for (const [name, expected] of Object.entries(plan.input_sha256))
  assert.equal(sha(await readFile(resolve(root, name))), expected, name);
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
      name: "frozen-row-first-postprocess",
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
const rows = [],
  inputs = [];
try {
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const { aiReceiptSchema } = await server.ssrLoadModule(
    "/src/lib/extraction-schema.mjs",
  );
  for (const item of plan.cases) {
    const recognition = validateRecognition(
      (await readJson(resolve(root, item.primary))).recognition,
      item.panels,
    );
    for (const variant of ["control", "candidate"]) {
      const retained = item.retained[variant];
      const index = execution.calls.findIndex(
        (call) => call.id === item.id && call.variant === variant,
      );
      const call = execution.calls[index];
      assert(retained || call, item.id + " " + variant);
      let draft, path, bytes;
      if (retained || call.accepted) {
        path = retained
          ? retained.receipt
          : `qa-artifacts/${run}/${index + 1}-normalized.json`;
        bytes = await readFile(resolve(root, path));
        inputHashes[path] = sha(bytes);
        const parsed = JSON.parse(bytes);
        draft = aiReceiptSchema.parse(parsed.receipt || parsed);
      }
      inputs.push({
        receipt_id: item.id,
        variant,
        path: path || null,
        source: retained?.source || "Fresh extension candidate",
        accepted: Boolean(draft),
      });
      for (const mode of ["auto", "selected-context"]) {
        const currency = { GB: "GBP", ID: "IDR", TW: "TWD" }[
          item.record.country
        ];
        assert(currency);
        const context = mode === "auto" ? undefined : { currency };
        const value = draft
          ? verifyIndependentReadings(draft, recognition, context)
          : parseReceiptWithSources(
              assembleRecognition(recognition).text,
              context,
            );
        rows.push({
          receipt_id: item.id,
          image_sha256: item.record.sha256,
          split: item.record.split,
          variant,
          mode,
          ...value,
          ...(draft
            ? {}
            : { error: call.failure || "native-contract-failure" }),
          calculation: calculateReceipt(value.receipt),
          elapsed_ms: call?.native_ms || 0,
          timing_scope:
            "Saved extraction evidence; retained controls/pilot and fresh extension have different timing circumstances. Zero means not remeasured. No workflow or speed-ratio claim.",
          context_scope:
            mode === "auto"
              ? "No supplied currency context"
              : "Explicit post-extraction dataset-country currency, never a model hint or automatic currency accuracy",
        });
      }
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
assert.equal(rows.length, 200);
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
      inputs,
      predictions: rows.length,
      independent_transactions: 50,
      extension_native_calls: 48,
      retained_pilot_candidates: 2,
      retained_controls: 50,
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
    independent_transactions: 50,
    native_failures: execution.calls.filter((call) => !call.accepted).length,
    new_model_requests: 0,
  }),
);
