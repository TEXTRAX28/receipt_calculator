// Execute the sealed seven-request development pilot, never a cloud provider.
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { once } from "node:events";
import assert from "node:assert/strict";
import { createServer, loadEnv } from "vite";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { expandCompactVision } from "./compact_vision_profile.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const out = resolve(root, "qa-artifacts", run);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (path) => readFile(path, "utf8").then(JSON.parse);
const planBytes = await readFile(resolve(out, "plan.json")),
  plan = JSON.parse(planBytes);
assert(plan.cases.length >= 1 && plan.cases.length <= 50);
assert.equal(plan.requests.length, plan.cases.length * 2);
assert.equal(
  plan.native_request_limit,
  plan.requests.length + (plan.reused_smoke ? 0 : 1),
);
for (const [name, expected] of Object.entries(plan.source_sha256))
  assert.equal(
    sha(await readFile(resolve(root, name))),
    expected,
    "Trial source changed",
  );
for (const [name, expected] of Object.entries(plan.input_sha256))
  assert.equal(
    sha(await readFile(resolve(root, name))),
    expected,
    "Trial input changed",
  );
const python = loadEnv("development", root, "LOCAL_").LOCAL_OCR_PYTHON;
assert(python);
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
const execution = {
  plan_sha256: sha(planBytes),
  started_at: new Date().toISOString(),
  native_calls: [],
  cloud_requests: 0,
  automatic_retries: 0,
};
if (plan.reused_smoke) {
  const proof = plan.reused_smoke;
  assert.equal(
    proof.profile_sha256,
    plan.source_sha256["receipt_training/scripts/compact_vision_profile.mjs"],
  );
  const meta = await json(resolve(root, proof.metadata_path));
  assert.equal(
    sha(await readFile(resolve(root, proof.metadata_path))),
    proof.metadata_sha256,
  );
  assert(meta.exit_code === 0 && meta.parsed_json && !meta.error);
  expandCompactVision(
    JSON.parse(
      (await readFile(resolve(root, proof.stdout_path), "utf8")).trim(),
    ),
  );
  execution.reused_smoke = proof;
}
const frozen = new Map(),
  loaded = {};
for (const [name, hash] of Object.entries(plan.source_sha256))
  if (name.startsWith("src/lib/")) {
    const bytes = await readFile(resolve(out, "source", name));
    assert.equal(sha(bytes), hash);
    frozen.set(resolve(root, name).replaceAll("\\", "/"), {
      name,
      text: bytes.toString("utf8"),
    });
  }
