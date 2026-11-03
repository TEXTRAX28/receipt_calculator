import test, { after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  ROOT,
  ENDPOINT,
  prepare,
  preflight,
  runOne,
  guardRequest,
  sha,
} from "./gemini35_uk_multipart.mjs";

const key = "offline-uk-key-keep-private";
const realFetch = globalThis.fetch;
globalThis.fetch = async () => {
  throw Error("Unexpected real transport in an offline test");
};
after(() => {
  globalThis.fetch = realFetch;
});
const load = async (path) => JSON.parse(await readFile(path, "utf8"));
async function scope() {
  const parent = await mkdtemp(resolve("qa-artifacts/gemini35-uk-protocol-"));
  const root = parent + "/scope",
    proof = await prepare(root);
  return { root, approvedPlanSha: proof.plan_sha256, apiKey: key };
}

test("the live preparation binds both unchanged crops without credentials or uploads", async () => {
  const { plan, panels, proof } = await preflight();
  const prepared = await load(ROOT + "/prepared.json");
  assert.deepEqual(proof, prepared.proof);
  assert.equal(plan.images.length, 2);
  assert.deepEqual(
    panels.map((p) => [p.photo, p.part]),
    [
      [1, 1],
      [2, 1],
    ],
  );
  assert.equal(prepared.external_requests, 0);
  assert.equal(prepared.credentials_loaded, false);
  assert.equal(plan.limits.generation_posts, 1);
  assert.ok(proof.source_sha256["server/local-model-manifest.json"]);
});

test("missing approval and altered prepared proof cannot start a request", async () => {
  const options = await scope();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("Must not reach transport");
  };
  await assert.rejects(
    runOne({ ...options, approvedPlanSha: "", fetcher }),
    /Exact plan approval/,
  );
  const path = options.root + "/prepared.json",
    prepared = await load(path);
  prepared.proof.source_sha256["server/receipt-api.mjs"] = "0".repeat(64);
  await writeFile(path, JSON.stringify(prepared));
  await assert.rejects(
    runOne({ ...options, fetcher }),
    /Prepared source changed/,
  );
  assert.equal(calls, 0);
  await assert.rejects(readFile(options.root + "/run/attempt.json"), /ENOENT/);
});

test("one exact two-image request uses the actual adapter, redacts output and cannot be resumed", async () => {
  const options = await scope(),
    prepared = await load(options.root + "/prepared.json");
  const receipt = await load(
    "qa-artifacts/advanced-ocr/gemini35-synthetic-v1/receipt.json",
  );
  receipt.warnings = [key];
  let calls = 0;
  const fetcher = async (url, request) => {
    calls++;
    guardRequest(url, request, key, prepared.request_sha256);
    const body = JSON.parse(request.body);
    assert.equal(body.model, "gemini-3.5-flash-lite");
    assert.equal(body.store, false);
    assert.equal(body.tools, undefined);
    assert.equal(body.previous_interaction_id, undefined);
    assert.equal(body.input.filter((p) => p.type === "image").length, 2);
    assert.deepEqual(body.generation_config, {
      max_output_tokens: 24000,
      thinking_level: "low",
    });
    assert.throws(() =>
      guardRequest(ENDPOINT + "/other", request, key, prepared.request_sha256),
    );
    assert.throws(() =>
      guardRequest(
        url,
        { ...request, method: "GET" },
        key,
        prepared.request_sha256,
      ),
    );
    body.input = body.input.toReversed();
    assert.throws(() =>
      guardRequest(
        url,
        { ...request, body: JSON.stringify(body) },
        key,
        prepared.request_sha256,
      ),
    );
    return new Response(
      JSON.stringify({
        status: "completed",
        usage: { input_tokens: 10, output_tokens: 10 },
        steps: [
          {
            type: "model_output",
            content: [{ type: "text", text: JSON.stringify(receipt) }],
          },
        ],
      }),
    );
  };
  const result = await runOne({ ...options, fetcher });
  assert.equal(result.status, "editable-draft");
  assert.equal(result.api_requests, 1);
  assert.equal(result.injected_transport, true);
  assert.equal(calls, 1);
  assert.equal(
    result.receipt_sha256,
    sha(await readFile(options.root + "/run/receipt.json")),
  );
  for (const file of await readdir(options.root + "/run"))
    assert.ok(
      !(await readFile(options.root + "/run/" + file, "utf8")).includes(key),
    );
  await assert.rejects(runOne({ ...options, fetcher }), /EEXIST/);
  assert.equal(calls, 1);
});

for (const status of [401, 429, 503])
  test(`HTTP ${status} consumes one attempt without a retry or alternative`, async () => {
    const options = await scope();
    let calls = 0;
    const fetcher = async () => {
      calls++;
      return new Response(JSON.stringify({ error: key }), { status });
    };
    const result = await runOne({ ...options, fetcher });
    assert.equal(result.http_status, status);
    assert.equal(result.status, "failed-no-retry");
    assert.equal(result.api_requests, 1);
    assert.equal(result.retries, 0);
    assert.equal(result.billing_activated, false);
    assert.ok(
      !(await readFile(options.root + "/run/response.json", "utf8")).includes(
        key,
      ),
    );
    await assert.rejects(runOne({ ...options, fetcher }), /EEXIST/);
    assert.equal(calls, 1);
  });

test("an oversized response is rejected and cannot cause a second request", async () => {
  const options = await scope();
  let calls = 0;
  const result = await runOne({
    ...options,
    fetcher: async () => {
      calls++;
      return new Response("x".repeat(1048577));
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.status, "failed-no-retry");
  assert.match(result.error, /1 MiB bound/);
  await assert.rejects(readFile(options.root + "/run/response.json"), /ENOENT/);
  assert.equal(
    (await load(options.root + "/run/attempt.json")).request_sha256.length,
    64,
  );
});

test("a lost response records consumption before network I/O and redacts the error", async () => {
  const options = await scope();
  let calls = 0;
  const fetcher = async () => {
    calls++;
    throw Error("Connection lost " + key);
  };
  const result = await runOne({ ...options, fetcher });
  assert.equal(result.api_requests, 1);
  assert.equal(result.status, "failed-no-retry");
  assert.ok(!result.error.includes(key));
  assert.match(result.error, /redacted/);
  await assert.rejects(runOne({ ...options, fetcher }), /EEXIST/);
  assert.equal(calls, 1);
});
