// One explicitly bounded local diagnostic; it cannot overlap the original-50 job.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, execFileSync } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const out = resolve(root, "qa-artifacts", run);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => readFile(path, "utf8").then(JSON.parse);
const plan = await json(resolve(out, "plan.json"));
assert.equal(plan.native_request_limit, 1);
assert.equal(plan.deadline_seconds, 180);
for (const [name, expected] of Object.entries({
  ...plan.source_sha256,
  ...plan.input_sha256,
}))
  assert.equal(
    sha(await readFile(resolve(root, name))),
    expected,
    "Diagnostic source/input changed",
  );
assert.equal(
  sha(await readFile(resolve(root, plan.request))),
  plan.request_sha256,
);
const cohortFile = resolve(
  root,
  "receipt_training/evaluation/runs/current-native-original50-v1/metadata.json",
);
const cohort = await json(cohortFile);
assert(
  cohort.source_unchanged && cohort.completed_at && cohort.cases.length === 50,
);
const active = execFileSync(
  "powershell.exe",
  [
    "-NoProfile",
    "-Command",
    "@(Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'llama-mtmd-cli.exe' }).Count",
  ],
  { encoding: "utf8", windowsHide: true },
).trim();
assert.equal(
  active,
  "0",
  "Another native vision process is running; do not overlap it",
);
const python = loadEnv("development", root, "LOCAL_").LOCAL_OCR_PYTHON;
assert(python, "The existing local Python installation is required");
const allowed = new Set([
  "systemroot",
  "windir",
  "path",
  "pathext",
  "temp",
  "tmp",
  "userprofile",
  "appdata",
  "localappdata",
  "programdata",
  "programfiles",
  "programfiles(x86)",
]);
const env = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => allowed.has(key.toLowerCase())),
);
env.HF_HUB_OFFLINE = "1";
await writeFile(
  resolve(out, "dispatch.json"),
  JSON.stringify(
    {
      cohort_metadata_sha256: sha(await readFile(cohortFile)),
      native_request_limit: 1,
      deadline_seconds: 180,
      cloud_requests: 0,
      automatic_retries: 0,
      no_other_native_process_at_dispatch: true,
      started_at: new Date().toISOString(),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
await writeFile(
  resolve(out, "source", "execution-controller.mjs"),
  await readFile(fileURLToPath(import.meta.url)),
  { flag: "wx" },
);
const child = spawn(
  python,
  [
    "-X",
    "utf8",
    "receipt_training/scripts/benchmark_vision_cli.py",
    "--request",
    plan.request,
    "--run",
    run,
    "--deadline",
    "180",
  ],
  { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
);
let stdout = "",
  stderr = "";
child.stdout.on("data", (bytes) => (stdout += bytes));
child.stderr.on("data", (bytes) => (stderr += bytes));
const [code, signal] = await once(child, "close");
await writeFile(resolve(out, "runner-stdout.log"), stdout, { flag: "wx" });
await writeFile(resolve(out, "runner-stderr.log"), stderr, { flag: "wx" });
await writeFile(
  resolve(out, "execution.json"),
  JSON.stringify(
    {
      exit_code: code,
      signal,
      native_requests: 1,
      cloud_requests: 0,
      automatic_retries: 0,
      completed_at: new Date().toISOString(),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
console.log(stdout.trim());
process.exitCode = code === 0 ? 0 : 1;
