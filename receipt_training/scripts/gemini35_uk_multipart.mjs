// Research-only: one separately approved request containing two fixed crops.
// Preparation and injected transport tests never load credentials or use a network.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { validatePreparedJpeg } from "../../server/receipt-zip.mjs";

export const ROOT = "qa-artifacts/provider-review/gemini35-uk-multipart-v3";
export const ENDPOINT =
  "https://generativelanguage.googleapis.com/v1beta/interactions";
const RUNNER = "receipt_training/scripts/gemini35_uk_multipart.mjs";
const INPUTS = [
  [
    "user-uk-items.jpg",
    "1c53a19923a200676096db4cc093610a3c895634d68fa90f9a9a5c5b38b51b68",
  ],
  [
    "user-uk-vat-totals.jpg",
    "adcf3ef31024a3e0e1efd92e90404e3bf48b1585fb6d2d5a911836b4e16e705b",
  ],
];
export const sha = (bytes) => createHash("sha256").update(bytes).digest("hex");
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const write = (path, value) => writeFile(path, json(value), { flag: "wx" });
const load = async (path) => JSON.parse(await readFile(path, "utf8"));
const clean = (text, key) => String(text).replaceAll(key, "[redacted]");

async function sourceHashes() {
  const hashes = {};
  for (const directory of ["server", "src/lib"])
    for (const name of (await readdir(directory)).sort())
      if (/\.(?:mjs|ts|json)$/.test(name)) {
        const path = `${directory}/${name}`;
        hashes[path] = sha(await readFile(path));
      }
  hashes[RUNNER] = sha(await readFile(RUNNER));
  return hashes;
}

export async function preflight(root = ROOT) {
  const bytes = await readFile(root + "/plan.json"),
    plan = JSON.parse(bytes);
  assert.equal(plan.model, "gemini-3.5-flash-lite");
  assert.equal(plan.endpoint, ENDPOINT);
  assert.equal(plan.store, false);
  assert.deepEqual(plan.limits, {
    generation_posts: 1,
    images: 2,
    retries: 0,
    timeout_ms: 90000,
    response_bytes: 1048576,
    billing_activation: false,
  });
  assert.equal(plan.images.length, 2);
  const panels = [];
  for (const [i, [name, digest]] of INPUTS.entries()) {
    const entry = plan.images[i];
    assert.equal(entry.path, `qa-artifacts/advanced-ocr/cloud-review/${name}`);
    assert.equal(entry.sha256, digest);
    const image = await readFile(entry.path),
      dimensions = validatePreparedJpeg(image);
    assert.equal(sha(image), digest);
    assert.equal(image.length, entry.bytes);
    assert.deepEqual(dimensions, { width: entry.width, height: entry.height });
    panels.push({ photo: i + 1, part: 1, data: image.toString("base64") });
  }
  return {
    plan,
    panels,
    proof: { plan_sha256: sha(bytes), source_sha256: await sourceHashes() },
  };
}

async function frozenAdapter(root, proof) {
  for (const [name, digest] of Object.entries(proof.source_sha256))
    assert.equal(sha(await readFile(`${root}/source/${name}`)), digest, name);
  return (
    await import(pathToFileURL(resolve(root, "source/server/receipt-api.mjs")))
  ).extractWithGemini;
}

export function guardRequest(url, options, key, expectedHash) {
  assert.equal(url, ENDPOINT);
  assert.equal(options.method, "POST");
  assert.equal(options.headers["x-goog-api-key"], key);
  assert.equal(
    sha(options.body),
    expectedHash,
    "Outgoing request differs from preparation",
  );
}

export async function prepare(root = ROOT) {
  const images = [];
  for (const [name, digest] of INPUTS) {
    const path = `qa-artifacts/advanced-ocr/cloud-review/${name}`,
      bytes = await readFile(path);
    assert.equal(sha(bytes), digest);
    images.push({
      path,
      sha256: digest,
      bytes: bytes.length,
      ...validatePreparedJpeg(bytes),
    });
  }
  await mkdir(root);
  await write(root + "/plan.json", {
    parent_commit: execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
    }).trim(),
    prepared_at: new Date().toISOString(),
    model: "gemini-3.5-flash-lite",
    endpoint: ENDPOINT,
    store: false,
    images,
    limits: {
      generation_posts: 1,
      images: 2,
      retries: 0,
      timeout_ms: 90000,
      response_bytes: 1048576,
      billing_activation: false,
    },
    scope:
      "One familiar UK transaction, two identifier-removed financial crops: all 18 purchases and the separate VAT table. Merchant/date are outside the crops; a partly visible pound symbol remains in the clipped savings line. Assess automatic currency separately from user-supplied GBP. No photographic-overlap or blind-holdout claim.",
    authorization:
      "Fresh Phase 6 approval and confirmation of at least one remaining Free request required. All earlier scopes are consumed.",
    inference:
      "Existing application instructions/schema, low thinking, 24000 output-token ceiling. No references, OCR readings, currency hint, tools or prior conversation supplied.",
    scoring:
      "Unchanged source-checked UK reference, exact fields and coupons, original purchase repeats, VAT and total. Native delivery and application arithmetic kept separate; missing values remain missing. Existing same-crop Veryfi/local results are historical comparators, not new latency measurements.",
  });
  const { panels, proof } = await preflight(root);
  for (const name of Object.keys(proof.source_sha256)) {
    const path = `${root}/source/${name}`;
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, await readFile(name), { flag: "wx" });
  }
  const extract = await frozenAdapter(root, proof);
  let request = null;
  const capture = new Error("offline-request-capture");
  await assert.rejects(
    extract(panels, {
      apiKey: "offline-prepare-only",
      model: "gemini-3.5-flash-lite",
      signal: new AbortController().signal,
      fetcher: async (url, options) => {
        assert.equal(url, ENDPOINT);
        request = options.body;
        throw capture;
      },
    }),
    (error) => error === capture,
  );
  assert.ok(request);
  const body = JSON.parse(request);
  assert.equal(body.input.filter((part) => part.type === "image").length, 2);
  assert.equal(body.store, false);
  assert.equal(body.tools, undefined);
  assert.equal(body.previous_interaction_id, undefined);
  await write(root + "/prepared.json", {
    proof,
    request_sha256: sha(request),
    request_bytes: Buffer.byteLength(request),
    external_requests: 0,
    credentials_loaded: false,
    ready_for_approval: true,
  });
  return proof;
}

