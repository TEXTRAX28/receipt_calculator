// Offline preparation only. This module has no credential loader or live sender.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { aiReceiptJsonSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";
import { validatePreparedJpeg } from "../../server/receipt-zip.mjs";

export const MODEL = "gpt-6-astra";
export const ENDPOINT = "https://api.openai.com/v1/responses";
export const IMAGES = [
  [
    "user-uk-items.jpg",
    "1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68",
  ],
  [
    "user-uk-vat-totals.jpg",
    "adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b",
  ],
];
const ROOT = fileURLToPath(new URL("../../", import.meta.url));
export const digest = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");

export function buildRequest(images) {
  assert.equal(images.length, 2);
  const content = [];
  for (const [i, bytes] of images.entries()) {
    assert.equal(
      digest(bytes),
      IMAGES[i][1],
      "Image differs from the fixed reviewed crop",
    );
    validatePreparedJpeg(bytes);
    content.push({ type: "input_text", text: `Photograph ${i + 1}, panel 1.` });
    content.push({
      type: "input_image",
      image_url: "data:image/jpeg;base64," + bytes.toString("base64"),
      detail: "original",
    });
  }
  return {
    model: MODEL,
    instructions: RECEIPT_INSTRUCTIONS,
    input: [{ role: "user", content }],
    text: {
      format: {
        type: "json_schema",
        name: "receipt",
        strict: true,
        schema: aiReceiptJsonSchema,
      },
    },
    reasoning: { effort: "medium" },
    max_output_tokens: 6000,
    store: false,
    stream: false,
    background: false,
    service_tier: "default",
    tools: [],
  };
}

export function estimateCost(body, dimensions) {
  const withoutImages = structuredClone(body);
  for (const part of withoutImages.input[0].content)
    if (part.type === "input_image")
      part.image_url = "[image bytes counted separately]";
  const nonImageUtf8Bytes = Buffer.byteLength(JSON.stringify(withoutImages));
  const imageTokens = dimensions.map(({ width, height }) => {
    assert(width <= 65535 && height <= 65535);
    const patches = Math.ceil(width / 32) * Math.ceil(height / 32);
    assert(patches <= 30000);
    return Math.ceil(patches * 1.2);
  });
  const inputAllowance =
    nonImageUtf8Bytes + 2048 + imageTokens.reduce((a, b) => a + b, 0);
  const outputMaximumUsd = (body.max_output_tokens * 50) / 1_000_000;
  return {
    checked_at: "2026-11-03",
    currency: "USD",
    image_input_tokens_estimate: imageTokens,
    non_image_utf8_bytes: nonImageUtf8Bytes,
    assumed_framing_allowance_tokens: 2048,
    conservative_input_allowance_tokens: inputAllowance,
    output_token_charge_ceiling_at_list_rate_usd: outputMaximumUsd,
    conservative_standard_estimate_usd:
      (inputAllowance * 10) / 1_000_000 + outputMaximumUsd,
    estimate_with_2x_listed_cache_write_input_rate_usd:
      (inputAllowance * 25) / 1_000_000 + outputMaximumUsd,
    caveat:
      "Local estimate, not a tokenizer result or enforceable account spending cap. UTF8 bytes plus a framing allowance conservatively approximate non-image tokens. Actual usage, cache-write policy, taxes, account pricing and eligibility remain unverified. No paid or regional processing option is enabled here.",
    model_pricing_source:
      "https://developers.openai.com/api/docs/models/gpt-6-astra",
    image_pricing_source:
      "https://developers.openai.com/api/docs/guides/images-vision",
  };
}

export async function prepare(destination) {
  const out = resolve(ROOT, destination);
  assert(
    relative(resolve(ROOT, "qa-artifacts/provider-review"), out).match(
      /^[\w-]+$/,
    ),
    "Use an unused direct provider-review folder",
  );
  const images = [],
    rows = [],
    inputs = {};
  for (const [name, expected] of IMAGES) {
    const path = "qa-artifacts/advanced-ocr/cloud-review/" + name;
    const bytes = await readFile(resolve(ROOT, path));
    assert.equal(digest(bytes), expected);
    const dimensions = validatePreparedJpeg(bytes);
    inputs[path] = expected;
    images.push(bytes);
    rows.push({ path, sha256: expected, bytes: bytes.length, ...dimensions });
  }
  const body = buildRequest(images);
  const serialized = JSON.stringify(body);
  const sourceHashes = {};
  for (const directory of ["src/lib", "server"])
    for (const name of (await readdir(resolve(ROOT, directory))).sort())
      if (/\.(?:ts|mjs|json)$/.test(name)) {
        const path = directory + "/" + name;
        sourceHashes[path] = digest(await readFile(resolve(ROOT, path)));
      }
  for (const path of [
    "receipt_training/scripts/prepare_openai_costco.mjs",
    "package-lock.json",
  ])
    sourceHashes[path] = digest(await readFile(resolve(ROOT, path)));
  await mkdir(out);
  const plan = {
    prepared_at: new Date().toISOString(),
    parent_commit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: ROOT,
      encoding: "utf8",
    }).trim(),
    status: "offline-prepared-no-live-sender",
    model: MODEL,
    endpoint: ENDPOINT,
    images: rows,
    body_sha256: digest(serialized),
    source_sha256: sourceHashes,
    input_sha256: inputs,
    limits: {
      generation_posts: 1,
      images: 2,
      retries: 0,
      timeout_ms: 90000,
      response_bytes: 1048576,
      max_output_tokens: 6000,
      tools: 0,
      billing_activation: false,
    },
    approved: false,
    credentials_loaded: false,
    provider_requests: 0,
    cost: estimateCost(body, rows),
    privacy:
      "Two fixed identifier-reduced crops inspected locally: product list and VAT totals. Merchant/date/payment identifiers excluded. A clipped savings line retains a partial pound symbol. store:false is not Zero Data Retention; standard abuse logs and transient prompt caching can retain content. Processing outside the UK is possible; no account-specific data-residency or training-opt-in setting verified.",
    scope:
      "One familiar development transaction, same two existing crops. No original-fifty upload, label values, previous OCR, currency hint, tools or history in the request. Independent model extraction only; actual API compatibility, output/schema acceptance, cost and financial accuracy remain untested. No live sender is implemented by this preparer.",
  };
  await writeFile(resolve(out, "request.json"), serialized, { flag: "wx" });
  await writeFile(
    resolve(out, "plan.json"),
    JSON.stringify(plan, null, 2) + "\n",
    { flag: "wx" },
  );
  return plan;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  assert.equal(
    process.argv[2],
    "--prepare",
    "Offline --prepare only; live execution is unavailable",
  );
  assert.equal(process.argv.length, 4);
  const plan = await prepare(process.argv[3]);
  console.log(
    JSON.stringify({
      status: plan.status,
      model: plan.model,
      body_sha256: plan.body_sha256,
      cost: plan.cost,
      provider_requests: 0,
    }),
  );
}
