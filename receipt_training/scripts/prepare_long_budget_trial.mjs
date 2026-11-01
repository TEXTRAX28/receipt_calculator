// Offline preparation only: one long one-photo timeout, unchanged canonical format.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""), "Use a new diagnostic name");
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (path) => relative(root, path).replaceAll("\\", "/");
const inputs = {},
  sources = {};
async function input(path, expected) {
  const bytes = await readFile(path);
  const actual = sha(bytes);
  if (expected) assert.equal(actual, expected, "Diagnostic input changed");
  inputs[name(path)] = actual;
  return bytes;
}
const original = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1",
);
const originalPlan = JSON.parse(await input(resolve(original, "plan.json")));
const summary = JSON.parse(
  await input(resolve(original, "case-summary-01.json")),
);
const folder = resolve(original, "cord-v2-train-000");
const meta = JSON.parse(await input(resolve(folder, "metadata.json")));
assert.equal(summary.receipt_id, meta.receipt_id);
assert.equal(
  summary.metadata_sha256,
  inputs[name(resolve(folder, "metadata.json"))],
);
const result = JSON.parse(await input(resolve(folder, "result.json")));
assert.equal(meta.comparison_complete, false);
assert.equal(meta.http.at(-1).status, 504);
assert(
  result.comparison_attempted && result.primary.receipt.items.length >= 15,
);
assert(
  meta.native_processes.some(
    (row) => row.stage === "vision-inference" && row.stdout_bytes > 0,
  ),
);
const images = [];
for (const [index, panel] of result.panels.entries()) {
  const path = resolve(folder, `panel-${index + 1}.jpg`);
  await input(path, panel.sha256);
  images.push(name(path));
}
for (const path of [
  "server/extraction-instructions.mjs",
  "server/local-vision.mjs",
  "src/lib/extraction-schema.mjs",
  "receipt_training/scripts/benchmark_vision_cli.py",
  "receipt_training/scripts/vision_cli_text.py",
  "receipt_training/scripts/prepare_long_budget_trial.mjs",
  "receipt_training/evaluation/vision-candidate-manifest.json",
  "package-lock.json",
]) {
  const bytes = await readFile(resolve(root, path));
  if (originalPlan.source_sha256[path])
    assert.equal(sha(bytes), originalPlan.source_sha256[path]);
  sources[path] = sha(bytes);
  const target = resolve(out, "source", path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
const schema = z.toJSONSchema(aiReceiptSchema);
schema.properties.items.items.properties.note = { type: "string", const: "" };
schema.properties.warnings.maxItems = 4;
const request = {
  images,
  schema,
  prompt:
    RECEIPT_INSTRUCTIONS +
    images
      .map(
        (_, i) =>
          `\nImage ${i + 1} is original photo 1, detail panel ${i + 1}.`,
      )
      .join(""),
  context: 8192,
  max_tokens: 4000,
  image_tokens: 1536,
  gpu_layers: "auto",
  require_clean_schema: true,
};
const requestFile = resolve(out, "request.json");
await writeFile(requestFile, JSON.stringify(request, null, 2), { flag: "wx" });
const plan = {
  scope:
    "One same-pixel canonical-format budget diagnostic for the first fresh long one-photo timeout. Only the research CLI wall deadline increases to 180 seconds; no compact representation, prompt, schema, token count, model/runtime or financial hint changes. This cannot establish an app fix, speed ratio, cohort result or general reliability.",
  original_receipt_id: meta.receipt_id,
  original_worker_wall_ms: summary.worker_wall_ms,
  original_vision_ms: meta.native_processes.find(
    (row) => row.stage === "vision-inference",
  ).elapsed_ms,
  original_http_statuses: meta.http.map((row) => row.status),
  original_total_cohort: 50,
  native_request_limit: 1,
  automatic_retries: 0,
  cloud_requests: 0,
  deadline_seconds: 180,
  request: name(requestFile),
  request_sha256: sha(await readFile(requestFile)),
  source_sha256: sources,
  input_sha256: inputs,
  wait_gate:
    "Do not execute until current-native-original50-v1 has terminal metadata for all fifty cases with source_unchanged=true and no existing native vision job is running. Do not restart that cohort or edit its frozen app/runner.",
  prepared_at: new Date().toISOString(),
};
await writeFile(
  resolve(out, "plan.json"),
  JSON.stringify(plan, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    prepared_native_requests: 1,
    executed: 0,
    cloud_requests: 0,
    request: name(requestFile),
  }),
);
