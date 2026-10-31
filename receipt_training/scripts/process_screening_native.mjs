// Frozen-code offline replay of saved native PNG model outputs. No labels/inference.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2",
);
const nativeFolder = resolve(folder, "native-protocol-v1");
const out = resolve(nativeFolder, "offline-v1");
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const planBytes = await readFile(resolve(nativeFolder, "plan.json")),
  plan = JSON.parse(planBytes);
const executionBytes = await readFile(resolve(nativeFolder, "execution.json"));
const execution = JSON.parse(executionBytes);
if (
  execution.plan_sha256 !== sha(planBytes) ||
  execution.results.some((row) => row.exit_code || row.timeout)
)
  throw new Error("Native comparison did not finish successfully");
const cloud = await json(
  resolve(root, "receipt_training/evaluation/veryfi-screening-plan-v1.json"),
);
const paddleFolder = resolve(
  root,
  "receipt_training/evaluation/runs",
  plan.paddle_run,
);
const paddleMeta = await json(resolve(paddleFolder, "metadata.json"));
const paddleBytes = await readFile(resolve(paddleFolder, "ocr.jsonl"));
if (
  sha(paddleBytes) !== paddleMeta.ocr_sha256 ||
  !paddleMeta.completed_at ||
  paddleMeta.errors
)
  throw new Error("Paddle evidence is incomplete or altered");
const paddle = new Map(
  paddleBytes
    .toString("utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => {
      const row = JSON.parse(line);
      return [row.receipt_id, row];
    }),
);
const inputs = [];
for (const row of plan.cases) {
  const raw = paddle.get(row.receipt_id);
  const visionFolder = resolve(root, "qa-artifacts/advanced-ocr", row.qwen_run);
  const meta = await json(resolve(visionFolder, "metadata.json"));
  const stdout = await readFile(resolve(visionFolder, "stdout.txt"));
  const data = await readFile(resolve(visionFolder, "model-output.json"));
  if (
    !raw ||
    raw.image_sha256 !== row.crop_sha256 ||
    raw.panels.length !== 1 ||
    raw.panels[0].sha256 !== row.crop_sha256 ||
    meta.images.length !== 1 ||
    meta.images[0].sha256 !== row.crop_sha256 ||
    meta.request_sha256 !== row.request_sha256 ||
    meta.stdout_sha256 !== sha(stdout) ||
    meta.exit_code ||
    !meta.parsed_json ||
    meta.error
  )
    throw new Error("Independent native model inputs or outputs differ");
  const wire = JSON.parse(
    stdout
      .toString("utf8")
      .replace(/\x1b\[[0-9;]*m/g, "")
      .trim(),
  );
  if (JSON.stringify(wire) !== JSON.stringify(JSON.parse(data)))
    throw new Error("Parsed output differs from complete native response");
  inputs.push({
    row,
    paddle: raw,
    vision: wire,
    vision_output_sha256: sha(data),
    currency: cloud.cases.find((item) => item.case === row.case)
      .offline_context_currency,
  });
}
// Use the exact unchanged app snapshot captured before native inference.
const captured = resolve(folder, "local-comparison-v1/source/src/lib");
const captureMeta = await json(
  resolve(folder, "local-comparison-v1/metadata.json"),
);
const frozen = new Map(),
  sourceHashes = {},
  loaded = {};
await mkdir(out);
await mkdir(resolve(out, "source"));
for (const name of await readdir(captured)) {
  if (!/[.](?:ts|mjs)$/.test(name)) continue;
  const raw = await readFile(resolve(captured, name));
  const path = "src/lib/" + name;
  if (
    sha(raw) !== captureMeta.source_sha256[path] ||
    sha(await readFile(resolve(root, path))) !== sha(raw)
  )
    throw new Error(
      "App source snapshot differs from the unchanged current app",
    );
  sourceHashes[path] = sha(raw);
  frozen.set(resolve(root, path).replaceAll("\\", "/"), {
    path,
    text: raw.toString("utf8"),
  });
  await writeFile(resolve(out, "source", name), raw, { flag: "wx" });
}
const self = await readFile(new URL(import.meta.url));
await writeFile(resolve(out, "processor.mjs"), self, { flag: "wx" });
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "node_modules/.vite-screening-native-v1"),
  server: { host: "127.0.0.1", hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-screening-source",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!entry) return null;
        loaded[entry.path] = sourceHashes[entry.path];
        return entry.text;
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
  const { receiptFromAi } = await server.ssrLoadModule("/src/lib/gemini.ts");
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const input of inputs) {
    const recognition = validateRecognition(
      {
        engine: paddleMeta.adapter,
        panels: input.paddle.panels.map(({ width, height, words, lines }) => ({
          photo: 1,
          part: 1,
          width,
          height,
          words,
          lines,
        })),
      },
      [{ photo: 1, part: 1 }],
    );
    const assembled = assembleRecognition(recognition);
    for (const [mode, context] of [
      ["automatic", undefined],
      ["known-currency", { currency: input.currency }],
    ]) {
      const readings = [
        ["paddle", parseReceiptWithSources(assembled.text, context).receipt],
        ["qwen", receiptFromAi(input.vision, "Local vision", context)],
        [
          "hybrid",
          verifyIndependentReadings(input.vision, recognition, context).receipt,
        ],
      ];
      for (const [method, receipt] of readings) {
        const originalCalculation = calculateReceipt(receipt);
        receipt.reviewChecks.push({
          scope: "receipt",
          field: "items",
          reason: "coverage",
          other: "Research crop draft requires source verification",
          confirmedValue: "",
        });
        predictions.push({
          case: input.row.case,
          receipt_id: input.row.receipt_id,
          method,
          mode,
          context: context || null,
          receipt,
          calculation: calculateReceipt(receipt),
          calculation_before_research_check: originalCalculation,
          source_crop_sha256: input.row.crop_sha256,
          vision_output_sha256: input.vision_output_sha256,
          trusted: false,
        });
      }
    }
  }
  const bytes = Buffer.from(
    predictions
      .map((row) =>
        JSON.stringify(row, (_k, value) =>
          typeof value === "bigint" ? value.toString() : value,
        ),
      )
      .join("\n") + "\n",
  );
  await writeFile(resolve(out, "predictions.jsonl"), bytes, { flag: "wx" });
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(
      {
        source_sha256: sourceHashes,
        loaded_frozen_module_sha256: loaded,
        processor_sha256: sha(self),
        predictions_sha256: sha(bytes),
        native_plan_sha256: sha(planBytes),
        native_execution_sha256: sha(executionBytes),
        paddle_output_sha256: sha(paddleBytes),
        paddle_metadata_sha256: sha(
          await readFile(resolve(paddleFolder, "metadata.json")),
        ),
        receipts: 6,
        variants: predictions.length,
        label_files_read: false,
        model_requests: 0,
        external_requests: 0,
        context_scope:
          "Predeclared known-currency context simulated only after extraction, equally across methods. Not a model hint, human-source verification or currency recognition success.",
        timing_scope:
          "Offline parsing/verification/calculation, never model inference or end-to-end app latency",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      receipts: 6,
      variants: predictions.length,
      frozen_modules_loaded: Object.keys(loaded).length,
      model_requests: 0,
      external_requests: 0,
    }),
  );
} finally {
  await server.close();
}
