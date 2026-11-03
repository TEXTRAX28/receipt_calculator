// Same current application and saved vision drafts; only primary OCR differs.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
assert(/^[\w-]+$/.test(tag || ""));
const base = `qa-artifacts/${tag}`;
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {}, loaded = {};
async function read(name, expected) {
  assert(!name.includes("..") && !name.includes(":") && !name.startsWith("/"));
  assert(!name.split("/").at(-1).startsWith(".env"));
  const bytes = await readFile(resolve(root, name));
  if (expected) assert.equal(sha(bytes), expected, name);
  inputs[name] = sha(bytes);
  return bytes;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const plan = await json(base + "/plan.json");
for (const [name, digest] of Object.entries(plan.input_sha256)) await read(name, digest);
const frozen = new Map();
for (const [name, digest] of Object.entries(plan.source_sha256)) {
  const raw = await read(`${base}/source/${name}`, digest);
  frozen.set(resolve(root, name).replaceAll("\\", "/"), { name, raw });
}
const originals = await json("qa-artifacts/row-first-original50-v1/plan.json");
const execution = await json("qa-artifacts/row-first-original50-v1/execution.json");
assert(originals.cases.length === 50 && execution.source_unchanged && execution.calls.length === 48);
assert(execution.calls.every((c) => c.accepted));
const doctr = new Map();
for (const split of ["development", "evaluation"]) {
  const folder = `receipt_training/evaluation/runs/doctr-full-${split}`;
  const meta = await json(folder + "/metadata.json");
  assert(meta.completed_at && meta.errors === 0 && meta.adapter === "doctr-db-resnet50-parseq-cpu");
  const values = (await read(folder + "/ocr.jsonl", meta.ocr_sha256)).toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
  for (const row of values) {
    assert(!doctr.has(row.receipt_id));
    doctr.set(row.receipt_id, row);
  }
}
assert.equal(doctr.size, 50);
const freshMeta = await json(plan.fresh_native_run + "/metadata.json");
assert(freshMeta.completed_at && freshMeta.adapter === "doctr-db-resnet50-parseq-cpu");
const fresh = (await read(plan.fresh_native_run + "/ocr.jsonl", freshMeta.ocr_sha256)).toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
assert.deepEqual(fresh.map((r) => r.receipt_id), plan.refreshed_ids);
for (const row of fresh) doctr.set(row.receipt_id, row);
const server = await createServer({
  root, configFile: false, envDir: false, appType: "custom", logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [{
    name: "frozen-doctr-primary-comparison", enforce: "pre",
    load(id) {
      const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
      if (!file) return;
      loaded[file.name] = sha(file.raw);
      return file.raw.toString("utf8");
    },
  }],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network disabled in saved-reading comparison"); };
const predictions = [], observations = [];
try {
  const { validateRecognition } = await server.ssrLoadModule("/src/lib/recognition-schema.mjs");
  const { assembleRecognition } = await server.ssrLoadModule("/src/lib/receipt-layout.ts");
  const { parseReceiptWithSources } = await server.ssrLoadModule("/src/lib/parser.ts");
  const { verifyIndependentReadings } = await server.ssrLoadModule("/src/lib/verify-readings.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const item of originals.cases) {
    const retained = item.retained.candidate;
    const index = execution.calls.findIndex((c) => c.id === item.id && c.variant === "candidate");
    assert(retained || index >= 0);
    const draft = await json(retained ? retained.receipt : `qa-artifacts/row-first-original50-v1/${index + 1}-normalized.json`);
    const paddle = (await json(item.primary, originals.input_sha256[item.primary])).recognition;
    const saved = doctr.get(item.id);
    assert.equal(saved.image_sha256, item.record.sha256);
    if (!saved.error) assert.equal(saved.panels.length, item.panels.length);
    for (const [i, panel] of (saved.error ? [] : saved.panels).entries()) {
      const supplied = item.panels[i];
      assert.deepEqual([panel.photo_index + 1, panel.panel_index + 1, panel.width, panel.height, panel.sha256], [supplied.photo, supplied.part, supplied.width, supplied.height, supplied.sha256]);
      await read(item.images[i], supplied.sha256);
    }
    const adapted = saved.error ? null : {
      engine: "doctr-db-resnet50-parseq-cpu",
      panels: saved.panels.map((p) => ({ photo: p.photo_index + 1, part: p.panel_index + 1, width: p.width, height: p.height, words: p.words, lines: p.lines })),
    };
    for (const [primary, recognition] of [["paddle", paddle], ["doctr", adapted]]) {
      let output;
      for (const mode of ["automatic", "known-currency"]) {
        const currency = { GB: "GBP", ID: "IDR", TW: "TWD" }[item.record.country];
        assert(currency);
        const context = mode === "known-currency" ? { currency } : undefined;
        for (const reader of ["primary", "hybrid"]) {
          const row = { receipt_id: item.id, image_sha256: item.record.sha256, split: item.record.split, primary, reader, mode, supplied_currency: context?.currency || null, elapsed_ms: 0, timing_scope: "Offline retained-reading replay; no inference or end-to-end latency measurement." };
          try {
            const evidence = validateRecognition(recognition, item.panels);
            output ??= assembleRecognition(evidence);
            const parsed = reader === "primary" ? parseReceiptWithSources(output.text, context) : verifyIndependentReadings(draft, evidence, context);
            predictions.push({ ...row, ...parsed, calculation: calculateReceipt(parsed.receipt) });
          } catch (error) {
            predictions.push({ ...row, error: String(error.message).slice(0, 500), receipt: {}, calculation: {} });
          }
        }
      }
      observations.push({ receipt_id: item.id, primary, recognition, output: output || null });
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
assert.equal(predictions.length, 400);
assert.equal(observations.length, 100);
for (const name of ["src/lib/verify-readings.ts", "src/lib/parser.ts", "src/lib/engine.ts"])
  assert.equal(loaded[name], plan.source_sha256[name]);
const stringify = (v) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? String(x) : x);
const out = resolve(root, base, "replay");
await mkdir(out);
const predictedBytes = Buffer.from(predictions.map(stringify).join("\n") + "\n");
const observedBytes = Buffer.from(observations.map(stringify).join("\n") + "\n");
await writeFile(resolve(out, "predictions.jsonl"), predictedBytes, { flag: "wx" });
await writeFile(resolve(out, "observations.jsonl"), observedBytes, { flag: "wx" });
await writeFile(resolve(out, "runner.mjs"), await readFile(fileURLToPath(import.meta.url)), { flag: "wx" });
await writeFile(resolve(out, "metadata.json"), JSON.stringify({ plan_sha256: inputs[base + "/plan.json"], input_sha256: inputs, loaded_source_sha256: loaded, source_sha256: plan.source_sha256, predictions_sha256: sha(predictedBytes), observations_sha256: sha(observedBytes), prediction_views: 400, observations: 100, new_model_calls: 0, private_uploads: 0, financial_edits: 0, checks_confirmed: 0, errors: predictions.filter((p) => p.error).length, scope: plan.scope }, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify({ prediction_views: 400, errors: predictions.filter((p) => p.error).length, new_model_calls: 0 }));
