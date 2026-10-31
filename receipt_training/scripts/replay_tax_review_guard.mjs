// Reuse twelve frozen Qwen crop/context drafts to isolate the tax-review change.
// No labels, model requests, external uploads or inferred tax settings.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
const root = fileURLToPath(new URL("../../", import.meta.url));
const before = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2/native-protocol-v1/offline-v1",
);
const out = resolve(root, "qa-artifacts/unknown-tax-native-replay-v1");
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const beforeMeta = JSON.parse(await readFile(resolve(before, "metadata.json")));
const beforeBytes = await readFile(resolve(before, "predictions.jsonl"));
if (sha(beforeBytes) !== beforeMeta.predictions_sha256)
  throw new Error("Frozen before evidence changed");
const rows = beforeBytes
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse)
  .filter((row) => row.method === "qwen");
if (rows.length !== 12) throw new Error("Unexpected frozen before cohort");
await mkdir(out);
await mkdir(resolve(out, "source"));
const sourceHashes = {},
  frozen = new Map(),
  loaded = {};
for (const name of await readdir(resolve(root, "src/lib"))) {
  if (!/[.](?:ts|mjs)$/.test(name)) continue;
  const bytes = await readFile(resolve(root, "src/lib", name));
  sourceHashes[name] = sha(bytes);
  if (
    name !== "gemini.ts" &&
    sha(bytes) !== beforeMeta.source_sha256["src/lib/" + name]
  )
    throw new Error("An unrelated library changed");
  frozen.set(resolve(root, "src/lib", name).replaceAll("\\", "/"), {
    name,
    text: bytes.toString("utf8"),
  });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
}
const self = await readFile(new URL(import.meta.url));
await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "node_modules/.vite-unknown-tax-replay-v1"),
  server: { host: "127.0.0.1", hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-tax-guard-source",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!entry) return null;
        loaded[entry.name] = sourceHashes[entry.name];
        return entry.text;
      },
    },
  ],
});
const projection = (receipt) => {
  const {
    id: _id,
    reviewChecks: _checks,
    items,
    adjustments,
    ...rest
  } = receipt;
  return {
    ...rest,
    items: items.map(({ id: _id, ...item }) => item),
    adjustments: adjustments.map(({ id: _id, ...adjustment }) => adjustment),
  };
};
const serialize = (value) =>
  JSON.stringify(value, (_key, item) =>
    typeof item === "bigint" ? item.toString() : item,
  );
const results = [];
try {
  const { receiptFromAi } = await server.ssrLoadModule("/src/lib/gemini.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const row of rows) {
    const native = resolve(
      root,
      "qa-artifacts/advanced-ocr/screening-native-png-v1-" + row.case,
    );
    const rawBytes = await readFile(resolve(native, "model-output.json"));
    if (sha(rawBytes) !== row.vision_output_sha256)
      throw new Error("Frozen native output changed");
    const raw = JSON.parse(rawBytes);
    const receipt = receiptFromAi(
      raw,
      "Local vision",
      row.context || undefined,
    );
    receipt.reviewChecks.push(
      ...row.receipt.reviewChecks.filter(
        (check) => check.reason === "coverage",
      ),
    );
    if (serialize(projection(receipt)) !== serialize(projection(row.receipt)))
      throw new Error("Tax guard changed a receipt value");
    const calculation = calculateReceipt(receipt);
    const monetary = [
      "hasRefunds",
      "subtotal",
      "receiptDiscount",
      "tax",
      "otherCharges",
      "total",
      "printed",
      "discrepancy",
      "equalCharges",
    ];
    for (const key of monetary)
      if (serialize(calculation[key]) !== serialize(row.calculation[key]))
        throw new Error("Tax guard changed arithmetic");
    const pending = receipt.reviewChecks.filter(
      (check) => check.field === "pricesIncludeTax" && !check.confirmedValue,
    );
    if (pending.length !== Number(raw.pricesIncludeTax === null))
      throw new Error(
        "Unknown tax basis did not produce exactly its required check",
      );
    results.push({
      case: row.case,
      mode: row.mode,
      receipt,
      calculation,
      unchanged_receipt_values: true,
      unchanged_monetary_totals: true,
      tax_basis_unknown: raw.pricesIncludeTax === null,
      previous_pending_checks: row.receipt.reviewChecks.length,
      current_pending_checks: receipt.reviewChecks.length,
      raw_model_output_sha256: sha(rawBytes),
    });
  }
  const bytes = Buffer.from(results.map(serialize).join("\n") + "\n");
  await writeFile(resolve(out, "predictions.jsonl"), bytes, { flag: "wx" });
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(
      {
        source_sha256: sourceHashes,
        loaded_frozen_module_sha256: loaded,
        runner_sha256: sha(self),
        before_predictions_sha256: sha(beforeBytes),
        predictions_sha256: sha(bytes),
        original_transactions: 6,
        offline_variants: rows.length,
        unknown_tax_variants: results.filter((row) => row.tax_basis_unknown)
          .length,
        changed_receipt_values: 0,
        changed_monetary_results: 0,
        label_files_read: false,
        inference_requests: 0,
        external_requests: 0,
        scope:
          "Only AI tax-basis source review changed. Existing currency context and every returned field/monetary result were retained. Frozen independent model evidence; not new extraction accuracy or latency.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      variants: results.length,
      unknown_tax_checks_added: results.filter((row) => row.tax_basis_unknown)
        .length,
      changed_receipt_values: 0,
      changed_monetary_results: 0,
      model_requests: 0,
      external_requests: 0,
    }),
  );
} finally {
  await server.close();
}
