// Offline protocol checks; this file does not load credentials or call a provider.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { after, test } from "node:test";
import { aiReceiptJsonSchema } from "../../src/lib/extraction-schema.mjs";
import { RECEIPT_INSTRUCTIONS } from "../../server/extraction-instructions.mjs";

let fetchCalls = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = () => {
  fetchCalls++;
  throw new Error("Provider requests are forbidden in offline preparation");
};
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(fetchCalls, 0);
});

const { buildRequest, digest, estimateCost, IMAGES, MODEL, prepare } =
  await import("./prepare_openai_costco.mjs");
const root = fileURLToPath(new URL("../../", import.meta.url));
const folder = "qa-artifacts/provider-review/openai-costco-v1";
const images = await Promise.all(
  IMAGES.map(([name]) =>
    readFile(resolve(root, "qa-artifacts/advanced-ocr/cloud-review", name)),
  ),
);
const body = buildRequest(images);
const planBytes = await readFile(resolve(root, folder, "plan.json"));
const requestBytes = await readFile(resolve(root, folder, "request.json"));
const plan = JSON.parse(planBytes);

test("fixed two-image request preserves the shared prompt and strict schema", () => {
  assert.equal(body.model, MODEL);
  assert.equal(body.instructions, RECEIPT_INSTRUCTIONS);
  assert.deepEqual(body.text.format.schema, aiReceiptJsonSchema);
  assert.equal(body.text.format.strict, true);
  assert.equal(body.store, false);
  assert.equal(body.stream, false);
  assert.equal(body.background, false);
  assert.equal(body.max_output_tokens, 6000);
  assert.equal(body.service_tier, "default");
  assert.deepEqual(body.tools, []);
  assert.equal(body.input.length, 1);
  const content = body.input[0].content;
  assert.deepEqual(
    content
      .filter((part) => part.type === "input_text")
      .map((part) => part.text),
    ["Photograph 1, panel 1.", "Photograph 2, panel 1."],
  );
  const imageParts = content.filter((part) => part.type === "input_image");
  assert.equal(imageParts.length, 2);
  imageParts.forEach((part, index) => {
    assert.equal(part.detail, "original");
    assert(part.image_url.startsWith("data:image/jpeg;base64,"));
    const bytes = Buffer.from(part.image_url.split(",")[1], "base64");
    assert.deepEqual(bytes, images[index]);
    assert.equal(digest(bytes), IMAGES[index][1]);
  });
  // No reference totals, previous model draft or currency hint is added.
  assert(!JSON.stringify({ ...body, input: [] }).includes("176.78"));
  assert(!Object.hasOwn(body, "previous_response_id"));
});

test("changed, reordered, missing and extra crops are rejected", () => {
  const changed = Buffer.from(images[0]);
  changed[Math.floor(changed.length / 2)] ^= 1;
  assert.throws(() => buildRequest([changed, images[1]]));
  assert.throws(() => buildRequest([...images].reverse()));
  assert.throws(() => buildRequest([images[0]]));
  assert.throws(() => buildRequest([...images, images[0]]));
});

test("nested provider objects meet documented strict-schema structural rules", () => {
  let objects = 0;
  function walk(value) {
    if (!value || typeof value !== "object") return;
    if (value.type === "object") {
      objects++;
      assert.equal(value.additionalProperties, false);
      assert.deepEqual(
        [...value.required].sort(),
        Object.keys(value.properties).sort(),
      );
    }
    Object.values(value).forEach((child) => {
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    });
  }
  walk(body.text.format.schema);
  assert(objects >= 4);
  // This is local structure checking, not proof of API acceptance.
});

test("original-detail image estimate and stated cost arithmetic reproduce", () => {
  const cost = estimateCost(body, plan.images);
  assert.deepEqual(cost.image_input_tokens_estimate, [730, 144]);
  assert.equal(cost.conservative_input_allowance_tokens, 8057);
  assert.equal(cost.output_token_charge_ceiling_at_list_rate_usd, 0.3);
  assert(Math.abs(cost.conservative_standard_estimate_usd - 0.38057) < 1e-10);
  assert(
    Math.abs(
      cost.estimate_with_2x_listed_cache_write_input_rate_usd - 0.501425,
    ) < 1e-10,
  );
  assert.match(cost.caveat, /not a tokenizer result or enforceable/);
  assert.throws(() => estimateCost(body, [{ width: 65536, height: 10 }]));
  assert.throws(() => estimateCost(body, [{ width: 6400, height: 6400 }]));
});

test("saved preparation exactly binds input bytes, source and the request", async () => {
  assert.equal(digest(requestBytes), plan.body_sha256);
  assert.deepEqual(JSON.parse(requestBytes), body);
  assert.equal(plan.approved, false);
  assert.equal(plan.credentials_loaded, false);
  assert.equal(plan.provider_requests, 0);
  for (const [path, hash] of Object.entries({
    ...plan.input_sha256,
    ...plan.source_sha256,
  }))
    assert.equal(digest(await readFile(resolve(root, path))), hash, path);
});

test("preparation refuses path escape and never overwrites an existing packet", async () => {
  await assert.rejects(prepare(folder), { code: "EEXIST" });
  await assert.rejects(prepare("../openai-preparation-outside"));
  await assert.rejects(prepare("qa-artifacts/provider-review/nested/child"));
  assert.deepEqual(
    await readFile(resolve(root, folder, "plan.json")),
    planBytes,
  );
  assert.deepEqual(
    await readFile(resolve(root, folder, "request.json")),
    requestBytes,
  );
});

test("CLI rejects live execution before producing a request", () => {
  const env = {};
  for (const key of ["SystemRoot", "WINDIR", "PATH", "PATHEXT"])
    if (process.env[key]) env[key] = process.env[key];
  const result = spawnSync(
    process.execPath,
    [
      resolve(root, "receipt_training/scripts/prepare_openai_costco.mjs"),
      "--run",
    ],
    { cwd: root, env, encoding: "utf8", windowsHide: true, timeout: 10000 },
  );
  assert.equal(result.error, undefined);
  assert.notEqual(result.status, 0);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Offline --prepare only/);
});
