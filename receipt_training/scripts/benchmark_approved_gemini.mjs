// Exactly one explicitly approved private-crop request. No retry or alternative model.
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { loadEnv } from "vite";

const project = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const approved = resolve(project, "qa-artifacts/advanced-ocr/cloud-review");
const additional = process.argv[2] === "--approved-additional-attempt";
if (process.argv.length > 2 && !additional)
  throw new Error("Unknown approval scope");
const out = resolve(
  project,
  `qa-artifacts/advanced-ocr/gemini-approved-uk-v${additional ? 2 : 1}`,
);
const prior = additional
  ? JSON.parse(
      await readFile(
        resolve(
          project,
          "qa-artifacts/advanced-ocr/gemini-approved-uk-v1/metadata.json",
        ),
      ),
    )
  : null;
if (additional && (prior.api_requests !== 1 || prior.http_status !== 503))
  throw new Error(
    "The separately approved additional-attempt precondition changed",
  );
const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const expected = [
  [
    "user-uk-items.jpg",
    "1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68",
  ],
  [
    "user-uk-vat-totals.jpg",
    "adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b",
  ],
];
const originalManifest = await readFile(
  resolve(approved, "request-manifest.json"),
);
const manifest = JSON.parse(originalManifest);
if (
  manifest.model !== "gemini-3.1-flash-lite" ||
  manifest.max_attempts !== 1 ||
  JSON.stringify(manifest.files.map((file) => [file.file, file.sha256])) !==
    JSON.stringify(expected)
)
  throw new Error(
    "The approved model, receipt crops or request limit changed; no upload made",
  );
const env = loadEnv("development", project, "");
if (!env.GEMINI_API_KEY)
  throw new Error("The server-side Gemini key is unavailable; no upload made");
const panels = [];
for (const [index, [name, hash]] of expected.entries()) {
  const bytes = await readFile(resolve(approved, name));
  if (sha(bytes) !== hash)
    throw new Error("An approved crop changed; no upload made");
  panels.push({ photo: index + 1, part: 1, data: bytes.toString("base64") });
}
await mkdir(out); // Existing output/consumption ledger means this approval cannot be reused.
const sourceHashes = {};
for (const folder of ["server", "src/lib"]) {
  for (const name of await readdir(resolve(project, folder))) {
    if (!/[.](?:mjs|json)$/.test(name)) continue;
    const path = `${folder}/${name}`,
      bytes = await readFile(resolve(project, path));
    await mkdir(dirname(resolve(out, "source", path)), { recursive: true });
    await writeFile(resolve(out, "source", path), bytes, { flag: "wx" });
    sourceHashes[path] = sha(bytes);
  }
}
const runner = await readFile(fileURLToPath(import.meta.url));
await writeFile(resolve(out, "runner.mjs"), runner, { flag: "wx" });
const metadata = {
  model: "gemini-3.1-flash-lite",
  provider: "Google Gemini API",
  scope:
    "One approved source-informed UK development receipt, exactly two identifier-removed crops",
  approval_user_reply: additional
    ? "Allow one additional attempt"
    : "Approve this one cropped-receipt test",
  approval_scope:
    "One receipt, one attempt in this authorization, existing user-declared free quota; no billing activation, paid fallback or automatic retry",
  attempt_number: additional ? 2 : 1,
  request_manifest_before_approval_sha256: sha(originalManifest),
  input_sha256: Object.fromEntries(expected),
  started_at: new Date().toISOString(),
  api_requests: 0,
  billing_activated: false,
  paid_fallback: false,
  retries: 0,
  claimed_cost_under_user_declared_free_quota_usd: "0",
  actual_account_billing_verified: false,
  runner_sha256: sha(runner),
  source_sha256: sourceHashes,
  inference_label_files_read: [],
  ocr_text_supplied: false,
  comparison_limits: [
    "Only visible body/VAT crops were authorized; merchant/date/currency and other context can be absent",
    "One source-informed development case cannot establish complete-cohort accuracy or latency p95",
  ],
};
await writeFile(
  resolve(out, "authorization.json"),
  JSON.stringify(metadata, null, 2) + "\n",
  { flag: "wx" },
);
const { extractWithGemini } = await import(
  pathToFileURL(resolve(out, "source/server/receipt-api.mjs"))
);
const started = performance.now();
try {
  const result = await extractWithGemini(panels, {
    apiKey: env.GEMINI_API_KEY,
    model: metadata.model,
    signal: AbortSignal.timeout(120000),
    fetcher: async (url, options) => {
      if (
        metadata.api_requests ||
        url !== "https://generativelanguage.googleapis.com/v1beta/interactions"
      )
        throw new Error("An additional or different request is not approved");
      const request = JSON.parse(options.body),
        images = request.input.filter((part) => part.type === "image");
      if (
        request.model !== metadata.model ||
        request.store !== false ||
        images.length !== 2 ||
        images.some(
          (image, index) =>
            sha(Buffer.from(image.data, "base64")) !== expected[index][1],
        )
      )
        throw new Error(
          "The outgoing request exceeds the exact approved scope",
        );
      metadata.request_sha256 = sha(options.body);
      metadata.store = false;
      if (additional && metadata.request_sha256 !== prior.request_sha256)
        throw new Error(
          "The request differs from the separately approved identical additional attempt",
        );
      // Consume before network I/O: a disconnect or unknown outcome never permits a retry.
      await writeFile(
        resolve(
          approved,
          additional
            ? "one-additional-attempt-consumed.json"
            : "one-attempt-consumed.json",
        ),
        JSON.stringify(
          {
            model: metadata.model,
            input_sha256: metadata.input_sha256,
            consumed_at: new Date().toISOString(),
            approval: metadata.approval_user_reply,
          },
          null,
          2,
        ) + "\n",
        { flag: "wx" },
      );
      metadata.api_requests = 1;
      const response = await fetch(url, options);
      metadata.http_status = response.status;
      if (response.ok) {
        const clone = response.clone();
        const pieces = [];
        let size = 0;
        for await (const chunk of clone.body) {
          size += chunk.length;
          if (size > 1024 * 1024)
            throw new Error("Provider response exceeded the configured bound");
          pieces.push(chunk);
        }
        const value = JSON.parse(Buffer.concat(pieces).toString("utf8"));
        metadata.provider_usage = value.usage || null;
        metadata.provider_status = value.status || null;
      }
      return response;
    },
  });
  await writeFile(
    resolve(out, "model-output.json"),
    JSON.stringify(result, null, 2) + "\n",
    { flag: "wx" },
  );
  metadata.strict_schema = true;
  metadata.extraction_completed = true;
  metadata.model_output_sha256 = sha(
    await readFile(resolve(out, "model-output.json")),
  );
  metadata.purchases = result.items.length;
} catch (error) {
  metadata.extraction_completed = false;
  metadata.error = String(error?.message || error).slice(0, 500);
  process.exitCode = 1;
} finally {
  metadata.elapsed_ms = Math.round(performance.now() - started);
  metadata.completed_at = new Date().toISOString();
  await writeFile(
    resolve(out, "metadata.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      model: metadata.model,
      api_requests: metadata.api_requests,
      http_status: metadata.http_status,
      extraction_completed: metadata.extraction_completed,
      purchases: metadata.purchases,
      elapsed_ms: metadata.elapsed_ms,
      error: metadata.error,
    }),
  );
}
