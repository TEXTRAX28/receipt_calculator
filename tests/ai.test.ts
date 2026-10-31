import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createReceiptApi,
  extractWithGemini as serverExtract,
} from "../server/receipt-api.mjs";
import { receiptFromAi, extractWithGemini } from "../src/lib/gemini";
import { calculateReceipt } from "../src/lib/engine";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { planReadingPanels } from "../src/lib/images";
import { joinDetailText } from "../src/lib/ocr";

const panelData = Buffer.from([
  255, 216, 255, 224, 0, 1, 2, 3, 255, 217,
]).toString("base64");
const panels = [
  { photo: 1, part: 1, data: panelData },
  { photo: 2, part: 1, data: panelData },
];
const response = (receipt = aiCostcoDraft()) =>
  new Response(
    JSON.stringify({
      status: "completed",
      outputs: [{ type: "text", text: JSON.stringify(receipt) }],
    }),
    { headers: { "content-type": "application/json" } },
  );
const servers: Server[] = [];
async function localApi(options: Parameters<typeof createReceiptApi>[0] = {}) {
  const handler = createReceiptApi(options);
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  const base = `http://127.0.0.1:${address.port}`;
  const post = (
    body: unknown = { consent: true, panels },
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/api/receipts/extract`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
        origin: base,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { base, post };
}
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve) => {
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
});

describe("Gemini receipts are evidence for the exact engine", () => {
  it("preserves 18 Costco purchases, both identical chickens, discounts and exact VAT", () => {
    const receipt = receiptFromAi(aiCostcoDraft());
    expect(receipt.source).toBe("ai");
    expect(receipt.items).toHaveLength(18);
    expect(
      receipt.items.filter((item) => /rotisserie/i.test(item.description)),
    ).toHaveLength(2);
    expect(receipt.items[3].discount).toBe("2.00");
    const result = calculateReceipt(receipt);
    expect(result.issues).toEqual([]);
    expect(result.total).toBe(17678n);
    expect(receipt.rawText).toBe("");
  });
  it("flags missing purchases and unknown currency/tax inclusion instead of inventing evidence", () => {
    const draft = aiCostcoDraft();
    const receipt = receiptFromAi({
      ...draft,
      currency: "",
      pricesIncludeTax: null,
      items: draft.items.slice(1),
    });
    expect(receipt.items).toHaveLength(17);
    expect(receipt.warnings.join(" ")).toMatch(/says 18 items.*found 17/);
    expect(receipt.warnings.join(" ")).toMatch(/Currency was unclear/);
    expect(receipt.warnings.join(" ")).toMatch(/could not determine/);
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it("rejects numeric prices, executable actions, negative purchases and unbounded output", () => {
    const draft = aiCostcoDraft();
    for (const invalid of [
      { ...draft, execute: "send secrets" },
      { ...draft, items: [{ ...draft.items[0], lineTotal: 9.49 }] },
      { ...draft, items: [{ ...draft.items[0], lineTotal: "-1.00" }] },
      { ...draft, items: Array.from({ length: 301 }, () => draft.items[0]) },
    ])
      expect(() => receiptFromAi(invalid)).toThrow();
  });
  it("accepts a blank unreadable amount and lets the engine block confirmation", () => {
    const draft = aiCostcoDraft();
    draft.items[0].lineTotal = "";
    draft.items[0].unitPrice = "";
    const receipt = receiptFromAi(draft);
    expect(receipt.items[0].lineTotal).toBe("");
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
});

describe("server-held credentials and bounded provider calls", () => {
  it("sends all numbered panels in one stateless, structured request, with no tools", async () => {
    const upstream = vi.fn(async () => response());
    const { post } = await localApi({
      apiKey: "test-server-only-key",
      fetcher: upstream,
    });
    const result = await post();
    expect(result.status).toBe(200);
    const payload = await result.json();
    expect(payload.receipt.items).toHaveLength(18);
    expect(JSON.stringify(payload)).not.toContain("test-server-only-key");
    expect(upstream).toHaveBeenCalledOnce();
    const [url, options] = upstream.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe(
      "https://generativelanguage.googleapis.com/v1beta/interactions",
    );
    const body = JSON.parse(options.body as string);
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.store).toBe(false);
    expect(body.tools).toBeUndefined();
    expect(
      body.input.filter((part: { type: string }) => part.type === "image"),
    ).toHaveLength(2);
    expect(body.system_instruction).toMatch(
      /Keep genuinely separate repeated purchases/,
    );
    expect(body.response_format.mime_type).toBe("application/json");
    expect(body.generation_config.thinking_level).toBe("low");
    expect(
      body.response_format.schema.properties.items.maxItems,
    ).toBeUndefined();
  });
  it("shows configuration without exposing a key and fails clearly when no key exists", async () => {
    const { base, post } = await localApi();
    expect(await (await fetch(`${base}/api/receipts/config`)).json()).toEqual({
      configured: false,
      provider: "Gemini",
      model: "gemini-3.8-flash",
    });
    const unavailable = await post();
    expect(unavailable.status).toBe(503);
    expect((await unavailable.json()).error).toMatch(/not connected yet/);
  });
  it("requires same-origin JSON and explicit processing consent", async () => {
    const upstream = vi.fn(async () => response());
    const { post } = await localApi({ apiKey: "test-key", fetcher: upstream });
    expect(
      (await post(undefined, { origin: "https://other.example" })).status,
    ).toBe(403);
    expect((await post(undefined, { "x-gather-request": "" })).status).toBe(
      415,
    );
    expect((await post({ consent: false, panels })).status).toBe(400);
    expect(
      (
        await post({
          consent: true,
          panels: [{ uri: "http://169.254.169.254" }],
        })
      ).status,
    ).toBe(400);
    expect(upstream).not.toHaveBeenCalled();
  });
  it.each([429, 502, 503, 504])(
    "does not leak upstream error bodies or retry quota/service failure %i",
    async (status) => {
      const upstream = vi.fn(
        async () => new Response("secret-debug-details", { status }),
      );
      const { post } = await localApi({
        apiKey: "test-key",
        fetcher: upstream,
      });
      const result = await post();
      expect(result.status).toBe(status === 429 ? 429 : 503);
      const body = await result.text();
      expect(body).toMatch(
        status === 429 ? /usage limit/ : /busy|temporarily unavailable/,
      );
      expect(body).not.toContain("secret-debug");
      expect(upstream).toHaveBeenCalledOnce();
    },
  );
  it("bounds local scan attempts instead of running an automatic retry loop", async () => {
    const upstream = vi.fn(async () => response());
    const { post } = await localApi({ apiKey: "test-key", fetcher: upstream });
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(200);
    expect((await post()).status).toBe(429);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
  it("rejects partial generations and invented source photo references", async () => {
    await expect(
      serverExtract(panels, {
        apiKey: "test-key",
        signal: new AbortController().signal,
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({ status: "incomplete", output_text: "{}" }),
            ),
        ),
      }),
    ).rejects.toThrow(/did not finish/);
    const draft = aiCostcoDraft();
    draft.items[0].sourcePhotos = [3];
    await expect(
      serverExtract(panels, {
        apiKey: "test-key",
        signal: new AbortController().signal,
        fetcher: vi.fn(async () => response(draft)),
      }),
    ).rejects.toThrow(/photo reference/);
  });
  it("cancels a stalled provider request when the deadline expires", async () => {
    const upstream = vi.fn(
      (_url: RequestInfo | URL, options?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          options!.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        }),
    );
    const { post } = await localApi({
      apiKey: "test-key",
      fetcher: upstream,
      timeoutMs: 50,
    });
    const result = await post();
    expect(result.status).toBe(504);
    expect((await result.json()).error).toMatch(/cancelled|two minutes/);
  });
  it("client cancellation preserves a useful recovery message", async () => {
    const control = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, options) =>
          new Promise((_resolve, reject) => {
            options.signal.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const work = extractWithGemini(
      [
        {
          id: "image",
          name: "receipt.jpg",
          url: "blob:test",
          blob: new Blob([Buffer.from(panelData, "base64")]),
        },
      ],
      control.signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(fetch).toHaveBeenCalled());
    const rejected = expect(work).rejects.toThrow(/cancelled/);
    control.abort();
    await rejected;
  });
});

describe("tall images retain readable sections", () => {
  it("covers a tall receipt with bounded, overlapping windows including the footer", () => {
    const plan = planReadingPanels(900, 12000);
    expect(plan.length).toBeGreaterThan(3);
    expect(plan.length).toBeLessThanOrEqual(12);
    expect(plan[0].top).toBe(0);
    expect(plan.at(-1)!.top + plan.at(-1)!.height).toBeCloseTo(12000, -1);
    for (const [index, panel] of plan.entries()) {
      expect(panel.outputWidth * panel.outputHeight).toBeLessThanOrEqual(
        4_000_000,
      );
      if (index)
        expect(panel.top).toBeLessThan(
          plan[index - 1].top + plan[index - 1].height,
        );
    }
    expect(planReadingPanels(900, 1200)).toEqual([]);
  });
  it("merges only a matching detail-window join, leaving genuine repeated purchases intact", () => {
    expect(
      joinDetailText([
        "Milk 2.50\nApples 3.00\nBread 1.00\nRice 4.00",
        "Apples 3.00\nBread 1.00\nRice 4.00\nTOTAL 10.50",
      ]),
    ).toBe("Milk 2.50\nApples 3.00\nBread 1.00\nRice 4.00\nTOTAL 10.50");
    const pair = "CHICKEN\n10533 1x 3.99 3.99 A";
    expect(joinDetailText([`${pair}\n${pair}`]).split("CHICKEN")).toHaveLength(
      3,
    );
  });
});