// Reject stale or unapproved preparations before even requesting credentials.
export async function loadApprovedApiKey({
  root = ROOT,
  approvedPlanSha,
  readKey,
}) {
  const { proof } = await preflight(root);
  const prepared = await load(root + "/prepared.json");
  assert.ok(
    approvedPlanSha && approvedPlanSha === proof.plan_sha256,
    "Exact plan approval required",
  );
  assert.deepEqual(proof, prepared.proof, "Prepared source changed");
  assert.equal(typeof readKey, "function");
  return readKey();
}

export async function runOne({
  root = ROOT,
  approvedPlanSha,
  apiKey,
  fetcher = globalThis.fetch,
}) {
  const { plan, panels, proof } = await preflight(root),
    prepared = await load(root + "/prepared.json");
  assert.ok(
    approvedPlanSha && approvedPlanSha === proof.plan_sha256,
    "Exact plan approval required",
  );
  assert.deepEqual(proof, prepared.proof, "Prepared source changed");
  assert.ok(apiKey, "Server-held Gemini key unavailable");
  const extract = await frozenAdapter(root, proof),
    out = root + "/run";
  await mkdir(out); // An interrupted attempt consumes this scope; never resume it.
  const metadata = {
    started_at: new Date().toISOString(),
    model: plan.model,
    proof,
    injected_transport: fetcher !== globalThis.fetch,
    api_requests: 0,
    retries: 0,
    billing_activated: false,
    actual_billing_inspected: false,
    store: false,
  };
  await write(out + "/authorization.json", {
    approved_plan_sha256: approvedPlanSha,
    scope:
      "One request, two exact prepared crops, existing user-confirmed Free quota only",
    injected_transport: metadata.injected_transport,
  });
  const started = performance.now();
  try {
    const receipt = await extract(panels, {
      apiKey,
      model: plan.model,
      signal: AbortSignal.timeout(plan.limits.timeout_ms),
      fetcher: async (url, options) => {
        assert.equal(metadata.api_requests, 0, "No second request permitted");
        guardRequest(url, options, apiKey, prepared.request_sha256);
        await write(out + "/attempt.json", {
          consumed_at: new Date().toISOString(),
          request_sha256: sha(options.body),
        });
        metadata.api_requests = 1;
        const response = await fetcher(url, options);
        metadata.http_status = response.status;
        const chunks = [];
        let size = 0;
        for await (const chunk of response.body) {
          size += chunk.length;
          if (size > plan.limits.response_bytes)
            throw Error("Response exceeds 1 MiB bound");
          chunks.push(chunk);
        }
        const safe = clean(Buffer.concat(chunks).toString("utf8"), apiKey);
        await writeFile(out + "/response.json", safe, { flag: "wx" });
        metadata.response_sha256 = sha(safe);
        try {
          metadata.provider_usage = JSON.parse(safe).usage || null;
        } catch {
          /* Preserve malformed response as failure. */
        }
        return new Response(safe, {
          status: response.status,
          headers: { "content-type": "application/json" },
        });
      },
    });
    await write(out + "/receipt.json", receipt);
    metadata.receipt_sha256 = sha(await readFile(out + "/receipt.json"));
    metadata.status = "editable-draft";
  } catch (error) {
    metadata.status = "failed-no-retry";
    metadata.error = clean(error.message, apiKey).slice(0, 600);
  }
  metadata.elapsed_ms = Math.round(performance.now() - started);
  metadata.finished_at = new Date().toISOString();
  await write(out + "/metadata.json", metadata);
  return metadata;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (process.argv[2] === "--prepare") {
    const proof = await prepare();
    console.log(
      JSON.stringify({
        prepared: true,
        plan_sha256: proof.plan_sha256,
        external_requests: 0,
      }),
    );
  } else if (
    process.argv[2] === "--execute-approved" &&
    /^[a-f0-9]{64}$/.test(process.argv[3] || "")
  ) {
    const apiKey = await loadApprovedApiKey({
      approvedPlanSha: process.argv[3],
      readKey: async () => {
        const { loadEnv } = await import("vite");
        return loadEnv("development", process.cwd(), "").GEMINI_API_KEY;
      },
    });
    const result = await runOne({ approvedPlanSha: process.argv[3], apiKey });
    console.log(
      JSON.stringify({
        status: result.status,
        requests: result.api_requests,
        http_status: result.http_status,
      }),
    );
  } else
    throw Error(
      "Use --prepare, or --execute-approved <plan SHA256> only after new user approval",
    );
}
