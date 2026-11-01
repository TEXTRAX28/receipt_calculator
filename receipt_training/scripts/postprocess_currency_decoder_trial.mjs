// Offline adapter/calculator replay. Native outputs remain unchanged and untrusted.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(root, "qa-artifacts/currency-decoder-v1");
const out = resolve(folder, "postprocess");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const plan = JSON.parse(await readFile(resolve(folder, "plan.json"), "utf8"));
const execution = JSON.parse(
  await readFile(resolve(folder, "native-execution.json"), "utf8"),
);
if (
  execution.results.length !== 6 ||
  execution.results.some((row) => row.exit_code || row.timed_out)
)
  throw new Error("Incomplete native experiment");
await mkdir(out);
await mkdir(resolve(out, "source"));
const frozen = new Map(),
  sources = {},
  loaded = {};
for (const name of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(name)) continue;
  const bytes = await readFile(resolve(root, "src/lib", name));
  sources[name] = sha(bytes);
  frozen.set(resolve(root, "src/lib", name).replaceAll("\\", "/"), {
    name,
    text: bytes.toString("utf8"),
  });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
}
await writeFile(
  resolve(out, "processor.mjs"),
  await readFile(new URL(import.meta.url)),
  { flag: "wx" },
);
const inputs = [];
for (const row of execution.results) {
  const path = resolve(root, "qa-artifacts/advanced-ocr", row.run);
  const metaBytes = await readFile(resolve(path, "metadata.json"));
  const meta = JSON.parse(metaBytes);
  const request = plan.cases.find((entry) => entry.id === row.id)[row.mode];
  if (
    meta.exit_code ||
    !meta.parsed_json ||
    meta.error ||
    meta.decoder_schema_warning ||
    meta.request_sha256 !== request.sha256 ||
    meta.external_api_requests ||
    meta.external_receipt_uploads ||
    meta.label_files_read ||
    meta.input_ocr_text
  )
    throw new Error("Invalid native metadata");
  const bytes = await readFile(resolve(path, "model-output.json"));
  inputs.push({
    id: row.id,
    mode: row.mode,
    raw: JSON.parse(bytes),
    native_metadata_sha256: sha(metaBytes),
    native_model_output_sha256: sha(bytes),
  });
}
let blockedNetwork = 0;
globalThis.fetch = async () => {
  blockedNetwork++;
  throw new Error("Network forbidden during offline output replay");
};
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "node_modules/.vite-currency-decoder-postprocess"),
  server: { hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-currency-decoder-postprocess",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (entry) {
          loaded[entry.name] = sources[entry.name];
          return entry.text;
        }
        return null;
      },
    },
  ],
});
const predictions = [];
try {
  const { receiptFromAi } = await server.ssrLoadModule("/src/lib/gemini.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const input of inputs)
    for (const [currencyMode, context] of [
      ["automatic", undefined],
      [
        "selected-currency",
        { currency: input.id.startsWith("cord-") ? "IDR" : "GBP" },
      ],
    ]) {
      const receipt = receiptFromAi(input.raw, "Local vision", context);
      const before = calculateReceipt(receipt);
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "items",
        reason: "coverage",
        other: "Research output requires complete source review",
        confirmedValue: "",
      });
      predictions.push({
        id: input.id,
        mode: input.mode,
        currencyMode,
        context: context || null,
        receipt,
        calculation: calculateReceipt(receipt),
        calculation_before_research_guard: before,
        native_metadata_sha256: input.native_metadata_sha256,
        native_model_output_sha256: input.native_model_output_sha256,
        trusted: false,
      });
    }
  if (blockedNetwork) throw new Error("Unexpected network attempt");
  const bytes =
    predictions
      .map((row) =>
        JSON.stringify(row, (_, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      )
      .join("\n") + "\n";
  await writeFile(resolve(out, "predictions.jsonl"), bytes, { flag: "wx" });
  for (const name of Object.keys(sources))
    if (sha(await readFile(resolve(root, "src/lib", name))) !== sources[name])
      throw new Error("Source changed during replay");
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(
      {
        source_sha256: sources,
        loaded_frozen_module_sha256: loaded,
        predictions_sha256: sha(bytes),
        processor_sha256: sha(await readFile(new URL(import.meta.url))),
        receipts: 3,
        native_outputs: 6,
        variants: predictions.length,
        native_model_calls_in_postprocessing: 0,
        external_requests: 0,
        blocked_network_attempts: blockedNetwork,
        label_files_read: false,
        selected_currency_scope:
          "Simulated user context applied only after extraction, identical in both arms; not model currency recognition or a prompt hint",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  process.stdout.write(
    JSON.stringify({
      offline_variants: predictions.length,
      model_calls: 0,
      external_requests: 0,
    }) + "\n",
  );
} finally {
  await server.close();
}
