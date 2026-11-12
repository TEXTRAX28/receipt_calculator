import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import {
  createOpenAiReader,
  OPENAI_ENDPOINT,
  prepareOpenAiRequest,
} from "../server/openai-reader.mjs";
import { createReceiptApi } from "../server/receipt-api.mjs";
import {
  openaiRequestSchema,
  openaiStatusSchema,
} from "../src/lib/openai-schema.mjs";
import { receiptFromAi } from "../src/lib/gemini";
import { aiCostcoDraft } from "./fixtures/ai-receipt";

// Protocol fixtures only. These are not credentials or real model readings.
const fakeKey = "sk-offline_openai_protocol_test_not_a_real_key";
const jpeg = await readFile(
  new URL("./fixtures/prepared-section.jpg", import.meta.url),
);
const panels = [1, 2].map((photo) => ({
  photo,
  part: 1,
  data: jpeg.toString("base64"),
}));
const folders: string[] = [],
  servers: Server[] = [];
async function folder() {
  const path = await mkdtemp(join(tmpdir(), "gather-openai-test-"));
  folders.push(path);
  return path;
}
const envelope = () => ({
  status: "completed",
  model: "gpt-6-astra",
  output: [
    { type: "reasoning", summary: [] },
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: JSON.stringify(aiCostcoDraft()) }],
    },
  ],
});
const response = () => new Response(JSON.stringify(envelope()));
async function reader(options: Parameters<typeof createOpenAiReader>[0] = {}) {
  const directory = await folder(),
    upstream = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) => response(),
    );
  const config = {
    apiKey: fakeKey,
    directory,
    grant: "offline-test-grant",
    limit: 1,
    fetcher: upstream,
    ...options,
  };
  return { directory, upstream, config, model: createOpenAiReader(config) };
}
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise<void>((done) => server.close(() => done()));
  }
  for (const path of folders.splice(0)) {
    if (
      !resolve(path).startsWith(resolve(tmpdir()) + sep) ||
      !path.includes("gather-openai-test-")
    )
      throw Error("Unsafe temporary path");
    await rm(path, { recursive: true, force: true });
  }
});