const server = await createServer({
  root,
  configFile: false,
  appType: "custom",
  cacheDir: resolve(root, "node_modules/.vite-" + run + "-verify"),
  server: {
    middlewareMode: true,
    hmr: false,
    watch: { ignored: ["**/qa-artifacts/**", "**/receipt_training/**"] },
  },
  plugins: [
    {
      name: "frozen-compact-verifier",
      enforce: "pre",
      load(id) {
        const file = frozen.get(id.split("?")[0].replaceAll("\\", "/"));
        if (!file) return null;
        loaded[file.name] = sha(file.text);
        return file.text;
      },
    },
  ],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled during native pilot postprocessing");
};
let postprocess;
try {
  const { verifyIndependentReadings } = await server.ssrLoadModule(
    "/src/lib/verify-readings.ts",
  );
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { validateRecognition } = await server.ssrLoadModule(
    "/src/lib/recognition-schema.mjs",
  );
  postprocess = async (item, receipt) => {
    const original = await json(resolve(root, item.primary_path));
    assert.equal(
      sha(await readFile(resolve(root, item.primary_path))),
      item.primary_sha256,
    );
    const recognition = validateRecognition(original.recognition, item.panels);
    const value = verifyIndependentReadings(receipt, recognition);
    return {
      receipt: value.receipt,
      calculation: calculateReceipt(value.receipt),
      corrections: value.corrections,
      removed_adjustments: value.removedAdjustments,
      matched_purchases: value.matchedPurchases,
    };
  };
  for (const entry of [
    ...(plan.reused_smoke
      ? []
      : [{ ...plan.smoke, id: "synthetic-smoke", mode: "compact" }]),
    ...plan.requests,
  ]) {
    assert.equal(sha(await readFile(resolve(root, entry.path))), entry.sha256);
    const child = spawn(
      python,
      [
        "-X",
        "utf8",
        resolve(root, "receipt_training/scripts/benchmark_vision_cli.py"),
        "--request",
        entry.path,
        "--run",
        entry.native_run,
        "--deadline",
        String(plan.native_deadline_seconds),
      ],
      { cwd: root, env, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] },
    );
    let stdout = "",
      stderr = "";
    child.stdout.on("data", (bytes) => {
      stdout += bytes.toString();
    });
    child.stderr.on("data", (bytes) => {
      stderr += bytes.toString();
    });
    const [code, signal] = await once(child, "close");
    const folder = resolve(root, "qa-artifacts/advanced-ocr", entry.native_run),
      meta = await json(resolve(folder, "metadata.json"));
    const result = {
      id: entry.id,
      mode: entry.mode,
      native_run: entry.native_run,
      exit_code: code,
      signal,
      elapsed_ms: meta.elapsed_ms,
      error: meta.error || null,
      accepted: false,
      native_metadata_sha256: sha(
        await readFile(resolve(folder, "metadata.json")),
      ),
      runner_stdout: stdout.trim(),
      runner_stderr: stderr.slice(0, 1000),
    };
    if (code === 0 && meta.parsed_json && !meta.error) {
      try {
        const raw = JSON.parse(
          (await readFile(resolve(folder, "stdout.txt"), "utf8")).trim(),
        );
        const receipt =
          entry.mode === "compact"
            ? expandCompactVision(raw)
            : aiReceiptSchema.parse(raw);
        assert(
          receipt.warnings.length <= 4 &&
            receipt.items.every((item) => item.note === ""),
        );
        const item = plan.cases.find((item) => item.id === entry.id);
        const photos = new Set(
          item ? item.panels.map((panel) => panel.photo) : [1],
        );
        assert(
          receipt.items.every((item) =>
            item.sourcePhotos.every((photo) => photos.has(photo)),
          ),
        );
        const file = resolve(out, `${entry.id}-${entry.mode}-canonical.json`);
        await writeFile(file, JSON.stringify(receipt, null, 2), { flag: "wx" });
        result.receipt_path = relative(root, file).replaceAll("\\", "/");
        result.receipt_sha256 = sha(await readFile(file));
        if (item) {
          const value = await postprocess(item, receipt),
            file = resolve(out, `${entry.id}-${entry.mode}-hybrid.json`);
          await writeFile(
            file,
            JSON.stringify(
              value,
              (_, value) => (typeof value === "bigint" ? String(value) : value),
              2,
            ),
            { flag: "wx" },
          );
          result.hybrid_path = relative(root, file).replaceAll("\\", "/");
          result.hybrid_sha256 = sha(await readFile(file));
        }
        result.accepted = true;
      } catch (error) {
        result.error = String(error);
      }
    }
    execution.native_calls.push(result);
    console.log(
      JSON.stringify({
        id: entry.id,
        mode: entry.mode,
        accepted: result.accepted,
        elapsed_ms: result.elapsed_ms,
        error: result.error,
      }),
    );
    if (entry.id === "synthetic-smoke" && !result.accepted) {
      execution.stopped_after_compatibility_failure = true;
      break;
    }
  }
} finally {
  globalThis.fetch = originalFetch;
  await server.close();
  execution.loaded_frozen_source_sha256 = loaded;
  execution.completed_at = new Date().toISOString();
  await writeFile(
    resolve(out, "execution.json"),
    JSON.stringify(execution, null, 2),
    { flag: "wx" },
  );
}
if (execution.stopped_after_compatibility_failure) process.exitCode = 1;
