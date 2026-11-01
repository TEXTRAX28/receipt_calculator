// Same saved original-fifty pixels/readings through frozen before/after modules.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2] || "invalid-line-recovery-v1";
assert(/^[\w-]+$/.test(run));
const out = resolve(root, "qa-artifacts", run);
const resultFolder = resolve(out, "replay");
const sha = (b) => createHash("sha256").update(b).digest("hex");
const inputs = {};
async function read(path, expected) {
  const b = await readFile(resolve(root, path));
  const digest = sha(b);
  if (expected) assert.equal(digest, expected, path);
  inputs[path] = digest;
  return b;
}
const json = async (path, expected) => JSON.parse(await read(path, expected));
const old = "qa-artifacts/row-first-original50-v1";
const plan = await json(old + "/plan.json"),
  execution = await json(old + "/execution.json");
assert(
  plan.cases.length === 50 &&
    execution.source_unchanged &&
    execution.calls.length === 48 &&
    execution.calls.every((row) => row.accepted),
);
for (const [path, expected] of Object.entries(plan.input_sha256))
  await read(path, expected);
const cases = [];
for (const item of plan.cases) {
  const retained = item.retained.candidate;
  const index = execution.calls.findIndex(
    (call) => call.id === item.id && call.variant === "candidate",
  );
  assert(retained || index >= 0);
  const path = retained
    ? retained.receipt
    : `${old}/${index + 1}-normalized.json`;
  cases.push({
    item,
    draft: await json(path),
    recognition: (await json(item.primary, plan.input_sha256[item.primary]))
      .recognition,
  });
}
await mkdir(resultFolder);
await mkdir(resolve(out, "after/src/lib"), { recursive: true });
const sources = {
  before: await json("qa-artifacts/" + run + "/before/source-sha256.json"),
  after: {},
};
for (const file of await readdir(resolve(root, "src/lib"))) {
  if (!/\.(ts|mjs)$/.test(file)) continue;
  const path = "src/lib/" + file,
    b = await readFile(resolve(root, path));
  sources.after[path] = sha(b);
  await writeFile(resolve(out, "after", path), b, { flag: "wx" });
}
await writeFile(
  resolve(out, "after/source-sha256.json"),
  JSON.stringify(sources.after, null, 2) + "\n",
  { flag: "wx" },
);
const self = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(resultFolder, "runner.mjs"), self, { flag: "wx" });
const rows = [],
  loaded = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in offline recovery replay");
};
try {
  for (const variant of ["before", "after"]) {
    const frozen = new Map();
    loaded[variant] = {};
    for (const [path, expected] of Object.entries(sources[variant])) {
      const b = await readFile(resolve(out, variant, path));
      assert.equal(sha(b), expected);
      frozen.set(resolve(root, path).replaceAll("\\", "/"), {
        path,
        text: b.toString("utf8"),
      });
    }
    const server = await createServer({
      root,
      configFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: resolve(root, `node_modules/.vite-invalid-recovery-${variant}`),
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [
        {
          name: "frozen-invalid-recovery-" + variant,
          enforce: "pre",
          load(id) {
            const s = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
            if (!s) return null;
            loaded[variant][s.path] = sources[variant][s.path];
            return s.text;
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
          const value = verifyIndependentReadings(
            draft,
            evidence,
            mode === "automatic" ? undefined : { currency },
          );
          for (const recovery of value.priceRecoveries || [])
            assert(
              value.receipt.reviewChecks.some(
                (c) =>
                  c.scope === "item" &&
                  c.itemId === recovery.itemId &&
                  c.field === "lineTotal" &&
                  c.reason === "recovered" &&
                  c.confirmedValue === "",
              ),
            );
          rows.push({
            receipt_id: item.id,
            image_sha256: item.record.sha256,
            split: item.record.split,
            variant,
            mode,
            ...value,
            calculation: calculateReceipt(value.receipt),
            elapsed_ms: 0,
            timing_scope:
              "Offline saved-reading replay, not model or workflow latency",
            context_scope:
              "Predeclared dataset currency supplied after extraction only in the known-currency branch; no model hint or automatic accuracy claim",
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
  pricesIncludeTax: receipt.pricesIncludeTax,
  taxMode: receipt.taxMode,
  taxCodes: receipt.taxCodes,
  items: receipt.items.map(
    ({ description, quantity, unitPrice, discount, taxCode }) => ({
      description,
      quantity,
      unitPrice,
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
for (const before of rows.filter((r) => r.variant === "before")) {
  const after = rows.find(
    (r) =>
      r.variant === "after" &&
      r.receipt_id === before.receipt_id &&
      r.mode === before.mode,
  );
  assert.deepEqual(
    financial(before.receipt),
    financial(after.receipt),
    before.receipt_id + " unrelated financial vector changed",
  );
  for (const [index, item] of after.receipt.items.entries())
    if (item.lineTotal !== before.receipt.items[index].lineTotal)
      assert(after.priceRecoveries.some((r) => r.itemId === item.id));
}
const bytes = Buffer.from(
  rows
    .map((r) =>
      JSON.stringify(r, (_, v) => (typeof v === "bigint" ? String(v) : v)),
    )
    .join("\n") + "\n",
);
await writeFile(resolve(resultFolder, "predictions.jsonl"), bytes, {
  flag: "wx",
});
await writeFile(
  resolve(resultFolder, "metadata.json"),
  JSON.stringify(
    {
      source_sha256: sources,
      loaded_frozen_source_sha256: loaded,
      input_sha256: inputs,
      runner_sha256: sha(self),
      predictions_sha256: sha(bytes),
      predictions: rows.length,
      unrelated_financial_vectors_unchanged: true,
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
    predictions: rows.length,
    unrelated_financial_vectors_unchanged: true,
    recoveries: rows
      .filter((r) => r.variant === "after")
      .map((r) => ({
        id: r.receipt_id,
        mode: r.mode,
        count: r.priceRecoveries.length,
      }))
      .filter((r) => r.count),
    new_model_requests: 0,
  }),
);
