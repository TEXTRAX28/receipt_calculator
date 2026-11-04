// Operator-run benchmark only. Importing or preparing never loads credentials.
import assert from "node:assert/strict";
import { readFile, writeFile, mkdir, realpath } from "node:fs/promises";
import { resolve, relative, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { aiReceiptSchema } from "../../src/lib/extraction-schema.mjs";
import { validatePreparedJpeg } from "../../server/receipt-zip.mjs";
import {
  buildRequest,
  digest,
  estimateCost,
  IMAGES,
  MODEL,
  ENDPOINT,
} from "./prepare_openai_costco.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const OLD = "C:/Users/natan/.codex/worktrees/receipt-ocr-baseline/costco_calc";
const KEY_FILE = resolve(OLD, ".env.local");
export const LIMITS = Object.freeze({
  posts: 1,
  images: 2,
  retries: 0,
  timeout_ms: 90000,
  response_bytes: 1048576,
  max_output_tokens: 6000,
  tools: 0,
  conservative_estimate_guard_usd: 0.6,
});
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const save = (path, value) => writeFile(path, json(value), { flag: "wx" });
class Failure extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}
const fail = (code) => {
  throw new Failure(code);
};

function destination(name) {
  const folder = resolve(ROOT, name);
  assert.equal(dirname(folder), resolve(ROOT, "qa-artifacts/provider-review"));
  assert.match(relative(dirname(folder), folder), /^[a-z0-9-]+$/);
  return folder;
}

export function verifyBody(plan, bytes) {
  if (digest(bytes) !== plan.body_sha256) fail("REQUEST_CHANGED");
  const body = JSON.parse(bytes);
  const images = body.input?.[0]?.content?.filter(
    (part) => part.type === "input_image",
  );
  if (images?.length !== 2) fail("INVALID_IMAGES");
  const decoded = images.map((part) => {
    if (!part.image_url?.startsWith("data:image/jpeg;base64,"))
      fail("INVALID_IMAGES");
    return Buffer.from(
      part.image_url.slice("data:image/jpeg;base64,".length),
      "base64",
    );
  });
  assert.deepEqual(body, buildRequest(decoded));
  assert.deepEqual(plan.limits, LIMITS);
  assert.equal(plan.model, MODEL);
  assert.equal(plan.endpoint, ENDPOINT);
  assert.equal(plan.images.length, 2);
  plan.images.forEach((image, i) => {
    assert.equal(image.sha256, IMAGES[i][1]);
    assert.equal(image.bytes, decoded[i].length);
    const dimensions = validatePreparedJpeg(decoded[i]);
    assert.equal(image.width, dimensions.width);
    assert.equal(image.height, dimensions.height);
  });
  const cost = estimateCost(body, plan.images);
  assert(
    cost.estimate_with_2x_listed_cache_write_input_rate_usd <=
      LIMITS.conservative_estimate_guard_usd,
  );
  return body;
}

export async function prepareOnce(name) {
  const folder = destination(name);
  const images = [],
    rows = [];
  for (const [name, expected] of IMAGES) {
    const path = resolve(OLD, "qa-artifacts/advanced-ocr/cloud-review", name);
    const bytes = await readFile(path);
    assert.equal(digest(bytes), expected);
    images.push(bytes);
    // Dimensions come from the same bounded JPEG decoder as buildRequest.
    rows.push({
      path,
      sha256: expected,
      bytes: bytes.length,
      ...validatePreparedJpeg(bytes),
    });
  }
  const body = buildRequest(images),
    serialized = JSON.stringify(body);
  const prior = await load(
    resolve(
      ROOT,
      "receipt_training/evaluation/advanced-gemini-percent-rate-recovery-v1.json",
    ),
  );
  // The historical packet supplies inventory, not a permanent source lock.
  // Each new preparation binds current bytes; execution checks them again.
  const source = {};
  for (const path of Object.keys(prior.source_sha256)) {
    const absolute = resolve(ROOT, path);
    assert(
      !relative(ROOT, absolute).startsWith("..") && !path.includes(".env"),
    );
    source[path] = digest(await readFile(absolute));
  }
  const scripts = {};
  for (const path of [
    "receipt_training/scripts/openai_costco_once.mjs",
    "receipt_training/scripts/test_openai_costco_once.mjs",
    "receipt_training/scripts/prepare_openai_costco.mjs",
  ])
    scripts[path] = digest(await readFile(resolve(ROOT, path)));
  const cost = { ...estimateCost(body, rows), checked_at: "2026-11-04" };
  const plan = {
    prepared_at: new Date().toISOString(),
    status: "awaiting-specific-upload-and-spend-approval",
    model: MODEL,
    endpoint: ENDPOINT,
    images: rows,
    body_sha256: digest(serialized),
    source_sha256: { ...source, ...scripts },
    limits: LIMITS,
    cost,
    credential_alias: "OPEN_AI_KEY",
    credential_source:
      "User-designated existing ignored env file; read only after approval and reservation.",
    approved: false,
    provider_requests: 0,
    real_keys_loaded: 0,
    privacy:
      "Two fixed identifier-reduced private crops. API data is not trained on by default; account opt-in is unverified. store:false does not remove abuse logging, transient caching or possible processing outside the UK. No Files upload, tools, retries, account probe, billing changes or new model selection.",
    scope:
      "One familiar transaction, shared unmodified prompt and schema; no reference amounts, prior reader output, currency hint or history. No general accuracy or production readiness claim. The local cost estimate is not an account hard spending cap.",
  };
  verifyBody(plan, Buffer.from(serialized));
  await mkdir(dirname(folder), { recursive: true });
  assert(
    !relative(await realpath(ROOT), await realpath(dirname(folder))).startsWith(
      "..",
    ),
  );
  await mkdir(folder);
  const canonical = await realpath(folder);
  assert(!relative(await realpath(ROOT), canonical).startsWith(".."));
  await writeFile(resolve(folder, "request.json"), serialized, { flag: "wx" });
  await save(resolve(folder, "plan.json"), plan);
  return {
    model: MODEL,
    plan_sha256: digest(json(plan)),
    body_sha256: plan.body_sha256,
    cost,
    provider_requests: 0,
    real_keys_loaded: 0,
  };
}

