// Seal identical-pixel controls before fresh native inference; no truth annotations.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import assert from "node:assert/strict";
import { loadEnv } from "vite";
import { z } from "zod";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";
import { createLocalModelReader } from "../../server/local-ocr.mjs";
import {
  compactVisionJsonSchema,
  compactVisionPrompt,
} from "./compact_vision_profile.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const reuse = process.argv[3];
if (reuse) assert(/^[\w-]+$/.test(reuse));
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (path) => relative(root, path).replaceAll("\\", "/");
const inputs = {};
async function input(path, expected) {
  const bytes = await readFile(resolve(root, path));
  const digest = sha(bytes);
  assert(!expected || digest === expected, "Changed input: " + path);
  inputs[path] = digest;
  return bytes;
}
const json = async (path, expected) => JSON.parse(await input(path, expected));
const canonical = z.toJSONSchema(aiReceiptSchema);
canonical.properties.items.items.properties.note = {
  type: "string",
  const: "",
};
canonical.properties.warnings.maxItems = 4;
const cases = [];
const uk = await json("qa-artifacts/vision-timeout-diagnostic-v1/plan.json");
const ukRequest = await json(
  "qa-artifacts/vision-timeout-diagnostic-v1/request.json",
  uk.request_sha256,
);
cases.push({
  id: "supplement-user-uk-20261026-group",
  source: "current supplied two-photo preparation",
  panels: uk.panels,
  images: ukRequest.images,
});
const six = await json(
  "receipt_training/evaluation/runs/current-preparation-six-v1/cord-v2-train-005/metadata.json",
);
cases.push({
  id: "cord-v2-train-005",
  source: "current six-case preparation",
  panels: six.panels.map((panel) => ({ ...panel, photo: 1, part: 1 })),
  images: [
    "receipt_training/evaluation/runs/current-preparation-six-v1/cord-v2-train-005/panel-1.jpg",
  ],
  saved_primary:
    "receipt_training/evaluation/runs/current-preparation-six-v1/cord-v2-train-005/ocr-response.json",
  saved_primary_sha256: six.http[0].response_sha256,
});
const old = await json("qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1.json");
const row = old.pilot.find((row) => row.id === "costco-tw-20121104");
assert(row);
const twRequest = await json(row.request, row.request_sha256);
const twRows = (
  await input(
    `receipt_training/evaluation/runs/${twRequest.source_panel_run}/predictions.jsonl`,
    twRequest.source_panel_manifest_sha256,
  )
)
  .toString("utf8")
  .trim()
  .split(/\r?\n/)
  .map(JSON.parse);
