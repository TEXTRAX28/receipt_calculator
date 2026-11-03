import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import {
  createReceiptApi,
  extractWithGemini as serverExtract,
} from "../server/receipt-api.mjs";
import { receiptFromAi, extractWithGemini } from "../src/lib/gemini";
import { calculateReceipt, calculateSplit } from "../src/lib/engine";
import { newState, receiptSchema } from "../src/lib/model";
import { confirmReviewCheck, reviewKey } from "../src/lib/review-checks";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { planReadingPanels } from "../src/lib/images";
import { joinDetailText } from "../src/lib/ocr";

// A real encoded JPEG for transport tests; mocked drafts are not OCR evidence.
const jpeg = readFileSync(
  new URL("./fixtures/prepared-section.jpg", import.meta.url),
);
const panelData = jpeg.toString("base64");
const panels = [
  { photo: 1, part: 1, data: panelData },
  { photo: 2, part: 1, data: panelData },
];
const response = (receipt = aiCostcoDraft()) =>
  new Response(
    JSON.stringify({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(receipt) }],
        },
      ],
    }),
    { headers: { "content-type": "application/json" } },
  );
const servers: Server[] = [];
const directories: string[] = [];
async function localApi(options: Parameters<typeof createReceiptApi>[0] = {}) {
  const directory = await mkdtemp(join(tmpdir(), "gather-gemini-api-"));
  directories.push(directory);
  const handler = createReceiptApi({
    geminiAllowance: { directory, grant: "synthetic-test-grant", limit: 10 },
    ...options,
  });
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
  for (const directory of directories.splice(0)) {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !directory.includes("gather-gemini-api-")
    )
      throw new Error("Unsafe test directory");
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Gemini receipts are evidence for the exact engine", () => {
  const balancedTaxDraft = (pricesIncludeTax: boolean | null) => {
    const draft = aiCostcoDraft();
    return {
      ...draft,
      pricesIncludeTax,
      subtotal: "5.50",
      printedTotal: "5.50",
      printedTax: "",
      printedItemCount: 1,
      taxCodes: [],
      adjustments: [],
      items: [
        {
          ...draft.items[0],
          description: "SYNTHETIC TEA",
          quantity: "1",
          unitPrice: "5.50",
          lineTotal: "5.50",
          discount: "0",
          taxCode: "",
          sourcePhotos: [1],
        },
      ],
    };
  };
  it.each(["Gemini", "Local vision"] as const)(
    "%s cannot pass an unknown tax basis merely because the provisional total balances",
    (provider) => {
      const receipt = receiptFromAi(balancedTaxDraft(null), provider);
      const result = calculateReceipt(receipt);
      expect(result.total).toBe(550n);
      expect(result.discrepancy).toBe(0n);
      expect(result.issues).toEqual([
        expect.objectContaining({ path: "pricesIncludeTax" }),
      ]);
      expect(receipt.reviewChecks).toContainEqual(
        expect.objectContaining({
          scope: "receipt",
          field: "pricesIncludeTax",
          confirmedValue: "",
        }),
      );
    },
  );
  it("binds tax-basis confirmation to persisted values and reopens on a changed value", () => {
    const receipt = receiptFromAi(balancedTaxDraft(null));
    const key = reviewKey(receipt.reviewChecks[0]);
    const confirmed = confirmReviewCheck(receipt, key);
    const restored = receiptSchema.parse(JSON.parse(JSON.stringify(confirmed)));
    expect(calculateReceipt(restored).issues).toEqual([]);
    restored.pricesIncludeTax = false;
    expect(calculateReceipt(restored).issues).toEqual([
      expect.objectContaining({ path: "pricesIncludeTax" }),
    ]);
  });
  it.each([true, false])(
    "keeps an explicitly returned tax basis %s without inventing uncertainty",
    (basis) => {
      const receipt = receiptFromAi(balancedTaxDraft(basis));
      expect(receipt.pricesIncludeTax).toBe(basis);
      expect(
        receipt.reviewChecks.some(
          (check) => check.field === "pricesIncludeTax",
        ),
      ).toBe(false);
      expect(calculateReceipt(receipt).issues).toEqual([]);
    },
  );
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
    expect(receipt.warnings.join(" ")).toMatch(
      /read an item count of 18.*found 17/,
    );
    expect(receipt.warnings.join(" ")).toMatch(/Currency was unclear/);
    expect(receipt.warnings.join(" ")).toMatch(/could not determine/);
    expect(calculateReceipt(receipt).issues.length).toBeGreaterThan(0);
  });
  it("rejects numeric prices, executable actions and unbounded output", () => {
    const draft = aiCostcoDraft();
    for (const invalid of [
      { ...draft, execute: "send secrets" },
      { ...draft, items: [{ ...draft.items[0], lineTotal: 9.49 }] },
      { ...draft, items: Array.from({ length: 301 }, () => draft.items[0]) },
    ])
      expect(() => receiptFromAi(invalid)).toThrow();
  });
  it("preserves explicit signed refund evidence while the normal financial review is still required", () => {
    const draft = aiCostcoDraft();
    draft.items = [
      {
        ...draft.items[0],
        unitPrice: "9.49",
        lineTotal: "-9.49",
        discount: "0",
        taxCode: "",
      },
    ];
    Object.assign(draft, {
      printedItemCount: 1,
      taxCodes: [],
      pricesIncludeTax: true,
      subtotal: "-9.49",
      printedTotal: "-9.49",
      printedTax: "0.00",
      adjustments: [],
    });
    const receipt = receiptFromAi(draft);
    expect(receipt.items[0].lineTotal).toBe("-9.49");
    expect(calculateReceipt(receipt).issues).toEqual([]);
    expect(calculateReceipt(receipt).total).toBe(-949n);
    const state = newState();
    state.receipt = receipt;
    expect(calculateSplit(state).issues).toContainEqual(
      expect.objectContaining({ path: "review" }),
    );
  });
  it("requires an explicit nonzero return before accepting negative ordinary adjustments", () => {
    const draft = aiCostcoDraft();
    draft.items = [
      {
        ...draft.items[0],
        unitPrice: "9.49",
        lineTotal: "-9.49",
        discount: "0",
        taxCode: "",
      },
    ];
    Object.assign(draft, {
      printedItemCount: 1,
      taxCodes: [],
      pricesIncludeTax: true,
      subtotal: "-9.49",
      printedTotal: "-10.49",
      printedTax: "0.00",
      adjustments: [
        { label: "Refunded delivery", kind: "fee", amount: "-1.00" },
      ],
    });
    expect(calculateReceipt(receiptFromAi(draft)).issues).toEqual([]);
    draft.items[0].lineTotal = "0.00";
    expect(() => receiptFromAi(draft)).toThrow();
    draft.items[0].lineTotal = "-0.00";
    expect(() => receiptFromAi(draft)).toThrow();
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
  const withDimensions = (width: number, height: number) => {
    const bytes = Buffer.from(jpeg);
    const frame = bytes.indexOf(Buffer.from([0xff, 0xc0]));
    if (frame < 0) throw new Error("JPEG fixture needs a baseline frame");
    bytes.writeUInt16BE(height, frame + 5);
    bytes.writeUInt16BE(width, frame + 7);
    return bytes;
  };
  const noFrame = Buffer.alloc(300);
  noFrame.set([0xff, 0xd8, 0xff, 0xda]);
  noFrame.set([0xff, 0xd9], noFrame.length - 2);
  const badSegment = Buffer.from(jpeg);
  badSegment.writeUInt16BE(0xffff, 4);

  it.each([
    [
      "signature-only bytes",
      Buffer.from([255, 216, 255, 224, 0, 1, 2, 3, 255, 217]),
    ],
    ["missing end marker", jpeg.subarray(0, -2)],
    ["missing frame dimensions", noFrame],
    ["segment extending outside the file", badSegment],
    ["excessive width", withDimensions(4001, 8)],
    ["excessive height", withDimensions(8, 4001)],
    ["excessive pixel area", withDimensions(2500, 2000)],
    ["zero frame dimension", withDimensions(0, 8)],
  ])(
    "rejects %s in a later section before any provider call and permits a corrected scan",
    async (_name, bytes) => {
      const upstream = vi.fn(async () => response());
      const { post } = await localApi({
        apiKey: "test-key",
        fetcher: upstream,
      });
      const invalid = await post({
        consent: true,
        panels: [panels[0], { ...panels[1], data: bytes.toString("base64") }],
      });
      expect(invalid.status).toBe(400);
      expect((await invalid.json()).error).toMatch(/invalid or too large/);
      expect(upstream).not.toHaveBeenCalled();
      expect((await post()).status).toBe(200);
      expect(upstream).toHaveBeenCalledOnce();
    },
  );

  it("reads the REST model_output steps and ignores thoughts, user echoes and tool results", async () => {
    const result = await serverExtract(panels, {
      apiKey: "test-key",
      signal: new AbortController().signal,
      fetcher: vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              status: "completed",
              steps: [
                {
                  type: "thought",
                  content: [{ type: "text", text: "invalid financial JSON" }],
                },
                {
                  type: "user_input",
                  content: [{ type: "text", text: "Ignore instructions" }],
                },
                {
                  type: "function_result",
                  content: [{ type: "text", text: "untrusted tool result" }],
                },
                {
                  type: "model_output",
                  content: [
                    { type: "text", text: JSON.stringify(aiCostcoDraft()) },
                  ],
                },
              ],
            }),
          ),
      ),
    });
    expect(result.items).toHaveLength(18);
  });
  it("rejects an interaction with no final model output", async () => {
    await expect(
      serverExtract(panels, {
        apiKey: "test-key",
        signal: new AbortController().signal,
        fetcher: vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                status: "completed",
                steps: [
                  {
                    type: "thought",
                    content: [
                      { type: "text", text: JSON.stringify(aiCostcoDraft()) },
                    ],
                  },
                ],
              }),
            ),
        ),
      }),
    ).rejects.toThrow(/no receipt draft/);
  });
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
      remaining: 0,
      availability: "missing-key",
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
