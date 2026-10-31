// Offline only. Uses the real app formatter/validator/calculator, never labels.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { adaptRawPrinted } from "./raw_printed_profile.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const [run, kind, currency, outputTag = "postprocess"] = process.argv.slice(2);
if (
  !run ||
  !/^[\w-]+$/.test(run) ||
  !["raw", "control"].includes(kind) ||
  !/^[\w-]+$/.test(outputTag)
)
  throw new Error("Choose a native run and raw/control contract");
const folder = resolve(root, "qa-artifacts/advanced-ocr", run),
  out = resolve(folder, outputTag);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const metaBytes = await readFile(resolve(folder, "metadata.json"));
const meta = JSON.parse(metaBytes);
if (
  meta.exit_code ||
  !meta.parsed_json ||
  meta.error ||
  meta.external_api_requests ||
  meta.external_receipt_uploads
)
  throw new Error(
    "Native extraction did not complete within the local protocol",
  );
for (const [name, key] of [
  ["stdout.txt", "stdout_sha256"],
  ["stderr.txt", "stderr_sha256"],
  ["request.json", "request_sha256"],
  ["harness.py", "harness_sha256"],
])
  if (sha(await readFile(resolve(folder, name))) !== meta[key])
    throw new Error("Native evidence changed");
const dataBytes = await readFile(resolve(folder, "model-output.json"));
const stdoutBytes = await readFile(resolve(folder, "stdout.txt"));
const raw = JSON.parse(
  new TextDecoder("utf-8", { fatal: true })
    .decode(stdoutBytes)
    .replace(/\x1b\[[0-9;]*m/g, "")
    .trim(),
);
if (JSON.stringify(raw) !== JSON.stringify(JSON.parse(dataBytes)))
  throw new Error("Parsed output differs from the retained native response");
await mkdir(out);
await mkdir(resolve(out, "source"));
const sources = {};
for (const name of [
  ...(await readdir(resolve(root, "src/lib")))
    .filter((name) => /[.](?:ts|mjs)$/.test(name))
    .map((name) => "src/lib/" + name),
  "receipt_training/scripts/raw_printed_profile.mjs",
  "receipt_training/scripts/process_printed_pilot.mjs",
  "package-lock.json",
]) {
  const bytes = await readFile(resolve(root, name));
  sources[name] = sha(bytes);
  const target = resolve(out, "source", name);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, bytes, { flag: "wx" });
}
const server = await createServer({
  root,
  configFile: false,
  cacheDir: resolve(root, "node_modules/.vite-printed-" + run),
  server: { host: "127.0.0.1", hmr: false, watch: null },
});
try {
  const { printedAmount } = await server.ssrLoadModule(
    "/src/lib/printed-amount.ts",
  );
  const { receiptFromAi } = await server.ssrLoadModule("/src/lib/gemini.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const context = currency ? { currency } : undefined;
  const adapted =
    kind === "raw"
      ? adaptRawPrinted(raw, context, printedAmount)
      : { data: raw, issues: [], trusted: false };
  const receipt = receiptFromAi(adapted.data, "Local vision", context);
  receipt.reviewChecks.push({
    scope: "receipt",
    field: "items",
    reason: "coverage",
    other: "Research extraction requires complete source verification",
    confirmedValue: "",
  });
  const output = {
    contract: kind,
    user_context_after_extraction: context || null,
    receipt,
    calculation: calculateReceipt(receipt),
    normalization_issues: adapted.issues,
    excluded_payments: adapted.excludedPayments || [],
    raw_evidence: kind === "raw" ? adapted.rawEvidence : null,
    trusted: false,
  };
  const bytes = Buffer.from(
    JSON.stringify(
      output,
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ) + "\n",
  );
  await writeFile(resolve(out, "result.json"), bytes, { flag: "wx" });
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(
      {
        native_metadata_sha256: sha(metaBytes),
        native_model_output_sha256: sha(dataBytes),
        native_stdout_sha256: sha(stdoutBytes),
        model_output_matches_complete_stdout_json: true,
        result_sha256: sha(bytes),
        source_sha256: sources,
        contract: kind,
        context_used_only_after_extraction: context || null,
        labels_read: false,
        model_requests: 0,
        external_requests: 0,
        arithmetic_is_not_source_verification: true,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      run,
      contract: kind,
      proposed_rows: receipt.items.length,
      normalization_issues: adapted.issues.length,
      financial_issues: output.calculation.issues.length,
      model_requests: 0,
      external_requests: 0,
    }),
  );
} finally {
  await server.close();
}
