// Actual sender exercised only through controlled transports and fake keys.
import assert from "node:assert/strict";
import { test, after } from "node:test";
import { readFile, writeFile, mkdtemp, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { validatePreparedJpeg } from "../../server/receipt-zip.mjs";
import {
  buildRequest,
  digest,
  IMAGES,
  MODEL,
  ENDPOINT,
} from "./prepare_openai_costco.mjs";
import {
  LIMITS,
  verifyBody,
  keyFromText,
  readLimited,
  decodeResponse,
  sendOnce,
  prepareOnce,
} from "./openai_costco_once.mjs";

const originalFetch = globalThis.fetch;
let unexpectedNetwork = 0;
globalThis.fetch = async () => {
  unexpectedNetwork++;
  throw Error("Offline benchmark test");
};
after(() => {
  globalThis.fetch = originalFetch;
  assert.equal(unexpectedNetwork, 0);
});
const fakeKey = "sk-fake-local-transport-key-never-real";
const old = "C:/Users/natan/.codex/worktrees/receipt-ocr-baseline/costco_calc";
const images = await Promise.all(
  IMAGES.map(([name]) =>
    readFile(join(old, "qa-artifacts/advanced-ocr/cloud-review", name)),
  ),
);
const bytes = Buffer.from(JSON.stringify(buildRequest(images)));
const plan = {
  model: MODEL,
  endpoint: ENDPOINT,
  body_sha256: digest(bytes),
  limits: LIMITS,
  images: images.map((image, i) => ({
    sha256: IMAGES[i][1],
    bytes: image.length,
    ...validatePreparedJpeg(image),
  })),
};
const planBytes = Buffer.from(JSON.stringify(plan));
const approval = {
  approved: true,
  provider: "OpenAI",
  model: MODEL,
  plan_sha256: digest(planBytes),
  request_sha256: digest(bytes),
  posts: 1,
  images: 2,
  retries: 0,
  estimate_guard_usd: 0.6,
};
const draft = {
  merchant: "Synthetic",
  date: "",
  currency: "GBP",
  subtotal: "10.00",
  printedTotal: "12.00",
  printedTax: "2.00",
  pricesIncludeTax: false,
  printedItemCount: 1,
  taxCodes: [{ code: "A", rate: "20.00" }],
  items: [
    {
      description: "Test",
      quantity: "1",
      unitPrice: "10.00",
      lineTotal: "10.00",
      discount: "0",
      taxCode: "A",
      note: "",
      sourcePhotos: [1, 2],
    },
  ],
  adjustments: [],
  warnings: [],
};
const completed = (value = draft) => ({
  status: "completed",
  model: MODEL,
  usage: {
    input_tokens: 1000,
    output_tokens: 500,
    total_tokens: 1500,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens_details: { reasoning_tokens: 100 },
  },
  output: [
    { type: "reasoning", summary: [] },
    {
      type: "message",
      role: "assistant",
      content: [
        { type: "output_text", text: JSON.stringify(value), annotations: [] },
      ],
    },
  ],
});
function harness(options = {}) {
  const stored = new Map();
  let reserved = 0,
    loaded = 0,
    posts = 0;
  const config = {
    planBytes,
    requestBytes: bytes,
    approval,
    reserve: async () => {
      assert.equal(reserved++, 0);
    },
    loadKey: async () => {
      loaded++;
      return fakeKey;
    },
    persist: async (name, value) => {
      assert(!stored.has(name));
      stored.set(name, value);
    },
    fetcher: async (url, init) => {
      posts++;
      assert.equal(url, ENDPOINT);
      assert.equal(init.method, "POST");
      assert.equal(init.redirect, "error");
      assert.equal(init.headers.Authorization, `Bearer ${fakeKey}`);
      assert.equal(init.body, bytes.toString());
      assert.equal(reserved, 1);
      assert.equal(loaded, 1);
      return new Response(JSON.stringify(completed()), {
        headers: { "x-request-id": "req_mock_1" },
      });
    },
    ...options,
  };
  return { config, stored, counts: () => ({ reserved, loaded, posts }) };
}

test("fixed request uses original two crops, strict schema, original detail and no tools/history", () => {
  const body = verifyBody(plan, bytes);
  assert.equal(body.model, "gpt-6-astra");
  assert.equal(body.max_output_tokens, 6000);
  assert.equal(body.store, false);
  assert.equal(body.stream, false);
  assert.equal(body.background, false);
  assert.equal(body.service_tier, "default");
  assert.deepEqual(body.tools, []);
  assert.equal(
    body.input[0].content.filter((p) => p.type === "input_image").length,
    2,
  );
  assert(
    body.input[0].content
      .filter((p) => p.type === "input_image")
      .every((p) => p.detail === "original"),
  );
  assert(!Object.hasOwn(body, "previous_response_id"));
  assert(!JSON.stringify({ ...body, input: [] }).includes("176.78"));
});

test("requires explicit matching approval before reservation, key access or transport", async () => {
  for (const replacement of [
    undefined,
    {},
    { ...approval, approved: false },
    { ...approval, images: 3 },
    { ...approval, plan_sha256: "bad" },
    { ...approval, request_sha256: "bad" },
    { ...approval, estimate_guard_usd: 1 },
  ]) {
    const h = harness({ approval: replacement });
    await assert.rejects(sendOnce(h.config));
    assert.deepEqual(h.counts(), { reserved: 0, loaded: 0, posts: 0 });
  }
});

test("refuses changed bytes or a substituted endpoint before key access", async () => {
  for (const replacement of [
    { requestBytes: Buffer.from("{}") },
    {
      planBytes: Buffer.from(
        JSON.stringify({ ...plan, endpoint: "https://example.invalid/" }),
      ),
    },
  ]) {
    const h = harness(replacement);
    await assert.rejects(sendOnce(h.config));
    assert.deepEqual(h.counts(), { reserved: 0, loaded: 0, posts: 0 });
  }
});

test("even rehashed model, tools, output-limit and prompt substitutions are refused", () => {
  for (const alter of [
    (body) => {
      body.model = "other";
    },
    (body) => {
      body.tools = [{ type: "web_search" }];
    },
    (body) => {
      body.max_output_tokens = 12000;
    },
    (body) => {
      body.instructions += "\nA fabricated answer";
    },
    (body) => {
      body.input.push(body.input[0]);
    },
  ]) {
    const body = JSON.parse(bytes);
    alter(body);
    const changed = Buffer.from(JSON.stringify(body));
    assert.throws(() =>
      verifyBody({ ...plan, body_sha256: digest(changed) }, changed),
    );
  }
});

test("crop order, real dimensions, byte counts and financial-budget guard are fixed", () => {
  assert.throws(() => buildRequest([...images].reverse()));
  assert.throws(() =>
    verifyBody(
      { ...plan, images: [{ ...plan.images[0], width: 1 }, plan.images[1]] },
      bytes,
    ),
  );
  assert.throws(() =>
    verifyBody(
      { ...plan, images: [{ ...plan.images[0], bytes: 1 }, plan.images[1]] },
      bytes,
    ),
  );
  assert.throws(() =>
    verifyBody(
      { ...plan, limits: { ...LIMITS, conservative_estimate_guard_usd: 0.01 } },
      bytes,
    ),
  );
});

test("successful mock preserves all literal fields and writes only bounded response/draft/result", async () => {
  const h = harness();
  const value = await sendOnce(h.config);
  assert.deepEqual(h.counts(), { reserved: 1, loaded: 1, posts: 1 });
  assert.deepEqual(value.draft, draft);
  assert.equal(value.result.accepted_draft, true);
  assert.equal(value.result.factual_accuracy_verified, false);
  assert.equal(value.result.billing_charge_verified, false);
  assert.equal(value.result.usage.reasoning_tokens, 100);
  assert.deepEqual(
    [...h.stored.keys()],
    ["response.txt", "draft.json", "result.json"],
  );
  assert(![...h.stored.values()].join("").includes(fakeKey));
});

for (const status of [401, 403, 429, 503])
  test(`HTTP ${status} is terminal without retry or draft`, async () => {
    let posts = 0;
    const h = harness({
      fetcher: async () => {
        posts++;
        return new Response('{"error":"mock"}', { status });
      },
    });
    const { result, draft: value } = await sendOnce(h.config);
    assert.equal(posts, 1);
    assert.equal(result.provider_posts, 1);
    assert.equal(result.code, `HTTP_${status}`);
    assert.equal(result.retries, 0);
    assert.equal(value, null);
    assert(!h.stored.has("draft.json"));
  });

test("timeouts are terminal, and a throwing transport cannot leak its error or key", async () => {
  const timed = harness({
    timeoutMs: 10,
    fetcher: (_url, init) =>
      new Promise((_, reject) =>
        init.signal.addEventListener("abort", () => reject(Error(fakeKey)), {
          once: true,
        }),
      ),
  });
  const value = await sendOnce(timed.config);
  assert.equal(value.result.code, "TIMEOUT");
  assert.equal(value.result.provider_posts, 1);
  assert(!JSON.stringify(value).includes(fakeKey));
  const rejected = harness({
    fetcher: async () => {
      throw Error(`provider details ${fakeKey}`);
    },
  });
  assert.equal(
    (await sendOnce(rejected.config)).result.code,
    "LOCAL_OR_NETWORK_FAILURE",
  );
  assert(![...rejected.stored.values()].join("").includes(fakeKey));
});

test("content-length and chunked response bounds reject oversized content", async () => {
  await assert.rejects(
    readLimited(
      new Response("x", {
        headers: { "content-length": String(LIMITS.response_bytes + 1) },
      }),
    ),
    /RESPONSE_TOO_LARGE/,
  );
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(600000));
      controller.enqueue(new Uint8Array(600000));
    },
    cancel() {
      cancelled = true;
    },
  });
  await assert.rejects(readLimited(new Response(body)), /RESPONSE_TOO_LARGE/);
  assert(cancelled);
});

