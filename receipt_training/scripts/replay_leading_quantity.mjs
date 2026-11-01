// Actual old/new parser and independent verifier over identical saved evidence.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const output = resolve(root, "qa-artifacts", run);
await mkdir(output);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputHashes = {};
async function read(path, expected) {
  const bytes = await readFile(path);
  const actual = sha(bytes);
  if (expected) assert.equal(actual, expected, path);
  inputHashes[path.slice(root.length).replaceAll("\\", "/")] = actual;
  return bytes;
}
const json = async (path, expected) => JSON.parse(await read(path, expected));
const frozenRoot = resolve(root, "qa-artifacts/literal-total-prompt-v1");
const sourcePlan = await json(resolve(frozenRoot, "plan.json"));
const cohortRoot = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1",
);
const cohort = await json(resolve(cohortRoot, "plan.json"));
const ukRoot = resolve(
  root,
  "receipt_training/evaluation/runs/compact-local-native-uk-v1",
);
const ukPlan = await json(resolve(ukRoot, "plan.json"));
const ukMeta = await json(resolve(ukRoot, "metadata.json"));
const records = [...cohort.records, ukPlan.record];
assert.equal(records.length, 51);
const cases = [];
for (const record of records) {
  const uk = record.receipt_id === ukPlan.record.receipt_id;
  const folder = uk ? ukRoot : resolve(cohortRoot, record.receipt_id);
  const meta = uk ? ukMeta : await json(resolve(folder, "metadata.json"));
  const primary = await json(
    resolve(folder, "ocr-response.json"),
    uk ? undefined : meta.http[0].response_sha256,
  );
  let vision;
  if (record.receipt_id === "cord-v2-train-000") {
    const replacement = resolve(
      root,
      "receipt_training/evaluation/runs/long-single-photo-current-v1",
      record.receipt_id,
    );
    const later = await json(resolve(replacement, "metadata.json"));
    assert.equal(later.http[1].request_sha256, meta.http[0].request_sha256);
    vision = await json(
      resolve(replacement, "vision-response.json"),
      later.http[1].response_sha256,
    );
  } else if (uk) {
    // Same two current JPEGs, fresh native control from the completed prompt pair.
    const pair = await json(resolve(frozenRoot, "case-8.json"));
    assert(
      pair.id === record.receipt_id &&
        pair.variant === "control" &&
        pair.accepted,
    );
    vision = { receipt: await json(resolve(frozenRoot, "8-normalized.json")) };
  } else
    vision = await json(
      resolve(folder, "vision-response.json"),
      meta.http[1].response_sha256,
    );
  const panels = uk
    ? ukMeta.panels
    : (await json(resolve(folder, "result.json"))).panels.map(
        (panel, index) => ({ ...panel, photo: 1, part: index + 1 }),
      );
  cases.push({ record, primary, vision, panels });
}
const sourceMaps = {},
  loaded = {},
  predictions = [];
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during deterministic replay");
};
try {
  for (const variant of ["control", "candidate"]) {
    const frozen = new Map(),
      hashes = {};
    for (const [name, expected] of Object.entries(sourcePlan.source_sha256)) {
      if (!name.startsWith("src/lib/")) continue;
      const changed =
        variant === "candidate" &&
        [
          "src/lib/parser.ts",
          "src/lib/verify-readings.ts",
          "src/lib/review-checks.ts",
        ].includes(name);
      const bytes = changed
        ? await readFile(resolve(root, name))
        : await read(resolve(frozenRoot, "source", name), expected);
      hashes[name] = sha(bytes);
      frozen.set(resolve(root, name).replaceAll("\\", "/"), {
        name,
        text: bytes.toString("utf8"),
      });
      if (changed) {
        const target = resolve(output, "source-candidate", name);
        await mkdir(resolve(target, ".."), { recursive: true });
        await writeFile(target, bytes, { flag: "wx" });
      }
    }
    sourceMaps[variant] = hashes;
    const actualLoads = {};
    const server = await createServer({
      root,
      configFile: false,
      appType: "custom",
      logLevel: "error",
      cacheDir: resolve(root, `node_modules/.vite-${run}-${variant}`),
      server: {
        middlewareMode: true,
        hmr: false,
        watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
      },
      plugins: [
        {
          name: "frozen-leading-quantity-comparison",
          enforce: "pre",
          load(id) {
            const source = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
            if (!source) return null;
            actualLoads[source.name] = hashes[source.name];
            return source.text;
          },
        },
      ],
    });
    try {
      const { parseReceiptWithSources } =
        await server.ssrLoadModule("/src/lib/parser.ts");
      const { assembleRecognition } = await server.ssrLoadModule(
        "/src/lib/receipt-layout.ts",
      );
      const { validateRecognition } = await server.ssrLoadModule(
        "/src/lib/recognition-schema.mjs",
      );
      const { verifyIndependentReadings } = await server.ssrLoadModule(
        "/src/lib/verify-readings.ts",
      );
      const { calculateReceipt } =
        await server.ssrLoadModule("/src/lib/engine.ts");
      for (const { record, primary, vision, panels } of cases) {
        const recognition = validateRecognition(primary.recognition, panels);
        const assembled = assembleRecognition(recognition);
        for (const mode of ["auto", "selected-context"]) {
          const currency = { GB: "GBP", ID: "IDR", TW: "TWD" }[record.country];
          assert(currency);
          const context = mode === "auto" ? undefined : { currency };
          const parsed = parseReceiptWithSources(assembled.text, context);
          const compared = verifyIndependentReadings(
            vision.receipt,
            recognition,
            context,
          );
          if (variant === "candidate") {
            for (const check of parsed.receipt.reviewChecks.filter(
              (check) =>
                check.scope === "item" &&
                check.field === "quantity" &&
                check.reason === "source",
            )) {
              const indices = parsed.sources[check.itemId];
              for (const item of compared.receipt.items) {
                if (
                  !item.quantity ||
                  !compared.sources[item.id]?.some((index) =>
                    indices.includes(index),
                  )
                )
                  continue;
                assert(
                  compared.receipt.reviewChecks.some(
                    (check) =>
                      check.scope === "item" &&
                      check.itemId === item.id &&
                      check.field === "quantity" &&
                      check.confirmedValue === "",
                  ),
                  "A leading-count source check was lost",
                );
              }
            }
          }
          for (const [reader, value] of [
            ["primary", parsed],
            ["compared", compared],
          ])
            predictions.push({
              receipt_id: record.receipt_id,
              image_sha256: record.sha256,
              split: record.split,
              variant,
              reader,
              mode,
              ...value,
              calculation: calculateReceipt(value.receipt),
              elapsed_ms: null,
            });
        }
      }
      for (const name of [
        "src/lib/parser.ts",
        "src/lib/verify-readings.ts",
        "src/lib/review-checks.ts",
        "src/lib/engine.ts",
      ])
        assert.equal(actualLoads[name], hashes[name]);
      loaded[variant] = actualLoads;
    } finally {
      await server.close();
    }
  }
} finally {
  globalThis.fetch = previousFetch;
}
const vector = (receipt) =>
  JSON.stringify({
    header: [
      receipt.currency,
      receipt.currencyUnresolved,
      receipt.subtotal,
      receipt.printedTotal,
      receipt.printedTax,
      receipt.pricesIncludeTax,
      receipt.taxMode,
      receipt.taxCodes,
    ],
    items: receipt.items.map((item) => [
      item.unitPrice,
      item.lineTotal,
      item.discount,
      item.taxCode,
    ]),
    adjustments: receipt.adjustments.map(({ id, ...row }) => row),
  });
