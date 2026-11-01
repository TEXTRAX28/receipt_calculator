// Runs the six sealed local requests only, without credentials or cloud calls.
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { openSync, closeSync } from "node:fs";
import { spawn, execFile } from "node:child_process";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(root, "qa-artifacts/currency-decoder-v1");
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const planBytes = await readFile(resolve(folder, "plan.json"));
const plan = JSON.parse(planBytes);
const harness = resolve(
  root,
  "receipt_training/scripts/benchmark_vision_cli.py",
);
if (
  sha(await readFile(harness)) !== plan.harness_sha256 ||
  plan.native_request_limit !== 8 ||
  plan.cases.length !== 3
)
  throw new Error("Sealed experiment differs");
const manifestBytes = await readFile(
  resolve(root, "receipt_training/evaluation/vision-candidate-manifest.json"),
);
if (sha(manifestBytes) !== plan.model_manifest_sha256)
  throw new Error("Pinned model differs");
const fixtures = JSON.parse(
  await readFile(resolve(folder, "smoke-fixtures.json"), "utf8"),
);
if (fixtures.plan_sha256 !== sha(planBytes))
  throw new Error("Smoke plan differs");
for (const smoke of plan.smokes) {
  const meta = JSON.parse(
    await readFile(
      resolve(
        root,
        "qa-artifacts/advanced-ocr",
        "currency-decoder-v1-smoke-" + smoke.currency,
        "metadata.json",
      ),
      "utf8",
    ),
  );
  const fixture = fixtures.controls.find(
    (entry) => entry.currency === smoke.currency,
  );
  if (
    meta.exit_code ||
    !meta.parsed_json ||
    meta.error ||
    meta.decoder_schema_warning ||
    meta.request_sha256 !== smoke.request.sha256 ||
    !fixture ||
    meta.images[0].sha256 !== fixture.sha256
  )
    throw new Error("Smoke decoder gate did not pass");
  const data = JSON.parse(
    await readFile(
      resolve(
        root,
        "qa-artifacts/advanced-ocr",
        "currency-decoder-v1-smoke-" + smoke.currency,
        "model-output.json",
      ),
      "utf8",
    ),
  );
  if (
    data.currency !== fixture.currency ||
    data.printedTotal !== fixture.known_printed_total ||
    data.items.length !== 1 ||
    data.items[0].unitPrice !== fixture.known_unit_price ||
    data.items[0].lineTotal !== fixture.known_line_total
  )
    throw new Error(
      "Smoke currency/precision did not match its synthetic source",
    );
}
for (const entry of plan.cases) {
  for (const image of entry.images)
    if (sha(await readFile(resolve(root, image.path))) !== image.sha256)
      throw new Error("Input image changed");
  for (const mode of ["control", "candidate"])
    if (
      sha(await readFile(resolve(root, entry[mode].path))) !==
      entry[mode].sha256
    )
      throw new Error("Request changed");
}
await writeFile(
  resolve(folder, "native-consumed.json"),
  JSON.stringify({
    started_at: new Date().toISOString(),
    plan_sha256: sha(planBytes),
    request_limit: 6,
    automatic_retries: 0,
  }) + "\n",
  { flag: "wx" },
);
await writeFile(
  resolve(folder, "native-runner.mjs"),
  await readFile(new URL(import.meta.url)),
  { flag: "wx" },
);
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
env.PYTHONUTF8 = "1";
env.HF_HUB_OFFLINE = "1";
const results = [];
async function run(entry, mode) {
  const tag = "currency-decoder-v1-" + entry.id + "-" + mode;
  const output = openSync(resolve(folder, tag + "-stdout.txt"), "wx");
  const errors = openSync(resolve(folder, tag + "-stderr.txt"), "wx");
  const start = Date.now();
  const child = spawn(
    "python",
    [
      "-X",
      "utf8",
      relative(root, harness),
      "--request",
      entry[mode].path,
      "--run",
      tag,
      "--deadline",
      "180",
    ],
    {
      cwd: root,
      env,
      windowsHide: true,
      stdio: ["ignore", output, errors],
    },
  );
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    execFile(
      "taskkill",
      ["/pid", String(child.pid), "/t", "/f"],
      { windowsHide: true },
      () => {},
    );
  }, 220000);
  const exit = await new Promise((done, reject) => {
    child.once("error", reject);
    child.once("close", (code) => done(code));
  }).finally(() => {
    clearTimeout(timer);
    closeSync(output);
    closeSync(errors);
  });
  const result = {
    id: entry.id,
    mode,
    run: tag,
    exit_code: exit,
    timed_out: timedOut,
    wall_ms: Date.now() - start,
  };
  results.push(result);
  process.stdout.write(JSON.stringify(result) + "\n");
  await writeFile(
    resolve(folder, "native-result-" + results.length + ".json"),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
}
for (const entry of plan.cases)
  for (const mode of ["control", "candidate"]) await run(entry, mode);
await writeFile(
  resolve(folder, "native-execution.json"),
  JSON.stringify(
    {
      completed_at: new Date().toISOString(),
      plan_sha256: sha(planBytes),
      source_sha256: sha(await readFile(new URL(import.meta.url))),
      results,
      real_receipt_uploads: 0,
      automatic_retries: 0,
      paid_activation: false,
    },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
if (results.some((row) => row.exit_code || row.timed_out)) process.exitCode = 1;
