import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const tag = process.argv[2];
assert(/^replay-v[1-9]\d*$/.test(tag));
const base = "qa-artifacts/azure-quantity-v1",
  out = base + "/" + tag;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const input = {},
  sources = {},
  loaded = {};
const read = async (name) => {
  const bytes = await readFile(name);
  input[name] = sha(bytes);
  return bytes;
};
const write = async (name, data) =>
  writeFile(
    out + "/" + name,
    JSON.stringify(data, (_, v) => (typeof v === "bigint" ? String(v) : v), 2) +
      "\n",
    { flag: "wx" },
  );
const plan = JSON.parse(await read(base + "/plan.json"));
const native = JSON.parse(
  await read("qa-artifacts/provider-review/azure-screening-v1/run/plan.json"),
);
const contextPlan = JSON.parse(
  await read(
    "qa-artifacts/provider-review/veryfi-screening-crops-v2/run/plan.json",
  ),
);
await mkdir(out);
const cases = [];
for (const entry of native.cases) {
  const folder =
    "qa-artifacts/provider-review/azure-screening-v1/run/" + entry.id;
  const meta = JSON.parse(await read(folder + "/metadata.json"));
  const bytes = await read(folder + "/response.json");
  assert.equal(sha(bytes), meta.response_sha256);
  const match = contextPlan.cases.find((c) => c.case === entry.id);
  assert.equal(match.receipt_id, entry.receipt_id);
  cases.push({
    entry,
    raw: JSON.parse(bytes),
    currency: match.offline_context_currency,
  });
}
const results = [];
const oldFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error("Offline replay forbids network");
};
try {
  for (const version of ["before", "after"]) {
    const frozen = new Map();
    sources[version] = {};
    loaded[version] = {};
    const files =
      version === "before"
        ? Object.keys(plan.source_sha256)
        : [
            ...(await readdir("src/lib"))
              .filter((n) => /\.(mjs|ts)$/.test(n))
              .map((n) => "src/lib/" + n),
            ...(await readdir("server"))
              .filter((n) => /\.(mjs|ts)$/.test(n))
              .map((n) => "server/" + n),
            "src/App.tsx",
          ];
    for (const name of files) {
      const bytes = await readFile(
        version === "before" ? base + "/before/" + name : name,
      );
      const digest = sha(bytes);
      if (version === "before") assert.equal(digest, plan.source_sha256[name]);
      sources[version][name] = digest;
      frozen.set(resolve(name).replaceAll("\\", "/"), {
        name,
        text: bytes.toString("utf8"),
      });
      const target = out + "/" + version + "/" + name;
      await mkdir(resolve(target, ".."), { recursive: true });
      await writeFile(target, bytes, { flag: "wx" });
    }
    const server = await createServer({
      configFile: false,
      envDir: false,
      appType: "custom",
      logLevel: "error",
      optimizeDeps: { noDiscovery: true },
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [
        {
          name: "frozen-azure-quantity",
          enforce: "pre",
          load(id) {
            const f = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
            if (!f) return null;
            loaded[version][f.name] = sources[version][f.name];
            return f.text;
          },
        },
      ],
    });
    try {
      const layout = await server.ssrLoadModule("/src/lib/azure-layout.mjs");
      const { receiptFromAzureWords } =
        await server.ssrLoadModule("/src/lib/azure.ts");
      const { calculateReceipt } =
        await server.ssrLoadModule("/src/lib/engine.ts");
      for (const { entry, raw, currency } of cases) {
        const panel = layout.projectAzurePage(raw, {
          photo: 1,
          part: 1,
          width: entry.width,
          height: entry.height,
        });
        const recognition = { engine: layout.AZURE_ENGINE, panels: [panel] };
        const hints =
          version === "after" ? layout.projectAzureQuantities(raw, panel) : [];
        for (const mode of ["automatic", "known-currency"]) {
          const result = receiptFromAzureWords(
            recognition,
            mode === "known-currency" ? { currency } : undefined,
            hints,
          );
          const receipt = result.receipt;
          assert(receipt.reviewChecks.every((c) => c.confirmedValue === ""));
          results.push({
            case: entry.id,
            receipt_id: entry.receipt_id,
            version,
            mode,
            hints,
            receipt,
            sources: result.sources,
            recognition,
            calculation: calculateReceipt(receipt),
          });
        }
      }
    } finally {
      await server.close();
    }
  }
} finally {
  globalThis.fetch = oldFetch;
}
assert.equal(results.length, 24);
const changes = [];
const plain = (r) => ({
  merchant: r.merchant,
  date: r.date,
  currency: r.currency,
  currencyUnresolved: r.currencyUnresolved,
  subtotal: r.subtotal,
  printedTotal: r.printedTotal,
  printedTax: r.printedTax,
  pricesIncludeTax: r.pricesIncludeTax,
  taxMode: r.taxMode,
  taxCodes: r.taxCodes,
  items: r.items.map(({ id, quantity, ...item }) => item),
  adjustments: r.adjustments.map(({ id, ...a }) => a),
});
for (const before of results.filter((r) => r.version === "before")) {
  const after = results.find(
    (r) =>
      r.version === "after" && r.case === before.case && r.mode === before.mode,
  );
  assert.deepEqual(plain(before.receipt), plain(after.receipt));
  assert.deepEqual(before.recognition, after.recognition);
  for (const [i, old] of before.receipt.items.entries()) {
    const item = after.receipt.items[i];
    if (old.quantity === item.quantity) continue;
    assert.equal(old.quantity, "");
    assert(
      after.receipt.reviewChecks.some(
        (c) =>
          c.scope === "item" &&
          c.itemId === item.id &&
          c.field === "quantity" &&
          c.confirmedValue === "",
      ),
    );
    changes.push({
      case: before.case,
      mode: before.mode,
      index: i,
      description: item.description,
      before: old.quantity,
      after: item.quantity,
    });
  }
}
for (const [name, digest] of Object.entries(sources.after))
  assert.equal(sha(await readFile(name)), digest);
await write("predictions.json", results);
const runner = await readFile(
  "receipt_training/scripts/replay_azure_quantities.mjs",
);
await writeFile(out + "/runner.mjs", runner, { flag: "wx" });
await write("metadata.json", {
  source_sha256: sources,
  loaded_source_sha256: loaded,
  input_sha256: input,
  predictions_sha256: sha(await readFile(out + "/predictions.json")),
  runner_sha256: sha(runner),
  prediction_views: 24,
  changes,
  other_fields_unchanged: true,
  source_words_unchanged: true,
  all_checks_unconfirmed: true,
  new_model_calls: 0,
  external_requests: 0,
});
console.log(
  JSON.stringify({
    prediction_views: 24,
    changes,
    new_model_calls: 0,
    other_fields_unchanged: true,
  }),
);
