// Paired offline parser/assembly comparison. No model, image upload or labels.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [tag] = process.argv.slice(2);
assert(/^[\w-]+$/.test(tag || ""));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const parent = "68654b2307b6db39cb133c0e4c30cdb1b798e63a";
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const inputs = {};
const write = async (name, value) => {
  const path = resolve(out, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, typeof value === "string" || Buffer.isBuffer(value)
    ? value : JSON.stringify(value, (_, v) => typeof v === "bigint" ? String(v) : v, 2) + "\n", { flag: "wx" });
};
async function read(name, expected) {
  const raw = await readFile(resolve(root, name));
  assert(!name.split(/[\\/]/).at(-1).startsWith(".env"));
  if (expected) assert.equal(sha(raw), expected, name);
  inputs[name] = sha(raw);
  return raw;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const records = (await read("receipt_training/manifest.jsonl")).toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
records.push(...(await read("receipt_training/annotations/private/supplement-manifest.jsonl")).toString("utf8").trim().split(/\r?\n/).map(JSON.parse));
const cases = [];
const paddleSeal = await json("receipt_training/evaluation/advanced-browser-paddle-v1.json");
const captureSeal = await json("receipt_training/evaluation/advanced-genuine-capture-v1.json");
// Reuse the previous benchmark's explicit currency context, never derive it
// from monetary labels or use it in automatic mode.
for (const name of ["browser-paddle-tiny-original50-parsed-v1", "browser-paddle-tiny-capture-parsed-v1"]) {
  const path = `qa-artifacts/${name}/input-plan.json`;
  assert(paddleSeal.evidence_sha256[path]);
  const plan = await json(path, paddleSeal.evidence_sha256[path]);
  for (const entry of plan.cases) {
    const found = records.find((r) => r.receipt_id === entry.record.receipt_id);
    assert(found && found.sha256 === entry.record.sha256);
    found.currency = entry.record.currency;
  }
}
for (const [group, path] of [
  ["original50", "qa-artifacts/browser-paddle-tiny-original50-adapted-v1/adapted.json"],
  ["genuine", "qa-artifacts/browser-paddle-tiny-capture-adapted-v1/adapted.json"],
]) {
  assert(paddleSeal.evidence_sha256[path]);
  const data = await json(path, paddleSeal.evidence_sha256[path]);
  for (const c of data.cases) {
    for (const frame of c.frames) await read(frame.path, frame.sha256);
    cases.push({ group, reader: c.recognition.engine, id: c.receipt_id, image_sha256: c.image_sha256, recognition: c.recognition });
  }
}
const tessPath = "receipt_training/evaluation/runs/tesseract-source-original50-v4/paired.jsonl";
assert(paddleSeal.evidence_sha256[tessPath]);
for (const c of (await read(tessPath, paddleSeal.evidence_sha256[tessPath])).toString("utf8").trim().split(/\r?\n/).map(JSON.parse))
  cases.push({ group: "original50", reader: "tesseract-js-6-eng", id: c.receipt_id, image_sha256: c.image_sha256, output: c.after });
for (const c of cases.filter((c) => c.group === "genuine")) {
  const path = `qa-artifacts/genuine-capture-doctr-parsed-v1/${c.id}-original.json`;
  assert(captureSeal.evidence_sha256[path]);
  const data = await json(path, captureSeal.evidence_sha256[path]);
  assert.equal(data.image_sha256, c.image_sha256);
  cases.push({ group: "genuine", reader: data.output.recognition.engine, id: c.id, image_sha256: c.image_sha256, recognition: data.output.recognition });
}
assert.equal(cases.length, 108);
for (const c of cases) {
  c.record = records.find((r) => r.receipt_id === c.id);
  assert(c.record && c.record.sha256 === c.image_sha256);
}
const names = execFileSync("git", ["ls-tree", "-r", "--name-only", parent, "src/lib"], { cwd: root, encoding: "utf8" }).trim().split(/\r?\n/);
const sources = {}, loaded = {};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network disabled in saved OCR replay"); };
try {
  for (const side of ["before", "after"]) {
    const frozen = new Map();
    sources[side] = {};
    loaded[side] = {};
    for (const name of names) {
      const raw = side === "before" ? execFileSync("git", ["show", `${parent}:${name}`], { cwd: root }) : await readFile(resolve(root, name));
      sources[side][name] = sha(raw);
      frozen.set(resolve(root, name).replaceAll("\\", "/"), { name, raw });
      await write(`source/${side}/${name}`, raw);
    }
    const server = await createServer({
      root, configFile: false, envDir: false, appType: "custom", logLevel: "error",
      optimizeDeps: { noDiscovery: true, include: [] },
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [{ name: "frozen-overlap-comparison", enforce: "pre", load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) return;
        loaded[side][file.name] = sha(file.raw);
        return file.raw.toString("utf8");
      } }],
    });
    try {
      const { assembleRecognition } = await server.ssrLoadModule("/src/lib/receipt-layout.ts");
      const { parseReceiptWithSources } = await server.ssrLoadModule("/src/lib/parser.ts");
      const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
      for (const c of cases) {
        const output = c.recognition ? { ...assembleRecognition(c.recognition), recognition: c.recognition } : c.output;
        const predictions = ["automatic", "known-currency"].map((mode) => {
          const context = mode === "known-currency" && c.record.currency ? { currency: c.record.currency } : undefined;
          const parsed = parseReceiptWithSources(output, context);
          parsed.receipt.source = "ocr";
          parsed.receipt.warnings = [...parsed.receipt.warnings, ...(output.warnings || [])].slice(0, 60);
          return { mode, supplied_currency: context?.currency || null, ...parsed, calculation: calculateReceipt(parsed.receipt) };
        });
        await write(`${side}/${c.group}/${c.reader}/${c.id}.json`, { receipt_id: c.id, image_sha256: c.image_sha256, record: c.record, predictions, output, financial_edits: 0, checks_confirmed: 0 });
      }
    } finally { await server.close(); }
  }
  for (const [name, expected] of Object.entries(sources.after)) assert.equal(sha(await readFile(resolve(root, name))), expected, "Source changed during replay");
  await write("runner.mjs", await readFile(fileURLToPath(import.meta.url)));
  await write("metadata.json", { parent_commit: parent, cases: cases.map(({ group, reader, id, image_sha256 }) => ({ group, reader, id, image_sha256 })), source_sha256: sources, loaded_source_sha256: loaded, input_sha256: inputs, new_model_calls: 0, external_receipt_uploads: 0, financial_edits: 0, checks_confirmed: 0, scope: "Same retained original50 and four familiar development receipts through frozen parent/current assembly and parser. Automatic and supplied-currency modes separate. No new inference, latency claim, labels in extraction or independent source verification. Parser replay does not run app-level review or hybrid VLM orchestration." });
  console.log(JSON.stringify({ cases: cases.length, predictions: cases.length * 4, new_model_calls: 0 }));
} finally { globalThis.fetch = originalFetch; }
