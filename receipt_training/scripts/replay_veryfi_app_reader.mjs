// Offline app integration replay. Synthetic transport, unchanged saved OCR text.
// This does not run recognition, upload receipt pixels, or reuse real document IDs.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2",
);
const tag = process.argv[2] || "saved-replay";
if (!/^[a-zA-Z0-9_-]{1,80}$/.test(tag))
  throw new Error("Choose a new bounded replay name");
const out = resolve(root, "qa-artifacts/veryfi-app-integration-v1", tag);
const sha = (data) => createHash("sha256").update(data).digest("hex");
const json = async (file) => JSON.parse(await readFile(file, "utf8"));
const stringify = (value) =>
  JSON.stringify(
    value,
    (_, entry) => (typeof entry === "bigint" ? entry.toString() : entry),
    2,
  );
const inputs = [];
const planBytes = await readFile(resolve(base, "run/plan.json"));
const priorBytes = await readFile(
  resolve(base, "ocr-text-reduced-price-v1/predictions.jsonl"),
);
const prior = priorBytes.toString("utf8").trim().split("\n").map(JSON.parse);
for (const entry of JSON.parse(planBytes).cases) {
  const bytes = await readFile(
    resolve(base, "run", entry.case, "response.json"),
  );
  const meta = await json(resolve(base, "run", entry.case, "metadata.json"));
  if (
    !meta.extraction_received ||
    sha(bytes) !== meta.response_sha256 ||
    meta.archive_sha256 !== entry.archive_sha256
  )
    throw new Error("Saved provider evidence changed");
  const record = JSON.parse(bytes);
  if (typeof record.ocr_text !== "string" || !record.ocr_text.trim())
    throw new Error("Missing literal OCR text");
  inputs.push({ entry, record, response_sha256: sha(bytes) });
}
if (inputs.length !== 6 || prior.length !== 12)
  throw new Error("Changed replay selection");
await mkdir(out);
await mkdir(resolve(out, "source"));
const sources = {},
  frozen = new Map(),
  loaded = {};
const libraryNames = (await readdir(resolve(root, "src/lib")))
  .filter((name) => /\.(ts|mjs)$/.test(name))
  .map((name) => "src/lib/" + name);
const files = [
  ...libraryNames,
  "server/veryfi-reader.mjs",
  "server/document-allowance.mjs",
  "server/receipt-zip.mjs",
  "server/receipt-api.mjs",
  "src/App.tsx",
  "vite.config.ts",
  "playwright.config.ts",
];
for (const name of files) {
  const bytes = await readFile(resolve(root, name));
  sources[name] = sha(bytes);
  await mkdir(resolve(out, "source", name, ".."), { recursive: true });
  await writeFile(resolve(out, "source", name), bytes, { flag: "wx" });
  if (name.startsWith("src/lib/"))
    frozen.set(resolve(root, name).replaceAll("\\", "/"), {
      name,
      text: bytes.toString("utf8"),
    });
}
await writeFile(
  resolve(out, "runner.mjs"),
  await readFile(new URL(import.meta.url)),
  { flag: "wx" },
);
let forbiddenNetworkAttempts = 0;
globalThis.fetch = async () => {
  forbiddenNetworkAttempts++;
  throw new Error("Network forbidden during saved-response replay");
};
const { createVeryfiReader, VERYFI_ENDPOINT } = await import(
  pathToFileURL(resolve(root, "server/veryfi-reader.mjs"))
);
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "node_modules/.vite-veryfi-app-replay-v1"),
  server: { host: "127.0.0.1", hmr: false, watch: null },
  plugins: [
    {
      name: "frozen-veryfi-app-replay",
      enforce: "pre",
      load(id) {
        const entry = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!entry) return null;
        loaded[entry.name] = sources[entry.name];
        return entry.text;
      },
    },
  ],
});
const predictions = [],
  calls = [];
