// Offline same-pixel pilot: change canonical item property generation order only.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const output = resolve(root, "qa-artifacts", run);
await mkdir(output);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (path) => relative(root, path).replaceAll("\\", "/");
const inputs = {},
  sources = {};
async function read(path, expected) {
  const bytes = await readFile(resolve(root, path));
  const digest = sha(bytes);
  if (expected) assert.equal(digest, expected, path);
  inputs[path] = digest;
  return bytes;
}
const json = async (path, expected) => JSON.parse(await read(path, expected));
const previous = await json("qa-artifacts/literal-total-prompt-v1/plan.json");
const cases = ["cord-v2-train-000", "tesco-gb-1994"].map((id) =>
  previous.cases.find((row) => row.id === id),
);
assert(
  cases.every(
    (row) =>
      row?.record.split === "development" && row.representation === "canonical",
  ),
);
const requests = [];
const order = [
  "description",
  "lineTotal",
  "quantity",
  "unitPrice",
  "discount",
  "taxCode",
  "note",
  "sourcePhotos",
];
for (const [index, item] of cases.entries()) {
  await read(item.primary, previous.input_sha256[item.primary]);
  for (const image of item.images)
    await read(image, previous.input_sha256[image]);
  const old = previous.requests.find(
    (row) => row.id === item.id && row.variant === "control",
  );
  const control = await json(old.request, old.sha256);
  for (const variant of index % 2
    ? ["candidate", "control"]
    : ["control", "candidate"]) {
    const request = structuredClone(control);
    if (variant === "candidate") {
      const shape = request.schema.properties.items.items;
      assert.deepEqual(new Set(order), new Set(Object.keys(shape.properties)));
      assert.deepEqual(new Set(order), new Set(shape.required));
      shape.properties = Object.fromEntries(
        order.map((key) => [key, shape.properties[key]]),
      );
      shape.required = order;
    }
    const path = resolve(output, `${index + 1}-${variant}-request.json`);
    await writeFile(path, JSON.stringify(request, null, 2), { flag: "wx" });
    requests.push({
      id: item.id,
      variant,
      native_run: `${run}-${index + 1}-${variant}`,
      request: name(path),
      sha256: sha(await readFile(path)),
    });
  }
}
async function freeze(path) {
  const bytes = await readFile(resolve(root, path));
  sources[path] = sha(bytes);
  const target = resolve(output, "source", path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
for (const file of await readdir(resolve(root, "src/lib")))
  if (/\.(ts|mjs)$/.test(file)) await freeze("src/lib/" + file);
for (const path of [
  "server/extraction-instructions.mjs",
  "server/local-vision-format.mjs",
  "server/local-vision.mjs",
  "receipt_training/scripts/prepare_row_first_trial.mjs",
  "receipt_training/scripts/run_row_first_trial.mjs",
  "receipt_training/scripts/benchmark_vision_cli.py",
  "receipt_training/scripts/vision_cli_text.py",
  "receipt_training/evaluation/vision-candidate-manifest.json",
  "package-lock.json",
])
  await freeze(path);
const plan = {
  scope:
    "Two previously inspected development transactions with fresh identical-pixel canonical controls and candidates. Only item property/required-key generation order changes so lineTotal precedes quantity and unitPrice. Schema constraints, prompt, all source images, model/runtime/seed/token settings and deadline are unchanged. No labels, OCR or currency hints enter a model request. Multi-photo compact output is unchanged and outside this pilot.",
  promotion_gate:
    "Require improved known line prices without any per-transaction regression in known names, quantities, unit prices, discounts, tax, fees, rounding or copied totals, then inspect unsupported changes and broaden native regression before considering an app change. A two-case pilot is not a new full-cohort result.",
  cases,
  requests,
  candidate_item_key_order: order,
  deadline_seconds: 180,
  native_request_limit: 4,
  cloud_requests: 0,
  automatic_retries: 0,
  label_files_read: false,
  source_sha256: sources,
  input_sha256: inputs,
  prepared_at: new Date().toISOString(),
};
await writeFile(
  resolve(output, "plan.json"),
  JSON.stringify(plan, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    prepared_cases: 2,
    native_request_limit: 4,
    executed: 0,
    cloud_requests: 0,
  }),
);
