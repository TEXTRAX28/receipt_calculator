// Offline postprocessing of saved readings of exactly the same two UK crops.
// No credentials, model inference, image upload, reference labels or browser UI.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createServer } from "vite";

const out = process.argv[2];
assert.match(
  out || "",
  /^qa-artifacts\/provider-review\/uk-multipart-offline-v\d+$/,
);
const snapshot = "qa-artifacts/provider-review/gemini35-uk-multipart-v2";
const local = "qa-artifacts/provider-review/local-redacted-comparison-v1";
const veryfi = "qa-artifacts/provider-review/veryfi-uk-v1/run";
const runner = "receipt_training/scripts/replay_uk_multipart_baseline.mjs";
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {},
  loaded = {},
  frozen = new Map();
const write = (name, value) =>
  writeFile(
    `${out}/${name}`,
    JSON.stringify(
      value,
      (_, v) => (typeof v === "bigint" ? String(v) : v),
      2,
    ) + "\n",
    { flag: "wx" },
  );
async function read(path, expected) {
  const bytes = await readFile(path),
    digest = sha(bytes);
  if (expected) assert.equal(digest, expected, path);
  inputs[path] = digest;
  return bytes;
}
const load = async (path, expected) => JSON.parse(await read(path, expected));

await mkdir(out);
await writeFile(out + "/runner.mjs", await read(runner), { flag: "wx" });
const prepared = await load(snapshot + "/prepared.json");
const plan = await load(snapshot + "/plan.json", prepared.proof.plan_sha256);
assert.equal(
  prepared.proof.plan_sha256,
  "e7295e0d68c7e5a0a1b3bebfac4155524e8a07ac8da2116861e1a82a1b0b9ea9",
);
const sources = prepared.proof.source_sha256;
for (const [name, digest] of Object.entries(sources)) {
  const bytes = await read(`${snapshot}/source/${name}`, digest);
  assert.equal(
    sha(await readFile(name)),
    digest,
    `Current source changed: ${name}`,
  );
  frozen.set(resolve(name).replaceAll("\\", "/"), {
    name,
    text: bytes.toString("utf8"),
  });
}
const veryfiMeta = await load(
  veryfi + "/metadata.json",
  "28932f8631e0b63f49c1ea61ca0a449d3b39fd49da2e09b09907a1f08d110e97",
);
const veryfiManifest = await load(
  veryfi + "/manifest.json",
  veryfiMeta.manifest_sha256,
);
const localMeta = await load(local + "/metadata.json");
for (const [i, image] of plan.images.entries()) {
  const bytes = await read(image.path, image.sha256);
  assert.equal(bytes.length, image.bytes);
  assert.equal(veryfiManifest.inputs[i].sha256, image.sha256);
  for (const call of localMeta.http) {
    assert.equal(call.status, 200);
    assert.deepEqual(call.images[i], {
      photo: i + 1,
      part: 1,
      sha256: image.sha256,
    });
  }
}
assert.equal(veryfiManifest.inputs.length, 2);
assert.equal(localMeta.http.length, 2);
assert(localMeta.http.every((call) => call.images.length === 2));
assert.equal(localMeta.crop_manifest_sha256, veryfiMeta.manifest_sha256);
const veryfiRaw = await load(
  veryfi + "/response.json",
  veryfiMeta.response_sha256,
);
const paddleRaw = await load(
  local + "/response-1.json",
  "a43ac8b7ccfd4a3839046ec31ac79087b85145b73f1c905cfa861c2188ab7032",
);
const qwenRaw = await load(
  local + "/response-2.json",
  "1d7a264b3a4e2fc9cb4d2234e6a5d7475ca18931a6bd21c58fc63e21edafa4f8",
);
await read("package-lock.json");
await write("plan.json", {
  scope:
    "One previously inspected transaction, four saved-reader postprocessings, automatic and supplied GBP contexts; eight views, not eight samples.",
  snapshot,
  source_sha256: sources,
  input_sha256: inputs,
  methods: ["veryfi-literal", "paddle-primary", "qwen-alone", "paddle-qwen"],
  contexts: ["automatic", "supplied-GBP"],
  external_requests: 0,
  new_model_calls: 0,
  labels_read_by_replay: false,
  limitations:
    "No overlap, merchant/date/currency recognition, browser, physical phone, new latency or generalization claim. Current source is unchanged.",
});

const priorFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error("Offline replay forbids network");
};
const server = await createServer({
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-uk-postprocessing",
      enforce: "pre",
      load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) {
          assert(
            !/[\\/]src[\\/]lib[\\/]|[\\/]server[\\/]/.test(id),
            `Unfrozen app dependency: ${id}`,
          );
          return null;
        }
        loaded[file.name] = sources[file.name];
        return file.text;
      },
    },
  ],
});
const predictions = [];
try {
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  const { assembleRecognition } = await server.ssrLoadModule(
    "/src/lib/receipt-layout.ts",
  );
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { receiptFromVeryfiText } =
    await server.ssrLoadModule("/src/lib/veryfi.ts");
  const { receiptFromAi } = await server.ssrLoadModule("/src/lib/gemini.ts");
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt, calculateSplit } =
    await server.ssrLoadModule("/src/lib/engine.ts");
  const { newState } = await server.ssrLoadModule("/src/lib/model.ts");
  const { checkIsPending } = await server.ssrLoadModule(
    "/src/lib/review-checks.ts",
  );
  const recognition = validateRecognition(paddleRaw.recognition, [
    { photo: 1, part: 1 },
    { photo: 2, part: 1 },
  ]);
  const assembled = assembleRecognition(recognition);
  await write("assembled-paddle.json", assembled);
  for (const context of [undefined, { currency: "GBP" }]) {
    const primary = parseReceiptWithSources(
      { ...assembled, recognition },
      context,
    ).receipt;
    primary.source = "ocr";
    primary.warnings = [...primary.warnings, ...assembled.warnings].slice(
      0,
      60,
    );
    const compared = verifyIndependentReadings(
      qwenRaw.receipt,
      recognition,
      context,
    );
    const candidates = [
      ["veryfi-literal", receiptFromVeryfiText(veryfiRaw.ocr_text, context)],
      ["paddle-primary", primary],
      ["qwen-alone", receiptFromAi(qwenRaw.receipt, "Local vision", context)],
      ["paddle-qwen", compared.receipt],
    ];
    for (const [method, receipt] of candidates) {
      const state = newState();
      state.receipt = receipt;
      state.people = [{ id: "offline-person", name: "Offline person" }];
      receipt.items.forEach((item) => {
        item.assignment.participants = ["offline-person"];
      });
      const canFinalizeWithoutReview = calculateSplit(state).canFinalize;
      assert.equal(canFinalizeWithoutReview, false);
      predictions.push({
        method,
        context: context ? "supplied-GBP" : "automatic",
        receipt,
        calculation: calculateReceipt(receipt),
        pending_source_checks: receipt.reviewChecks.filter((check) =>
          checkIsPending(receipt, check),
        ).length,
        can_finalize_without_review: canFinalizeWithoutReview,
      });
    }
    await write(`comparison-${context ? "GBP" : "automatic"}.json`, compared);
  }
} catch (error) {
  await write("failure.json", {
    error: String(error),
    external_requests: 0,
    new_model_calls: 0,
  });
  throw error;
} finally {
  await server.close();
  globalThis.fetch = priorFetch;
}
for (const [name, digest] of Object.entries(inputs))
  assert.equal(sha(await readFile(name)), digest, name);
for (const [name, digest] of Object.entries(sources))
  assert.equal(sha(await readFile(name)), digest, name);
for (const name of [
  "src/lib/parser.ts",
  "src/lib/engine.ts",
  "src/lib/veryfi.ts",
  "src/lib/gemini.ts",
  "src/lib/verify-readings.ts",
])
  assert.equal(loaded[name], sources[name]);
await write("predictions.json", predictions);
await write("metadata.json", {
  input_sha256: inputs,
  loaded_frozen_source_sha256: loaded,
  predictions_sha256: sha(await readFile(out + "/predictions.json")),
  source_unchanged: true,
  external_requests: 0,
  credentials_loaded: false,
  new_model_calls: 0,
  labels_read_by_replay: false,
  transactions: 1,
  views: predictions.length,
  scope:
    "Actual core postprocessing; excludes App source-region UI wiring and upload transport. No receipt or field checks confirmed.",
});
console.log(
  JSON.stringify(
    predictions.map((p) => ({
      method: p.method,
      context: p.context,
      rows: p.receipt.items.length,
      total: String(p.calculation.total),
      discrepancy: String(p.calculation.discrepancy),
      pending: p.pending_source_checks,
    })),
  ),
);
