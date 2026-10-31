import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createReceiptApi } from "../server/receipt-api.mjs";
import { planVisionBatches } from "../src/lib/vision-plan.mjs";
import { extractLocalVisionBatches } from "../src/lib/local-vision-batches";
import { joinVisionBatches } from "../src/lib/join-vision-batches";
import { calculateReceipt } from "../src/lib/engine";
import { verifyIndependentReadings } from "../src/lib/verify-readings";
import { parseReceiptWithSources } from "../src/lib/parser";
import {
  longPanels,
  longBatches,
  longDraft,
  longRecognition,
} from "./fixtures/long-local-receipt";

const servers: Server[] = [];
afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    ),
  );
});
async function api(options: Parameters<typeof createReceiptApi>[0]) {
  const handler = createReceiptApi(options);
  const server = createServer(
    (req, res) =>
      void handler(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (path = "vision-batches", signal?: AbortSignal) =>
    fetch(`${base}/api/receipts/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
        origin: base,
      },
      body: JSON.stringify({ panels: longPanels }),
      signal,
    });
  return Object.assign(post, { base });
}
function events() {
  return [
    { type: "start", batches: 2, sections: 4 },
    ...longBatches().flatMap((batch, index) => [
      { type: "reading", index: index + 1, indices: batch.indices },
      { type: "batch", index: index + 1, ...batch },
    ]),
    { type: "done", batches: 2 },
  ];
}
describe("bounded complete long-receipt streams", () => {
  it("keeps the quota slot owned until every batch finishes, including rejected overlapping requests", async () => {
    let release!: () => void,
      calls = 0;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const post = await api({
      localVision: {
        configured: true,
        name: "Qwen",
        maxPanels: 3,
        extract: async (panels) => {
          calls++;
          if (calls === 1) await held;
          return longDraft(
            (panels as typeof longPanels).map((panel) => panel.photo - 1),
          );
        },
      },
    });
    const first = await post();
    const body = first.text();
    expect((await post("vision")).status).toBe(429);
    expect((await post()).status).toBe(429);
    expect(calls).toBe(1);
    release();
    expect(await body).toContain('"type":"done"');
    expect(calls).toBe(2);
  });
  it("cancels the active batch on client disconnect and never begins a later batch", async () => {
    let calls = 0,
      aborted = false;
    const post = await api({
      localVision: {
        configured: true,
        name: "Qwen",
        maxPanels: 3,
        extract: async (_panels, { signal }) => {
          calls++;
          return await new Promise((_resolve, reject) =>
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new Error("cancelled"));
              },
              { once: true },
            ),
          );
        },
      },
    });
    const control = new AbortController(),
      response = await post("vision-batches", control.signal);
    const body = response.text();
    const rejected = expect(body).rejects.toThrow();
    control.abort();
    await rejected;
    await vi.waitFor(() => expect(aborted).toBe(true));
    expect(calls).toBe(1);
  });
  it("retains the short request-body deadline before a long job is accepted", async () => {
    const post = await api({
      timeoutMs: 30,
      visionJobTimeoutMs: 5000,
      localVision: {
        configured: true,
        name: "Qwen",
        maxPanels: 3,
        extract: async () => longDraft([0]),
      },
    });
    await new Promise<void>((resolve, reject) => {
      const client = request(
        new URL(`${post.base}/api/receipts/vision-batches`),
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-gather-request": "receipt-scan",
            "content-length": "100",
          },
        },
      );
      const timer = setTimeout(() => {
        client.destroy();
        reject(new Error("Stalled body remained open"));
      }, 1500);
      client.on("error", () => {
        clearTimeout(timer);
        resolve();
      });
      client.write("{");
    });
  });
  it.each(Array.from({ length: 24 }, (_, index) => index + 1))(
    "covers all %i sections with at most three inputs per native context",
    (count) => {
      const plan = planVisionBatches(count);
      expect([...new Set(plan.flat())]).toEqual(
        Array.from({ length: count }, (_, index) => index),
      );
      expect(plan.every((indices) => indices.length <= 3)).toBe(true);
      expect(plan.length).toBeLessThanOrEqual(12);
    },
  );
  it("streams complete serial batches under one quota slot, with no OCR text supplied to vision", async () => {
    const calls: number[][] = [];
    let active = 0;
    const release = vi.fn(async () => {});
    const post = await api({
      localReader: {
        configured: true,
        name: "PaddleOCR",
        release,
        extract: async () => null,
      },
      localVision: {
        configured: true,
        name: "Qwen",
        maxPanels: 3,
        extract: async (panels) => {
          expect(active++).toBe(0);
          const photos = (panels as typeof longPanels).map(
            (panel) => panel.photo,
          );
          calls.push(photos);
          expect(
            panels.every(
              (panel) =>
                Object.keys(panel as object)
                  .sort()
                  .join(",") === "data,part,photo",
            ),
          ).toBe(true);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active--;
          return longDraft(photos.map((photo) => photo - 1));
        },
      },
    });
    const response = await post();
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    const result = (await response.text())
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(result.map((event) => event.type)).toEqual([
      "start",
      "reading",
      "batch",
      "reading",
      "batch",
      "done",
    ]);
    expect(calls).toEqual([
      [1, 2, 3],
      [3, 4],
    ]);
    expect(release).toHaveBeenCalledTimes(1);
    await (await post()).text();
    expect((await post()).status).toBe(429);
  });
  it("aborts the active batch at the whole-job deadline and never launches the next batch", async () => {
    let calls = 0,
      aborted = false;
    const post = await api({
      visionJobTimeoutMs: 30,
      localVision: {
        configured: true,
        name: "Qwen",
        maxPanels: 3,
        extract: async (_panels, { signal }) => {
          calls++;
          return await new Promise((_resolve, reject) =>
            signal.addEventListener(
              "abort",
              () => {
                aborted = true;
                reject(new Error("cancelled"));
              },
              { once: true },
            ),
          );
        },
      },
    });
    const text = await (await post()).text();
    expect(aborted).toBe(true);
    expect(calls).toBe(1);
    const result = text
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(result.at(-1).type).toBe("error");
    expect(result.some((event) => event.type === "done")).toBe(false);
  });
  it("decodes split UTF-8 event chunks and returns only a complete validated plan", async () => {
    const bytes = new TextEncoder().encode(
      events()
        .map((event) => JSON.stringify(event))
        .join("\n") + "\n",
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            new ReadableStream({
              start(controller) {
                for (let i = 0; i < bytes.length; i += 17)
                  controller.enqueue(bytes.slice(i, i + 17));
                controller.close();
              },
            }),
            { headers: { "content-type": "application/x-ndjson" } },
          ),
      ),
    );
    expect(
      await extractLocalVisionBatches(
        longPanels,
        new AbortController().signal,
        () => {},
      ),
    ).toEqual(longBatches());
    const fetchOptions = vi.mocked(fetch).mock.calls[0][1];
    expect(fetchOptions?.signal?.aborted).toBe(false);
  });
  it.each([
    "missing-done",
    "missing-batch",
    "wrong-order",
    "wrong-photo",
    "error",
  ])("rejects an incomplete/untrusted stream: %s", async (kind) => {
    const value = events();
    if (kind === "missing-done") value.pop();
    if (kind === "missing-batch") value.splice(2, 1);
    if (kind === "wrong-order") Object.assign(value[1], { indices: [1, 2, 3] });
    if (kind === "wrong-photo")
      Object.assign(value[2], {
        receipt: {
          ...longDraft([0, 1, 2]),
          items: [{ ...longDraft([0]).items[0], sourcePhotos: [4] }],
        },
      });
    if (kind === "error")
      value.splice(3, 3, {
        type: "error",
        error: "Native inference failed",
      } as never);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            value.map((event) => JSON.stringify(event)).join("\n") + "\n",
            { headers: { "content-type": "application/x-ndjson" } },
          ),
      ),
    );
    await expect(
      extractLocalVisionBatches(
        longPanels,
        new AbortController().signal,
        () => {},
      ),
    ).rejects.toThrow();
  });
});
describe("physical source identity joins, independent of arithmetic", () => {
  it("retains the OCR alternative as well as both model tax-code alternatives", () => {
    const batches = longBatches(),
      recognition = longRecognition();
    batches[0].receipt.items[2].taxCode = "A";
    batches[1].receipt.items[0].taxCode = "B";
    recognition.panels[2].lines[0].text += " Z";
    recognition.panels[2].words[0].text += " Z";
    const result = joinVisionBatches(batches, longPanels, recognition);
    const check = result.receipt.reviewChecks.find(
      (check) =>
        check.scope === "item" &&
        check.itemId === result.receipt.items[2].id &&
        check.field === "taxCode",
    );
    expect(check?.reason).toBe("different");
    expect(check?.other).toContain("Z");
    expect(check?.other).toContain("A");
    expect(check?.other).toContain("B");
  });
  it("joins an overlapping Costco purchase/coupon pair and applies the printed deduction exactly once", () => {
    const recognition = longRecognition();
    const texts = [
      ["COSTCO UK", "Currency GBP"],
      ["EGGS", "11111 1x 2.00 2.00 Z"],
      [
        "CHICKEN SKEWERS",
        "10001 1x 10.00 10.00 Z",
        "IRC CHICKEN",
        "20002 1x 2.00 2.00-Z",
      ],
      [
        "TOTAL(INCL VAT) £10.00",
        "VAT Code Excl Vat VAT",
        "Z 0.00% 10.00 0.00",
        "TOTAL(EXCL VAT) 10.00",
        "VAT Amount 0.00",
      ],
    ];
    recognition.panels = recognition.panels.map((panel, index) => {
      const lines = texts[index].map((text, row) => ({
        text,
        confidence: 0.99,
        box: [0.1, (row + 0.1) / 7, 0.9, (row + 0.8) / 7] as [
          number,
          number,
          number,
          number,
        ],
      }));
      return { ...panel, lines, words: lines };
    });
    const item = (description: string, price: string, photo: number) => ({
      description,
      quantity: "1",
      unitPrice: price,
      lineTotal: price,
      discount: "0",
      taxCode: "Z",
      note: "",
      sourcePhotos: [photo],
    });
    const first = {
      ...longDraft([0]),
      merchant: "Costco",
      printedTotal: "",
      pricesIncludeTax: null,
      taxCodes: [],
      items: [
        item("EGGS", "2.00", 2),
        item("CHICKEN SKEWERS", "10.00", 3),
        item("IRC CHICKEN", "2.00", 3),
      ],
    };
    const second = {
      ...first,
      merchant: "",
      printedTotal: "10.00",
      subtotal: "10.00",
      printedTax: "0.00",
      pricesIncludeTax: false,
      taxCodes: [{ code: "Z", rate: "0" }],
      items: first.items.slice(1),
    };
    const result = joinVisionBatches(
      [
        { indices: [0, 1, 2], receipt: first },
        { indices: [2, 3], receipt: second },
      ],
      longPanels,
      recognition,
    );
    expect(result.batchJoin.joined).toBe(2);
    expect(result.receipt.items).toHaveLength(2);
    expect(result.receipt.items.map((item) => item.discount)).toEqual([
      "0",
      "2.00",
    ]);
    expect(calculateReceipt(result.receipt).total).toBe(1000n);
    expect(result.corrections).toHaveLength(1);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "discount", reason: "recovered" }),
    );
  });
  it("joins copies of the same printed row while retaining conflicting tax codes as mandatory checks", () => {
    const batches = longBatches();
    batches[1].receipt.items[0].taxCode = "A";
    const result = joinVisionBatches(batches, longPanels, longRecognition());
    expect(result.receipt.items).toHaveLength(6);
    expect(calculateReceipt(result.receipt).total).toBe(1950n);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "item",
        field: "taxCode",
        reason: "different",
        other: "No code / A",
      }),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({
        scope: "receipt",
        field: "taxCodes",
        reason: "different",
      }),
    );
    expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
  });
  it("joins the shared source row across all twelve distinct photos", () => {
    const panels = Array.from({ length: 12 }, (_, index) => ({
      photo: index + 1,
      part: 1,
      data: longPanels[0].data,
    }));
    const recognition = longRecognition();
    recognition.panels = panels.map((panel, index) => {
      const text = `Product ${index + 1} 1x 1.00 1.00`,
        line = {
          text,
          confidence: 0.99,
          box: [0.1, 0.1, 0.9, 0.18] as [number, number, number, number],
        };
      return {
        ...panel,
        width: 700,
        height: 700,
        lines: [line],
        words: [line],
      };
    });
    const batches = planVisionBatches(12).map((indices: number[]) => ({
      indices,
      receipt: {
        ...longDraft([0]),
        merchant: "",
        currency: "" as const,
        printedTotal: "",
        items: indices.map((index) => ({
          ...longDraft([0]).items[0],
          description: `Product ${index + 1}`,
          unitPrice: "1.00",
          lineTotal: "1.00",
          sourcePhotos: [index + 1],
        })),
      },
    }));
    for (const batch of batches) {
      const read = verifyIndependentReadings(batch.receipt, {
        ...recognition,
        panels: recognition.panels.filter((panel) =>
          batch.indices.includes(panel.photo - 1),
        ),
      });
      expect(
        read.itemAnchors.length,
        JSON.stringify(
          parseReceiptWithSources(read.text).receipt.items.map((item) => [
            item.description,
            item.quantity,
            item.unitPrice,
            item.lineTotal,
            item.taxCode,
          ]),
        ),
      ).toBe(batch.receipt.items.length);
      expect(
        read.itemAnchors.every((anchor) => anchor.reliable),
        JSON.stringify(read.receipt.reviewChecks),
      ).toBe(true);
    }
    const result = joinVisionBatches(batches, panels, recognition);
    expect(result.receipt.items).toHaveLength(12);
    expect(result.batchJoin.joined).toBe(5);
  });
  it("joins three shared-source copies but retains both actual identical chicken purchases", () => {
    const result = joinVisionBatches(
      longBatches(),
      longPanels,
      longRecognition(),
    );
    expect(result.batchJoin.joined).toBe(3);
    expect(result.receipt.items).toHaveLength(6);
    expect(
      result.receipt.items.filter((item) => item.description === "Chicken"),
    ).toHaveLength(2);
    expect(calculateReceipt(result.receipt).total).toBe(1950n);
    expect(result.receipt.reviewChecks).toEqual([
      expect.objectContaining({ field: "items", reason: "coverage" }),
    ]);
  });
  it.each(["unclear", "changed-price"])(
    "preserves ambiguous shared rows for human review: %s",
    (kind) => {
      const recognition = longRecognition(),
        batches = longBatches();
      if (kind === "unclear") recognition.panels[2].words[1].confidence = 0.6;
      else batches[1].receipt.items[1].lineTotal = "4.01";
      const result = joinVisionBatches(batches, longPanels, recognition);
      expect(result.receipt.items.length).toBeGreaterThan(6);
      expect(calculateReceipt(result.receipt).issues.length).toBeGreaterThan(0);
    },
  );
  it("does not select a balancing total or collapse identical-looking receipt charges", () => {
    const batches = longBatches();
    batches[0].receipt.printedTotal = "19.49";
    for (const batch of batches)
      batch.receipt.adjustments.push({
        label: "Service fee",
        kind: "fee",
        amount: "1.00",
      });
    const result = joinVisionBatches(batches, longPanels, longRecognition());
    expect(result.receipt.adjustments).toHaveLength(2);
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "printedTotal", reason: "different" }),
    );
    expect(result.receipt.reviewChecks).toContainEqual(
      expect.objectContaining({ field: "adjustments", reason: "different" }),
    );
  });
});
