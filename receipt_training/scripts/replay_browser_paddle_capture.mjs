// Frozen app assembly/parser, actual independently captured browser SDK polygons.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [tag, sourceTag, adaptedTag] = process.argv.slice(2);
assert(
  [tag, sourceTag, adaptedTag].every((name) => /^[\w-]+$/.test(name || "")),
);
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const inputs = {};
async function read(name, expected) {
  const raw = await readFile(resolve(root, name));
  if (expected) assert.equal(sha(raw), expected, name);
  inputs[name] = sha(raw);
  return raw;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const source = `qa-artifacts/${sourceTag}`;
const cohortMode = process.argv.includes("--original50");
const frozenSource = cohortMode
  ? "qa-artifacts/genuine-capture-read-v1"
  : source;
const oldMeta = await json(frozenSource + "/metadata.json");
const originalPlan = await json(
  source + "/input-plan.json",
  cohortMode ? undefined : oldMeta.input_plan_sha256,
);
const cohortInput = cohortMode
  ? await json(source + "/capture-input.json")
  : null;
if (cohortMode) {
  assert(
    cohortInput.paired_encoded_hashes_match && originalPlan.cases.length === 50,
  );
  for (const [name, expected] of Object.entries(cohortInput.input_sha256))
    await read(name, expected);
}
const baseline = cohortMode
  ? (
      await read(
        "receipt_training/evaluation/runs/tesseract-source-original50-v4/paired.jsonl",
      )
    )
      .toString("utf8")
      .trim()
      .split(/\r?\n/)
      .map(JSON.parse)
  : [];
const plan = { ...originalPlan, variants: ["original"] };
const planBytes = Buffer.from(JSON.stringify(plan, null, 2) + "\n");
const adapted = await json(`qa-artifacts/${adaptedTag}/adapted.json`);
for (const [name, expected] of Object.entries(adapted.input_sha256))
  await read(name, expected);
const frozen = new Map();
for (const [name, expected] of Object.entries(oldMeta.source_sha256)) {
  const raw = await read(frozenSource + "/source/" + name, expected);
  frozen.set(resolve(root, name).replaceAll("\\", "/"), { name, raw });
}
const loaded = {};
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-browser-paddle-replay",
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
const fetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in saved OCR replay");
};
const write = (name, value) =>
  writeFile(
    resolve(out, name),
    JSON.stringify(
      value,
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ) + "\n",
    { flag: "wx" },
  );
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
  for (const entry of plan.cases) {
    const id = entry.record.receipt_id;
    const reading = adapted.cases.find((c) => c.receipt_id === id);
    assert(reading && reading.image_sha256 === entry.record.sha256);
    const prepared = cohortMode
      ? cohortInput.cases.find((c) => c.receipt_id === id)
      : await json(`${source}/${id}-original.json`);
    assert(prepared);
    assert.deepEqual(reading.frames, prepared.frames);
    assert.equal(
      reading.recognition.engine,
      "paddle-ppocrv6-tiny-browser-wasm",
    );
    // Validate the shared panels contract without masquerading as a remote engine.
    const panels = recognitionSchema.shape.panels.parse(
      reading.recognition.panels,
    );
    assert.equal(panels.length, prepared.frames.length);
    assert.deepEqual(
      panels.map(({ photo, part, width, height }) => ({
        photo,
        part,
        width,
        height,
      })),
      prepared.frames.map(({ photo, part, width, height }) => ({
        photo,
        part,
        width,
        height,
      })),
    );
    const recognition = { engine: reading.recognition.engine, panels };
    const assembled = assembleRecognition(recognition);
    const output = { ...assembled, recognition };
    const predictions = [];
    for (const mode of ["automatic", "known-currency"]) {
      const parsed = parseReceiptWithSources(
        output,
        mode === "automatic" ? undefined : { currency: entry.record.currency },
      );
      parsed.receipt.source = "ocr";
      parsed.receipt.warnings = [
        ...parsed.receipt.warnings,
        "The experimental browser reader prepared this draft. Check every purchase, quantity, discount and amount against the originals.",
        ...assembled.warnings,
      ].slice(0, 60);
      predictions.push({
        mode,
        reader: recognition.engine,
        ...parsed,
        calculation: calculateReceipt(parsed.receipt),
      });
    }
    if (cohortMode) {
      const previous = baseline.find((c) => c.receipt_id === id);
      assert(previous && previous.image_sha256 === entry.record.sha256);
      assert.deepEqual(
        previous.after.panels.map((f) => f.sha256),
        reading.frames.map((f) => f.sha256),
      );
      for (const mode of ["automatic", "known-currency"]) {
        const parsed = parseReceiptWithSources(
          previous.after,
          mode === "automatic"
            ? undefined
            : { currency: entry.record.currency },
        );
        parsed.receipt.source = "ocr";
        predictions.push({
          mode,
          reader: "tesseract-js-6-eng",
          ...parsed,
          calculation: calculateReceipt(parsed.receipt),
        });
      }
    }
    const result = {
      receipt_id: id,
      image_sha256: entry.record.sha256,
      variant: "original",
      reader: recognition.engine,
      output,
      predictions,
      frames: reading.frames,
      preparations: prepared.preparations,
      source_preparation_reused: true,
      preparation_ms: 0,
      reading_ms: reading.reading_ms,
      elapsed_ms: reading.reading_ms,
      abstained: false,
      new_ocr_sections: panels.length,
    };
    await write(`${id}-original.json`, result);
    cases.push({
      receipt_id: id,
      variant: "original",
      error: null,
      new_ocr_sections: panels.length,
    });
  }
  for (const [name, expected] of Object.entries(oldMeta.source_sha256)) {
    const target = resolve(out, "source", name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(
      target,
      await read(frozenSource + "/source/" + name, expected),
      {
        flag: "wx",
      },
    );
  }
  const self = await readFile(fileURLToPath(import.meta.url));
  await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
  await writeFile(resolve(out, "input-plan.json"), planBytes, { flag: "wx" });
  await write("metadata.json", {
    source_sha256: oldMeta.source_sha256,
    loaded_frozen_source_sha256: loaded,
    source_unchanged: true,
    cases,
    input_sha256: inputs,
    input_plan_sha256: sha(planBytes),
    original_input_plan_sha256: inputs[source + "/input-plan.json"],
    runner_sha256: sha(self),
    requests: { writes: [], external: [] },
    actual_ocr_sections: adapted.actual_ocr_sections,
    cohort: cohortMode ? "original50" : "genuine-capture-four",
    scope:
      "Offline unchanged app assembly/parser on actual browser tiny Paddle WASM readings. Original prepared JPEG hashes verified against paired reader inputs. Optional original50 compares saved Tesseract observations with the same frozen parser and separately supplied currency context; no new Tesseract calls. Original variant only, no checks cleared or values edited. SDK regions are detected line fragments, not invented per-word boxes. Engine identity preserved; not a remote schema engine, app provider integration or blind holdout.",
    timing_scope:
      "Warm WASM prediction/decode per receipt after synthetic gate; reuses preparation, excludes initialization and offline parse time. Not end-to-end latency, p95, phone memory or a controlled latency comparison.",
    completed_at: new Date().toISOString(),
    external_receipt_uploads: 0,
    new_ocr_jobs_in_replay: 0,
  });
  console.log(
    JSON.stringify({
      cases: cases.length,
      actual_panels: adapted.actual_ocr_sections,
      new_ocr_in_replay: 0,
    }),
  );
} finally {
  globalThis.fetch = fetch;
  await server.close();
}
