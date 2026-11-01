// One fresh browser/native regression after the measured one-photo timeout.
// Reuses the frozen original-cohort worker protocol, without labels or hints.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const original = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1",
);
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const old = await readJson(resolve(original, "metadata.json"));
assert(old.source_unchanged && old.completed_at && old.cases.length === 50);
const record = old.records.find(
  (row) => row.receipt_id === "cord-v2-train-000",
);
assert(record && record.split === "development");
const output = resolve(root, "receipt_training/evaluation/runs", run);
await mkdir(output);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const sourceHashes = {};
for (const name of [
  ...Object.keys(old.source_sha256),
  "receipt_training/scripts/benchmark_long_single_photo.mjs",
]) {
  const bytes = await readFile(resolve(root, name));
  sourceHashes[name] = sha(bytes);
  const target = resolve(output, "source", name);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
assert.equal(
  sha(await readFile(resolve(root, "receipt_training", record.file_path))),
  record.sha256,
);
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
const plan = {
  scope:
    "One fresh development regression after extending the canonical single-photo deadline. Actual browser preparation, primary OCR, automatic independent native vision and deterministic validation. No label files, supplied currency context, external providers or retries. This is neither a fresh fifty-case run nor a complete financial success test.",
  records: [record],
  source_sha256: sourceHashes,
  original_run: "current-native-original50-v1",
  label_files_read: false,
  cloud_requests: 0,
  automatic_retries: 0,
  sealed_at: new Date().toISOString(),
};
await writeJson(resolve(output, "plan.json"), plan);
const started = performance.now();
const child = spawn(
  process.execPath,
  [
    resolve(root, "receipt_training/scripts/benchmark_current_cohort.mjs"),
    run,
    record.receipt_id,
  ],
  { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let stdout = "",
  stderr = "";
child.stdout.on("data", (bytes) => (stdout += bytes.toString()));
child.stderr.on("data", (bytes) => (stderr += bytes.toString()));
const [code, signal] = await once(child, "close");
await writeFile(resolve(output, "worker-stdout.log"), stdout, { flag: "wx" });
await writeFile(resolve(output, "worker-stderr.log"), stderr, { flag: "wx" });
let unchanged = true;
for (const [name, expected] of Object.entries(sourceHashes))
  if (sha(await readFile(resolve(root, name))) !== expected) unchanged = false;
const meta = await readJson(
  resolve(output, record.receipt_id, "metadata.json"),
);
const summary = {
  ...plan,
  exit_code: code,
  signal,
  worker_wall_ms: Math.round(performance.now() - started),
  source_unchanged: unchanged,
  http_statuses: meta.http.map((packet) => packet.status),
  comparison_complete: meta.comparison_complete,
  completed_at: new Date().toISOString(),
};
await writeJson(resolve(output, "metadata.json"), summary);
console.log(JSON.stringify(summary));
if (code !== 0 || !unchanged || !meta.comparison_complete) process.exitCode = 1;
