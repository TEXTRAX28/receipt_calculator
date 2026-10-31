// Predeclare native PNG controls after the preserved JPEG-endpoint setup failure.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RECEIPT_INSTRUCTIONS } from "../../server/receipt-api.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2",
);
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
const manifestBytes = await readFile(resolve(folder, "manifest.json"));
const cloudBytes = await readFile(
  resolve(root, "receipt_training/evaluation/veryfi-screening-plan-v1.json"),
);
const manifest = JSON.parse(manifestBytes),
  cloudPlan = JSON.parse(cloudBytes);
if (sha(manifestBytes) !== cloudPlan.manifest_sha256)
  throw new Error("Prepared crops changed");
const failure = JSON.parse(
  await readFile(resolve(folder, "local-comparison-v1/metadata.json")),
);
if (
  failure.cases.length !== 6 ||
  failure.cases.some((row) => row.comparison_complete)
)
  throw new Error(
    "Inspect the actual HTTP setup outcome before changing protocol",
  );
const out = resolve(folder, "native-protocol-v1");
await mkdir(out);
const panelName = "provider-screening-native-png-panels-v1";
const panelFolder = resolve(
  root,
  "receipt_training/evaluation/runs",
  panelName,
);
await mkdir(panelFolder);
await mkdir(resolve(panelFolder, "panels"));
const baseRequest = JSON.parse(
  await readFile(
    resolve(
      root,
      "qa-artifacts/advanced-ocr/qwen-v2-full-cohort-v1-requests/cord-v2-train-003.json",
    ),
  ),
);
const records = [],
  cases = [];
for (const row of manifest.cases) {
  const pixels = await readFile(resolve(folder, row.crop_file));
  if (sha(pixels) !== row.crop_sha256) throw new Error("Inspected PNG changed");
  const file = `panels/${row.case}.png`;
  await writeFile(resolve(panelFolder, file), pixels, { flag: "wx" });
  records.push({
    receipt_id: row.receipt_id,
    image_sha256: row.crop_sha256,
    panels: [
      {
        file_path: file,
        photo_index: 0,
        panel_index: 0,
        sha256: row.crop_sha256,
      },
    ],
  });
  const request = {
    ...baseRequest,
    images: [
      resolve(folder, row.crop_file).slice(root.length).replaceAll("\\", "/"),
    ],
    prompt:
      RECEIPT_INSTRUCTIONS +
      "\nImage 1 is original photo 1, section 1. Use original photo numbers in sourcePhotos.",
    source_panel_run: panelName,
    source_image_sha256: row.crop_sha256,
    receipt_id: row.receipt_id,
    source_split: row.original_split,
  };
  delete request.source_panel_manifest_sha256;
  const bytes = Buffer.from(JSON.stringify(request, null, 2) + "\n");
  await writeFile(resolve(out, row.case + ".json"), bytes, { flag: "wx" });
  cases.push({
    case: row.case,
    receipt_id: row.receipt_id,
    original_split: row.original_split,
    crop_sha256: row.crop_sha256,
    request: `qa-artifacts/provider-review/veryfi-screening-crops-v2/native-protocol-v1/${row.case}.json`,
    request_sha256: sha(bytes),
    qwen_run: "screening-native-png-v1-" + row.case,
  });
}
const panelBytes = Buffer.from(
  records.map((row) => JSON.stringify(row)).join("\n") + "\n",
);
await writeFile(resolve(panelFolder, "predictions.jsonl"), panelBytes, {
  flag: "wx",
});
await writeFile(
  resolve(panelFolder, "metadata.json"),
  JSON.stringify(
    {
      completed_at: new Date().toISOString(),
      predictions_sha256: sha(panelBytes),
      preparation_only: true,
      scope:
        "Byte-identical copies of the six inspected PNG crops; no browser preprocessing or model inference",
      external_requests: 0,
    },
    null,
    2,
  ),
  { flag: "wx" },
);
const sources = {};
for (const name of [
  "receipt_training/scripts/prepare_screening_native.mjs",
  "receipt_training/scripts/run_screening_native.mjs",
  "receipt_training/scripts/benchmark_local.py",
  "receipt_training/scripts/benchmark_vision_cli.py",
  "server/local_ocr_models.py",
  "server/local-model-manifest.json",
  "server/extraction-instructions.mjs",
  "receipt_training/evaluation/vision-candidate-manifest.json",
])
  sources[name] = sha(await readFile(resolve(root, name)));
await writeFile(
  resolve(out, "plan.json"),
  JSON.stringify(
    {
      sealed_at: new Date().toISOString(),
      cases,
      panel_run: panelName,
      paddle_run: "provider-screening-native-paddle-v1",
      cloud_plan_sha256_unchanged: sha(cloudBytes),
      manifest_sha256: sha(manifestBytes),
      panel_manifest_sha256: sha(panelBytes),
      source_sha256: sources,
      scope:
        "Native PNG model comparison, not an integrated HTTP/browser benchmark. Replaces only the failed local test setup; six cloud input hashes/options/approval scope are unchanged. No labels, OCR text or currency hints enter inference.",
      prior_http_result:
        "Six attempted local HTTP requests; the first two rejected PNG-as-JPEG and four were rate-limited; no successful model extraction. Preserved without modification.",
      local_calls_planned: { paddle: 6, qwen: 6 },
      retries: 0,
      external_requests: 0,
      timing_limit:
        "Native Paddle warm inference and Qwen fresh CLI loading/encoding/generation are different components; no direct speed ratio or p95 claim.",
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({
    native_cases: 6,
    source_pngs_unchanged: true,
    cloud_scope_unchanged: true,
    external_requests: 0,
  }),
);