for (const [name, data, expected] of [
  [
    "incomplete",
    { ...completed(), status: "incomplete" },
    "INCOMPLETE_RESPONSE",
  ],
  [
    "refusal",
    {
      ...completed(),
      output: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "refusal", refusal: "mock" }],
        },
      ],
    },
    "MODEL_REFUSAL",
  ],
  [
    "tool output",
    { ...completed(), output: [{ type: "function_call", name: "run" }] },
    "INVALID_OUTPUT",
  ],
  [
    "two text answers",
    { ...completed(), output: [completed().output[1], completed().output[1]] },
    "INVALID_OUTPUT",
  ],
  [
    "formatted rate",
    completed({ ...draft, taxCodes: [{ code: "A", rate: "20%" }] }),
    "INVALID_RECEIPT_SCHEMA",
  ],
  [
    "third photograph",
    completed({ ...draft, items: [{ ...draft.items[0], sourcePhotos: [3] }] }),
    "INVALID_SOURCE_PHOTO",
  ],
  [
    "extra receipt key",
    completed({ ...draft, action: "execute" }),
    "INVALID_RECEIPT_SCHEMA",
  ],
])
  test(`${name} remains rejected and uncorrected`, () =>
    assert.throws(() => decodeResponse(data), new RegExp(expected)));

