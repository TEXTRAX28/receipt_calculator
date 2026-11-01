// Freeze validation and protected Git state without model or API requests.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "qa-artifacts/source-price-release-v1");
const validation = "qa-artifacts/invalid-line-recovery-validation-v2";
const report = resolve(
  root,
  "receipt_training/evaluation/advanced-source-price-validation-v1.json",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (path) => relative(root, path).replaceAll("\\", "/");
const json = async (path) =>
  JSON.parse(await readFile(resolve(root, path), "utf8"));
const evidence = {},
  sources = {},
  scanned = [];
async function remember(path) {
  const absolute = resolve(root, path);
  assert(!name(absolute).startsWith("../"));
  const bytes = await readFile(absolute);
  evidence[name(absolute)] = sha(bytes);
  return bytes;
}
async function walk(path, visit) {
  for (const entry of await readdir(resolve(root, path), {
    withFileTypes: true,
  })) {
    if (["__pycache__", "graphify-out"].includes(entry.name)) continue;
    const next = path + "/" + entry.name;
    if (entry.isDirectory()) await walk(next, visit);
    else await visit(next);
  }
}
if (process.argv.includes("--check")) {
  for (const [path, expected] of Object.entries(
    (await json(report)).evidence_sha256,
  )) {
    await remember(path);
    assert.equal(evidence[path], expected, path);
  }
  console.log(
    JSON.stringify({
      verified_files: Object.keys(evidence).length,
      new_model_requests: 0,
    }),
  );
} else {
  await mkdir(output);
  async function save(path) {
    const bytes = await readFile(resolve(root, path));
    sources[path] = sha(bytes);
    scanned.push(bytes);
    const target = resolve(output, "source", path);
    await mkdir(resolve(target, ".."), { recursive: true });
    await writeFile(target, bytes, { flag: "wx" });
    await remember(target);
  }
  for (const path of ["src", "server", "tests", "scripts", "dist"])
    await walk(path, save);
  for (const path of [
    "README.md",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "playwright.config.ts",
    "index.html",
    "tsconfig.json",
    "receipt_training/evaluation/SOURCE_PRICE_RECOVERY.md",
    "receipt_training/evaluation/AZURE_SIX_RESULT.md",
    "receipt_training/evaluation/ADVANCED_OCR_REPORT.md",
    "receipt_training/scripts/capture_source_price_validation.mjs",
  ])
    await save(path);
  const env = loadEnv("development", root, "");
  const privateValues = [
    env.GEMINI_API_KEY,
    env.VERYFI_CLIENT_ID,
    env.VERYFI_BEARER_KEY,
    env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
    env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT,
  ].filter(Boolean);
  for (const bytes of scanned)
    for (const value of privateValues)
      assert(
        !bytes.includes(Buffer.from(value)),
        "Configured private value found in source/build",
      );

  const unit = await json(validation + "/unit.json");
  assert(
    unit.success && unit.numPassedTests === 520 && unit.numFailedTests === 0,
  );
  const browser = await json(validation + "/browser.json");
  assert(
    browser.stats.expected === 167 &&
      browser.stats.skipped === 1 &&
      browser.stats.unexpected === 0 &&
      browser.stats.flaky === 0,
  );
  for (const [file, pattern] of [
    ["build.log", /built in/],
    ["format.log", /All matched files use Prettier/],
    ["graph.log", /Graph is current/],
  ])
    assert(
      pattern.test((await remember(validation + "/" + file)).toString("utf8")),
      file,
    );
  const browserFolders = new Set();
  function attachments(value) {
    if (!value || typeof value !== "object") return;
    if (
      value.name === "QA artifact directory" &&
      value.contentType === "text/plain"
    )
      browserFolders.add(
        Buffer.from(value.body, "base64")
          .toString("utf8")
          .replaceAll("\\", "/"),
      );
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(attachments);
      else if (child && typeof child === "object") attachments(child);
    }
  }
  attachments(browser);
  const include = async (path) => walk(path, remember);
  await include(validation);
  for (const folder of browserFolders) await include(folder);

  const comparisonPath =
    "receipt_training/evaluation/advanced-source-price-recovery-v2.json";
  const comparison = JSON.parse(await remember(comparisonPath));
  assert(
    comparison.known_field_regressions.length === 0 &&
      comparison.proposals.length === 11,
  );
  for (const [path, expected] of Object.entries(comparison.evidence_sha256)) {
    await remember(path);
    assert.equal(evidence[path], expected, path);
  }
  const ui = await json(
    "qa-artifacts/invalid-price-native-phone-v2/ui/result.json",
  );
  assert.equal(
    ui.image_sha256,
    "893039ec50d04a6d8d151ebfa47a98528f4e8cb5abfc0097183b64dafbd10895",
  );
  assert.deepEqual(ui.posts, [
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
  assert(
    ui.external_requests === 0 &&
      ui.blocked.length === 0 &&
      ui.financial_fields_edited === false &&
      ui.recoveries === 5,
  );

  const git = (args, cwd = root) =>
    execFileSync("git", args, { cwd, windowsHide: true });
  const original = "C:/Users/natan/VSC Code/costco_calc";
  const stable = git(["rev-parse", "stable/receipt-verified"])
    .toString()
    .trim();
  const originalHead = git(["rev-parse", "HEAD"], original).toString().trim();
  const originalDiff = sha(git(["diff", "--binary"], original));
  const originalStatus = git(["status", "--porcelain=v1"], original)
    .toString()
    .trim()
    .split(/\r?\n/)
    .map((row) => row.trim())
    .sort();
  assert.equal(stable, "ee725ba45e799bee8501d3de034e0302c0127afd");
  assert.equal(originalHead, "29a187af7347be94c0728f4785be674500833748");
  assert.equal(
    originalDiff,
    "72fe803bf341a3052a441b7144838d06e7f4cbea5b59d612feb649368442e31b",
  );
  assert.deepEqual(originalStatus, [
    "M server/receipt-api.mjs",
    "M src/lib/extraction-schema.mjs",
    "M tests/ai.test.ts",
  ]);
  const result = {
    scope:
      "Final source-price proposal code: regression validation, frozen saved-reading replay, retained actual phone observations and protected Git state. Not production acceptance.",
    source_sha256: sources,
    unit_passed: 520,
    browser_passed: 167,
    browser_existing_skip: 1,
    browser_attachment_folders: browserFolders.size,
    configured_private_value_matches: 0,
    stable_commit: stable,
    original_checkout_commit: originalHead,
    original_dirty_binary_diff_sha256: originalDiff,
    original_dirty_paths: originalStatus,
    new_external_requests_by_capture: 0,
    native_phone_observations: comparison.native_phone_observations,
    successful_native_scan_to_review_ms: ui.elapsed_ms,
    limits:
      "Actual native phone observations precede the isolated final conflicting-batch-currency guard; final replay and synthetic batch tests verify that guard. Price proposals remain unconfirmed. No p95, physical-device, complete-financial, deployment, push or merge claim. Full objective remains active.",
    evidence_sha256: evidence,
  };
  await writeFile(report, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      verified_files: Object.keys(evidence).length,
      source_files: Object.keys(sources).length,
      browser_attachment_folders: browserFolders.size,
      unit_passed: 520,
      browser_passed: 167,
      configured_private_value_matches: 0,
      protected_git_state_unchanged: true,
    }),
  );
}
