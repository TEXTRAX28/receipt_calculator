// Seal four development pairs before inference. Never reads truth annotations.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";
import {
  compactVisionJsonSchema,
  compactVisionPrompt,
} from "../../server/local-vision-format.mjs";
import { literalTotalInstructions } from "./literal_total_prompt.mjs";

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
  const bytes = await readFile(path);
  const hash = sha(bytes);
  if (expected) assert.equal(hash, expected, name(path));
  inputs[name(path)] = hash;
  return bytes;
}
const json = async (path) => JSON.parse(await read(path));
const original = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1",
);
const cohort = await json(resolve(original, "metadata.json"));
assert(
  cohort.completed_at && cohort.source_unchanged && cohort.cases.length === 50,
);
const cases = [];
for (const id of ["cord-v2-train-000", "cord-v2-train-004", "tesco-gb-1994"]) {
  const record = cohort.records.find((row) => row.receipt_id === id);
  assert(record && record.split === "development");
  const folder = resolve(original, id);
  const result = await json(resolve(folder, "result.json"));
  const meta = await json(resolve(folder, "metadata.json"));
  await read(
    resolve(folder, "ocr-response.json"),
    meta.http[0].response_sha256,
  );
  const images = [];
  for (const [index, panel] of result.panels.entries()) {
    const image = resolve(folder, `panel-${index + 1}.jpg`);
    await read(image, panel.sha256);
    images.push(name(image));
  }
  cases.push({
    id,
    record,
    images,
    panels: result.panels.map((panel, index) => ({
      ...panel,
      photo: 1,
      part: index + 1,
    })),
    primary: name(resolve(folder, "ocr-response.json")),
    representation: "canonical",
  });
}
const uk = resolve(
  root,
  "receipt_training/evaluation/runs/compact-local-native-uk-v1",
);
const ukPlan = await json(resolve(uk, "plan.json"));
const ukMeta = await json(resolve(uk, "metadata.json"));
assert(
  ukMeta.completed_workflow &&
    ukMeta.completed_at &&
    ukPlan.record.split === "development",
);
await read(resolve(uk, "ocr-response.json"));
const ukImages = [];
for (const [index, panel] of ukMeta.panels.entries()) {
  const path = resolve(uk, `panel-${index + 1}.jpg`);
  await read(path, panel.sha256);
  ukImages.push(name(path));
}
cases.push({
  id: ukPlan.record.receipt_id,
  record: ukPlan.record,
  images: ukImages,
  panels: ukMeta.panels,
  primary: name(resolve(uk, "ocr-response.json")),
  representation: "compact",
});
async function freeze(path) {
  const bytes = await readFile(resolve(root, path));
  sources[path] = sha(bytes);
  const target = resolve(output, "source", path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
async function walk(path) {
  for (const file of await readdir(resolve(root, path), {
    withFileTypes: true,
  })) {
    const child = path + "/" + file.name;
    if (file.isDirectory()) await walk(child);
    else await freeze(child);
  }
}
await walk("src/lib");
for (const path of [
  "server/extraction-instructions.mjs",
  "server/local-vision-format.mjs",
  "server/local-vision.mjs",
  "receipt_training/scripts/literal_total_prompt.mjs",
  "receipt_training/scripts/prepare_literal_total_trial.mjs",
  "receipt_training/scripts/run_literal_total_trial.mjs",
  "receipt_training/scripts/benchmark_vision_cli.py",
  "receipt_training/scripts/vision_cli_text.py",
  "receipt_training/evaluation/vision-candidate-manifest.json",
  "package-lock.json",
])
  await freeze(path);
const canonical = z.toJSONSchema(aiReceiptSchema);
canonical.properties.items.items.properties.note = {
  type: "string",
  const: "",
};
canonical.properties.warnings.maxItems = 4;
const requests = [];
for (const [index, item] of cases.entries()) {
  // Alternate pair order to disclose/limit order effects; never infer a speed ratio.
  for (const variant of index % 2
    ? ["candidate", "control"]
    : ["control", "candidate"]) {
    const nativeRun = `${run}-${index + 1}-${variant}`;
    const request = {
      images: item.images,
      schema:
        item.representation === "compact" ? compactVisionJsonSchema : canonical,
      prompt:
        (item.representation === "compact"
          ? compactVisionPrompt
          : RECEIPT_INSTRUCTIONS) +
        (variant === "candidate" ? literalTotalInstructions : "") +
        item.panels
          .map(
            (panel, i) =>
              `\nImage ${i + 1} is original photo ${panel.photo}, detail panel ${panel.part}.`,
          )
          .join(""),
      context: 8192,
      max_tokens: 4000,
      image_tokens: 1536,
      gpu_layers: "auto",
      require_clean_schema: true,
    };
    const path = resolve(output, `${index + 1}-${variant}-request.json`);
    await writeFile(path, JSON.stringify(request, null, 2), { flag: "wx" });
    requests.push({
      id: item.id,
      variant,
      native_run: nativeRun,
      request: name(path),
      sha256: sha(await readFile(path)),
    });
  }
}
const plan = {
  scope:
    "Four previously inspected development transactions, each with a fresh same-pixel control and a candidate differing only by a general prompt clarification. Three one-photo canonical cases cover a long quantity receipt, grouped amounts/payments and reduced-price rows; the two-photo UK compact case guards coupons and VAT. No annotations, OCR, location or currency context enters either model request.",
  promotion_gate:
    "Require improved source-known line-price accuracy with no regressions in known purchase names/counts, quantities, unit prices, discounts, tax/fees/rounding or copied totals across these pairs. Inspect unsupported changes and retained review gates. A successful pilot alone does not certify a new full-cohort or public-ready reader.",
  cases,
  requests,
  deadline_seconds: 180,
  native_request_limit: 8,
  source_sha256: sources,
  input_sha256: inputs,
  cloud_requests: 0,
  automatic_retries: 0,
  label_files_read: false,
  prepared_at: new Date().toISOString(),
};
await writeFile(
  resolve(output, "plan.json"),
  JSON.stringify(plan, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    cases: cases.length,
    native_request_limit: 8,
    executed: 0,
    cloud_requests: 0,
  }),
);
