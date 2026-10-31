// Offline audit only. Never reads credentials, calls an API or accepts a draft.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = resolve(root, "qa-artifacts/provider-review/veryfi-uk-v1");
const tag = process.argv[2] || "ocr-text-review-v1";
if (!/^[\w-]+$/.test(tag)) throw new Error("Choose a new bounded review name");
const out = resolve(folder, tag);
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const metaBytes = await readFile(resolve(folder, "run/metadata.json"));
const meta = JSON.parse(metaBytes);
const response = await readFile(resolve(folder, "run/response.json"));
if (
  meta.provider !== "Veryfi" ||
  meta.processing_requests !== 1 ||
  !meta.extraction_received ||
  meta.response_sha256 !== sha(response)
)
  throw new Error("Missing or altered successful one-use response");
// Only literal OCR text enters the parser. Native JSON financial numbers are unused.
const text = JSON.parse(response).ocr_text;
if (typeof text !== "string" || !text || text.length > 60000)
  throw new Error("Missing or oversized OCR text");
await mkdir(out);
await mkdir(resolve(out, "source"));
const sources = {};
for (const name of [
  ...(await readdir(resolve(root, "src/lib")))
    .filter((name) => /[.](?:ts|mjs)$/.test(name))
    .map((name) => "src/lib/" + name),
  "receipt_training/scripts/process_veryfi_text.mjs",
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
  cacheDir: resolve(root, "node_modules/.vite-veryfi-text-" + tag),
  server: { host: "127.0.0.1", hmr: false, watch: null },
});
try {
  const { parseReceiptWithSources } =
    await server.ssrLoadModule("/src/lib/parser.ts");
  const { calculateReceipt } = await server.ssrLoadModule("/src/lib/engine.ts");
  const { receipt, sources: sourceLines } = parseReceiptWithSources(text);
  receipt.reviewChecks.push({
    scope: "receipt",
    field: "items",
    reason: "coverage",
    other: "Research provider text requires complete source verification",
    confirmedValue: "",
  });
  const result = {
    receipt,
    calculation: calculateReceipt(receipt),
    sourceLines,
    trusted: false,
    source_mapping_limit:
      "Veryfi supplied one combined text document; line indices do not identify an original photograph or bounding box.",
  };
  const bytes = Buffer.from(
    JSON.stringify(
      result,
      (_k, v) => (typeof v === "bigint" ? v.toString() : v),
      2,
    ) + "\n",
  );
  await writeFile(resolve(out, "result.json"), bytes, { flag: "wx" });
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(
      {
        provider_metadata_sha256: sha(metaBytes),
        provider_response_sha256: sha(response),
        literal_ocr_text_sha256: sha(Buffer.from(text)),
        result_sha256: sha(bytes),
        source_sha256: sources,
        input_native_money_fields_used: false,
        currency_context_supplied: false,
        label_files_read: false,
        model_requests: 0,
        external_requests: 0,
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      proposed_rows: receipt.items.length,
      financial_issues: result.calculation.issues.length,
      calculated_total_minor: result.calculation.total.toString(),
      discrepancy_minor: result.calculation.discrepancy.toString(),
      external_requests: 0,
      trusted: false,
    }),
  );
} finally {
  await server.close();
}
