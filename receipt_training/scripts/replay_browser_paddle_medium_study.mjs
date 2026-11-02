// Identical frozen app parser on independent tiny and medium image readings.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [
  tag,
  tinyTag,
  mediumTag,
  studyTag = "browser-paddle-medium-paired-plan-v1",
] = process.argv.slice(2);
assert([tag, tinyTag, mediumTag].every((s) => /^[\w-]+$/.test(s || "")));
assert(/^browser-paddle-medium-paired-plan-v[1-9]\d*$/.test(studyTag));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const inputs = {};
async function read(name, expected) {
  assert(!name.includes("..") && !name.startsWith("/") && !name.includes(":"));
  assert(!name.split("/").at(-1).startsWith(".env"));
  const raw = await readFile(resolve(root, name));
  if (expected) assert.equal(sha(raw), expected, name);
  inputs[name] = sha(raw);
  return raw;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const write = async (name, value) => {
  const path = resolve(out, name);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    Buffer.isBuffer(value)
      ? value
      : JSON.stringify(
          value,
          (_, v) => (typeof v === "bigint" ? String(v) : v),
          2,
        ) + "\n",
    { flag: "wx" },
  );
};
const planBase = `qa-artifacts/${studyTag}`;
const plan = await json(planBase + "/study-plan.json");
assert.equal(plan.study_id, studyTag.replace("-plan-", "-"));
const frozen = new Map(),
  loaded = {};
for (const [name, expected] of Object.entries(plan.source_sha256)) {
  const raw = await read(`${planBase}/source/${name}`, expected);
  if (name.startsWith("src/lib/"))
    frozen.set(resolve(root, name).replaceAll("\\", "/"), { name, raw });
}
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-medium-study-parser",
      enforce: "pre",
      load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) return;
        loaded[file.name] = sha(file.raw);
        return file.raw.toString("utf8");
      },
    },
  ],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in saved-reading replay");
};
try {
  const { recognitionSchema } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const cases = [];
  for (const [size, sourceTag] of [
    ["tiny", tinyTag],
    ["medium", mediumTag],
  ]) {
    const adapted = await json(`qa-artifacts/${sourceTag}/adapted.json`);
    for (const [name, expected] of Object.entries(adapted.input_sha256))
      await read(name, expected);
    assert.equal(adapted.cases.length, 7);
    assert.equal(adapted.actual_ocr_sections, 8);
    for (const [index, c] of adapted.cases.entries()) {
      const entry = plan.cases[index];
      assert.equal(c.receipt_id, entry.receipt_id);
      assert.equal(c.image_sha256, entry.image_sha256);
      assert.deepEqual(c.frames, entry.frames);
      assert.equal(c.recognition.engine, `paddle-ppocrv6-${size}-browser-wasm`);
      const panels = recognitionSchema.shape.panels.parse(c.recognition.panels);
      const recognition = { engine: c.recognition.engine, panels };
      const output = { ...assembleRecognition(recognition), recognition };
      const predictions =
        entry.group === "genuine-whole"
          ? ["automatic", "known-currency"].map((mode) => {
              const context =
                mode === "known-currency" && entry.record.currency
                  ? { currency: entry.record.currency }
                  : undefined;
              const parsed = parseReceiptWithSources(output, context);
              parsed.receipt.source = "ocr";
              parsed.receipt.warnings = [
                ...parsed.receipt.warnings,
                ...(output.warnings || []),
              ].slice(0, 60);
              return {
                mode,
                supplied_currency: context?.currency || null,
                ...parsed,
                calculation: calculateReceipt(parsed.receipt),
              };
            })
          : [];
      await write(`${size}/${c.receipt_id}.json`, {
        ...entry,
        reader: recognition.engine,
        output,
        predictions,
        reading_ms: c.reading_ms,
        financial_edits: 0,
        checks_confirmed: 0,
      });
      cases.push({
        size,
        receipt_id: c.receipt_id,
        group: entry.group,
        predictions: predictions.length,
      });
    }
  }
  await write("runner.mjs", await readFile(fileURLToPath(import.meta.url)));
  await write("metadata.json", {
    study_plan_path: planBase + "/study-plan.json",
    cases,
    input_sha256: inputs,
    source_sha256: plan.source_sha256,
    loaded_source_sha256: loaded,
    new_model_calls: 0,
    external_receipt_uploads: 0,
    financial_edits: 0,
    checks_confirmed: 0,
    scope:
      "Frozen same parser, assembler, financial engine and references for both independent image readers. Four whole receipts scored separately from three selected areas. Automatic and currency-context modes separate. App-level mandatory review is not replayed; raw parser agreement is not permission to trust a draft.",
  });
  console.log(
    JSON.stringify({
      cases: cases.length,
      financial_predictions: cases.reduce((n, c) => n + c.predictions, 0),
      new_model_calls: 0,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