try {
  const { receiptFromVeryfiText } =
    await server.ssrLoadModule("/src/lib/veryfi.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const jpeg = Buffer.alloc(300);
  jpeg.set([255, 216, 255, 224, 0, 16]);
  jpeg.set([255, 192, 0, 17, 8], 20);
  jpeg.writeUInt16BE(32, 25);
  jpeg.writeUInt16BE(32, 27);
  jpeg.set([255, 217], 298);
  for (const [index, input] of inputs.entries()) {
    const syntheticId = String(900001 + index);
    const reader = createVeryfiReader({
      clientId: "synthetic_replay_client",
      bearerKey: "synthetic_replay_bearer_key_not_real",
      directory: resolve(out, "synthetic-allowance"),
      grant: "offline-six-case-replay",
      limit: 6,
      fetcher: async (url, options) => {
        calls.push({
          case: input.entry.case,
          method: options.method,
          synthetic_id: syntheticId,
        });
        if (options.method === "POST" && url === VERYFI_ENDPOINT) {
          const body = JSON.parse(options.body);
          // Only transport identities are replaced. Every OCR/native field is saved provider data.
          return new Response(
            JSON.stringify({
              ...input.record,
              id: Number(syntheticId),
              external_id: body.external_id,
            }),
            {
              status: 201,
              headers: { "content-type": "application/json" },
            },
          );
        }
        if (
          options.method === "DELETE" &&
          url === VERYFI_ENDPOINT + "/" + syntheticId
        )
          return new Response(null, { status: 204 });
        throw new Error("Unrecognized synthetic transport call");
      },
    });
    const output = await reader.extract(
      [{ photo: 1, part: 1, data: jpeg.toString("base64") }],
      { signal: new AbortController().signal },
    );
    if (
      output.text !== input.record.ocr_text ||
      output.cleanup !== "provider-reported-success"
    )
      throw new Error("Literal text or synthetic cleanup changed");
    for (const [mode, context] of [
      ["automatic", undefined],
      ["known-currency", { currency: input.entry.offline_context_currency }],
    ]) {
      const receipt = receiptFromVeryfiText(output.text, context);
      const calculation = calculateReceipt(receipt);
      const old = prior.find(
        (row) => row.case === input.entry.case && row.mode === mode,
      );
      const slimReceipt = ({ id, source, reviewChecks, warnings, ...rest }) =>
        rest;
      const canonical = (value) =>
        JSON.stringify(value, (key, entry) =>
          ["id", "itemId", "issues"].includes(key)
            ? undefined
            : typeof entry === "bigint"
              ? entry.toString()
              : entry,
        );
      if (
        canonical(slimReceipt(receipt)) !==
          canonical(slimReceipt(old.receipt)) ||
        canonical(calculation) !== canonical(old.calculation)
      )
        throw new Error(
          `Financial fields changed: ${input.entry.case}/${mode}`,
        );
      if (!calculation.issues.length)
        throw new Error("An unreviewed replay became payable");
      predictions.push({
        case: input.entry.case,
        receipt_id: input.entry.receipt_id,
        mode,
        context: context || null,
        receipt,
        calculation,
        provider_response_sha256: input.response_sha256,
        literal_ocr_text_sha256: sha(Buffer.from(output.text)),
        financial_fields_unchanged: true,
        trusted: false,
      });
    }
  }
  for (const name of files)
    if (sha(await readFile(resolve(root, name))) !== sources[name])
      throw new Error("Source changed during replay");
  if (
    forbiddenNetworkAttempts ||
    calls.length !== 12 ||
    calls.filter((call) => call.method === "POST").length !== 6
  )
    throw new Error("Replay request invariant");
  const predictionBytes =
    predictions.map((row) => stringify(row).replace(/\n\s*/g, "")).join("\n") +
    "\n";
  await writeFile(resolve(out, "predictions.jsonl"), predictionBytes, {
    flag: "wx",
  });
  const metadata = {
    created_at: new Date().toISOString(),
    task: "saved Veryfi output through app adapter and parser",
    genuine_ocr_retest: false,
    actual_external_requests: 0,
    forbidden_network_attempts: forbiddenNetworkAttempts,
    synthetic_transport: {
      image:
        "300-byte JPEG header control; not receipt pixels or a codec fixture",
      replaced_fields: ["id", "external_id"],
      calls,
    },
    cases: inputs.length,
    variants: predictions.length,
    financial_fields_unchanged: 12,
    accepted_payable_results: 0,
    source_sha256: sources,
    loaded_ssr_modules: loaded,
    previous_predictions_sha256: sha(priorBytes),
    plan_sha256: sha(planBytes),
    predictions_sha256: sha(Buffer.from(predictionBytes)),
    limits: [
      "Selected currencies are supplied after extraction, not inferred",
      "No new OCR accuracy measurement",
      "Original provider IDs are never deleted or sent",
    ],
  };
  await writeFile(resolve(out, "metadata.json"), stringify(metadata) + "\n", {
    flag: "wx",
  });
  process.stdout.write(
    JSON.stringify({
      output: relative(root, out),
      variants: 12,
      financial_fields_unchanged: 12,
      actual_external_requests: 0,
      trusted_results: 0,
    }) + "\n",
  );
} finally {
  await server.close();
}
