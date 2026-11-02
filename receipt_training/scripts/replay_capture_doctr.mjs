// Same saved native observations, actual app computer-reader assembly/parser.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [tag, sourceTag, nativeTag] = process.argv.slice(2);
assert(
  [tag, sourceTag, nativeTag].every((name) => /^[\w-]+$/.test(name || "")),
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
const oldMeta = await json(source + "/metadata.json");
const planBytes = await read(
  source + "/input-plan.json",
  oldMeta.input_plan_sha256,
);
const plan = JSON.parse(planBytes);
const controller = await json(`qa-artifacts/${nativeTag}/controller.json`);
assert(controller.spawned && !controller.error && controller.exit_code === 0);
const native = controller.native_run;
const meta = await json(native + "/metadata.json");
assert(
  meta.completed_at &&
    meta.errors === 0 &&
    meta.adapter === "doctr-db-resnet50-parseq-cpu",
);
const readings = (await read(native + "/ocr.jsonl", meta.ocr_sha256))
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
assert(readings.length === 10);
const frozen = new Map();
for (const [name, expected] of Object.entries(oldMeta.source_sha256)) {
  const raw = await read(source + "/source/" + name, expected);
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
      name: "frozen-capture-model-replay",
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
      (_, value) => (typeof value === "bigint" ? String(value) : value),
      2,
    ) + "\n",
    { flag: "wx" },
  );
const cases = [];
try {
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { requireCorrectedPhotoReview } = await server.ssrLoadModule(
    "/src/lib/capture-review.ts",
  );
  for (const entry of plan.cases) {
    const id = entry.record.receipt_id;
    let original;
    for (const variant of plan.variants) {
      const prepared = await json(`${source}/${id}-${variant}.json`);
      let result;
      if (prepared.reused_original) {
        assert(original);
        result = {
          ...original,
          variant,
          abstained: true,
          reused_original: true,
          frames: [],
          new_ocr_sections: 0,
        };
      } else {
        const reading = readings.find(
          (r) => r.receipt_id === `${id}--${variant}`,
        );
        assert(
          reading &&
            !reading.error &&
            reading.panels.length === prepared.frames.length,
        );
        const panels = reading.panels.map(
          ({ photo_index, panel_index, sha256, ...panel }, index) => {
            assert.equal(sha256, prepared.frames[index].sha256);
            return { photo: photo_index + 1, part: panel_index + 1, ...panel };
          },
        );
        const recognition = validateRecognition(
          { engine: meta.adapter, panels },
          prepared.frames,
        );
        const assembled = assembleRecognition(recognition);
        const output = { ...assembled, recognition };
        const predictions = [];
        for (const mode of ["automatic", "known-currency"]) {
          const parsed = parseReceiptWithSources(
            output,
            mode === "automatic"
              ? undefined
              : { currency: { GB: "GBP", ID: "IDR" }[entry.record.country] },
          );
          parsed.receipt.source = "ocr";
          parsed.receipt.warnings = [
            ...parsed.receipt.warnings,
            "The computer model prepared this draft. Check every purchase, quantity, discount and amount against the originals.",
            ...assembled.warnings,
          ].slice(0, 60);
          const receipt = requireCorrectedPhotoReview(
            parsed.receipt,
            variant === "manual-straighten",
          );
          predictions.push({
            mode,
            ...parsed,
            receipt,
            calculation: calculateReceipt(receipt),
          });
        }
        result = {
          receipt_id: id,
          image_sha256: entry.record.sha256,
          variant,
          reader: meta.adapter,
          output,
          predictions,
          frames: prepared.frames,
          preparations: prepared.preparations,
          source_preparation_reused: true,
          preparation_ms: 0,
          reading_ms: reading.inference_ms,
          elapsed_ms: reading.inference_ms,
          abstained: false,
          new_ocr_sections: panels.length,
        };
      }
      if (variant === "original") original = result;
      cases.push({
        receipt_id: id,
        variant,
        error: null,
        abstained: !!result.abstained,
        reused_original: !!result.reused_original,
        new_ocr_sections: result.new_ocr_sections,
      });
      await write(`${id}-${variant}.json`, result);
    }
  }
  // Keep the scorer's source schema explicit; bytes come from the frozen app snapshot.
  for (const [name, expected] of Object.entries(oldMeta.source_sha256)) {
    const target = resolve(out, "source", name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, await read(source + "/source/" + name, expected), {
      flag: "wx",
    });
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
    runner_sha256: sha(self),
    requests: { writes: [], external: [] },
    actual_ocr_sections: controller.selected_panels,
    scope:
      "Offline actual computer-reader source assembly/parser on saved independent docTR observations of the same prepared JPEGs as Tesseract. No checks cleared or monetary fields edited. Mandatory corrected-photo coverage retained. Not a fresh HTTP/browser journey or a model promotion.",
    timing_scope:
      "Native docTR inference on reused frozen images; model initialization and preparation excluded. Incomparable to browser end-to-end timing. Zero preparation_ms denotes reused preparation, not free preparation.",
    completed_at: new Date().toISOString(),
    external_receipt_uploads: 0,
    new_ocr_jobs_in_replay: 0,
  });
  console.log(
    JSON.stringify({
      cases: cases.length,
      native_panels: controller.selected_panels,
      new_ocr_in_replay: 0,
    }),
  );
} finally {
  globalThis.fetch = fetch;
  await server.close();
}
