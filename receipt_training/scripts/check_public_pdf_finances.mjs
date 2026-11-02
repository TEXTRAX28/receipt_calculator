// Re-evaluate preserved browser drafts; no extraction, edits, models or network.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const run = process.argv[2];
assert(/^[\w-]+$/.test(run || ""));
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const inputs = {};
async function json(name) {
  const bytes = await readFile(resolve(root, name));
  inputs[name] = sha(bytes);
  return JSON.parse(bytes);
}
const before = "qa-artifacts/public-digital-v1/browser";
const after = `qa-artifacts/${run}/browser`;
const plans = await Promise.all(
  [before, after].map((folder) => json(folder + "/plan.json")),
);
for (const name of [
  "src/lib/engine.ts",
  "src/lib/money.ts",
  "src/lib/model.ts",
  "src/lib/review-checks.ts",
  "package-lock.json",
]) {
  const bytes = await readFile(resolve(root, name));
  assert.equal(sha(bytes), plans[0].source_sha256[name]);
  assert.equal(sha(bytes), plans[1].source_sha256[name]);
  inputs[name] = sha(bytes);
}
const fetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw new Error("Network disabled in PDF financial replay");
};
const server = await createServer({
  root,
  configFile: false,
  envDir: false,
  appType: "custom",
  logLevel: "error",
  server: { middlewareMode: true, hmr: false, watch: null },
});
const cases = [];
try {
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  for (const id of ["amazon-public-invoice", "gopak-public-invoice"]) {
    const original = await json(`${before}/${id}.json`);
    const current = await json(`${after}/${id}.json`);
    assert.equal(current.error, null);
    assert.deepEqual(current.requests, { posts: [], external: [] });
    const financial = ({ reviewChecks, ...receipt }) => receipt;
    assert.deepEqual(
      financial(current.state.receipt),
      financial(current.reviewed_state.receipt),
    );
    const result = { id };
    for (const [variant, receipt] of [
      ["before", original.state.receipt],
      ["after_initial", current.state.receipt],
      ["after_checked", current.reviewed_state.receipt],
    ]) {
      const calculation = calculateReceipt(receipt);
      result[variant] = {
        total_minor: calculation.total.toString(),
        discrepancy_minor: calculation.discrepancy?.toString() ?? null,
        issues: calculation.issues,
      };
    }
    cases.push(result);
  }
  await writeFile(
    resolve(root, `qa-artifacts/${run}/financial-checks.json`),
    JSON.stringify(
      {
        scope:
          "Current unchanged deterministic engine replays preserved before/after browser drafts. Checked means automated source-checkbox interactions, not independent human verification.",
        cases,
        input_sha256: inputs,
        extraction_calls: 0,
        network_requests: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      cases.map(({ id, after_checked }) => ({ id, ...after_checked })),
    ),
  );
} finally {
  await server.close();
  globalThis.fetch = fetch;
}
