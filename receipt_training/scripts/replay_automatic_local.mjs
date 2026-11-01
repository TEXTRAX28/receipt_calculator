// Actual local orchestration with hash-bound saved model responses, never new inference.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const training = resolve(root, "receipt_training");
const args = process.argv.slice(2);
const option = (name) => args[args.indexOf(name) + 1];
const run = args.includes("--run") ? option("--run") : "";
const cohort = args.includes("--cohort") ? option("--cohort") : "original";
assert(/^[\w-]+$/.test(run) && ["original", "supplement"].includes(cohort));
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const local = (name) => {
  const path = resolve(root, name);
  assert(!relative(root, path).startsWith(".."), "Input outside project");
  return path;
};
const inventory = {};
const bytesAt = async (name, expected) => {
  const path = local(name),
    bytes = await readFile(path),
    hash = digest(bytes);
  if (expected) assert.equal(hash, expected, "Changed frozen input: " + name);
  inventory[relative(root, path).replaceAll("\\", "/")] = hash;
  return bytes;
};
const jsonAt = async (name, expected) =>
  JSON.parse(await bytesAt(name, expected));
const rows = (bytes) =>
  bytes.toString("utf8").trim().split(/\r?\n/).map(JSON.parse);
const folder = (name) => "receipt_training/evaluation/runs/" + name;
const manifestName =
  cohort === "original"
    ? "receipt_training/manifest.jsonl"
    : "receipt_training/annotations/private/supplement-manifest.jsonl";
const manifest = rows(await bytesAt(manifestName));
const visionFolder = folder("qwen-full-v2-verified-import");
const visionMeta = await jsonAt(visionFolder + "/metadata.json");
const vision = new Map(
  rows(
    await bytesAt(
      visionFolder + "/structured.jsonl",
      visionMeta.structured_sha256,
    ),
  ).map((row) => [row.receipt_id, row]),
);
const plan = await jsonAt(
  "qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1.json",
  visionMeta.predeclared_pilot_sha256,
);
const cases = new Map(plan.pilot.map((row) => [row.id, row]));
const ocrRuns = [];
for (const name of [
  "paddle-v6-full-development",
  "paddle-v6-full-evaluation",
  "paddle-v6-full-supplement",
]) {
  const meta = await jsonAt(folder(name) + "/metadata.json");
  assert(meta.completed_at);
  ocrRuns.push({
    name,
    meta,
    rows: new Map(
      rows(await bytesAt(folder(name) + "/ocr.jsonl", meta.ocr_sha256)).map(
        (row) => [row.receipt_id, row],
      ),
    ),
  });
}
const records = manifest.filter(
  (row) =>
    row.real_receipt &&
    row.included_in_pilot !== false &&
    vision.has(row.receipt_id),
);
assert.equal(records.length, cohort === "original" ? 50 : 3);
const output = local(folder(run));
await mkdir(output); // Exclusive run; never overwrite previous evidence.
await mkdir(resolve(output, "source"));
const frozen = new Map(),
  hashes = {},
  loaded = {};
for (const name of (await readdir(resolve(root, "src/lib")))
  .filter((name) => /\.(ts|mjs)$/.test(name))
  .sort()) {
  const bytes = await readFile(resolve(root, "src/lib", name));
  hashes[name] = digest(bytes);
  frozen.set(resolve(root, "src/lib", name).replaceAll("\\", "/"), {
    name,
    source: bytes.toString("utf8"),
  });
  await writeFile(resolve(output, "source", name), bytes, { flag: "wx" });
}
const runner = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(output, "evaluate.mjs"), runner, { flag: "wx" });
await writeFile(
  resolve(output, "package-lock.json"),
  await bytesAt("package-lock.json"),
  { flag: "wx" },
);
await bytesAt("receipt_training/evaluation/config.json");
const metadata = {
  scope:
    "Original saved PaddleOCR and independent Qwen3-VL outputs through actual primary/always/automatic local orchestration. Synthetic saved-response transport, no model calls, labels or image uploads. Replay time is not OCR or end-to-end latency.",
  cohort,
  run,
  node: process.version,
  started_at: new Date().toISOString(),
  source_sha256: hashes,
  source_served_from_frozen_snapshot: true,
  evaluation_runner_sha256: digest(runner),
  config_sha256: inventory["receipt_training/evaluation/config.json"],
  manifest_sha256: inventory[manifestName],
  package_lock_sha256: inventory["package-lock.json"],
  native_inference_requests: 0,
  api_requests: 0,
  external_requests: 0,
  api_cost: "0",
  paired_inputs: [],
};
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  cacheDir: resolve(root, "node_modules/.vite-" + run),
  server: {
    middlewareMode: true,
    hmr: false,
    watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
  },
  plugins: [
    {
      name: "frozen-adaptive-source",
      enforce: "pre",
      load(id) {
        const record = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!record) return null;
        loaded[record.name] = digest(record.source);
        return record.source;
      },
    },
  ],
});
const originalFetch = globalThis.fetch;
const predictions = [],
  unexpected = [];