const tw = twRows.find((row) => row.receipt_id === "costco-tw-20121104");
assert(tw);
cases.push({
  id: tw.receipt_id,
  source: "retained original Taiwanese comparison pixels",
  images: twRequest.images,
  panels: tw.panels.map((panel) => ({
    ...panel,
    photo: panel.photo_index + 1,
    part: panel.panel_index + 1,
  })),
});
for (const item of cases) {
  assert.equal(item.images.length, item.panels.length);
  for (const [index, path] of item.images.entries())
    await input(path, item.panels[index].sha256);
}
if (reuse) {
  const previous = await json(`qa-artifacts/${reuse}/plan.json`);
  for (const item of cases) {
    const old = previous.cases.find((row) => row.id === item.id);
    assert(old);
    const identity = (row) =>
      row.panels.map(({ photo, part, sha256 }) => ({ photo, part, sha256 }));
    assert.deepEqual(
      identity(item),
      identity(old),
      "Primary reuse requires identical physical pixels and order",
    );
    item.saved_primary = old.primary_path;
    item.saved_primary_sha256 = old.primary_sha256;
  }
}
const sources = {};
await mkdir(resolve(out, "source"));
for (const directory of ["src/lib", "server", "receipt_training/scripts"]) {
  for (const entry of await readdir(resolve(root, directory))) {
    const path = directory + "/" + entry;
    if (
      !/\.(mjs|ts|py|json)$/.test(entry) ||
      (directory === "receipt_training/scripts" &&
        ![
          "compact_vision_profile.mjs",
          "prepare_compact_vision_trial.mjs",
          "run_compact_vision_trial.mjs",
          "benchmark_vision_cli.py",
          "vision_cli_text.py",
        ].includes(entry))
    )
      continue;
    const bytes = await input(path);
    sources[path] = sha(bytes);
    const target = resolve(out, "source", path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
  }
}
for (const path of [
  "package-lock.json",
  "receipt_training/evaluation/vision-candidate-manifest.json",
]) {
  const bytes = await input(path);
  sources[path] = sha(bytes);
  const target = resolve(out, "source", path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
await writeFile(
  resolve(out, "selection.json"),
  JSON.stringify(
    {
      cases,
      sealed_at: new Date().toISOString(),
      scope:
        "Three previously inspected development transactions. Same pixels/model/budgets; only fixed-position item representation plus its explicit prompt mapping differs. Native flags remain unchanged. No labels or OCR reach the vision model.",
      native_request_limit: 7,
      primary_new_request_limit: 2,
      modes: ["canonical", "compact"],
      source_sha256: sources,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const freshPrimaryCalls = cases.filter((item) => !item.saved_primary).length;
const primary = freshPrimaryCalls
  ? createLocalModelReader({
      python: loadEnv("development", root, "LOCAL_").LOCAL_OCR_PYTHON || "",
      engine: "paddle-v6",
    })
  : null;
assert(!primary || primary.configured);
try {
  for (const item of cases) {
    const panels = await Promise.all(
      item.images.map(async (path, index) => ({
        photo: item.panels[index].photo,
        part: item.panels[index].part,
        data: (await input(path, item.panels[index].sha256)).toString("base64"),
      })),
    );
    const file = resolve(out, `${item.id}-primary.json`);
    if (item.saved_primary)
      await writeFile(
        file,
        await input(item.saved_primary, item.saved_primary_sha256),
        { flag: "wx" },
      );
    else {
      const started = performance.now();
      const recognition = await primary.extract(panels, {
        signal: AbortSignal.timeout(125000),
      });
      await writeFile(file, JSON.stringify({ recognition }, null, 2), {
        flag: "wx",
      });
      item.primary_elapsed_ms = Math.round(performance.now() - started);
    }
    item.primary_path = name(file);
    item.primary_sha256 = sha(await readFile(file));
  }
} finally {
  await primary?.dispose();
}
const requests = [];
for (const item of cases) {
  const photoMap = item.panels
    .map(
      (panel, index) =>
        `\nImage ${index + 1} is original photo ${panel.photo}, detail panel ${panel.part}.`,
    )
    .join("");
  for (const mode of ["canonical", "compact"]) {
    const request = {
      images: item.images,
      schema: mode === "canonical" ? canonical : compactVisionJsonSchema,
      prompt:
        (mode === "canonical" ? RECEIPT_INSTRUCTIONS : compactVisionPrompt) +
        photoMap,
      context: 8192,
      max_tokens: 4000,
      image_tokens: 1536,
      gpu_layers: "auto",
      require_clean_schema: true,
    };
    const file = resolve(out, `${item.id}-${mode}.json`);
    await writeFile(file, JSON.stringify(request, null, 2), { flag: "wx" });
    requests.push({
      id: item.id,
      mode,
      path: name(file),
      sha256: sha(await readFile(file)),
      native_run: `${run}-${item.id}-${mode}`,
    });
  }
}
const smoke = {
  images: ["qa-artifacts/advanced-ocr/synthetic-smoke.jpg"],
  schema: compactVisionJsonSchema,
  prompt:
    compactVisionPrompt + "\nImage 1 is original photo 1, detail panel 1.",
  context: 8192,
  max_tokens: 4000,
  image_tokens: 1536,
  gpu_layers: "auto",
  require_clean_schema: true,
};
await input(smoke.images[0]);
const smokePath = resolve(out, "smoke.json");
await writeFile(smokePath, JSON.stringify(smoke, null, 2), { flag: "wx" });
const plan = {
  cases,
  requests,
  smoke: {
    path: name(smokePath),
    sha256: sha(await readFile(smokePath)),
    native_run: run + "-smoke",
  },
  source_sha256: sources,
  input_sha256: inputs,
  selection_sha256: sha(await readFile(resolve(out, "selection.json"))),
  sealed_at: new Date().toISOString(),
  native_request_limit: 7,
  native_deadline_seconds: 240,
  native_order: requests.map((row) => row.native_run),
  selection_limits:
    "Development pilot and fixed canonical-first order; existing source knowledge, CPU/GPU/OS caches and host load limit generalization and timing comparisons. Neither schema nor prompt may change during the run.",
  cloud_requests: 0,
};
await writeFile(resolve(out, "plan.json"), JSON.stringify(plan, null, 2), {
  flag: "wx",
});
console.log(
  JSON.stringify({
    run,
    cases: cases.length,
    new_primary_calls: freshPrimaryCalls,
    reused_primary_readings: 3 - freshPrimaryCalls,
    requests: 7,
    cloud_requests: 0,
  }),
);
