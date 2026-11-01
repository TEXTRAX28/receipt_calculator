// Immutable post-run sources/assets, actual browser attachments and Git boundaries.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "qa-artifacts/long-single-photo-release-v1");
const report = resolve(
  root,
  "receipt_training/evaluation/advanced-long-single-photo-validation-v1.json",
);
const evidence = {},
  sources = {},
  scan = [];
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const key = (path) => relative(root, path).replaceAll("\\", "/");
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
async function remember(path, expected) {
  const bytes = await readFile(path);
  const digest = sha(bytes);
  if (expected) assert.equal(digest, expected, key(path));
  evidence[key(path)] = digest;
  return bytes;
}
if (process.argv.includes("--check")) {
  for (const [name, expected] of Object.entries(
    (await readJson(report)).evidence_sha256,
  ))
    await remember(resolve(root, name), expected);
  console.log(JSON.stringify({ verified_files: Object.keys(evidence).length }));
} else {
  await mkdir(output);
  async function save(name) {
    const bytes = await readFile(resolve(root, name));
    scan.push(bytes);
    sources[name] = sha(bytes);
    const target = resolve(output, "source", name);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    await remember(target, sources[name]);
  }
  async function walk(name) {
    for (const entry of await readdir(resolve(root, name), {
      withFileTypes: true,
    })) {
      if (entry.name === "__pycache__") continue;
      const path = name + "/" + entry.name;
      if (entry.isDirectory()) await walk(path);
      else await save(path);
    }
  }
  for (const name of ["src", "server", "tests", "scripts", "dist"])
    await walk(name);
  for (const name of [
    "README.md",
    "vite.config.ts",
    "playwright.config.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "index.html",
    "receipt_training/evaluation/ADVANCED_OCR_REPORT.md",
    "receipt_training/evaluation/CURRENT_NATIVE_ORIGINAL50.md",
    "receipt_training/evaluation/LONG_SINGLE_PHOTO_DEADLINE.md",
    "receipt_training/scripts/capture_deadline_validation.mjs",
  ])
    await save(name);
  const env = loadEnv("development", root, "");
  const secrets = [
    env.GEMINI_API_KEY,
    env.VERYFI_CLIENT_ID,
    env.VERYFI_BEARER_KEY,
    env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  ].filter(Boolean);
  for (const bytes of scan)
    for (const value of secrets)
      assert(
        !bytes.includes(Buffer.from(value)),
        "Configured secret in source/build",
      );
  const git = (args, cwd = root) =>
    execFileSync("git", args, { cwd, windowsHide: true });
  const original = "C:/Users/natan/VSC Code/costco_calc";
  const stable = git(["rev-parse", "stable/receipt-verified"])
    .toString()
    .trim();
  const originalHead = git(["rev-parse", "HEAD"], original).toString().trim();
  const originalDiff = sha(git(["diff", "--binary"], original));
  const status = git(["status", "--porcelain=v1"], original)
    .toString()
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .sort();
  assert.equal(stable, "ee725ba45e799bee8501d3de034e0302c0127afd");
  assert.equal(originalHead, "29a187af7347be94c0728f4785be674500833748");
  assert.equal(
    originalDiff,
    "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b",
  );
  assert.deepEqual(status, [
    "M server/receipt-api.mjs",
    "M src/lib/extraction-schema.mjs",
    "M tests/ai.test.ts",
  ]);
  const native = await readJson(
    resolve(
      root,
      "receipt_training/evaluation/runs/long-single-photo-current-v1/metadata.json",
    ),
  );
  assert(
    native.source_unchanged &&
      native.comparison_complete &&
      native.exit_code === 0,
  );
  for (const [name, expected] of Object.entries(native.source_sha256))
    assert.equal(sha(await readFile(resolve(root, name))), expected, name);
  const browser = JSON.parse(
    await remember(
      resolve(
        root,
        "qa-artifacts/long-single-photo-validation-v1/browser.json",
      ),
    ),
  );
  assert.equal(browser.stats.expected, 167);
  assert.equal(browser.stats.skipped, 1);
  assert.equal(browser.stats.unexpected, 0);
  assert.equal(browser.stats.flaky, 0);
  const folders = new Set();
  function attachments(value) {
    if (!value || typeof value !== "object") return;
    if (
      value.name === "QA artifact directory" &&
      value.contentType === "text/plain"
    ) {
      const name = Buffer.from(value.body, "base64")
        .toString("utf8")
        .replaceAll("\\", "/");
      assert(/^qa-artifacts\/e2e-runs\/[\w-]+$/.test(name));
      folders.add(name);
    }
    for (const child of Object.values(value)) attachments(child);
  }
  attachments(browser);
  assert.equal(folders.size, 32);
  for (const name of folders)
    for (const file of await readdir(resolve(root, name)))
      await remember(resolve(root, name, file));
  const value = {
    scope:
      "Post-run source/build snapshot, real browser attachment paths and protected-state checks for the bounded single-photo deadline correction. Actual native evidence is separately retained; this snapshot does not turn emulated tests into handset evidence or a blind accuracy study.",
    created_at: new Date().toISOString(),
    source_sha256: sources,
    original_checkout: {
      head: originalHead,
      dirty_diff_sha256: originalDiff,
      status,
    },
    stable_commit: stable,
    improvement_branch: git(["branch", "--show-current"]).toString().trim(),
    parent_commit: git(["rev-parse", "HEAD"]).toString().trim(),
    configured_secret_matches_in_source_and_build: 0,
    browser_stats: browser.stats,
    browser_attempt_directories: [...folders],
    model_workflow_source_unchanged: true,
    cloud_requests: 0,
    evidence_sha256: evidence,
  };
  await writeFile(report, JSON.stringify(value, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      source_and_build_files: Object.keys(sources).length,
      browser_attempt_directories: folders.size,
      evidence_files: Object.keys(evidence).length,
      protected_original: true,
      protected_stable: true,
      secret_matches: 0,
    }),
  );
}
