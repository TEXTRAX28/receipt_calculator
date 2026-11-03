// Current frozen app interpretation of independently read, preselected variants.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [tag, planTag, readingTag] = process.argv.slice(2);
assert([tag, planTag, readingTag].every((name) => /^[\w-]+$/.test(name || "")));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const inputs = {};
async function read(name, expected) {
  assert(!name.includes("..") && !name.startsWith("/") && !name.includes(":"));
  const raw = await readFile(resolve(root, name));
  if (expected) assert.equal(sha(raw), expected, name);
  inputs[name] = sha(raw);
  return raw;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const study = await json(`qa-artifacts/${planTag}/study-plan.json`);
assert.equal(study.study_id, planTag.replace("-plan-", "-"));
const runnerName =
  "receipt_training/scripts/replay_browser_paddle_capture_variants.mjs";
for (const [name, expected] of Object.entries(study.input_sha256))
  await read(
    name === runnerName ? `qa-artifacts/${planTag}/source/${name}` : name,
    expected,
  );
const source = study.capture_source;
const planBytes = await read(`${source}/input-plan.json`);
const plan = JSON.parse(planBytes);
const folder = `qa-artifacts/${readingTag}`;
const control = await json(`${folder}-control/controller.json`);
assert(control.spawned && !control.error && control.exit_code === 0);
assert.equal(control.startup_required_ram, study.limits.startup_ram_bytes);
assert(control.minimum_available_ram >= study.limits.runtime_ram_floor_bytes);
const readings = await json(`${folder}/capture-results.json`);
assert.equal(readings.engine, "paddle-ppocrv6-tiny-browser-wasm");
assert(
  !readings.errors.length &&
    !readings.requests.external.length &&
    !readings.requests.writes.length,
);
assert.deepEqual(
  readings.cases.map((c) => c.receipt_id),
  study.cases.map((c) => c.receipt_id),
);
for (const [name, expected] of Object.entries(readings.input_sha256))
  await read(name, expected);
const frozen = new Map();
for (const [name, expected] of Object.entries(study.source_sha256)) {
  const raw = await read(`qa-artifacts/${planTag}/source/${name}`, expected);
  frozen.set(resolve(root, name).replaceAll("\\", "/"), { name, raw });
  const target = resolve(out, "source", name);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, raw, { flag: "wx" });
}
const loaded = {};
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
      name: "frozen-preparation-replay",
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
try {
  const { paddlePanel } = await server.ssrLoadModule(
    "/src/lib/paddle-layout.ts",
  );
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { reviewDeviceReading } = await server.ssrLoadModule(
    "/src/lib/device-review.ts",
  );
  const { requireCorrectedPhotoReview } = await server.ssrLoadModule(
    "/src/lib/capture-review.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const cases = [];
  let actualSections = 0;
  for (const entry of plan.cases) {
    const id = entry.record.receipt_id;
    let original;
    for (const variant of plan.variants) {
      const prepared = await json(`${source}/${id}-${variant}.json`);
      assert.equal(prepared.image_sha256, entry.record.sha256);
      let result;
      if (prepared.reused_original) {
        assert(original && prepared.abstained);
        result = {
          ...original,
          variant,
          abstained: true,
          reused_original: true,
          frames: [],
          new_ocr_sections: 0,
          preparations: prepared.preparations,
        };
      } else {
        const observed = readings.cases.find(
          (c) => c.receipt_id === `${id}--${variant}`,
        );
        assert(observed && !observed.error);
        assert.deepEqual(observed.frames, prepared.frames);
        assert.equal(observed.panels.length, observed.frames.length);
        const panels = [];
        let readingMs = 0;
        for (const [index, panel] of observed.panels.entries()) {
          const raw = await json(
            `${folder}/${panel.result}`,
            panel.result_sha256,
          );
          const frame = prepared.frames[index];
          assert.deepEqual(raw.frame, frame);
          assert(!raw.error);
          panels.push(
            paddlePanel(
              raw.reading,
              frame.width,
              frame.height,
              frame.photo,
              frame.part,
            ),
          );
          readingMs += raw.elapsed_ms;
        }
        actualSections += panels.length;
        const recognition = { engine: readings.engine, panels };
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
            ...assembled.warnings,
          ].slice(0, 60);
          // Same mandatory complete-list gate as App.tsx's enhanced-reader intake.
          if (
            !parsed.receipt.reviewChecks.some(
              (c) => c.scope === "receipt" && c.field === "items",
            )
          )
            parsed.receipt.reviewChecks.push({
              scope: "receipt",
              field: "items",
              reason: "source",
              other:
                "Check the complete purchase list, quantities, amounts and overlapping rows against every photo. The enhanced reader is experimental.",
              confirmedValue: "",
            });
          const receipt = requireCorrectedPhotoReview(
            reviewDeviceReading(
              parsed.receipt,
              parsed.sources,
              output.sourceLines || [],
              recognition,
              parsed.fieldSources,
              output.sourceConflicts,
              output.joinedSectionRows,
            ),
            variant === "manual-straighten",
          );
          assert(receipt.reviewChecks.every((check) => !check.confirmedValue));
          predictions.push({
            ...parsed,
            receipt,
            mode,
            reader: readings.engine,
            calculation: calculateReceipt(receipt),
          });
        }
        result = {
          receipt_id: id,
          image_sha256: entry.record.sha256,
          variant,
          reader: readings.engine,
          output,
          predictions,
          frames: prepared.frames,
          preparations: prepared.preparations,
          source_preparation_reused: true,
          preparation_ms: 0,
          reading_ms: readingMs,
          elapsed_ms: readingMs,
          abstained: false,
          new_ocr_sections: panels.length,
        };
      }
      if (variant === "original") original = result;
      await write(`${id}-${variant}.json`, result);
      cases.push({
        receipt_id: id,
        variant,
        error: null,
        reused_original: !!result.reused_original,
        new_ocr_sections: result.new_ocr_sections,
      });
    }
  }
  assert.equal(actualSections, 17);
  const self = await readFile(fileURLToPath(import.meta.url));
  await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
  await writeFile(resolve(out, "input-plan.json"), planBytes, { flag: "wx" });
  await write("metadata.json", {
    source_sha256: study.source_sha256,
    loaded_frozen_source_sha256: loaded,
    source_unchanged: true,
    cases,
    input_sha256: inputs,
    input_plan_sha256: sha(planBytes),
    runner_sha256: sha(self),
    planned_runner_sha256: study.source_sha256[runnerName],
    replay_correction:
      "The first offline replay wrote nine unscored CORD variants, then stopped because the UK record has currency=null. Supplied context now uses the original frozen country's GB/GBP and ID/IDR mapping, as in the preceding docTR study. Dependency discovery is disabled. Frozen app source, all image readings and reference/scoring definitions are unchanged; no additional inference.",
    actual_ocr_sections: actualSections,
    requests: { writes: [], external: [] },
    completed_at: new Date().toISOString(),
    scope:
      "Current frozen app paddlePanel/assembly/parser and enhanced-device review gates, on independently read fixed original/crop/straighten JPEGs. Actual SDK outputs retained. Preparation reused; no image edits, inferred fields or cleared checks. Not a full UI journey or physical phone test.",
    timing_scope:
      "Warm SDK prediction/decode; excludes reused preparation, startup and offline interpretation.",
    new_ocr_jobs_in_replay: 0,
    external_receipt_uploads: 0,
  });
  console.log(
    JSON.stringify({
      cases: cases.length,
      actual_ocr_sections: actualSections,
      new_ocr_jobs_in_replay: 0,
    }),
  );
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
