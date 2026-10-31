// Execute only the sealed local model controls. Keys never enter a model process.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { spawn, execFile } from "node:child_process";
import { openSync, closeSync } from "node:fs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2/native-protocol-v1",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const planBytes = await readFile(resolve(folder, "plan.json")),
  plan = JSON.parse(planBytes);
for (const [name, digest] of Object.entries(plan.source_sha256))
  if (sha(await readFile(resolve(root, name))) !== digest)
    throw new Error("Sealed native source changed");
for (const row of plan.cases)
  if (sha(await readFile(resolve(root, row.request))) !== row.request_sha256)
    throw new Error("Sealed request changed");
const local = parseEnv(await readFile(resolve(root, ".env.local"), "utf8"));
const python = local.LOCAL_OCR_PYTHON;
if (!python) throw new Error("Configured local Python is missing");
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
Object.assign(env, {
  HF_HUB_OFFLINE: "1",
  PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK: "True",
  PYTHONUTF8: "1",
});
// Verify the six pinned Paddle assets before allowing initialization.
const assets = JSON.parse(
  await readFile(resolve(root, "server/local-model-manifest.json")),
)["paddle-v6"].files;
for (const asset of assets)
  if (
    sha(
      await readFile(resolve(root, "receipt_training/.cache", asset.path)),
    ) !== asset.sha256
  )
    throw new Error("Pinned Paddle asset changed");
await writeFile(
  resolve(folder, "local-consumed.json"),
  JSON.stringify({
    started_at: new Date().toISOString(),
    plan_sha256: sha(planBytes),
    automatic_retries: 0,
  }),
  { flag: "wx" },
);
async function run(args, tag, deadline) {
  const output = resolve(folder, tag + "-stdout.txt"),
    errors = resolve(folder, tag + "-stderr.txt");
  const outFd = openSync(output, "wx"),
    errFd = openSync(errors, "wx");
  const started = Date.now();
  let expired = false;
  const child = spawn(python, args, {
    cwd: root,
    env,
    windowsHide: true,
    stdio: ["ignore", outFd, errFd],
  });
  const timer = setTimeout(() => {
    expired = true;
    if (child.pid)
      execFile(
        "taskkill.exe",
        ["/PID", String(child.pid), "/T", "/F"],
        { windowsHide: true },
        () => {},
      );
  }, deadline);
  let code;
  try {
    code = await new Promise((done, fail) => {
      child.once("error", fail);
      child.once("exit", done);
    });
  } finally {
    clearTimeout(timer);
    closeSync(outFd);
    closeSync(errFd);
  }
  const result = {
    tag,
    pid: child.pid,
    exit_code: code,
    timeout: expired,
    elapsed_ms: Date.now() - started,
    stdout_sha256: sha(await readFile(output)),
    stderr_sha256: sha(await readFile(errors)),
    environment_policy: "Whitelist only; no provider credentials",
    external_receipt_uploads: 0,
  };
  await writeFile(
    resolve(folder, tag + "-metadata.json"),
    JSON.stringify(result, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      stage: tag,
      exit_code: code,
      timeout: expired,
      elapsed_ms: result.elapsed_ms,
    }),
  );
  return result;
}
const results = [];
results.push(
  await run(
    [
      "-X",
      "utf8",
      "receipt_training/scripts/benchmark_local.py",
      "--engine",
      "paddle-v6",
      "--panels",
      plan.panel_run,
      "--run",
      plan.paddle_run,
    ],
    "paddle",
    180000,
  ),
);
for (const row of plan.cases)
  results.push(
    await run(
      [
        "-X",
        "utf8",
        "receipt_training/scripts/benchmark_vision_cli.py",
        "--request",
        row.request,
        "--run",
        row.qwen_run,
        "--deadline",
        "180",
      ],
      row.case,
      210000,
    ),
  );
await writeFile(
  resolve(folder, "execution.json"),
  JSON.stringify(
    {
      results,
      automatic_retries: 0,
      external_receipt_uploads: 0,
      plan_sha256: sha(planBytes),
    },
    null,
    2,
  ),
  { flag: "wx" },
);
if (results.some((row) => row.exit_code !== 0 || row.timeout))
  process.exitCode = 1;
