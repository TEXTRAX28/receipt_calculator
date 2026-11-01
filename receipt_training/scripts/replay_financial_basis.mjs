// Offline before/after replay. No new OCR, model calls, hints or label reads.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2] || "financial-basis-recovery-v1";
assert(/^[\w-]+$/.test(run));
const out = resolve(root, "qa-artifacts", run);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {};
async function read(path, expected) {
  const bytes = await readFile(resolve(root, path));
  const digest = sha(bytes);
  if (expected) assert.equal(digest, expected, path);
  inputs[path] = digest;
  return bytes;
}
const json = async (path, expected) => JSON.parse(await read(path, expected));
const old = "qa-artifacts/row-first-original50-v1";
const plan = await json(old + "/plan.json");
const execution = await json(old + "/execution.json");
assert(
  plan.cases.length === 50 &&
    execution.source_unchanged &&
    execution.calls.length === 48,
);
assert(execution.calls.every((row) => row.accepted));
for (const [path, expected] of Object.entries(plan.input_sha256))
  await read(path, expected);
const cases = [];
for (const item of plan.cases) {
  const retained = item.retained.candidate;
  const index = execution.calls.findIndex(
    (call) => call.id === item.id && call.variant === "candidate",
  );
  assert(retained || index >= 0);
  cases.push({
    item,
    draft: await json(
      retained ? retained.receipt : `${old}/${index + 1}-normalized.json`,
    ),
    recognition: (await json(item.primary, plan.input_sha256[item.primary]))
      .recognition,
  });
}
const sources = {
  before: await json(
    "qa-artifacts/financial-basis-recovery-v1/before/source-sha256.json",
  ),
  after: {},
};
await mkdir(out, { recursive: true });
await mkdir(resolve(out, "replay"));
await mkdir(resolve(out, "after/src/lib"), { recursive: true });
for (const file of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(file)) continue;
  const path = "src/lib/" + file,
    bytes = await readFile(resolve(root, path));
  sources.after[path] = sha(bytes);
  await writeFile(resolve(out, "after", path), bytes, { flag: "wx" });
}
const self = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "replay/runner.mjs"), self, { flag: "wx" });
const rows = [],
  loaded = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in financial-basis replay");
};
try {
  for (const variant of ["before", "after"]) {
    const frozen = new Map();
    loaded[variant] = {};
    for (const [path, expected] of Object.entries(sources[variant])) {
      const bytes = await readFile(
        variant === "before"
          ? resolve(
              root,
              "qa-artifacts/financial-basis-recovery-v1/before",
              path,
            )
          : resolve(out, variant, path),
      );
      assert.equal(sha(bytes), expected);
      frozen.set(resolve(root, path).replaceAll("\\", "/"), {
        path,
        text: bytes.toString("utf8"),
      });
    }
    const server = await createServer({
      root,
      configFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: resolve(root, `node_modules/.vite-financial-basis-${variant}`),
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [
        {
          name: "frozen-financial-basis",
          enforce: "pre",
          load(id) {
            const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
            if (!entry) return null;
            loaded[variant][entry.path] = sources[variant][entry.path];
            return entry.text;
          },
        },
      ],
    });
    try {
      const { verifyIndependentReadings } = await server.ssrLoadModule(
        "/src/lib/verify-readings.ts",
      );
      const { validateRecognition } = await server.ssrLoadModule(
        "/src/lib/recognition-schema.mjs",
      );
      const { calculateReceipt } =
        await server.ssrLoadModule("/src/lib/engine.ts");
      for (const { item, draft, recognition } of cases) {
        const evidence = validateRecognition(recognition, item.panels);
        for (const mode of ["automatic", "known-currency"]) {
          const currency = { GB: "GBP", ID: "IDR", TW: "TWD" }[
            item.record.country
          ];
          assert(currency);
          const result = verifyIndependentReadings(
            draft,
            evidence,
            mode === "automatic" ? undefined : { currency },
          );
          if (result.taxBasisRecovery)
            assert(
              result.receipt.reviewChecks.some(
                (check) =>
                  check.field === "pricesIncludeTax" &&
                  check.reason === "recovered" &&
                  check.confirmedValue === "",
              ),
            );
          rows.push({
            receipt_id: item.id,
            image_sha256: item.record.sha256,
            split: item.record.split,
            variant,
            mode,
            ...result,
            calculation: calculateReceipt(result.receipt),
            elapsed_ms: 0,
            timing_scope:
              "Offline saved independent readings; no scanner latency",
          });
        }
      }
      for (const path of [
        "src/lib/verify-readings.ts",
        "src/lib/parser.ts",
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
const financial = (receipt) => ({
  currency: receipt.currency,
  currencyUnresolved: receipt.currencyUnresolved,
  merchant: receipt.merchant,
  date: receipt.date,
  subtotal: receipt.subtotal,
  printedTotal: receipt.printedTotal,
  printedTax: receipt.printedTax,
  taxMode: receipt.taxMode,
  taxCodes: receipt.taxCodes,
  items: receipt.items.map(
    ({ description, quantity, unitPrice, lineTotal, discount, taxCode }) => ({
      description,
      quantity,
      unitPrice,
      lineTotal,
      discount,
      taxCode,
    }),
  ),
  adjustments: receipt.adjustments.map(
    ({ label, kind, amount, allocation }) => ({
      label,
      kind,
      amount,
      allocation,
    }),
  ),
});
const recoveries = [];
for (const before of rows.filter((row) => row.variant === "before")) {
  const after = rows.find(
    (row) =>
      row.variant === "after" &&
      row.receipt_id === before.receipt_id &&
      row.mode === before.mode,
  );
  assert.deepEqual(
    financial(before.receipt),
    financial(after.receipt),
    before.receipt_id,
  );
  if (before.receipt.pricesIncludeTax !== after.receipt.pricesIncludeTax) {
    assert(
      before.receipt.pricesIncludeTax === true &&
        after.receipt.pricesIncludeTax === false &&
        after.taxBasisRecovery,
    );
    assert(
      after.calculation.issues.some(
        (issue) => issue.path === "pricesIncludeTax",
      ),
    );
    recoveries.push({
      receipt_id: after.receipt_id,
      mode: after.mode,
      sourceIndices: after.taxBasisRecovery.sourceIndices,
    });
  }
}
const bytes = Buffer.from(
  rows
    .map((row) =>
      JSON.stringify(row, (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    )
    .join("\n") + "\n",
);
await writeFile(resolve(out, "replay/predictions.jsonl"), bytes, {
  flag: "wx",
});
await writeFile(
  resolve(out, "replay/metadata.json"),
  JSON.stringify(
    {
      source_sha256: sources,
      frozen_source_paths: {
        before: "qa-artifacts/financial-basis-recovery-v1/before",
        after: `qa-artifacts/${run}/after`,
      },
      loaded_frozen_source_sha256: loaded,
      input_sha256: inputs,
      runner_sha256: sha(self),
      predictions_sha256: sha(bytes),
      prediction_views: rows.length,
      recoveries,
      unchanged_amounts_products_and_metadata: true,
      recovery_checks_unconfirmed: true,
      new_model_requests: 0,
      external_requests: 0,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    prediction_views: rows.length,
    recoveries,
    unchanged_amounts_products_and_metadata: true,
    new_model_requests: 0,
  }),
);
