// Offline reading-interpretation replay. No new OCR, model calls or label reads.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2] || "grouped-amounts-v1";
assert(/^[\w-]+$/.test(run));
const beforeRoot = process.argv[3] || "qa-artifacts/grouped-amounts-v1/before";
assert(/^qa-artifacts\/[\w-]+\/before$/.test(beforeRoot));
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
  before: await json(beforeRoot + "/source-sha256.json"),
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
          ? resolve(root, beforeRoot, path)
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
      cacheDir: resolve(root, `node_modules/.vite-grouped-amounts-${variant}`),
      envDir: false,
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
      const { parseReceiptWithSources } =
        await server.ssrLoadModule("/src/lib/parser.ts");
      const { assembleRecognition } = await server.ssrLoadModule(
        "/src/lib/receipt-layout.ts",
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
          if (result.financialRoleRecovery) {
            const fields = ["adjustments"];
            if (
              result.financialRoleRecovery.previous.printedTax !==
              result.receipt.printedTax
            )
              fields.push("printedTax");
            if (
              result.financialRoleRecovery.previous.taxMode !==
              result.receipt.taxMode
            )
              fields.push("taxCodes");
            for (const field of fields)
              assert(
                result.receipt.reviewChecks.some(
                  (check) =>
                    check.scope === "receipt" &&
                    check.field === field &&
                    check.confirmedValue === "",
                ),
              );
          }
          const primary = parseReceiptWithSources(
            assembleRecognition(evidence).text,
            mode === "automatic" ? undefined : { currency },
          );
          const paymentExclusions = result.removedAdjustments.filter((entry) =>
            entry.reason.startsWith("payment-"),
          );
          if (paymentExclusions.length)
            assert(
              result.receipt.reviewChecks.some(
                (check) =>
                  check.scope === "receipt" &&
                  check.field === "adjustments" &&
                  ["coverage", "recovered", "source"].includes(check.reason) &&
                  check.confirmedValue === "",
              ),
            );
          rows.push({
            receipt_id: item.id,
            image_sha256: item.record.sha256,
            split: item.record.split,
            variant,
            mode,
            reader: "primary",
            ...primary,
            calculation: calculateReceipt(primary.receipt),
            elapsed_ms: 0,
            timing_scope: "Offline saved native reading; no scanner latency",
          });
          rows.push({
            reader: "hybrid",
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
const recoveries = rows
  .filter(
    (row) =>
      row.reader === "hybrid" &&
      row.variant === "after" &&
      row.financialRoleRecovery,
  )
  .map((row) => ({
    receipt_id: row.receipt_id,
    mode: row.mode,
    sourceIndices: row.financialRoleRecovery.sourceIndices,
  }));
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
        before: beforeRoot,
        after: `qa-artifacts/${run}/after`,
      },
      loaded_frozen_source_sha256: loaded,
      input_sha256: inputs,
      runner_sha256: sha(self),
      predictions_sha256: sha(bytes),
      prediction_views: rows.length,
      recoveries,
      references_changed: false,
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
    references_changed: false,
    new_model_requests: 0,
  }),
);