describe("OpenAI explicit last-resort reader; offline transports only", () => {
  it("needs both upload and credit consent in the HTTP contract", () => {
    expect(
      openaiRequestSchema.safeParse({ consent: true, panels }).success,
    ).toBe(false);
    expect(
      openaiRequestSchema.safeParse({
        consent: true,
        useCredits: false,
        panels,
      }).success,
    ).toBe(false);
    expect(
      openaiRequestSchema.safeParse({ consent: true, useCredits: true, panels })
        .success,
    ).toBe(true);
  });
  it("key presence alone does not enable calls or create a ledger on status checks", async () => {
    const client = await reader({ grant: "", limit: 0 });
    expect(
      openaiStatusSchema.parse(await client.model.getStatus()),
    ).toMatchObject({
      configured: false,
      remaining: 0,
      availability: "missing-allowance",
    });
    await expect(client.model.extract(panels)).rejects.toMatchObject({
      status: 503,
    });
    expect(client.upstream).not.toHaveBeenCalled();
    expect(await readdir(client.directory)).toEqual([]);
  });
  it("keeps missing credentials and unavailable allowance storage disabled", async () => {
    const missing = await reader({ apiKey: "" });
    expect(await missing.model.getStatus()).toMatchObject({
      configured: false,
      availability: "missing-key",
    });
    const bad = await reader({ directory: fileURLToPath(import.meta.url) });
    expect(await bad.model.getStatus()).toMatchObject({
      configured: false,
      availability: "storage-unavailable",
    });
  });
  it("preserves original sections, schema, photo identity and independent image-only instructions", () => {
    const prepared = prepareOpenAiRequest(panels),
      body = JSON.parse(prepared.serialized);
    expect(body).toMatchObject({
      model: "gpt-6-astra",
      max_output_tokens: 6000,
      store: false,
      stream: false,
      background: false,
      tools: [],
      service_tier: "default",
    });
    expect(body.text.format.strict).toBe(true);
    expect(body.input).toHaveLength(1);
    expect(
      body.input[0].content
        .filter((part: { type: string }) => part.type === "input_image")
        .map((part: { image_url: string; detail: string }) => ({
          detail: part.detail,
          image: part.image_url,
        })),
    ).toEqual(
      panels.map((panel) => ({
        detail: "original",
        image: "data:image/jpeg;base64," + panel.data,
      })),
    );
    expect(prepared.photos).toEqual(new Set([1, 2]));
    expect(prepared.estimateUsd).toBeLessThanOrEqual(0.6);
  });
  it("sends once to the fixed endpoint and preserves literal money through the current converter", async () => {
    const client = await reader();
    const output = await client.model.extract(panels);
    expect(output.receipt).toEqual(aiCostcoDraft());
    expect(client.upstream).toHaveBeenCalledTimes(1);
    expect(client.upstream.mock.calls[0]?.[0]).toBe(OPENAI_ENDPOINT);
    expect(client.upstream.mock.calls[0]?.[1]).toMatchObject({
      redirect: "error",
      method: "POST",
      headers: { Authorization: `Bearer ${fakeKey}` },
    });
    const converted = receiptFromAi(output.receipt, "OpenAI");
    expect(
      converted.items.map((item) => [
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.discount,
      ]),
    ).toEqual(
      output.receipt.items.map((item) => [
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.discount,
      ]),
    );
    expect(await client.model.getStatus()).toMatchObject({
      configured: false,
      remaining: 0,
      availability: "exhausted",
    });
  });
  it("does not replenish an attempt across restarts or credential changes", async () => {
    const client = await reader();
    await client.model.extract(panels);
    const restarted = createOpenAiReader({
      ...client.config,
      apiKey: "sk-another_offline_key_not_real_000000",
    });
    await expect(restarted.extract(panels)).rejects.toMatchObject({
      status: 429,
    });
    expect(client.upstream).toHaveBeenCalledTimes(1);
  });
  it("atomically bounds two separate readers sharing one slot", async () => {
    const client = await reader();
    const other = createOpenAiReader(client.config);
    const results = await Promise.allSettled([
      client.model.extract(panels),
      other.extract(panels),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(client.upstream).toHaveBeenCalledTimes(1);
  });
  it("rejects invalid images before reservation or provider I/O", async () => {
    const client = await reader();
    await expect(
      client.model.extract([{ photo: 1, part: 1, data: "aW52YWxpZA==" }]),
    ).rejects.toMatchObject({ status: 400 });
    expect(client.upstream).not.toHaveBeenCalled();
    expect((await client.model.getStatus()).remaining).toBe(1);
  });
  it("refuses an over-budget synthetic image header before consuming an attempt", async () => {
    // Deliberately altered metadata, not a real image or a recognition fixture.
    // Only the preflight header/cost check is exercised; no upload can occur.
    const large = Buffer.from(jpeg);
    let found = false;
    for (let i = 0; i < large.length - 9; i++) {
      if (large[i] === 255 && [192, 194].includes(large[i + 1])) {
        large.writeUInt16BE(2000, i + 5);
        large.writeUInt16BE(2000, i + 7);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
    const client = await reader();
    await expect(
      client.model.extract(
        panels.map((panel) => ({ ...panel, data: large.toString("base64") })),
      ),
    ).rejects.toMatchObject({ status: 413 });
    expect(client.upstream).not.toHaveBeenCalled();
    expect((await client.model.getStatus()).remaining).toBe(1);
  });
  it.each([401, 403, 429, 503])(
    "retains HTTP %i failure without retry, leaking content or reclaiming a slot",
    async (status) => {
      const upstream = vi.fn(async () => new Response(fakeKey, { status }));
      const client = await reader({ fetcher: upstream });
      const error = await client.model.extract(panels).catch((error) => error);
      expect(error.message).not.toContain(fakeKey);
      expect(error.status).toBe(status === 429 ? 429 : 502);
      expect(upstream).toHaveBeenCalledTimes(1);
      expect((await client.model.getStatus()).remaining).toBe(0);
    },
  );
  it.each([
    "incomplete",
    "refusal",
    "tool",
    "role",
    "multiple",
    "model",
    "json",
    "money",
    "photo",
  ])("rejects %s output without repairing fields or retrying", async (mode) => {
    const value = envelope();
    if (mode === "incomplete") value.status = "incomplete";
    if (mode === "model") value.model = "another-model";
    if (mode === "tool") value.output[1].type = "function_call";
    const message = value.output[1] as
      { role: string; content: { type: string; text: string }[] } | undefined;
    if (mode === "role") message!.role = "user";
    if (mode === "refusal")
      message!.content = [{ type: "refusal", text: "No" }];
    if (mode === "multiple") message!.content.push({ ...message!.content[0] });
    if (mode === "json") message!.content[0].text = "not JSON";
    if (mode === "money" || mode === "photo") {
      const raw = aiCostcoDraft();
      if (mode === "money") raw.items[0].lineTotal = "£14.99";
      else raw.items[0].sourcePhotos = [12];
      message!.content[0].text = JSON.stringify(raw);
    }
    const upstream = vi.fn(async () => new Response(JSON.stringify(value)));
    const client = await reader({ fetcher: upstream });
    await expect(client.model.extract(panels)).rejects.toMatchObject({
      status: 502,
    });
    expect(upstream).toHaveBeenCalledTimes(1);
    expect((await client.model.getStatus()).remaining).toBe(0);
  });
  it("redacts credentials even when model text uses Unicode escapes", async () => {
    const raw = aiCostcoDraft();
    raw.items[0].description = fakeKey;
    const value = envelope();
    value.output[1].content![0].text = JSON.stringify(raw).replaceAll(
      "sk-offline",
      "\\u0073k-offline",
    );
    const client = await reader({
      fetcher: async () => new Response(JSON.stringify(value)),
    });
    const output = await client.model.extract(panels);
    expect(JSON.stringify(output)).not.toContain(fakeKey);
    expect(output.receipt.items[0].description).toBe("[REDACTED]");
  });
  it.each(["declared", "stream"])("bounds %s response bytes", async (mode) => {
    const client = await reader({
      fetcher: async () =>
        new Response(
          "x".repeat(1048577),
          mode === "declared"
            ? { headers: { "content-length": "1048577" } }
            : {},
        ),
    });
    await expect(client.model.extract(panels)).rejects.toMatchObject({
      status: 502,
    });
    expect((await client.model.getStatus()).remaining).toBe(0);
  });
  it("does not reserve or post an already-cancelled scan", async () => {
    const client = await reader(),
      controller = new AbortController();
    controller.abort();
    await expect(
      client.model.extract(panels, { signal: controller.signal }),
    ).rejects.toThrow();
    expect(client.upstream).not.toHaveBeenCalled();
    expect((await client.model.getStatus()).remaining).toBe(1);
  });
  it("cancels a stalled response stream at its total deadline and retains the attempt", async () => {
    let cancelled = false;
    const client = await reader({
      timeoutMs: 20,
      fetcher: async () =>
        new Response(
          new ReadableStream({
            cancel() {
              cancelled = true;
            },
          }),
        ),
    });
    await expect(client.model.extract(panels)).rejects.toMatchObject({
      status: 504,
    });
    expect(cancelled).toBe(true);
    expect((await client.model.getStatus()).remaining).toBe(0);
  });
  it("keeps an unknown currency unresolved until explicit user context", () => {
    const raw = aiCostcoDraft();
    expect(
      receiptFromAi({ ...raw, currency: "" }, "OpenAI").currencyUnresolved,
    ).toBe(true);
    expect(
      receiptFromAi({ ...raw, currency: "" }, "OpenAI", { currency: "GBP" })
        .currencyUnresolved,
    ).toBe(false);
  });
});

describe("OpenAI actual loopback API; upstream mocked", () => {
  async function api(openAiOnly = false) {
    const client = await reader();
    const handler = createReceiptApi({
      openAiOnly,
      openaiReader: client.model,
    });
    const server = createServer((req, res) => {
      void handler(req, res, () => {
        res.writeHead(404);
        res.end();
      });
    });
    servers.push(server);
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const post = (body: unknown, headers = {}) =>
      fetch(base + "/api/receipts/openai", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gather-request": "receipt-scan",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    return { ...client, base, post };
  }
  it("requires both consent flags before spending, then uses the dedicated key and ledger", async () => {
    const client = await api();
    expect((await client.post({ consent: true, panels })).status).toBe(400);
    expect(client.upstream).not.toHaveBeenCalled();
    const result = await client.post({
      consent: true,
      useCredits: true,
      panels,
    });
    expect(result.status).toBe(200);
    expect((await result.json()).receipt).toEqual(aiCostcoDraft());
    const status = await (
      await fetch(client.base + "/api/receipts/openai/config")
    ).json();
    expect(status).toMatchObject({
      provider: "OpenAI",
      configured: false,
      remaining: 0,
    });
    expect(JSON.stringify(status)).not.toContain(fakeKey);
  });
  it("rejects cross-origin requests before touching the upstream", async () => {
    const client = await api();
    expect(
      (
        await client.post(
          { consent: true, useCredits: true, panels },
          { origin: "https://other.example" },
        )
      ).status,
    ).toBe(403);
    expect(client.upstream).not.toHaveBeenCalled();
    expect((await client.model.getStatus()).remaining).toBe(1);
  });
  it("blocks the other receipt endpoints in OpenAI-only mode", async () => {
    const client = await api(true);
    const denied = [
      "providers",
      "config",
      "extract",
      "recognize",
      "vision",
      "vision-batches",
      "azure",
      "veryfi",
    ];
    for (const route of denied) {
      expect((await fetch(`${client.base}/api/receipts/${route}`)).status).toBe(
        404,
      );
    }
    const result = await client.post({
      consent: true,
      useCredits: true,
      panels,
    });
    expect(result.status).toBe(200);
    expect(client.upstream).toHaveBeenCalledTimes(1);
  });
});