try {
  const { extractComparedReceipt } = await server.ssrLoadModule(
    "/src/lib/compared-reader.ts",
  );
  const { extractWithLocalModel } = await server.ssrLoadModule(
    "/src/lib/local-model.ts",
  );
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { localCheckDecision } = await server.ssrLoadModule(
    "/src/lib/local-check-policy.ts",
  );
  metadata.historical_evidence_decisions = [];
  for (const record of records) {
    const id = record.receipt_id,
      entry = cases.get(id),
      candidate = vision.get(id);
    assert(entry && candidate);
    const request = await jsonAt(entry.request, entry.request_sha256);
    const paired = ocrRuns.find(
      (item) =>
        item.meta.panel_run === request.source_panel_run && item.rows.has(id),
    );
    assert(paired, "Missing exact primary pair for " + id);
    const ocr = paired.rows.get(id);
    assert.equal(record.sha256, candidate.image_sha256);
    assert.equal(ocr.image_sha256, candidate.image_sha256);
    const panelManifestName =
      folder(request.source_panel_run) + "/predictions.jsonl";
    const panelBytes = await bytesAt(
      panelManifestName,
      request.source_panel_manifest_sha256,
    );
    assert.equal(digest(panelBytes), paired.meta.panel_manifest_sha256);
    const source = rows(panelBytes).find((row) => row.receipt_id === id);
    const expected = source.panels.map((panel) => panel.sha256);
    assert.deepEqual(
      ocr.panels.map((panel) => panel.sha256),
      expected,
    );
    assert.equal(request.images.length, expected.length);
    const images = [],
      expectedTransport = [];
    for (const [index, name] of request.images.entries()) {
      const panel = source.panels[index],
        bytes = await bytesAt(name, expected[index]);
      const photo = panel.photo_index,
        part = panel.panel_index;
      if (!images[photo]) {
        assert.equal(photo, images.length, "Non-contiguous photo order");
        images.push({
          id: String(photo),
          name: "saved-panel.jpg",
          url: "",
          blob: new Blob([bytes], { type: "image/jpeg" }),
          panels: [],
        });
      }
      assert.equal(
        part,
        images[photo].panels.length,
        "Non-contiguous panel order",
      );
      images[photo].panels.push(new Blob([bytes], { type: "image/jpeg" }));
      expectedTransport.push({
        photo: photo + 1,
        part: part + 1,
        sha256: expected[index],
      });
    }
    const recognition = {
      engine: paired.meta.adapter,
      panels: ocr.panels.map(
        ({ photo_index, panel_index, width, height, words, lines }) => ({
          photo: photo_index + 1,
          part: panel_index + 1,
          width,
          height,
          words,
          lines,
        }),
      ),
    };
    let compatibilityError = null;
    try {
      validateRecognition(recognition, expectedTransport);
    } catch (error) {
      compatibilityError = String(error);
    }
    // Policy-only inspection also covers old prepared panels that today's transport
    // rejects. Never change their pixels/geometry or bypass the live validation.
    const assembled = assembleRecognition(recognition);
    const parsedPrimary = parseReceiptWithSources(assembled);
    metadata.historical_evidence_decisions.push({
      receipt_id: id,
      decision: localCheckDecision(
        parsedPrimary.receipt,
        parsedPrimary.sources,
        assembled.sourceLines,
        recognition,
      ),
      current_recognition_compatible: compatibilityError === null,
      compatibility_error: compatibilityError,
    });
    metadata.paired_inputs.push({
      receipt_id: id,
      ocr_run: paired.name,
      ocr_sha256: paired.meta.ocr_sha256,
      vision_request_sha256: entry.request_sha256,
      source_panel_manifest_sha256: digest(panelBytes),
      panel_sha256: expected,
    });
    for (const mode of ["primary", "always", "auto"]) {
      const ledger = [];
      globalThis.fetch = async (url, init) => {
        try {
          assert(
            ["./api/receipts/recognize", "./api/receipts/vision"].includes(url),
            "Unexpected transport URL",
          );
          assert.equal(init?.method, "POST");
          assert.equal(init.headers["x-gather-request"], "receipt-scan");
          const body = JSON.parse(init.body);
          assert.deepEqual(Object.keys(body), ["panels"]);
          assert.deepEqual(
            body.panels.map(({ photo, part, data, ...extra }) => {
              assert.deepEqual(extra, {});
              return {
                photo,
                part,
                sha256: digest(Buffer.from(data, "base64")),
              };
            }),
            expectedTransport,
            "Independent readers must receive exact original prepared pixels/order",
          );
          ledger.push({
            url,
            body_sha256: digest(init.body),
            prepared_panels: expectedTransport,
          });
          return new Response(
            JSON.stringify(
              url.endsWith("/recognize")
                ? { recognition }
                : { receipt: candidate.receipt },
            ),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        } catch (error) {
          unexpected.push(String(error));
          throw error;
        }
      };
      const started = performance.now(),
        signal = new AbortController().signal;
      let result;
      try {
        if (mode === "primary") {
          const primary = await extractWithLocalModel(images, signal, () => {});
          const parsed = parseReceiptWithSources(primary);
          parsed.receipt.source = "ocr";
          parsed.receipt.warnings = [
            ...parsed.receipt.warnings,
            ...primary.warnings,
          ].slice(0, 60);
          result = {
            ...parsed,
            comparisonComplete: false,
            comparisonAttempted: false,
            decision: null,
          };
        } else
          result = await extractComparedReceipt(
            images,
            signal,
            () => {},
            undefined,
            mode,
          );
      } catch (error) {
        result = {
          error: String(error),
          comparisonComplete: false,
          comparisonAttempted: false,
          decision: null,
        };
      }
      assert.deepEqual(
        ledger.map((item) => item.url),
        [
          "./api/receipts/recognize",
          ...(result.comparisonAttempted ? ["./api/receipts/vision"] : []),
        ],
      );
      predictions.push({
        receipt_id: id,
        image_sha256: record.sha256,
        split: record.split,
        mode,
        receipt: result.receipt,
        ...(result.error
          ? { error: result.error }
          : { calculation: calculateReceipt(result.receipt) }),
        comparison_complete: result.comparisonComplete,
        comparison_attempted: result.comparisonAttempted,
        decision: result.decision,
        simulated_requests: ledger,
        elapsed_ms: Math.round(performance.now() - started),
      });
    }
  }
} catch (error) {
  await writeFile(
    resolve(output, "failure.json"),
    JSON.stringify(
      {
        error: String(error),
        unexpected_transport_attempts: unexpected,
        completed_variants: predictions.length,
        native_inference_requests: 0,
        api_requests: 0,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  throw error;
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
}
assert.deepEqual(unexpected, [], "Unexpected transport attempted");
for (const name of [
  "compared-reader.ts",
  "local-check-policy.ts",
  "parser.ts",
  "engine.ts",
  "verify-readings.ts",
  "panel-transport.ts",
])
  assert.equal(
    loaded[name],
    hashes[name],
    "Required module was not loaded from frozen source: " + name,
  );
const predictionBytes =
  predictions
    .map((row) =>
      JSON.stringify(row, (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    )
    .join("\n") + "\n";
metadata.completed_at = new Date().toISOString();
metadata.predictions_sha256 = digest(predictionBytes);
metadata.loaded_frozen_source_sha256 = loaded;
metadata.input_sha256 = inventory;
metadata.simulated_transport_requests = predictions.reduce(
  (sum, row) => sum + row.simulated_requests.length,
  0,
);
metadata.unexpected_transport_attempts = unexpected;
await writeFile(resolve(output, "predictions.jsonl"), predictionBytes, {
  flag: "wx",
});
await writeFile(
  resolve(output, "metadata.json"),
  JSON.stringify(metadata, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    run,
    receipts: records.length,
    variants: predictions.length,
    automatically_compared: predictions.filter(
      (row) => row.mode === "auto" && row.comparison_attempted,
    ).length,
    external_requests: 0,
    native_inference_requests: 0,
  }),
);
