// Additional original multi-section control, without repeating the completed pilot.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import {
  compactVisionJsonSchema,
  compactVisionPrompt,
} from "./compact_vision_profile.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const local = (path) => relative(root, path).replaceAll("\\", "/");
const inputs = {};
async function read(name, expected) {
  const bytes = await readFile(resolve(root, name));
  const digest = sha(bytes);
  assert(!expected || digest === expected);
  inputs[name] = digest;
  return bytes;
}
const json = async (name, expected) => JSON.parse(await read(name, expected));
const before = await json("qa-artifacts/compact-vision-v2/plan.json");
const sources = {};
for (const [name, expected] of Object.entries(before.source_sha256)) {
  const bytes = await read(
    name,
    name.endsWith("run_compact_vision_trial.mjs") ? undefined : expected,
  );
  sources[name] = sha(bytes);
  const path = resolve(out, "source", name);
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, bytes, { flag: "wx" });
}
const self = "receipt_training/scripts/prepare_compact_long_extension.mjs";
const selfBytes = await read(self);
sources[self] = sha(selfBytes);
const selfTarget = resolve(out, "source", self);
await mkdir(resolve(selfTarget, ".."), { recursive: true });
await writeFile(selfTarget, selfBytes, { flag: "wx" });
const sourcePlan = await json(
  "qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1.json",
);
const row = sourcePlan.pilot.find((row) => row.id === "tesco-gb-1994");
assert(row);
const controlRequest = await json(row.request, row.request_sha256);
const panelBytes = await read(
  `receipt_training/evaluation/runs/${controlRequest.source_panel_run}/predictions.jsonl`,
  controlRequest.source_panel_manifest_sha256,
);
const image = panelBytes
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse)
  .find((row) => row.receipt_id === "tesco-gb-1994");
assert(
  image && image.panels.length === 2 && controlRequest.images.length === 2,
);
const panels = image.panels.map((panel) => ({
  ...panel,
  photo: panel.photo_index + 1,
  part: panel.panel_index + 1,
}));
for (const [index, name] of controlRequest.images.entries())
  await read(name, panels[index].sha256);
const primaryMeta = await json(
  "receipt_training/evaluation/runs/paddle-v6-full-development/metadata.json",
);
assert.equal(primaryMeta.panel_run, controlRequest.source_panel_run);
const primaryBytes = await read(
  "receipt_training/evaluation/runs/paddle-v6-full-development/ocr.jsonl",
  primaryMeta.ocr_sha256,
);
const primary = primaryBytes
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse)
  .find((row) => row.receipt_id === "tesco-gb-1994");
assert(primary);
assert.deepEqual(
  primary.panels.map((panel) => panel.sha256),
  panels.map((panel) => panel.sha256),
);
const primaryFile = resolve(out, "tesco-primary.json");
await writeFile(
  primaryFile,
  JSON.stringify(
    {
      recognition: {
        engine: primaryMeta.adapter,
        panels: primary.panels.map(
          ({ photo_index, panel_index, width, height, words, lines }) => ({
            photo: photo_index + 1,
            part: panel_index + 1,
            width,
            height,
            words,
            lines,
          }),
        ),
      },
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const item = {
  id: "tesco-gb-1994",
  images: controlRequest.images,
  panels,
  source:
    "Additional previously inspected original two-section development receipt",
  primary_path: local(primaryFile),
  primary_sha256: sha(await readFile(primaryFile)),
};
const priorCanonical = await json(
  before.requests.find((row) => row.mode === "canonical").path,
);
const photoMap = panels
  .map(
    (panel, index) =>
      `\nImage ${index + 1} is original photo ${panel.photo}, detail panel ${panel.part}.`,
  )
  .join("");
const requests = [];
for (const mode of ["canonical", "compact"]) {
  const request = {
    ...priorCanonical,
    images: item.images,
    schema:
      mode === "canonical" ? priorCanonical.schema : compactVisionJsonSchema,
    prompt:
      (mode === "canonical" ? RECEIPT_INSTRUCTIONS : compactVisionPrompt) +
      photoMap,
  };
  const file = resolve(out, `tesco-${mode}.json`);
  await writeFile(file, JSON.stringify(request, null, 2), { flag: "wx" });
  requests.push({
    id: item.id,
    mode,
    path: local(file),
    sha256: sha(await readFile(file)),
    native_run: `${run}-${item.id}-${mode}`,
  });
}
const smokeRoot = "qa-artifacts/advanced-ocr/compact-vision-v2-smoke";
const smokeMeta = await json(smokeRoot + "/metadata.json");
assert(smokeMeta.exit_code === 0 && smokeMeta.parsed_json);
await read(smokeRoot + "/stdout.txt", smokeMeta.stdout_sha256);
const plan = {
  cases: [item],
  requests,
  source_sha256: sources,
  input_sha256: inputs,
  native_request_limit: 2,
  native_deadline_seconds: 240,
  reused_smoke: {
    profile_sha256:
      sources["receipt_training/scripts/compact_vision_profile.mjs"],
    metadata_path: smokeRoot + "/metadata.json",
    metadata_sha256: sha(
      await readFile(resolve(root, smokeRoot, "metadata.json")),
    ),
    stdout_path: smokeRoot + "/stdout.txt",
  },
  sealed_at: new Date().toISOString(),
  scope:
    "Both original multi-section inputs have a measured compact/control comparison: the existing UK pilot plus this additional Tesco case. Same immutable pixels and primary evidence, no OCR/labels in model requests. No general-accuracy or speed-ratio claim.",
  cloud_requests: 0,
  automatic_retries: 0,
};
await writeFile(resolve(out, "plan.json"), JSON.stringify(plan, null, 2), {
  flag: "wx",
});
console.log(
  JSON.stringify({ run, cases: 1, native_calls: 2, cloud_requests: 0 }),
);