test("unexpected returned models and invalid JSON are retained as failures", async () => {
  for (const body of [
    JSON.stringify({ ...completed(), model: "other" }),
    "bad json",
  ]) {
    const h = harness({ fetcher: async () => new Response(body) });
    const { result } = await sendOnce(h.config);
    assert.equal(result.accepted_draft, false);
    assert(h.stored.has("response.txt"));
    assert(!h.stored.has("draft.json"));
  }
});

test("a reflected fake key in response or request ID is redacted before persistence", async () => {
  const h = harness({
    fetcher: async () =>
      new Response(JSON.stringify({ ...completed(), unused: fakeKey }), {
        headers: { "x-request-id": fakeKey },
      }),
  });
  const { result } = await sendOnce(h.config);
  assert.equal(result.request_id, "[REDACTED]");
  assert(![...h.stored.values()].join("").includes(fakeKey));
});

test("exclusive persistent reservation permits only one competing attempt", async () => {
  const folder = await mkdtemp(join(tmpdir(), "gather-openai-unit-"));
  const marker = join(folder, "attempt.json");
  let posts = 0,
    loads = 0;
  try {
    const config = {
      planBytes,
      requestBytes: bytes,
      approval,
      reserve: () => writeFile(marker, "reserved", { flag: "wx" }),
      loadKey: async () => {
        loads++;
        return fakeKey;
      },
      fetcher: async () => {
        posts++;
        return new Response(JSON.stringify(completed()));
      },
    };
    const results = await Promise.allSettled([
      sendOnce(config),
      sendOnce(config),
    ]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(results.filter((r) => r.status === "rejected").length, 1);
    assert.equal(posts, 1);
    assert.equal(loads, 1);
    await assert.rejects(sendOnce(config), { code: "EEXIST" });
    assert.equal(posts, 1);
  } finally {
    await unlink(marker);
    await rmdir(folder);
  }
});

test("only the user-authorized alias is parsed; missing, duplicate and malformed keys refuse", () => {
  assert.equal(
    keyFromText(`GEMINI_API_KEY=irrelevant\nOPEN_AI_KEY='${fakeKey}'\n`),
    fakeKey,
  );
  assert.equal(keyFromText(`export OPEN_AI_KEY=${fakeKey}`), fakeKey);
  for (const text of [
    "",
    `OPENAI_API_KEY=${fakeKey}`,
    "OPEN_AI_KEY=not-a-key",
    `OPEN_AI_KEY=${fakeKey}\nOPEN_AI_KEY=${fakeKey}`,
  ])
    assert.throws(() => keyFromText(text));
  assert.throws(() => keyFromText(`OPEN_AI_KEY=${fakeKey}`, "OTHER_KEY"));
});

test("failed credential loading consumes the reservation without making a request", async () => {
  const h = harness({
    loadKey: async () => {
      throw Error(fakeKey);
    },
  });
  const { result } = await sendOnce(h.config);
  assert.equal(result.provider_posts, 0);
  assert.equal(result.accepted_draft, false);
  assert.equal(h.counts().reserved, 1);
  assert(!JSON.stringify(result).includes(fakeKey));
});

test("preparation rejects path escapes, and CLI rejects implicit live execution", async () => {
  await assert.rejects(prepareOnce("../escape"));
  const env = Object.fromEntries(
    Object.entries(process.env).filter(([name]) =>
      ["systemroot", "windir", "path", "pathext"].includes(name.toLowerCase()),
    ),
  );
  const child = spawnSync(
    process.execPath,
    [
      "--jitless",
      fileURLToPath(new URL("./openai_costco_once.mjs", import.meta.url)),
      "--run",
    ],
    { env, encoding: "utf8", windowsHide: true, timeout: 10000 },
  );
  assert.equal(child.status, 1);
  assert.equal(child.stdout, "");
  assert.match(child.stderr, /EXPLICIT_PREPARE_OR_APPROVED_RUN_REQUIRED/);
});

test("positive preparation creates a verifiable packet and refuses overwrites", async () => {
  const name = `qa-artifacts/provider-review/openai-offline-test-${process.pid}`;
  const folder = fileURLToPath(new URL(`../../${name}/`, import.meta.url));
  try {
    const summary = await prepareOnce(name);
    const frozenBytes = await readFile(join(folder, "plan.json"));
    const frozen = JSON.parse(frozenBytes);
    const request = await readFile(join(folder, "request.json"));
    assert.equal(summary.plan_sha256, digest(frozenBytes));
    assert.equal(summary.body_sha256, digest(request));
    assert.equal(frozen.provider_requests, 0);
    assert.equal(frozen.real_keys_loaded, 0);
    assert.equal(frozen.approved, false);
    assert.equal(Object.keys(frozen.source_sha256).length, 228);
    for (const [name, expected] of Object.entries(frozen.source_sha256)) {
      const path = fileURLToPath(new URL(`../../${name}`, import.meta.url));
      assert.equal(expected, digest(await readFile(path)), name);
    }
    verifyBody(frozen, request);
    await assert.rejects(prepareOnce(name), { code: "EEXIST" });
    assert.deepEqual(await readFile(join(folder, "plan.json")), frozenBytes);
  } finally {
    for (const entry of ["request.json", "plan.json"]) {
      try {
        await unlink(join(folder, entry));
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
      }
    }
    try {
      await rmdir(folder);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
});
