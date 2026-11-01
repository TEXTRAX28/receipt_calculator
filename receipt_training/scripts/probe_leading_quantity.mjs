// Offline parser prototype. Root application files remain unchanged.
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
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sourceRun = resolve(root, "qa-artifacts/literal-total-prompt-v1");
const plan = await readJson(resolve(sourceRun, "plan.json"));
const frozen = new Map();
for (const [name, expected] of Object.entries(plan.source_sha256)) {
  if (!name.startsWith("src/lib/")) continue;
  const bytes = await readFile(resolve(sourceRun, "source", name));
  assert.equal(sha(bytes), expected);
  frozen.set(resolve(root, name).replaceAll("\\", "/"), { name, bytes });
}
const parserPath = resolve(root, "src/lib/parser.ts").replaceAll("\\", "/");
const originalParser = frozen.get(parserPath).bytes.toString("utf8");
let candidate = originalParser;
const replacements = [
  [
    "      const percentDeduction =",
    `      // Leading purchase counts are separate from a pack measurement.
      // Negative-row classification is unchanged in this prototype.
      const leadingQuantity =
        !quantity && !/[-−]/.test(generic[2])
          ? description.match(/^(\\d+(?:[.,]\\d+)?)\\s*[x×]\\s+(\\p{L}.*)$/u)
          : null;
      const percentDeduction =`,
  ],
  [
    "            : description\n        ).slice(0, 180);",
    "            : leadingQuantity ? leadingQuantity[2] : description\n        ).slice(0, 180);",
  ],
  [
    '        item.quantity = quantity ? quantity[1].replace(",", ".") : "";',
    '        item.quantity = quantity ? quantity[1].replace(",", ".") : leadingQuantity ? leadingQuantity[1].replace(",", ".") : "";',
  ],
  [
    "        item.note = quantity\n",
    `        if (leadingQuantity) receipt.reviewChecks.push({
          scope: "item", itemId: item.id, field: "quantity", reason: "source",
          other: "Confirm that the leading count is purchased quantity, not part of the pack description.",
          confirmedValue: "",
        });
        item.note = quantity || leadingQuantity\n`,
  ],
];
for (const [before, after] of replacements) {
  assert.equal(
    candidate.split(before).length - 1,
    1,
    "Parser prototype target changed",
  );
  candidate = candidate.replace(before, after);
}
await writeFile(resolve(output, "control-parser.ts"), originalParser, {
  flag: "wx",
});
await writeFile(resolve(output, "candidate-parser.ts"), candidate, {
  flag: "wx",
});
await writeFile(
  resolve(output, "probe.mjs"),
  await readFile(fileURLToPath(import.meta.url)),
  { flag: "wx" },
);
const cohortPath = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1",
);
const cohort = await readJson(resolve(cohortPath, "plan.json"));
const records = [...cohort.records];
const ukPath = resolve(
  root,
  "receipt_training/evaluation/runs/compact-local-native-uk-v1",
);
const ukPlan = await readJson(resolve(ukPath, "plan.json"));
records.push(ukPlan.record);
const predictions = [],
  moduleHashes = {},
  inputHashes = {};
const previousFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during parser probe");
};
try {
  for (const variant of ["control", "candidate"]) {
    const loaded = {};
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
          name: "frozen-leading-quantity-probe",
          enforce: "pre",
          load(id) {
            const path = id.split("?")[0].replaceAll("\\", "/");
            const source = frozen.get(path);
            if (!source) return null;
            const text =
              path === parserPath && variant === "candidate"
                ? candidate
                : source.bytes.toString("utf8");
            loaded[source.name] = sha(Buffer.from(text));
            return text;
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
      const { calculateReceipt } =
        await server.ssrLoadModule("/src/lib/engine.ts");
      for (const record of records) {
        const file =
          record.receipt_id === ukPlan.record.receipt_id
            ? resolve(ukPath, "ocr-response.json")
            : resolve(cohortPath, record.receipt_id, "ocr-response.json");
        const bytes = await readFile(file);
        inputHashes[file.slice(root.length).replaceAll("\\", "/")] = sha(bytes);
        const recognition = JSON.parse(bytes).recognition;
        const assembled = assembleRecognition(recognition);
        for (const mode of ["auto", "selected-context"]) {
          const currency = { GB: "GBP", ID: "IDR", TW: "TWD" }[record.country];
          assert(
            currency,
            "Expected explicit dataset country for context diagnostic",
          );
          const context = mode === "auto" ? undefined : { currency };
          const parsed = parseReceiptWithSources(assembled.text, context);
          predictions.push({
            receipt_id: record.receipt_id,
            image_sha256: record.sha256,
            split: record.split,
            variant,
            mode,
            elapsed_ms: null,
            ...parsed,
            calculation: calculateReceipt(parsed.receipt),
          });
        }
      }
      const synthetic = [
        ["2 x Tea 6.00", "Tea", "2"],
        ["1.5 × Apples 3.75", "Apples", "1.5"],
        ["6x340g Spam 14.99", "6x340g Spam", ""],
        ["6 x 340g Spam 14.99", "6 x 340g Spam", ""],
        ["Chicken skewer 15 9.49", "Chicken skewer 15", ""],
        ["2 x Pack 1x 5.00 5.00", "2 x Pack", "1"],
        ["Milk 1x 5.00 -5.00", "Milk", "1"],
        ["2 x Coupon 1.00", null, null],
      ];
      for (const [line, description, quantity] of synthetic) {
        const receipt = parseReceiptWithSources(
          `Market GBP\n${line}\nTOTAL GBP 6.00`,
        ).receipt;
        if (description === null) assert.equal(receipt.items.length, 0);
        else if (variant === "candidate") {
          assert.equal(receipt.items[0].description, description);
          assert.equal(receipt.items[0].quantity, quantity);
          if (/^\d.*[x×]\s+\p{L}/u.test(line) && !/1x 5/.test(line))
            assert(
              receipt.reviewChecks.some(
                (check) =>
                  check.scope === "item" &&
                  check.field === "quantity" &&
                  check.confirmedValue === "",
              ),
            );
        }
      }
      moduleHashes[variant] = loaded;
    } finally {
      await server.close();
    }
  }
} finally {
  globalThis.fetch = previousFetch;
}
const financialVector = (receipt) =>
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
let changed = 0;
for (const before of predictions.filter((row) => row.variant === "control")) {
  const after = predictions.find(
    (row) =>
      row.variant === "candidate" &&
      row.receipt_id === before.receipt_id &&
      row.mode === before.mode,
  );
  assert.equal(financialVector(before.receipt), financialVector(after.receipt));
  if (
    JSON.stringify(
      before.receipt.items.map((row) => [row.description, row.quantity]),
    ) !==
    JSON.stringify(
      after.receipt.items.map((row) => [row.description, row.quantity]),
    )
  )
    changed++;
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
  resolve(output, "metadata.json"),
  JSON.stringify(
    {
      input_hashes: inputHashes,
      module_hashes: moduleHashes,
      original_parser_sha256: sha(Buffer.from(originalParser)),
      candidate_parser_sha256: sha(Buffer.from(candidate)),
      records: records.length,
      paired_contexts: predictions.length / 2,
      changed_name_or_quantity_contexts: changed,
      price_unit_discount_tax_adjustment_vectors_unchanged: true,
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
    records: records.length,
    paired_contexts: predictions.length / 2,
    changed_contexts: changed,
    financial_vectors_unchanged: true,
    new_model_requests: 0,
  }),
);
