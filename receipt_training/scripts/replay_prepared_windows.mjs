// Paired interpretation only: exact retained SDK readings, no new OCR or upload.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const tag = process.argv[2];
assert(/^[\w-]+$/.test(tag || ""));
const out = resolve(root, "qa-artifacts", tag);
await mkdir(out);
const hashes = {},
  sha = (b) => createHash("sha256").update(b).digest("hex");
async function read(name, expected) {
  const path = resolve(root, name);
  assert(
    path.startsWith(resolve(root) + "\\") ||
      path.startsWith(resolve(root) + "/"),
  );
  assert(!name.split(/[\\/]/).at(-1).startsWith(".env"));
  const raw = await readFile(path);
  if (expected) assert.equal(sha(raw), expected, name);
  hashes[name] = sha(raw);
  return raw;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
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
const baselinePlan = await json(
  "qa-artifacts/browser-paddle-preparation-plan-v2/study-plan.json",
);
const sources = { before: {}, after: {} },
  snapshots = { before: new Map(), after: new Map() };
const names = [
  ...new Set([
    ...execFileSync("git", ["ls-files", "src/lib"], {
      cwd: root,
      encoding: "utf8",
    })
      .trim()
      .split(/\r?\n/),
    "src/lib/window-overlap.ts",
  ]),
];
for (const arm of ["before", "after"]) {
  const entries =
    arm === "before"
      ? Object.entries(baselinePlan.source_sha256).filter(([name]) =>
          name.startsWith("src/lib/"),
        )
      : names.map((name) => [name, undefined]);
  for (const [name, expected] of entries) {
    const raw = await read(
      arm === "before"
        ? "qa-artifacts/browser-paddle-preparation-plan-v2/source/" + name
        : name,
      expected,
    );
    sources[arm][name] = sha(raw);
    snapshots[arm].set(resolve(root, name).replaceAll("\\", "/"), {
      name,
      raw,
    });
    const target = resolve(out, "source", arm, name);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, raw, { flag: "wx" });
  }
}
const changes = names.filter(
  (name) => sources.before[name] !== sources.after[name],
);
assert.deepEqual(
  changes.sort(),
  [
    "src/lib/paddle-browser.ts",
    "src/lib/receipt-layout.ts",
    "src/lib/window-overlap.ts",
  ].sort(),
);
const cohorts = [];
const originalSource = "qa-artifacts/browser-paddle-tiny-original50-v1";
const originalInput = await json(originalSource + "/capture-input.json");
const originalPlan = await json(originalInput.source + "/input-plan.json");
const originalReadings = await json(originalSource + "/capture-results.json");
assert.equal(originalPlan.cases.length, 50);
for (const entry of originalPlan.cases) {
  const id = entry.record.receipt_id;
  cohorts.push({
    cohort: "original50",
    id,
    record: entry.record,
    variant: "original",
    source: originalSource,
    prepared: originalInput.cases.find((c) => c.receipt_id === id),
    observed: originalReadings.cases.find((c) => c.receipt_id === id),
  });
}
const preparedSource = "qa-artifacts/genuine-capture-read-v1";
const prepPlan = await json(preparedSource + "/input-plan.json");
const prepReadingsSource = "qa-artifacts/browser-paddle-preparation-tiny-v1";
const prepReadings = await json(prepReadingsSource + "/capture-results.json");
for (const entry of prepPlan.cases)
  for (const variant of prepPlan.variants) {
    const id = entry.record.receipt_id;
    const prepared = await json(`${preparedSource}/${id}-${variant}.json`);
    const effective = prepared.reused_original
      ? await json(`${preparedSource}/${id}-original.json`)
      : prepared;
    cohorts.push({
      cohort: id.startsWith("supplement-") ? "supplied-uk" : "preparation-cord",
      id,
      record: entry.record,
      variant,
      source: prepReadingsSource,
      prepared: effective,
      reused_original: !!prepared.reused_original,
      observed: prepReadings.cases.find(
        (c) =>
          c.receipt_id ===
          `${id}--${prepared.reused_original ? "original" : variant}`,
      ),
    });
  }
