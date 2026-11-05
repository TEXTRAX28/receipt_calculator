// Offline tests only: fake responses, fake key, never a real upstream request.
import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  readdir,
  copyFile,
  readFile,
  writeFile,
  rm,
  realpath,
} from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { FOLDER, preflight, runSix, capture } from "./openai_six_screen.mjs";
const BASE = dirname(FOLDER),
  key = "sk-offline_six_crop_protocol_not_a_real_key";
globalThis.fetch = async () => {
  throw Error("Real network forbidden in protocol tests");
};
const receipt = {
  merchant: "SYNTHETIC",
  date: "",
  currency: "GBP",
  subtotal: "1.00",
  printedTotal: "1.00",
  printedTax: "0",
  pricesIncludeTax: true,
  printedItemCount: 1,
  taxCodes: [],
  items: [
    {
      description: "SYNTHETIC ONLY",
      quantity: "1",
      unitPrice: "1.00",
      lineTotal: "1.00",
      discount: "0",
      taxCode: "",
      note: "fake transport response, not receipt recognition",
      sourcePhotos: [1],
    },
  ],
  adjustments: [],
  warnings: [],
};
const reply = () =>
  new Response(
    JSON.stringify({
      model: "gpt-6-astra",
      status: "completed",
      usage: { input_tokens: 1, output_tokens: 1 },
      output: [
        { type: "reasoning" },
        {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: JSON.stringify(receipt) }],
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
async function fixture() {
  const root = await mkdtemp(resolve(BASE, "openai-six-test-"));
  for (const f of await readdir(FOLDER))
    if (!f.startsWith(".") && !["run", "authorization.json"].includes(f))
      await copyFile(resolve(FOLDER, f), resolve(root, f));
  return root;
}
async function clean(root) {
  assert.equal(dirname(await realpath(root)), await realpath(BASE));
  await rm(root, { recursive: true, force: true });
}
async function options(folder) {
  const p = await preflight(folder);
  let clock = 1793836800000;
  return {
    folder,
    approval: {
      approved_by_user: true,
      plan_sha256: p.plan_sha256,
      model: "gpt-6-astra",
      posts: 6,
      use_credits: true,
      scope: "OFFLINE TEST ONLY",
    },
    loadKey: async () => key,
    now: () => clock,
    wait: async (ms) => {
      clock += ms;
    },
  };
}
test("approval rejection precedes key access or provider I/O", async () => {
  const folder = await fixture();
  try {
    let keys = 0,
      calls = 0;
    await assert.rejects(
      runSix({
        folder,
        approval: {},
        loadKey: async () => {
          keys++;
          return key;
        },
        fetcher: async () => {
          calls++;
          return reply();
        },
      }),
    );
    assert.equal(keys, 0);
    assert.equal(calls, 0);
    assert(!(await readdir(folder)).includes("run"));
  } finally {
    await clean(folder);
  }
});
test("six exact guarded posts, independent images, spacing, strict drafts, exclusive rerun block", async () => {
  const folder = await fixture();
  try {
    const opts = await options(folder);
    let calls = 0;
    const result = await runSix({
      ...opts,
      fetcher: async (url, options) => {
        calls++;
        assert.equal(url, "https://api.openai.com/v1/responses");
        const b = JSON.parse(options.body);
        assert.equal(
          b.input[0].content.filter((p) => p.type === "input_image").length,
          1,
        );
        assert.equal(b.store, false);
        assert.equal(b.background, false);
        assert.deepEqual(b.tools, []);
        return reply();
      },
    });
    assert.equal(calls, 6);
    assert(result.cases.every((c) => c.status === "strict-schema-passed"));
    for (let i = 1; i < 6; i++)
      assert(
        Date.parse(result.cases[i].started_at) -
          Date.parse(result.cases[i - 1].started_at) >=
          31000,
      );
    await assert.rejects(
      runSix({
        ...opts,
        fetcher: async () => {
          calls++;
          return reply();
        },
      }),
    );
    assert.equal(calls, 6);
  } finally {
    await clean(folder);
  }
});
test("quota error stops the remaining five uploads without retry", async () => {
  const folder = await fixture();
  try {
    let calls = 0;
    const r = await runSix({
      ...(await options(folder)),
      fetcher: async () => {
        calls++;
        return new Response('{"error":"quota"}', { status: 429 });
      },
    });
    assert.equal(calls, 1);
    assert.equal(r.provider_requests, 1);
    assert.equal(
      r.cases.filter((c) => c.status.startsWith("not-attempted")).length,
      5,
    );
  } finally {
    await clean(folder);
  }
});
test("changed frozen image blocks before credentials", async () => {
  const folder = await fixture();
  try {
    await writeFile(resolve(folder, "case-01.jpg"), "changed");
    let keys = 0;
    await assert.rejects(
      runSix({
        ...(await options(FOLDER)),
        folder,
        loadKey: async () => {
          keys++;
          return key;
        },
      }),
    );
    assert.equal(keys, 0);
  } finally {
    await clean(folder);
  }
});
test("capture bounds declared and streaming responses and cancels a stalled body", async () => {
  await assert.rejects(
    capture(
      new Response("x", { headers: { "content-length": "1048577" } }),
      new AbortController().signal,
      key,
    ),
  );
  await assert.rejects(
    capture(
      new Response("x".repeat(1048577)),
      new AbortController().signal,
      key,
    ),
  );
  const control = new AbortController();
  const pending = capture(
    new Response(new ReadableStream({ start() {} })),
    control.signal,
    key,
  );
  const fail = assert.rejects(pending);
  control.abort();
  await fail;
});
test("retained parsed output removes encoded key reflections without changing prices", async () => {
  const bad = JSON.stringify(receipt).replace(
    "SYNTHETIC ONLY",
    [...key]
      .map((c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"))
      .join(""),
  );
  const r = await capture(
    new Response(
      JSON.stringify({
        output: [{ content: [{ type: "output_text", text: bad }] }],
      }),
    ),
    new AbortController().signal,
    key,
  );
  assert(!r.serialized.includes(key));
  const recovered = JSON.parse(r.data.output[0].content[0].text);
  assert.equal(recovered.items[0].description, "[REDACTED]");
  assert.equal(recovered.items[0].lineTotal, "1.00");
});
