// Offline replay of literal OCR text only; no native money/currency/score is used.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2",
);
const tag = process.argv[2] || "ocr-text-app-v1";
if (!/^[\w-]+$/.test(tag)) throw new Error("Choose a new bounded replay name");
const out = resolve(folder, tag);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const planBytes = await readFile(resolve(folder, "run/plan.json"));
const plan = JSON.parse(planBytes);
const sourceReview = await json(resolve(folder, "run/source-review.json"));
if (
  sha(await readFile(resolve(folder, "screening-labels-v1.jsonl"))) !==
  sourceReview.screening_labels_sha256
)
  throw new Error("Frozen reference hash changed");
// The reference bytes above are only hash-checked, never decoded or passed to parsing.
const inputs = [];
for (const row of plan.cases) {
  const metaBytes = await readFile(
    resolve(folder, "run", row.case, "metadata.json"),
  );
  const meta = JSON.parse(metaBytes);
  const response = await readFile(
    resolve(folder, "run", row.case, "response.json"),
  );
  if (
    !meta.extraction_received ||
    meta.response_sha256 !== sha(response) ||
    meta.archive_sha256 !== row.archive_sha256
  )
    throw new Error("Missing/altered successful case");
  const text = JSON.parse(response).ocr_text;
  if (typeof text !== "string" || !text || text.length > 60000)
    throw new Error("Missing/bounded OCR text required");
  inputs.push({
    row,
    text,
    response_sha256: sha(response),
    metadata_sha256: sha(metaBytes),
  });
}
await mkdir(out);
await mkdir(resolve(out, "source"));
const frozen = new Map(),
  sources = {},
  loaded = {};
for (const name of await readdir(resolve(root, "src/lib"))) {
  if (!/[.](?:ts|mjs)$/.test(name)) continue;
  const bytes = await readFile(resolve(root, "src/lib", name));
  sources[name] = sha(bytes);
  frozen.set(resolve(root, "src/lib", name).replaceAll("\\", "/"), {
    name,
    text: bytes.toString("utf8"),
  });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
}
const runner = await readFile(new URL(import.meta.url));
await writeFile(resolve(out, "runner.mjs"), runner, { flag: "wx" });
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "node_modules/.vite-veryfi-screening-" + tag),
  server: { host: "127.0.0.1", hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-veryfi-text-parser",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!entry) return null;
        loaded[entry.name] = sources[entry.name];
        return entry.text;
      },
    },
  ],
});
const predictions = [];
try {
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const input of inputs)
    for (const [mode, context] of [
      ["automatic", undefined],
      ["known-currency", { currency: input.row.offline_context_currency }],
    ]) {
      const { receipt, sources: sourceLines } = parseReceiptWithSources(
        input.text,
        context,
      );
      const defaultCalculation = calculateReceipt(receipt);
      receipt.reviewChecks.push({
        scope: "receipt",
        field: "items",
        reason: "coverage",
        other: "Research provider text requires complete source review",
        confirmedValue: "",
      });
      predictions.push({
        case: input.row.case,
        receipt_id: input.row.receipt_id,
        method: "veryfi-ocr-text",
        mode,
        context: context || null,
        receipt,
        calculation: calculateReceipt(receipt),
        default_calculation_before_research_check: defaultCalculation,
        sourceLines,
        literal_ocr_text_sha256: sha(Buffer.from(input.text)),
        provider_response_sha256: input.response_sha256,
        provider_metadata_sha256: input.metadata_sha256,
        trusted: false,
      });
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
        source_sha256: sources,
        loaded_frozen_module_sha256: loaded,
        runner_sha256: sha(runner),
        predictions_sha256: sha(bytes),
        plan_sha256: sha(planBytes),
        receipts: 6,
        variants: predictions.length,
        model_requests: 0,
        external_requests: 0,
        ground_truth_values_read: false,
        reference_hash_checked_only: true,
        native_money_currency_or_confidence_fields_used: false,
        context_scope:
          "The known-currency branch simulates a predeclared user selection after extraction, equally to local controls. Not model currency recognition or source verification.",
        source_mapping_limit:
          "Literal combined OCR lines only. No original-photo/pixel box is invented for a parsed purchase.",
        timing_scope:
          "Offline parsing and calculation; no inference/end-to-end latency measurement",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      receipts: 6,
      offline_variants: predictions.length,
      frozen_modules_loaded: Object.keys(loaded).length,
      model_requests: 0,
      external_requests: 0,
    }),
  );
} finally {
  await server.close();
}
