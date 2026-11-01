// One real five-item phone workflow for invalid vision-price proposals.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { createServer, loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
const checkScalars = process.argv.includes("--scalars");
assert(/^[\w-]+$/.test(run || ""), "Use a new run name");
const out = resolve(root, "qa-artifacts", run);
await mkdir(out);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (name, value) =>
  writeFile(resolve(out, name), JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
const source = {};
async function save(path) {
  const bytes = await readFile(resolve(root, path));
  source[path] = sha(bytes);
  const target = resolve(out, "source", path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
async function walk(path) {
  for (const entry of await readdir(resolve(root, path), {
    withFileTypes: true,
  })) {
    if (["graphify-out", "__pycache__"].includes(entry.name)) continue;
    const name = path + "/" + entry.name;
    if (entry.isDirectory()) await walk(name);
    else if (/\.(ts|tsx|mjs|py|css|json)$/.test(name)) await save(name);
  }
}
await walk("src");
await walk("server");
for (const name of [
  "vite.config.ts",
  "playwright.config.ts",
  "package-lock.json",
  "index.html",
  "tests/e2e/computer-reader-real.spec.ts",
  "tests/e2e/qa-artifacts.ts",
  "tests/fixtures/long-local-receipt.ts",
  "receipt_training/scripts/run_invalid_price_workflow.mjs",
  "receipt_training/evaluation/vision-candidate-manifest.json",
])
  await save(name);
const local = loadEnv("development", root, "LOCAL_");
assert(local.LOCAL_OCR_PYTHON, "Existing local Python is required");
Object.assign(process.env, {
  LOCAL_OCR_PYTHON: local.LOCAL_OCR_PYTHON,
  LOCAL_OCR_ENGINE: "paddle-v6",
  LOCAL_VISION_ENABLED: "1",
  AZURE_DOCUMENT_INTELLIGENCE_KEY: "",
  AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "",
  GEMINI_API_KEY: "",
  VERYFI_CLIENT_ID: "",
  VERYFI_BEARER_KEY: "",
  VERYFI_ALLOWANCE_ID: "",
  VERYFI_DOCUMENT_LIMIT: "0",
});
const before = new Set(await readdir(resolve(root, "qa-artifacts/e2e-runs")));
const meta = {
  scope:
    "One real development receipt, actual installed independent readers plus HTTP and phone UI. Checks literal source proposals for invalid model prices, original-value details and blocked confirmation. No complete-financial, blind-holdout or physical-phone claim.",
  started_at: new Date().toISOString(),
  source_sha256: source,
  external_uploads: 0,
  retries: 0,
  checks_scalar_proposals: checkScalars,
};
await json("plan.json", meta);
let server;
try {
  server = await createServer({
    root,
    server: { host: "127.0.0.1", port: 0, strictPort: false, hmr: false },
    cacheDir: resolve(root, "node_modules/.vite-" + run),
    logLevel: "warn",
  });
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  const providers = await (
    await fetch(origin + "/api/receipts/providers")
  ).json();
  const gemini = await (await fetch(origin + "/api/receipts/config")).json();
  assert(providers.localModel.configured && providers.localVision.configured);
  assert.equal(providers.veryfi.configured, false);
  assert.equal(providers.veryfi.remaining, 0);
  assert.equal(gemini.configured, false);
  meta.providers = providers;
  meta.gemini_configured = gemini.configured;
  const args = [
    resolve(root, "node_modules/@playwright/test/cli.js"),
    "test",
    "tests/e2e/computer-reader-real.spec.ts",
    "--project=mobile",
    "--grep=real invalid-price recovery",
    "--workers=1",
    "--reporter=line,json,html",
    "--output=" + resolve(out, "test-results"),
  ];
  const child = spawn(process.execPath, args, {
    cwd: root,
    windowsHide: true,
    env: {
      ...process.env,
      GATHER_LOCAL_MODEL_URL: origin,
      GATHER_LOCAL_RECOVERY_RECEIPT: resolve(
        root,
        "receipt_training/non_costco/physical/cord/cord-v2-train-005.jpg",
      ),
      GATHER_LOCAL_RECOVERY_RUN: run,
      GATHER_LOCAL_RECOVERY_SCALARS: checkScalars ? "1" : "",
      PLAYWRIGHT_JSON_OUTPUT_FILE: resolve(out, "playwright.json"),
      PLAYWRIGHT_HTML_OUTPUT_DIR: resolve(out, "html"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  meta.test_pid = child.pid;
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (bytes) => (stdout += bytes));
  child.stderr.on("data", (bytes) => (stderr += bytes));
  const [exitCode, signal] = await once(child, "close");
  await writeFile(resolve(out, "stdout.log"), stdout, { flag: "wx" });
  await writeFile(resolve(out, "stderr.log"), stderr, { flag: "wx" });
  meta.exit_code = exitCode;
  meta.signal = signal;
  meta.new_e2e_directories = (
    await readdir(resolve(root, "qa-artifacts/e2e-runs"))
  )
    .filter((name) => !before.has(name))
    .map((name) => "qa-artifacts/e2e-runs/" + name);
  meta.source_unchanged = true;
  for (const [name, expected] of Object.entries(source))
    if (sha(await readFile(resolve(root, name))) !== expected)
      meta.source_unchanged = false;
  assert(meta.source_unchanged, "Source changed during native measurement");
  process.exitCode = exitCode === 0 ? 0 : 1;
} catch (error) {
  meta.error = String(error);
  process.exitCode = 1;
} finally {
  await server?.close();
  meta.completed_at = new Date().toISOString();
  await json("execution.json", meta);
  console.log(JSON.stringify({ out, ...meta, source_sha256: undefined }));
}