for (const before of predictions.filter((row) => row.variant === "control")) {
  const after = predictions.find(
    (row) =>
      row.variant === "candidate" &&
      row.receipt_id === before.receipt_id &&
      row.reader === before.reader &&
      row.mode === before.mode,
  );
  assert.equal(
    vector(before.receipt),
    vector(after.receipt),
    `Unexpected financial change: ${before.receipt_id}/${before.reader}/${before.mode}`,
  );
}
await writeFile(
  resolve(output, "predictions.jsonl"),
  predictions
    .map((row) =>
      JSON.stringify(row, (_, value) =>
        typeof value === "bigint" ? String(value) : value,
      ),
    )
    .join("\n") + "\n",
  { flag: "wx" },
);
await writeFile(
  resolve(output, "replay.mjs"),
  await readFile(fileURLToPath(import.meta.url)),
  { flag: "wx" },
);
await writeFile(
  resolve(output, "metadata.json"),
  JSON.stringify(
    {
      scope:
        "Same-evidence deterministic old/new parser and independent-verifier replay, original fifty plus a separate two-photo UK supplement, two post-extraction context views. The first case uses the later successful deadline-regression vision and UK uses a later same-pixel native control; these mixed inference vintages do not constitute a fresh fifty-case native run or timed orchestration test.",
      source_sha256: sourceMaps,
      loaded_frozen_source_sha256: loaded,
      input_sha256: inputHashes,
      records: 51,
      paired_reader_contexts: 204,
      predictions: predictions.length,
      financial_vectors_unchanged: true,
      explicit_leading_count_checks_preserved: true,
      label_files_read: false,
      new_model_requests: 0,
      cloud_requests: 0,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    records: 51,
    paired_reader_contexts: 204,
    financial_vectors_unchanged: true,
    new_model_requests: 0,
  }),
);
