// Freeze post-run validation sources/assets and verify protected Git/secret boundaries.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const out = resolve(root, "qa-artifacts/compact-release-check-v1");
const report = resolve(
  root,
  "receipt_training/evaluation/advanced-compact-validation-v1.json",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const key = (path) => relative(root, path).replaceAll("\\", "/");
const evidence = {};
if (process.argv.includes("--check")) {
  const value = JSON.parse(await readFile(report, "utf8"));
  for (const [name, expected] of Object.entries(value.evidence_sha256))
    assert.equal(sha(await readFile(resolve(root, name))), expected, name);
  console.log(
    JSON.stringify({ verified_files: Object.keys(value.evidence_sha256).length }),
  );
} else {
  await mkdir(out);
  const sourceHashes = {},
    scanBytes = [];
  async function remember(path, expected) {
    const bytes = await readFile(path),
      actual = sha(bytes);
    if (expected) assert.equal(actual, expected, key(path));
    evidence[key(path)] = actual;
    return bytes;
  }
  async function save(name) {
    const bytes = await readFile(resolve(root, name));
    scanBytes.push(bytes);
    sourceHashes[name] = sha(bytes);
    const target = resolve(out, "source", name);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    await remember(target, sourceHashes[name]);
  }
  async function walk(name) {
    for (const entry of await readdir(resolve(root, name), {
      withFileTypes: true,
    })) {
      if (["graphify-out", "__pycache__"].includes(entry.name)) continue;
      const path = name + "/" + entry.name;
      if (entry.isDirectory()) await walk(path);
      else await save(path);
    }
  }
  for (const dir of ["src", "server", "tests", "scripts"]) await walk(dir);
  for (const name of [
    "README.md",
    "vite.config.ts",
    "playwright.config.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "index.html",
    "receipt_training/evaluation/COMPACT_MULTIPHOTO_READER.md",
    "receipt_training/evaluation/ADVANCED_OCR_REPORT.md",
    "receipt_training/scripts/capture_compact_validation.mjs",
  ])
    await save(name);
  await walk("dist");
  const env = loadEnv("development", root, "");
  const secrets = [
    env.GEMINI_API_KEY,
    env.VERYFI_CLIENT_ID,
    env.VERYFI_BEARER_KEY,
  ].filter(Boolean);
  for (const bytes of scanBytes)
    for (const value of secrets)
      assert(!bytes.includes(Buffer.from(value)), "Configured secret in source/build");

  const git = (args, cwd = root) =>
    execFileSync("git", args, { cwd, windowsHide: true });
  const original = "C:/Users/natan/VSC Code/costco_calc";
  const stable = git(["rev-parse", "stable/receipt-verified"]).toString().trim();
  const originalHead = git(["rev-parse", "HEAD"], original).toString().trim();
  const originalDiff = sha(git(["diff", "--binary"], original));
  const originalStatus = git(["status", "--porcelain=v1"], original)
    .toString()
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim());
  assert.equal(stable, "ee725ba45e799bee8501d3de034e0302c0127afd");
  assert.equal(originalHead, "29a187af7347be94c0728f4785be674500833748");
  assert.equal(originalDiff, "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b");
  assert.deepEqual(originalStatus.sort(), [
    "M server/receipt-api.mjs",
    "M src/lib/extraction-schema.mjs",
    "M tests/ai.test.ts",
  ]);

  for (const name of ["advanced-compact-multiphoto-v1.json", "advanced-current-preparation-v1.json"])
    await remember(resolve(root, "receipt_training/evaluation", name));
  const nativePlan = JSON.parse(
    await readFile(resolve(root, "receipt_training/evaluation/runs/compact-local-native-uk-v1/plan.json"), "utf8"),
  );
  for (const [name, expected] of Object.entries(nativePlan.source_sha256))
    assert.equal(sha(await readFile(resolve(root, name))), expected, "Native run source changed: " + name);
  const browser = JSON.parse(
    await remember(resolve(root, "qa-artifacts/compact-runtime-browser-v2/browser.json")),
  );
  assert.equal(browser.stats.expected, 167);
  assert.equal(browser.stats.unexpected, 0);
  const begin = Date.parse(browser.stats.startTime),
    end = begin + browser.stats.duration;
  const folders = [];
  for (const name of await readdir(resolve(root, "qa-artifacts/e2e-runs"))) {
    const folder = resolve(root, "qa-artifacts/e2e-runs", name);
    let test;
    try {
      test = JSON.parse(await readFile(resolve(folder, "test.json"), "utf8"));
    } catch {
      continue;
    }
    const time = Date.parse(test.created_at);
    if (time < begin || time > end) continue;
    folders.push(key(folder));
    for (const file of await readdir(folder)) await remember(resolve(folder, file));
  }
  const result = {
    scope: "Post-run source/asset snapshot and bounded checks supplement the frozen compact workflow report. These snapshots do not turn the browser suite into a frozen-source replay or the model examples into a blind holdout.",
    created_at: new Date().toISOString(),
    source_sha256: sourceHashes,
    original_checkout: { head: originalHead, dirty_diff_sha256: originalDiff, status: originalStatus },
    stable_commit: stable,
    improvement_branch: git(["branch", "--show-current"]).toString().trim(),
    parent_commit_before_checkpoint: git(["rev-parse", "HEAD"]).toString().trim(),
    configured_secret_matches_in_source_and_build: 0,
    browser_attempt_directories: folders,
    browser_stats: browser.stats,
    model_workflow_source_unchanged: true,
    cloud_requests: 0,
    evidence_sha256: evidence,
  };
  await writeFile(report, JSON.stringify(result, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ protected_original: true, protected_stable: true, secret_matches: 0, frozen_sources_and_assets: Object.keys(sourceHashes).length, browser_attempt_directories: folders.length, evidence_files: Object.keys(evidence).length }));
}
