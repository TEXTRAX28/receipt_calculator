// Unchanged deterministic engine on saved, unedited browser drafts; no OCR.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const folder = `receipt_training/evaluation/runs/${run}`;
const inputs = {};
const sha = (raw) => createHash("sha256").update(raw).digest("hex");
async function json(name) {
  const raw = await readFile(resolve(root, name));
  inputs[name] = sha(raw);
  return JSON.parse(raw);
}
const plan = await json(folder + "/plan.json");
for (const name of [
  "src/lib/engine.ts",
  "src/lib/money.ts",
  "src/lib/model.ts",
  "src/lib/review-checks.ts",
  "package-lock.json",
]) {
  const bytes = await readFile(resolve(root, name));
  assert.equal(sha(bytes), plan.source_sha256[name]);
  inputs[name] = sha(bytes);
}
const fetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in saved-draft calculation");
};
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
});
try {
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const cases = [];
  for (const document of plan.documents) {
    const reading = await json(`${folder}/${document.id}.json`);
    assert.equal(reading.error, null);
    const calculation = calculateReceipt(reading.state.receipt);
    cases.push({
      id: document.id,
      elapsed_ms: reading.elapsed_ms,
      receipt: reading.state.receipt,
      calculation: {
        total: calculation.total.toString(),
        printed: calculation.printed?.toString() ?? null,
        discrepancy: calculation.discrepancy?.toString() ?? null,
        issues: calculation.issues,
      },
    });
  }
  await writeFile(
    resolve(root, folder + "/financial-checks.json"),
    JSON.stringify(
      {
        scope:
          "Saved initial drafts, no checks cleared or monetary fields edited. Actual unchanged engine; this is not another inference or UI attempt.",
        cases,
        input_sha256: inputs,
        new_ocr_jobs: 0,
        network_requests: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      cases.map(({ id, calculation }) => ({
        id,
        discrepancy: calculation.discrepancy,
        issues: calculation.issues.length,
      })),
    ),
  );
} finally {
  await server.close();
  globalThis.fetch = fetch;
}
