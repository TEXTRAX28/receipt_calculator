import { afterEach, describe, expect, it, vi } from "vitest";
import { extractWithOpenAi, openaiConfiguration } from "../src/lib/openai";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import type { ReceiptImage } from "../src/lib/images";

const panels = [
  { photo: 1, part: 1, data: "offline_jpeg_1" },
  { photo: 2, part: 1, data: "offline_jpeg_2" },
];
vi.mock("../src/lib/panel-transport", () => ({
  panelsForImages: vi.fn(async () => panels),
}));
const images: ReceiptImage[] = panels.map(({ photo }) => ({
  id: String(photo),
  name: "Synthetic photo",
  url: "",
  blob: new Blob(),
}));
afterEach(() => vi.unstubAllGlobals());
describe("OpenAI client contract with fake transport", () => {
  it("only checks local configuration and receives public metadata", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            provider: "OpenAI",
            model: "gpt-6-astra",
            configured: false,
            remaining: 0,
            estimateGuardUsd: 0.6,
            availability: "missing-key",
          }),
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    expect(
      await openaiConfiguration(new AbortController().signal),
    ).toMatchObject({ configured: false, availability: "missing-key" });
    expect(fetcher.mock.calls).toHaveLength(1);
  });
  it("sends independent photos with explicit upload and credit intent and preserves returned money", async () => {
    const raw = aiCostcoDraft();
    const fetcher = vi.fn(
      async (_url: string, _options: RequestInit) =>
        new Response(JSON.stringify({ receipt: { ...raw, currency: "" } })),
    );
    vi.stubGlobal("fetch", fetcher);
    const receipt = await extractWithOpenAi(
      images,
      new AbortController().signal,
      () => {},
      { currency: "GBP" },
    );
    const [url, request] = fetcher.mock.calls[0];
    expect(url).toBe("./api/receipts/openai");
    expect(JSON.parse(String(request.body))).toEqual({
      consent: true,
      useCredits: true,
      panels,
    });
    expect(receipt.currencyUnresolved).toBe(false);
    expect(
      receipt.items.map((item) => [
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.discount,
      ]),
    ).toEqual(
      raw.items.map((item) => [
        item.quantity,
        item.unitPrice,
        item.lineTotal,
        item.discount,
      ]),
    );
    expect(
      receipt.warnings.some((warning) => warning.startsWith("OpenAI prepared")),
    ).toBe(true);
  });
  it("leaves missing currency unresolved without a user context", async () => {
    vi.stubGlobal(
      "fetch",
      async () =>
        new Response(
          JSON.stringify({ receipt: { ...aiCostcoDraft(), currency: "" } }),
        ),
    );
    expect(
      (await extractWithOpenAi(images, new AbortController().signal, () => {}))
        .currencyUnresolved,
    ).toBe(true);
  });
  it("retains a failure without automatic retry", async () => {
    const fetcher = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ error: "Attempt used. Choose another reader." }),
          { status: 429 },
        ),
    );
    vi.stubGlobal("fetch", fetcher);
    await expect(
      extractWithOpenAi([], new AbortController().signal, () => {}),
    ).rejects.toThrow("Attempt used");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("never posts an already-aborted scan", async () => {
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    controller.abort();
    await expect(
      extractWithOpenAi([], controller.signal, () => {}),
    ).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("does not accept a returned draft after cancellation", async () => {
    const controller = new AbortController();
    vi.stubGlobal("fetch", async () => {
      controller.abort();
      return new Response(JSON.stringify({ receipt: aiCostcoDraft() }));
    });
    await expect(
      extractWithOpenAi([], controller.signal, () => {}),
    ).rejects.toThrow(/cancelled/);
  });
  it("does not repair invalid financial strings into an accepted draft", async () => {
    const raw = aiCostcoDraft();
    raw.items[0].lineTotal = "unreadable";
    vi.stubGlobal(
      "fetch",
      async () => new Response(JSON.stringify({ receipt: raw })),
    );
    await expect(
      extractWithOpenAi([], new AbortController().signal, () => {}),
    ).rejects.toThrow(/invalid or incomplete/);
  });
});
