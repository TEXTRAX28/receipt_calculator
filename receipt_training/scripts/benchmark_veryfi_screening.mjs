// Default: strictly offline dry run. Upload scope differs from the consumed UK probe.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { sha } from "./veryfi_screening_transport.mjs";
import { runScreeningBatch } from "./veryfi_screening_batch.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(
  root,
  "qa-artifacts/provider-review/veryfi-screening-crops-v2",
);
const planFile = resolve(
  root,
  "receipt_training/evaluation/veryfi-screening-plan-v1.json",
);
const execute = process.argv[2] === "--execute-authorized";
if (process.argv.length > 2 && !execute)
  throw new Error("Choose the offline dry run or --execute-authorized");
const planBytes = await readFile(planFile),
  plan = JSON.parse(planBytes);
for (const [name, digest] of Object.entries(plan.protocol_sha256))
  if (sha(await readFile(new URL(name, import.meta.url))) !== digest)
    throw new Error("Sealed screening protocol changed; no request made");
const manifestBytes = await readFile(resolve(folder, "manifest.json"));
const reviewBytes = await readFile(resolve(folder, "source-review.json"));
if (
  sha(manifestBytes) !== plan.manifest_sha256 ||
  sha(reviewBytes) !== plan.source_review_sha256
)
  throw new Error("Prepared scope changed; no request made");
const manifest = JSON.parse(manifestBytes);
if (manifest.cases.length !== 6 || plan.cases.length !== 6)
  throw new Error("Unexpected case count");
const cases = [];
for (const [index, item] of manifest.cases.entries()) {
  const sealed = plan.cases[index];
  if (
    sealed.case !== item.case ||
    sealed.archive_sha256 !== item.archive_sha256 ||
    !/^case-0[1-6]$/.test(item.case) ||
    item.crop_file !== `${item.case}/receipt.png` ||
    item.archive_file !== `${item.case}/receipt.zip`
  )
    throw new Error("Unexpected case mapping");
  const crop = await readFile(resolve(folder, item.crop_file));
  const archive = await readFile(resolve(folder, item.archive_file));
  if (sha(crop) !== item.crop_sha256 || sha(archive) !== item.archive_sha256)
    throw new Error("Inspected crop/archive changed; no request made");
  cases.push({ id: item.case, archive, archive_sha256: item.archive_sha256 });
}
let local = {};
try {
  local = parseEnv(await readFile(resolve(root, ".env.local"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT") throw new Error("Could not read local settings");
}
const credentials = {
  clientId: process.env.VERYFI_CLIENT_ID || local.VERYFI_CLIENT_ID || "",
  bearerKey: process.env.VERYFI_BEARER_KEY || local.VERYFI_BEARER_KEY || "",
};
if (!execute) {
  console.log(
    JSON.stringify({
      provider: "Veryfi",
      dry_run: true,
      prepared_cases: cases.length,
      client_id_configured: Boolean(credentials.clientId),
      bearer_key_configured: Boolean(credentials.bearerKey),
      new_six_case_approval_and_free_quota_confirmation_required: true,
      external_requests: 0,
    }),
  );
} else {
  let authorization;
  try {
    authorization = JSON.parse(
      await readFile(resolve(folder, "authorization.json"), "utf8"),
    );
  } catch {
    throw new Error(
      "Separate six-case authorization is missing; no request made",
    );
  }
  if (
    authorization.plan_sha256 !== sha(planBytes) ||
    authorization.manifest_sha256 !== sha(manifestBytes) ||
    authorization.source_review_sha256 !== sha(reviewBytes)
  )
    throw new Error("Authorization does not match this sealed six-case scope");
  const run = resolve(folder, "run");
  const results = await runScreeningBatch({
    cases,
    authorization,
    credentials,
    consumeBatch: async (record) => {
      await writeFile(
        resolve(folder, "consumed.json"),
        JSON.stringify(record, null, 2),
        { flag: "wx" },
      );
      await mkdir(run);
      await mkdir(resolve(run, "source"));
      for (const name of Object.keys(plan.protocol_sha256))
        await writeFile(
          resolve(run, "source", name),
          await readFile(new URL(name, import.meta.url)),
          { flag: "wx" },
        );
      for (const [name, bytes] of [
        ["plan.json", planBytes],
        ["manifest.json", manifestBytes],
        ["source-review.json", reviewBytes],
      ])
        await writeFile(resolve(run, name), bytes, { flag: "wx" });
    },
    consumeCase: async (id, record) => {
      await mkdir(resolve(run, id));
      await writeFile(
        resolve(run, id, "consumed.json"),
        JSON.stringify(record, null, 2),
        { flag: "wx" },
      );
    },
    saveResponse: (id, raw) =>
      writeFile(resolve(run, id, "response.json"), raw, { flag: "wx" }),
    saveMetadata: (id, data) =>
      writeFile(
        resolve(run, id, "metadata.json"),
        JSON.stringify(data, null, 2),
        { flag: "wx" },
      ),
  });
  await writeFile(
    resolve(run, "summary.json"),
    JSON.stringify(results, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      processing_requests: results.reduce(
        (n, r) => n + r.processing_requests,
        0,
      ),
      deletion_requests: results.reduce((n, r) => n + r.deletion_requests, 0),
      successful_extractions: results.filter((r) => r.extraction_received)
        .length,
      automatic_retries: 0,
      billing_activated: false,
    }),
  );
}
