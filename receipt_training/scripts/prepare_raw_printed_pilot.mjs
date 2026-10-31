// Seal a local-only raw-print pilot on existing control pixels. Never reads labels.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  rawPrintedJsonSchema,
  rawPrintedPrompt,
} from "./raw_printed_profile.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const version = process.argv[2];
if (!version || !/^[\w-]+$/.test(version))
  throw new Error("Choose a new bounded pilot version");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const input = async (name) => {
  const path = resolve(root, name);
  if (relative(root, path).startsWith(".."))
    throw new Error("Keep pilot inputs inside the project");
  return await readFile(path);
};
const basePlanName = "qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1.json";
const baseBytes = await input(basePlanName),
  base = JSON.parse(baseBytes);
const harness = await input("receipt_training/scripts/benchmark_vision_cli.py");
const profile = {
  model_manifest: "receipt_training/evaluation/vision-candidate-manifest.json",
  output_mode: "structured-receipt",
  schema: rawPrintedJsonSchema,
  prompt: rawPrintedPrompt,
  constrain_schema: true,
  normalize_numeric_json: false,
  require_clean_schema: true,
};
const folder = resolve(
  root,
  "qa-artifacts/advanced-ocr",
  version + "-requests",
);
const cases = [];
const files = [];
for (const id of [
  "cord-v2-train-004",
  "cord-v2-train-003",
  "supplement-user-uk-20261026-group",
]) {
  const row = base.pilot.find((entry) => entry.id === id);
  if (!row || row.source !== "development")
    throw new Error("Use only the predeclared development cases");
  const oldBytes = await input(row.request),
    old = JSON.parse(oldBytes);
  if (sha(oldBytes) !== row.request_sha256)
    throw new Error("The original control request changed");
  const controlFolder = "qa-artifacts/advanced-ocr/qwen-full-v2-" + id;
  const controlBytes = await input(controlFolder + "/metadata.json"),
    control = JSON.parse(controlBytes);
  if (
    control.request_sha256 !== row.request_sha256 ||
    control.harness_sha256 !==
      sha(await input(controlFolder + "/harness.py")) ||
    control.exit_code ||
    !control.parsed_json
  )
    throw new Error("The retained historical control is missing or altered");
  const sourceBytes = await input(
    `receipt_training/evaluation/runs/${old.source_panel_run}/predictions.jsonl`,
  );
  if (sha(sourceBytes) !== old.source_panel_manifest_sha256)
    throw new Error("Frozen source-panel map changed");
  const source = sourceBytes
    .toString("utf8")
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse)
    .find((entry) => entry.receipt_id === id);
  if (
    !source ||
    source.image_sha256 !== old.source_image_sha256 ||
    source.panels.length !== old.images.length
  )
    throw new Error("Control source mapping differs");
  const mapping = [];
  for (const [index, image] of old.images.entries()) {
    if (sha(await input(image)) !== source.panels[index].sha256)
      throw new Error("Prepared control pixels changed");
    mapping.push(
      `Image ${index + 1} is original photo ${source.panels[index].photo_index + 1}, section ${source.panels[index].panel_index + 1}.`,
    );
  }
  const request = {
    ...old,
    ...profile,
    images: old.images,
    prompt: profile.prompt.replace(
      "{{SOURCE_PHOTO_MAP}}",
      mapping.join(" ") + " Use original photo numbers in sourcePhotos.",
    ),
  };
  const bytes = Buffer.from(JSON.stringify(request, null, 2) + "\n");
  const requestName = `qa-artifacts/advanced-ocr/${version}-requests/${id}.json`;
  files.push([resolve(root, requestName), bytes]);
  const freshControl = `qa-artifacts/advanced-ocr/${version}-requests/${id}-control.json`;
  files.push([resolve(root, freshControl), oldBytes]);
  cases.push({
    ...row,
    request: requestName,
    request_sha256: sha(bytes),
    control_native_metadata: controlFolder + "/metadata.json",
    control_native_metadata_sha256: sha(controlBytes),
    control_request: row.request,
    control_request_sha256: row.request_sha256,
    fresh_control_request: freshControl,
    fresh_control_request_sha256: row.request_sha256,
  });
}
const smoke = {
  ...profile,
  images: ["qa-artifacts/advanced-ocr/synthetic-smoke.jpg"],
  context: 8192,
  max_tokens: 4000,
  image_tokens: 1536,
  gpu_layers: "auto",
  prompt: profile.prompt.replace(
    "{{SOURCE_PHOTO_MAP}}",
    "Image 1 is original photo 1, section 1.",
  ),
};
const smokeBytes = Buffer.from(JSON.stringify(smoke, null, 2) + "\n");
await mkdir(folder);
for (const [path, bytes] of files) await writeFile(path, bytes, { flag: "wx" });
await writeFile(resolve(folder, "synthetic.json"), smokeBytes, { flag: "wx" });
await writeFile(
  resolve(folder, "profile.mjs"),
  await input("receipt_training/scripts/raw_printed_profile.mjs"),
  { flag: "wx" },
);
await writeFile(
  resolve(folder, "builder.mjs"),
  await input("receipt_training/scripts/prepare_raw_printed_pilot.mjs"),
  { flag: "wx" },
);
const plan = {
  version,
  sealed_at: new Date().toISOString(),
  scope:
    "Research-only printed money contract, compared with fresh canonical controls under the same current native harness. Exact retained control images and budgets; no OCR text, annotations or currency hints enter a model request. Separate user currency may be supplied only to the deterministic adapter after extraction. Source-informed development selection, not a blind holdout or production selection.",
  base_plan_sha256: sha(baseBytes),
  harness_sha256: sha(harness),
  profile_sha256: sha(
    await input("receipt_training/scripts/raw_printed_profile.mjs"),
  ),
  builder_sha256: sha(
    await input("receipt_training/scripts/prepare_raw_printed_pilot.mjs"),
  ),
  model_manifest_sha256: sha(await input(profile.model_manifest)),
  synthetic_request: `qa-artifacts/advanced-ocr/${version}-requests/synthetic.json`,
  synthetic_request_sha256: sha(smokeBytes),
  label_files_read: false,
  input_ocr_text: false,
  external_requests: 0,
  pilot: cases,
};
await writeFile(
  resolve(root, `qa-artifacts/advanced-ocr/${version}.json`),
  JSON.stringify(plan, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    version,
    native_cases: cases.length,
    synthetic_cases: 1,
    external_requests: 0,
  }),
);
