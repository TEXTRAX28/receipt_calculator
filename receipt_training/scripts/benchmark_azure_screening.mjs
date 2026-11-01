// Offline by default. No key, account or old provider approval enables uploads.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import { sha } from "./azure_receipt_probe.mjs";
import { runAzureBatch } from "./azure_receipt_batch.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(root, "qa-artifacts/provider-review/azure-screening-v1");
const planFile = resolve(
  root,
  "receipt_training/evaluation/azure-screening-plan-v1.json",
);
const execute = process.argv[2] === "--execute-authorized";
assert(
  process.argv.length === 2 || (process.argv.length === 3 && execute),
  "Choose the dry run or --execute-authorized",
);
const planBytes = await readFile(planFile),
  plan = JSON.parse(planBytes);
for (const [name, expected] of Object.entries(plan.protocol_sha256))
  assert.equal(
    sha(await readFile(resolve(root, name))),
    expected,
    "Sealed Azure protocol changed",
  );
const cases = [];
for (const row of plan.cases) {
  const image = await readFile(resolve(root, row.image));
  assert.equal(sha(image), row.image_sha256, "Reviewed crop changed");
  cases.push({ id: row.id, image });
}
for (const [name, expected] of Object.entries(plan.review_sha256))
  assert.equal(
    sha(await readFile(resolve(root, name))),
    expected,
    "Source review changed",
  );
let local = {};
try {
  local = parseEnv(await readFile(resolve(root, ".env.local"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw new Error("Could not read local settings");
}
const credentials = {
  endpoint:
    process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ||
    local.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT ||
    "",
  key:
    process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY ||
    local.AZURE_DOCUMENT_INTELLIGENCE_KEY ||
    "",
};
if (!execute) {
  console.log(
    JSON.stringify({
      provider: plan.provider,
      dry_run: true,
      prepared_cases: cases.length,
      endpoint_configured: Boolean(credentials.endpoint),
      key_configured: Boolean(credentials.key),
      new_azure_approval_and_six_unused_f0_pages_required: true,
      external_requests: 0,
    }),
  );
} else {
  const authorization = JSON.parse(
    await readFile(resolve(folder, "authorization.json"), "utf8"),
  );
  const run = resolve(folder, "run");
  const json = (path, value) =>
    writeFile(path, JSON.stringify(value, null, 2) + "\n", { flag: "wx" });
  const results = await runAzureBatch({
    cases,
    authorization,
    credentials,
    planSha256: sha(planBytes),
    consumeBatch: async (meta) => {
      await json(resolve(folder, "consumed.json"), meta);
      await mkdir(run);
      await mkdir(resolve(run, "source"));
      for (const [name, expected] of Object.entries(plan.protocol_sha256)) {
        const bytes = await readFile(resolve(root, name));
        assert.equal(sha(bytes), expected);
        await writeFile(resolve(run, "source", name.split("/").at(-1)), bytes, {
          flag: "wx",
        });
      }
      await writeFile(resolve(run, "plan.json"), planBytes, { flag: "wx" });
    },
    consumeCase: async (id, meta) => {
      await mkdir(resolve(run, id));
      await json(resolve(run, id, "consumed.json"), meta);
    },
    saveResponse: (id, raw) =>
      writeFile(resolve(run, id, "response.json"), raw, { flag: "wx" }),
    saveMetadata: (id, meta) => json(resolve(run, id, "metadata.json"), meta),
  });
  await json(resolve(run, "summary.json"), { results, automatic_retries: 0 });
  console.log(
    JSON.stringify({
      attempted: results.length,
      extractions_received: results.filter((row) => row.extraction_received)
        .length,
      deletions_reported: results.filter(
        (row) => row.deletion_status === "provider-reported-success",
      ).length,
    }),
  );
}
