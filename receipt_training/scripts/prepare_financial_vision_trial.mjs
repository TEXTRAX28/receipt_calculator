// Freeze a source-informed diagnostic trial before native inference. No labels read.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  financialSummaryPrompt,
  financialSummaryJsonSchema,
} from "./financial_vision_profile.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const base = resolve(root, "qa-artifacts/financial-vision-pilot-v1");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputHashes = {};
async function read(path) {
  const bytes = await readFile(resolve(root, path));
  inputHashes[path] = sha(bytes);
  return bytes;
}
const plan = JSON.parse(
  await read("qa-artifacts/row-first-original50-v1/plan.json"),
);
const ids = ["cord-v2-train-013", "cord-v2-train-005", "cord-v2-train-023"];
await mkdir(base);
const cases = [];
for (const [index, id] of ids.entries()) {
  const old = plan.cases.find((row) => row.id === id);
  assert(old && old.images.length <= 3);
  for (const [n, path] of old.images.entries())
    assert.equal(sha(await read(path)), old.panels[n].sha256);
  const request = {
    images: old.images,
    prompt: financialSummaryPrompt,
    schema: financialSummaryJsonSchema,
    context: 6144,
    max_tokens: 1600,
    image_tokens: 1024,
    gpu_layers: 99,
    projector_gpu: true,
    constrain_schema: true,
    normalize_numeric_json: false,
    require_clean_schema: true,
  };
  const path = base + `/request-${index + 1}.json`;
  const bytes = JSON.stringify(request, null, 2) + "\n";
  await writeFile(path, bytes, { flag: "wx" });
  cases.push({
    id,
    split: old.record.split,
    original_image_sha256: old.record.sha256,
    request: `qa-artifacts/financial-vision-pilot-v1/request-${index + 1}.json`,
    request_sha256: sha(bytes),
    native_run: `financial-vision-pilot-v1-${index + 1}`,
    images: old.images,
  });
}
for (const name of [
  "financial_vision_profile.mjs",
  "prepare_financial_vision_trial.mjs",
  "benchmark_vision_cli.py",
]) {
  const path = "receipt_training/scripts/" + name,
    bytes = await read(path);
  await writeFile(base + "/" + name, bytes, { flag: "wx" });
}
await writeFile(
  base + "/plan.json",
  JSON.stringify(
    {
      scope:
        "Three source-informed development diagnostics: service/tax summary, coupon/card tender, zero-tax unknown-basis control. Same prepared original pixels as prior row-first model work; not a blind holdout or fresh full-receipt replacement trial.",
      cases,
      input_sha256: inputHashes,
      model_manifest:
        "receipt_training/evaluation/vision-candidate-manifest.json",
      new_model_request_limit: 3,
      deadline_seconds: 180,
      automatic_retries: 0,
      label_files_read: false,
      input_ocr_text: false,
      external_requests: 0,
      promotion_gate:
        "Research only. Correct source financial roles and tax basis, literal source amounts, and unknown zero-tax basis are necessary before any app implementation. No bill may be silently accepted from specialist output.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    cases: cases.length,
    requests_prepared: 3,
    label_files_read: false,
    external_requests: 0,
  }),
);