for (const reading of [originalReadings, prepReadings]) {
  assert(
    !reading.errors.length &&
      !reading.requests.external.length &&
      !reading.requests.writes.length,
  );
  for (const [name, expected] of Object.entries(reading.input_sha256))
    await read(name, expected);
}
for (const row of cohorts) {
  assert(row.observed && row.prepared && !row.observed.error);
  assert.deepEqual(row.observed.frames, row.prepared.frames);
  assert.equal(row.observed.image_sha256, row.record.sha256);
  row.raw = [];
  for (const panel of row.observed.panels) {
    const observed = await json(
      row.source + "/" + panel.result,
      panel.result_sha256,
    );
    await read(observed.frame.path, observed.frame.sha256);
    assert(!observed.error);
    row.raw.push(observed);
  }
}
await write("protocol.json", {
  recorded_before_replay: true,
  changes,
  source_sha256: sources,
  counts: { original50: 50, preparation_variants: 12, views_per_arm: 124 },
  input_sha256: hashes,
  scope:
    "Both arms receive identical actual SDK detections and source pixels. Before uses frozen parent app; after passes known preparation windows. Existing financial/reference rules and every pending review remain. No new inference.",
});
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in retained-reading replay");
};
const results = new Map();
const loaded = { before: {}, after: {} };
try {
  for (const arm of ["before", "after"]) {
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
          name: "frozen-window-replay",
          enforce: "pre",
          load(id) {
            const file = snapshots[arm].get(
              id.split("?")[0].replaceAll("\\", "/"),
            );
            if (!file) return;
            loaded[arm][file.name] = sha(file.raw);
            return file.raw.toString("utf8");
          },
        },
      ],
    });
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
      const { calculateReceipt } =
        await server.ssrLoadModule("/src/lib/engine.ts");
      for (const entry of cohorts) {
        const identity = `${entry.cohort}--${entry.id}--${entry.variant}`;
        const panels = entry.raw.map((r) =>
          paddlePanel(
            r.reading,
            r.frame.width,
            r.frame.height,
            r.frame.photo,
            r.frame.part,
          ),
        );
        const recognition = {
          engine: "paddle-ppocrv6-tiny-browser-wasm",
          panels,
        };
        const assembled = assembleRecognition(
          recognition,
          arm === "after"
            ? entry.prepared.preparations.map((p) => p.windows)
            : undefined,
        );
        const output = { ...assembled, recognition };
        const views = [];
        for (const mode of ["automatic", "known-currency"]) {
          const parsed = parseReceiptWithSources(
            output,
            mode === "automatic"
              ? undefined
              : {
                  currency:
                    entry.record.currency ||
                    { GB: "GBP", ID: "IDR" }[entry.record.country],
                },
          );
          parsed.receipt.source = "ocr";
          parsed.receipt.warnings = [
            ...parsed.receipt.warnings,
            ...assembled.warnings,
          ].slice(0, 60);
          if (
            !parsed.receipt.reviewChecks.some(
              (c) => c.scope === "receipt" && c.field === "items",
            )
          )
            parsed.receipt.reviewChecks.push({
              scope: "receipt",
              field: "items",
              reason: "source",
              confirmedValue: "",
              other:
                "Check every purchase against the original receipt; enhanced reading remains experimental.",
            });
          const receipt = requireCorrectedPhotoReview(
            reviewDeviceReading(
              parsed.receipt,
              parsed.sources,
              output.sourceLines,
              recognition,
              parsed.fieldSources,
              output.sourceConflicts,
              output.joinedSectionRows,
            ),
            entry.variant === "manual-straighten" && !entry.reused_original,
          );
          assert(receipt.reviewChecks.every((c) => !c.confirmedValue));
          views.push({
            ...parsed,
            receipt,
            mode,
            calculation: calculateReceipt(receipt),
            elapsed_ms: 0,
          });
        }
        if (!results.has(identity))
          results.set(identity, {
            receipt_id: entry.id,
            cohort: entry.cohort,
            record: entry.record,
            image_sha256: entry.record.sha256,
            variant: entry.variant,
            reused_original: !!entry.reused_original,
            frames: entry.prepared.frames,
            preparations: entry.prepared.preparations,
          });
        results.get(identity)[arm] = { output, views };
      }
    } finally {
      await server.close();
    }
  }
  for (const [identity, result] of results) {
    assert.deepEqual(
      result.before.output.recognition,
      result.after.output.recognition,
    );
    await write(identity + ".json", result);
  }
  const self = await readFile(fileURLToPath(import.meta.url));
  await writeFile(resolve(out, "runner.mjs"), self, { flag: "wx" });
  await write("metadata.json", {
    source_sha256: sources,
    loaded_source_sha256: loaded,
    input_sha256: hashes,
    runner_sha256: sha(self),
    cases: [...results.keys()],
    completed_at: new Date().toISOString(),
    new_model_inferences: 0,
    private_uploads: 0,
    scope:
      "62 retained cases/options,124 views per arm. Identical recognition and reference inputs. Source changes limited to enhanced preparation-window joining. No money edits or checks cleared; supplied currency and cohorts stay separate.",
  });
  console.log(
    JSON.stringify({
      cases: results.size,
      views_per_arm: results.size * 2,
      new_inferences: 0,
    }),
  );
} finally {
  globalThis.fetch = previousFetch;
}