export function keyFromText(text, alias = "OPEN_AI_KEY") {
  // This parser is intentionally limited to the alias the user authorized.
  if (alias !== "OPEN_AI_KEY") fail("INVALID_KEY_ALIAS");
  const lines = text
    .split(/\r?\n/)
    .filter((line) => /^\s*(?:export\s+)?OPEN_AI_KEY\s*=/.test(line));
  if (lines.length !== 1) fail("KEY_NOT_CONFIGURED");
  const raw = lines[0].slice(lines[0].indexOf("=") + 1).trim();
  const value = /^(["']).*\1$/.test(raw) ? raw.slice(1, -1) : raw;
  if (!/^sk-[A-Za-z0-9_-]{20,500}$/.test(value)) fail("KEY_NOT_CONFIGURED");
  return value;
}

export async function readLimited(response, limit = LIMITS.response_bytes) {
  const declared = response.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > limit)) {
    await response.body?.cancel();
    fail("RESPONSE_TOO_LARGE");
  }
  const reader = response.body?.getReader();
  if (!reader) fail("EMPTY_RESPONSE");
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        fail("RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, size);
}

export function decodeResponse(data) {
  if (data.status !== "completed") fail("INCOMPLETE_RESPONSE");
  if (!Array.isArray(data.output)) fail("INVALID_OUTPUT");
  const parts = [];
  for (const output of data.output) {
    if (output.type === "reasoning") continue;
    if (
      output.type !== "message" ||
      output.role !== "assistant" ||
      !Array.isArray(output.content)
    )
      fail("INVALID_OUTPUT");
    for (const content of output.content) {
      if (content.type === "refusal") fail("MODEL_REFUSAL");
      if (content.type !== "output_text" || typeof content.text !== "string")
        fail("INVALID_OUTPUT");
      parts.push(content.text);
    }
  }
  if (parts.length !== 1) fail("INVALID_OUTPUT");
  let draft;
  try {
    draft = JSON.parse(parts[0]);
  } catch {
    fail("INVALID_RECEIPT_JSON");
  }
  if (!aiReceiptSchema.safeParse(draft).success) fail("INVALID_RECEIPT_SCHEMA");
  if (draft.items.some((item) => item.sourcePhotos.some((photo) => photo > 2)))
    fail("INVALID_SOURCE_PHOTO");
  return draft; // Preserve the model's literal fields; do not repair financial data.
}

export async function sendOnce({
  planBytes,
  requestBytes,
  approval,
  reserve,
  loadKey,
  fetcher = globalThis.fetch,
  persist = async () => {},
  timeoutMs = LIMITS.timeout_ms,
}) {
  const plan = JSON.parse(planBytes);
  const body = verifyBody(plan, requestBytes);
  assert.deepEqual(approval, {
    approved: true,
    provider: "OpenAI",
    model: MODEL,
    plan_sha256: digest(planBytes),
    request_sha256: digest(requestBytes),
    posts: 1,
    images: 2,
    retries: 0,
    estimate_guard_usd: 0.6,
  });
  assert(timeoutMs > 0 && timeoutMs <= LIMITS.timeout_ms);
  await reserve(); // Exclusive persistent reservation, before key access or I/O.
  let key;
  let timer;
  const began = performance.now();
  const controller = new AbortController();
  let posts = 0;
  let httpStatus = null;
  let requestId = "";
  let responseModel = "";
  let usage = null;
  let code = null;
  let draft = null;
  try {
    key = await loadKey();
    if (!/^sk-[A-Za-z0-9_-]{20,500}$/.test(key)) fail("KEY_NOT_CONFIGURED");
    timer = setTimeout(() => controller.abort(), timeoutMs);
    posts++;
    const response = await fetcher(ENDPOINT, {
      method: "POST",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    httpStatus = response.status;
    requestId = (response.headers.get("x-request-id") || "")
      .slice(0, 160)
      .replaceAll(key, "[REDACTED]");
    const bytes = await readLimited(response);
    const text = bytes.toString("utf8").replaceAll(key, "[REDACTED]");
    await persist("response.txt", text);
    if (!response.ok) fail(`HTTP_${response.status}`);
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      fail("INVALID_RESPONSE_JSON");
    }
    responseModel =
      typeof data.model === "string" ? data.model.slice(0, 100) : "";
    if (!/^gpt-6-astra(?:[-.].*)?$/.test(responseModel))
      fail("UNEXPECTED_MODEL");
    // Usage is a fixed numeric projection, never arbitrary returned content.
    const tokens = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : null);
    usage = {
      input_tokens: tokens(data.usage?.input_tokens),
      output_tokens: tokens(data.usage?.output_tokens),
      total_tokens: tokens(data.usage?.total_tokens),
      cached_input_tokens: tokens(
        data.usage?.input_tokens_details?.cached_tokens,
      ),
      reasoning_tokens: tokens(
        data.usage?.output_tokens_details?.reasoning_tokens,
      ),
    };
    draft = decodeResponse(data);
    await persist("draft.json", json(draft));
  } catch (error) {
    code =
      error instanceof Failure
        ? error.code
        : controller.signal.aborted
          ? "TIMEOUT"
          : "LOCAL_OR_NETWORK_FAILURE";
  } finally {
    clearTimeout(timer);
    key = undefined;
  }
  const result = {
    terminal: code ? "failed" : "completed",
    code,
    model: MODEL,
    returned_model: responseModel,
    http_status: httpStatus,
    request_id: requestId,
    elapsed_ms: Math.round(performance.now() - began),
    provider_posts: posts,
    retries: 0,
    accepted_draft: !code,
    usage,
    source_photos: 2,
    factual_accuracy_verified: false,
    billing_charge_verified: false,
    full_goal_complete: false,
  };
  await persist("result.json", json(result));
  return { result, draft };
}

async function execute(name, approvalPath) {
  const folder = destination(name);
  const canonical = await realpath(folder);
  assert(!relative(await realpath(ROOT), canonical).startsWith(".."));
  const planBytes = await readFile(resolve(folder, "plan.json"));
  const requestBytes = await readFile(resolve(folder, "request.json"));
  const plan = JSON.parse(planBytes);
  for (const [path, expected] of Object.entries(plan.source_sha256)) {
    const target = resolve(ROOT, path);
    assert(!relative(ROOT, target).startsWith("..") && !path.includes(".env"));
    assert.equal(
      digest(await readFile(target)),
      expected,
      "Source changed since preparation",
    );
  }
  const approval = await load(resolve(approvalPath));
  const { result } = await sendOnce({
    planBytes,
    requestBytes,
    approval,
    reserve: () =>
      save(resolve(folder, "attempt.json"), {
        reserved_at: new Date().toISOString(),
        request_sha256: digest(requestBytes),
        posts_max: 1,
        retries: 0,
      }),
    loadKey: async () => keyFromText(await readFile(KEY_FILE, "utf8")),
    persist: (name, data) =>
      writeFile(resolve(folder, name), data, { flag: "wx" }),
  });
  console.log(JSON.stringify(result));
  if (result.terminal !== "completed") process.exitCode = 1;
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    if (process.argv.length === 4 && process.argv[2] === "--prepare")
      console.log(JSON.stringify(await prepareOnce(process.argv[3])));
    else if (
      process.argv.length === 6 &&
      process.argv[2] === "--run" &&
      process.argv[4] === "--approval-file"
    )
      await execute(process.argv[3], process.argv[5]);
    else fail("EXPLICIT_PREPARE_OR_APPROVED_RUN_REQUIRED");
  } catch (error) {
    console.error(
      JSON.stringify({
        terminal: "refused",
        code: error instanceof Failure ? error.code : "LOCAL_PREFLIGHT_REFUSED",
        provider_request_authorization_unchanged: true,
      }),
    );
    process.exitCode = 1;
  }
}
