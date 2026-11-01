// Extend the successful two-case order-only pilot to every original receipt.
// Prior completed pilot candidates are identified, never counted as fresh extension calls.
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
const original =
  "receipt_training/evaluation/runs/current-native-original50-v1";
const old = await json(original + "/metadata.json");
assert(old.source_unchanged && old.completed_at && old.records.length === 50);
assert.equal(
  old.records.filter((row) => row.split === "evaluation").length,
  12,
);
const pilot = await json("qa-artifacts/row-first-pilot-v1/plan.json");
const pilotRun = await json("qa-artifacts/row-first-pilot-v1/execution.json");
assert(
  pilotRun.source_unchanged &&
    pilotRun.calls.length === 4 &&
    pilotRun.calls.every((row) => row.accepted),
);
const template = await json(
  pilot.requests.find((row) => row.variant === "candidate").request,
);
const cases = [],
  requests = [];
for (const [position, record] of old.records.entries()) {
  assert(record.real_receipt && record.external_processing_allowed === false);
  await read("receipt_training/" + record.file_path, record.sha256);
  const folder = original + "/" + record.receipt_id;
  const meta = await json(folder + "/metadata.json");
  const result = await json(folder + "/result.json");
  await read(folder + "/ocr-response.json", meta.http[0].response_sha256);
  const images = [];
  for (const [index, panel] of result.panels.entries()) {
    const path = `${folder}/panel-${index + 1}.jpg`;
    await read(path, panel.sha256);
    images.push(path);
  }
  const panels = result.panels.map((panel, index) => ({
    ...panel,
    photo: 1,
    part: index + 1,
  }));
  const retained = {};
  for (const variant of ["control", "candidate"]) {
    const index = pilotRun.calls.findIndex(
      (call) => call.id === record.receipt_id && call.variant === variant,
    );
    if (index < 0) continue;
    const call = pilotRun.calls[index];
    const path = `qa-artifacts/row-first-pilot-v1/${index + 1}-normalized.json`;
    await read(path);
    await read(
      `qa-artifacts/advanced-ocr/${call.native_run}/metadata.json`,
      call.native_metadata_sha256,
    );
    retained[variant] = {
      receipt: path,
      native_run: call.native_run,
      source: "Completed fresh same-pixel pilot",
    };
  }
  if (!retained.control) {
    assert(meta.http[1].status === 200);
    const path = folder + "/vision-response.json";
    await read(path, meta.http[1].response_sha256);
    retained.control = {
      receipt: path,
      source:
        "Retained completed original-fifty canonical response, successful under the previous wall limit; identical model, prompt, source pixels and generation parameters",
    };
  }
  const item = {
    id: record.receipt_id,
    record,
    images,
    panels,
    primary: folder + "/ocr-response.json",
    representation: "canonical",
    retained,
  };
  cases.push(item);
  if (retained.candidate) continue;
  const request = structuredClone(template);
  request.images = images;
  const mapping = panels
    .map(
      (panel, i) =>
        `\nImage ${i + 1} is original photo ${panel.photo}, detail panel ${panel.part}.`,
    )
    .join("");
  const instruction = await readFile(
    resolve(root, "server/extraction-instructions.mjs"),
    "utf8",
  );
  // Use the original control prompt prefix, not source code or dataset metadata.
  const control = await json(
    pilot.requests.find((row) => row.variant === "control").request,
  );
  const split = control.prompt.indexOf("\nImage 1 is original photo");
  assert(split > 0 && instruction.includes("RECEIPT_INSTRUCTIONS"));
  request.prompt = control.prompt.slice(0, split) + mapping;
  const path = resolve(
    output,
    `${String(position + 1).padStart(2, "0")}-candidate-request.json`,
  );
  await writeFile(path, JSON.stringify(request, null, 2), { flag: "wx" });
  requests.push({
    id: item.id,
    variant: "candidate",
    native_run: `${run}-${position + 1}-candidate`,
    request: name(path),
    sha256: sha(await readFile(path)),
  });
}
assert.equal(cases.length, 50);
assert.equal(requests.length, 48);
assert.equal(cases.filter((item) => item.retained.candidate).length, 2);
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
  "receipt_training/scripts/prepare_row_first_cohort.mjs",
  "receipt_training/scripts/run_row_first_cohort.mjs",
  "receipt_training/scripts/benchmark_vision_cli.py",
  "receipt_training/scripts/vision_cli_text.py",
  "receipt_training/evaluation/vision-candidate-manifest.json",
  "package-lock.json",
])
  await freeze(path);
const plan = {
  scope:
    "Order-only candidate on all fifty original financial receipts, unchanged 38-development/12-evaluation membership. Forty-eight new serial native candidates extend two clearly identified fresh pilot candidates. Controls retain forty-eight earlier successful same-pixel canonical reads plus the two fresh pilot controls. This is a model-output accuracy comparison over the same prepared JPEGs, not a new full browser/OCR workflow, blind holdout or controlled latency ratio. No label files, OCR text or country/currency/merchant hints enter model requests.",
  promotion_gate:
    "Inspect every known-field change, failure, unmatched/missing purchase and unsupported proposal before considering production. The two-case no-regression pilot alone does not justify changing the app. No result may be discarded because it worsens the comparison.",
  cases,
  requests,
  candidate_item_key_order: pilot.candidate_item_key_order,
  deadline_seconds: 180,
  native_request_limit: 48,
  retained_pilot_candidates: 2,
  total_candidate_receipts: 50,
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
    original_receipts: 50,
    new_native_candidates: 48,
    retained_pilot_candidates: 2,
    executed: 0,
    cloud_requests: 0,
  }),
);
