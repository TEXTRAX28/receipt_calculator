// Seal current app validation, native failures/successes and protected Git state.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = resolve(root, "qa-artifacts/row-first-release-v1");
const report = resolve(
  root,
  "receipt_training/evaluation/advanced-row-first-validation-v1.json",
);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const name = (path) => relative(root, path).replaceAll("\\", "/");
const json = async (path) => JSON.parse(await readFile(path, "utf8"));
const evidence = {},
  sources = {},
  scanned = [];
async function remember(path) {
  const bytes = await readFile(path);
  evidence[name(path)] = sha(bytes);
  return bytes;
}
if (process.argv.includes("--check")) {
  for (const [path, expected] of Object.entries(
    (await json(report)).evidence_sha256,
  )) {
    await remember(resolve(root, path));
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
    "receipt_training/evaluation/ROW_FIRST_DECODER.md",
    "receipt_training/evaluation/AZURE_SIX_RESULT.md",
    "receipt_training/evaluation/ADVANCED_OCR_REPORT.md",
    "receipt_training/scripts/capture_row_first_validation.mjs",
  ])
    await save(path);
  const env = loadEnv("development", root, "");
  const secrets = [
    env.GEMINI_API_KEY,
    env.VERYFI_CLIENT_ID,
    env.VERYFI_BEARER_KEY,
    env.AZURE_DOCUMENT_INTELLIGENCE_KEY,
  ].filter(Boolean);
  for (const bytes of scanned)
    for (const secret of secrets)
      assert(
        !bytes.includes(Buffer.from(secret)),
        "Configured secret found in source/build",
      );
  const unit = await json(
    resolve(root, "qa-artifacts/row-first-validation-v1/unit-final.json"),
  );
  assert(
    unit.success && unit.numPassedTests === 506 && unit.numFailedTests === 0,
  );
  const browser = await json(
    resolve(root, "qa-artifacts/row-first-validation-v1/browser.json"),
  );
  assert(
    browser.stats.expected === 167 &&
      browser.stats.skipped === 1 &&
      browser.stats.unexpected === 0 &&
      browser.stats.flaky === 0,
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
  const include = async (path) =>
    walk(path, (file) => remember(resolve(root, file)));
  await include("qa-artifacts/row-first-validation-v1");
  for (const folder of browserFolders) await include(folder);
  const nativeRuns = [];
  for (const run of [
    "row-first-native-phone-v1",
    "row-first-native-phone-v2",
  ]) {
    const folder = "qa-artifacts/" + run;
    const meta = await json(resolve(root, folder, "execution.json"));
    assert(
      meta.source_unchanged &&
        meta.external_uploads === 0 &&
        meta.retries === 0,
    );
    nativeRuns.push({
      run,
      exit_code: meta.exit_code,
      started_at: meta.started_at,
      completed_at: meta.completed_at,
    });
    await include(folder);
  }
  assert(nativeRuns[0].exit_code === 1 && nativeRuns[1].exit_code === 0);
  const ui = await json(
    resolve(root, "qa-artifacts/row-first-native-phone-v2/ui/result.json"),
  );
  assert.equal(
    ui.image_sha256,
    "a7efa7596757d7916c5e454e8bd98e3371cdf476ac737a269693804484cfc193",
  );
  assert.deepEqual(ui.posts, [
    "/api/receipts/recognize",
    "/api/receipts/vision",
  ]);
  assert(
    ui.external_requests === 0 &&
      ui.blocked.length === 0 &&
      ui.financial_fields_edited === false &&
      ui.receipt.items.length === 22,
  );
  assert(
    ui.reviewed.length === 4 &&
      ui.reviewed.every((row) =>
        row.checks.some(
          (check) =>
            check.field === "unitPrice" &&
            check.reason === "unsupported" &&
            check.confirmedValue === "",
        ),
      ),
  );
  await include(
    "receipt_training/evaluation/runs/row-first-long-diagnostic-v1",
  );
  await include("qa-artifacts/row-first-risk-review-v1");
  await include("qa-artifacts/row-first-native-phone-failure-review-v1");
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
      "Current order-only app promotion: full regression checks, retained real native phone timeout/success, independent pipeline and unchanged protected Git state. Not a production acceptance or complete-financial-accuracy certificate.",
    source_sha256: sources,
    unit_passed: 506,
    browser_passed: 167,
    browser_existing_skip: 1,
    native_phone_observations: nativeRuns,
    successful_native_scan_to_review_ms: ui.elapsed_ms,
    browser_attachment_folders: browserFolders.size,
    source_build_secret_matches: 0,
    stable_commit: stable,
    original_checkout_commit: originalHead,
    original_dirty_binary_diff_sha256: originalDiff,
    original_dirty_paths: originalStatus,
    new_external_requests_by_capture: 0,
    limits:
      "First real phone observation timed out; later real runs do not erase it or establish a cause. Corrected line prices retain unsupported unit/source checks and blocked confirmation. No p95, physical-phone, complete receipt, deployment, push or merge claim. The full objective remains active.",
    evidence_sha256: evidence,
  };
  await writeFile(report, JSON.stringify(result, null, 2) + "\n", {
    flag: "wx",
  });
  console.log(
    JSON.stringify({
      verified_files: Object.keys(evidence).length,
      browser_attachment_folders: browserFolders.size,
      source_files: Object.keys(sources).length,
      unit_passed: 506,
      browser_passed: 167,
      secrets_found: 0,
      protected_git_state_unchanged: true,
    }),
  );
}
