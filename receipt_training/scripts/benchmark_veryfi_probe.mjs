// Default is a local dry run. A separate human authorization is required for live I/O.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import {
  ENDPOINT,
  sha,
  runVeryfiProbe,
  validateProbeInputs,
} from "./veryfi_probe_transport.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const prepared = resolve(root, "qa-artifacts/provider-review/veryfi-uk-v1");
const planFile = resolve(
  root,
  "receipt_training/evaluation/veryfi-probe-plan-v1.json",
);
const execute = process.argv[2] === "--execute-authorized";
if (process.argv.length > 2 && !execute)
  throw new Error("Choose the default dry run or --execute-authorized");
const planBytes = await readFile(planFile);
const plan = JSON.parse(planBytes);
for (const name of [
  "benchmark_veryfi_probe.mjs",
  "veryfi_probe_transport.mjs",
]) {
  if (
    sha(await readFile(new URL(name, import.meta.url))) !==
    plan.protocol_sha256[name]
  )
    throw new Error("Prepared protocol changed; no request made");
}
const manifestBytes = await readFile(resolve(prepared, "manifest.json"));
const manifest = JSON.parse(manifestBytes);
const archive = await readFile(resolve(prepared, "receipt.zip"));
if (
  plan.manifest_sha256 !== sha(manifestBytes) ||
  plan.archive_sha256 !== sha(archive) ||
  manifest.archive_sha256 !== sha(archive) ||
  manifest.provider !== "Veryfi" ||
  manifest.endpoint !== ENDPOINT ||
  manifest.max_processing_requests !== 1 ||
  manifest.max_deletion_requests !== 1 ||
  manifest.automatic_retries !== 0
)
  throw new Error("Prepared scope changed; no request made");
for (const input of manifest.inputs) {
  const path = resolve(root, input.source);
  if (
    !path.startsWith(
      resolve(root, "qa-artifacts/advanced-ocr/cloud-review") + "/",
    ) &&
    !path.startsWith(
      resolve(root, "qa-artifacts/advanced-ocr/cloud-review") + "\\",
    )
  )
    throw new Error("Unexpected input path");
  if (sha(await readFile(path)) !== input.sha256)
    throw new Error("Inspected crop changed; no request made");
}
let local = {};
try {
  local = parseEnv(await readFile(resolve(root, ".env.local"), "utf8"));
} catch (error) {
  if (error.code !== "ENOENT")
    throw new Error("Could not read local configuration");
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
      input_files: manifest.inputs.length,
      archive_bytes: archive.length,
      archive_sha256: sha(archive),
      client_id_configured: Boolean(credentials.clientId),
      bearer_key_configured: Boolean(credentials.bearerKey),
      private_upload_approval_required: true,
      external_requests: 0,
    }),
  );
} else {
  let permit;
  try {
    permit = JSON.parse(
      await readFile(resolve(prepared, "authorization.json"), "utf8"),
    );
  } catch {
    throw new Error("Separate human authorization is missing; no request made");
  }
  if (
    permit.manifest_sha256 !== sha(manifestBytes) ||
    permit.plan_sha256 !== sha(planBytes) ||
    typeof permit.user_reply !== "string" ||
    !permit.user_reply.trim()
  )
    throw new Error("Authorization does not match this prepared scope");
  validateProbeInputs({ archive, permit, credentials });
  const out = resolve(prepared, "run");
  const metadata = await runVeryfiProbe({
    archive,
    permit,
    credentials,
    consume: async (record) => {
      await writeFile(
        resolve(prepared, "consumed.json"),
        JSON.stringify(record, null, 2),
        { flag: "wx" },
      );
      await mkdir(out);
      await mkdir(resolve(out, "source"));
      for (const name of [
        "benchmark_veryfi_probe.mjs",
        "veryfi_probe_transport.mjs",
      ])
        await writeFile(
          resolve(out, "source", name),
          await readFile(new URL(name, import.meta.url)),
          { flag: "wx" },
        );
      await writeFile(resolve(out, "manifest.json"), manifestBytes, {
        flag: "wx",
      });
      await writeFile(
        resolve(out, "authorization.json"),
        JSON.stringify(permit, null, 2),
        { flag: "wx" },
      );
    },
    saveResponse: (raw) =>
      writeFile(resolve(out, "response.json"), raw, { flag: "wx" }),
  });
  metadata.manifest_sha256 = sha(manifestBytes);
  metadata.protocol_source_sha256 = Object.fromEntries(
    await Promise.all(
      ["benchmark_veryfi_probe.mjs", "veryfi_probe_transport.mjs"].map(
        async (name) => [
          name,
          sha(await readFile(resolve(out, "source", name))),
        ],
      ),
    ),
  );
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(metadata, null, 2),
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      provider: metadata.provider,
      processing_requests: metadata.processing_requests,
      processing_http_status: metadata.processing_http_status,
      extraction_received: metadata.extraction_received,
      deletion_requests: metadata.deletion_requests,
      deletion_status: metadata.deletion_status,
      elapsed_ms: metadata.elapsed_ms,
      error: metadata.error,
    }),
  );
  if (
    !metadata.extraction_received ||
    metadata.deletion_status !== "provider-reported-success"
  )
    process.exitCode = 1;
}
