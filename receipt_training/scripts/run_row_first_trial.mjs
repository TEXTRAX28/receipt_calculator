// Serial bounded native execution. No retries, cloud, labels or prompt adaptation.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { once } from "node:events";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { expandCompactVision } from "../../server/local-vision-format.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const output = resolve(root, "qa-artifacts", run);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const planBytes = await readFile(resolve(output, "plan.json"));
const plan = JSON.parse(planBytes);
assert.equal(plan.requests.length, 4);
assert.equal(plan.native_request_limit, 4);
assert.equal(plan.deadline_seconds, 180);
assert.equal(plan.cases.length, 2);
for (const [name, expected] of Object.entries({
  ...plan.source_sha256,
  ...plan.input_sha256,
}))
  assert.equal(sha(await readFile(resolve(root, name))), expected, name);
for (const request of plan.requests)
  assert.equal(
    sha(await readFile(resolve(root, request.request))),
    request.sha256,
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
assert.equal(active, "0", "Do not overlap native vision processes");
const python = loadEnv("development", root, "LOCAL_").LOCAL_OCR_PYTHON;
assert(python, "Use the installed local OCR environment");
const allow = new Set([
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
  Object.entries(process.env).filter(([key]) => allow.has(key.toLowerCase())),
);
env.HF_HUB_OFFLINE = "1";
const writeJson = (path, value) =>
  writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
await writeJson(resolve(output, "dispatch.json"), {
  plan_sha256: sha(planBytes),
  native_request_limit: 4,
  cloud_requests: 0,
  automatic_retries: 0,
  no_other_native_process_at_dispatch: true,
  started_at: new Date().toISOString(),
});
const calls = [];
for (const [index, request] of plan.requests.entries()) {
  console.log(
    JSON.stringify({
      starting: request.native_run,
      position: index + 1,
      count: 4,
    }),
  );
  const child = spawn(
    python,
    [
      "-X",
      "utf8",
      "receipt_training/scripts/benchmark_vision_cli.py",
      "--request",
      request.request,
      "--run",
      request.native_run,
      "--deadline",
      "180",
    ],
    { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (bytes) => (stdout += bytes.toString()));
  child.stderr.on("data", (bytes) => (stderr += bytes.toString()));
  const [code, signal] = await once(child, "close");
  await writeFile(resolve(output, `${index + 1}-runner-stdout.log`), stdout, {
    flag: "wx",
  });
  await writeFile(resolve(output, `${index + 1}-runner-stderr.log`), stderr, {
    flag: "wx",
  });
  const folder = resolve(root, "qa-artifacts/advanced-ocr", request.native_run);
  const meta = await readJson(resolve(folder, "metadata.json"));
  const bytes = await readFile(resolve(folder, "stdout.txt"));
  assert.equal(meta.request_sha256, request.sha256);
  assert.equal(sha(bytes), meta.stdout_sha256);
  let accepted = false,
    failure = null;
  try {
    assert(
      code === 0 &&
        meta.exit_code === 0 &&
        meta.parsed_json &&
        !meta.decoder_schema_warning &&
        !meta.error,
    );
    const item = plan.cases.find((item) => item.id === request.id);
    const value = JSON.parse(bytes);
    const draft =
      item.representation === "compact"
        ? expandCompactVision(value)
        : aiReceiptSchema.parse(value);
    const photos = new Set(item.panels.map((panel) => panel.photo));
    assert(
      draft.warnings.length <= 4 &&
        draft.items.every(
          (row) =>
            row.note === "" &&
            row.sourcePhotos.every((photo) => photos.has(photo)),
        ),
    );
    await writeJson(resolve(output, `${index + 1}-normalized.json`), draft);
    accepted = true;
  } catch {
    failure = "native-or-strict-contract-failure";
  }
  const entry = {
    ...request,
    exit_code: code,
    signal,
    accepted,
    failure,
    native_ms: meta.elapsed_ms,
    native_metadata_sha256: sha(
      await readFile(resolve(folder, "metadata.json")),
    ),
  };
  calls.push(entry);
  await writeJson(resolve(output, `case-${index + 1}.json`), entry);
  console.log(
    JSON.stringify({
      completed: request.native_run,
      accepted,
      native_ms: meta.elapsed_ms,
    }),
  );
}
let unchanged = true;
for (const [name, expected] of Object.entries(plan.source_sha256))
  if (sha(await readFile(resolve(root, name))) !== expected) unchanged = false;
await writeJson(resolve(output, "execution.json"), {
  calls,
  native_requests: calls.length,
  source_unchanged: unchanged,
  cloud_requests: 0,
  automatic_retries: 0,
  completed_at: new Date().toISOString(),
});
if (!unchanged || calls.some((call) => !call.accepted)) process.exitCode = 1;
