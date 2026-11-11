import { describe, it, expect, vi, afterEach } from "vitest";
import { newItem } from "../src/lib/model";
import type { ExtractionProvider } from "../src/lib/ocr";
import { localOcrProvider } from "../src/lib/ocr";
import { enhancedOcrProvider } from "../src/lib/paddle-browser";
import {
  supportedNameRepair,
  rereadUncertainNames,
} from "../src/lib/name-reread";
import { parseReceiptWithSources } from "../src/lib/parser";
type Output = Awaited<ReturnType<ExtractionProvider["extract"]>>;
function observation(
  text: string,
  words: { text: string; confidence: number }[],
  engine: NonNullable<
    Output["recognition"]
  >["engine"] = "paddle-ppocrv6-tiny-browser-wasm",
): Output {
  return {
    text,
    recognition: {
      engine,
      panels: [
        {
          photo: 1,
          part: 1,
          width: 100,
          height: 100,
          words: words.map((word) => ({ ...word, box: [0.1, 0.1, 0.8, 0.2] })),
          lines: [{ text, confidence: 0.95, box: [0.1, 0.1, 0.8, 0.2] }],
        },
      ],
    },
  };
}
const item = () => ({
  ...newItem(),
  description: "Cald Udon",
  quantity: "1",
  lineTotal: "6.50",
});
const primary = () =>
  observation("1 cold Udon 6.50", [
    { text: "1 cold Udon", confidence: 0.81 },
    { text: "6.50", confidence: 0.99 },
  ]);
const independent = () =>
  observation(
    "1 Cold Udon noisy footer",
    [
      { text: "1", confidence: 0.88 },
      { text: "Cold", confidence: 0.95 },
      { text: "Udon", confidence: 0.75 },
      { text: "noise", confidence: 0.1 },
    ],
    "tesseract-js-6-eng",
  );
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("source-supported name repairs", () => {
  it("accepts one letter supported by independent source readings, preserving case", () => {
    expect(supportedNameRepair(item(), primary(), independent())).toBe(
      "Cold Udon",
    );
  });
  it.each([
    "changed price",
    "changed count",
    "no agreement",
    "weak word",
    "weak crop",
    "several letters",
    "incomplete name",
  ])("retains the original with %s", (kind) => {
    const row = item(),
      first = primary(),
      second = independent();
    if (kind === "changed price") first.text = "1 cold Udon 8.50";
    if (kind === "changed count") first.text = "2 cold Udon 6.50";
    if (kind === "no agreement")
      second.recognition!.panels[0].words[1].text = "Cald";
    if (kind === "weak word")
      second.recognition!.panels[0].words[1].confidence = 0.45;
    if (kind === "weak crop")
      first.recognition!.panels[0].words[0].confidence = 0.4;
    if (kind === "several letters") row.description = "Hard Udon";
    if (kind === "incomplete name")
      (second.recognition!.panels[0].words.pop(),
        second.recognition!.panels[0].words.pop());
    expect(supportedNameRepair(row, first, second)).toBeNull();
  });
  it("does not rewrite accent-bearing or numbered product names", () => {
    for (const name of ["Càld Udon", "2 Pack Rolls"]) {
      expect(
        supportedNameRepair(
          { ...item(), description: name },
          primary(),
          independent(),
        ),
      ).toBeNull();
    }
  });
  it("does not treat a single model's high score as independent support", () => {
    const output = independent();
    output.recognition!.panels[0].words = [];
    expect(supportedNameRepair(item(), primary(), output)).toBeNull();
  });
});
function fixture() {
  const parsed = parseReceiptWithSources(
    "GBP\nQty Dish Amount\n1 Cald Udon 6.50\nTotal 6.50",
  );
  parsed.sources[parsed.receipt.items[0].id] = [0];
  const output = observation("1 Cald Udon 6.50", [
    { text: "1 Cald Udon", confidence: 0.92 },
  ]);
  output.sourceLines = [
    {
      text: output.text,
      photo: 1,
      part: 1,
      confidence: 0.92,
      box: [0.1, 0.1, 0.8, 0.2],
    },
  ];
  const images = [
    {
      id: "photo",
      name: "Receipt",
      blob: new Blob(["test"]),
      url: "blob:test",
    },
  ];
  return { parsed, output, images };
}
function canvasRuntime() {
  vi.stubGlobal("createImageBitmap", async () => ({
    width: 100,
    height: 100,
    close: vi.fn(),
  }));
  vi.stubGlobal("document", {
    createElement: () => ({
      width: 0,
      height: 0,
      getContext: () => ({
        fillStyle: "",
        fillRect: () => {},
        drawImage: () => {},
      }),
      toBlob: (done: (blob: Blob) => void) => done(new Blob(["crop"])),
    }),
  });
}
describe("bounded optional local name reading", () => {
  it("can check a name fragment that also contains a printed price column", async () => {
    canvasRuntime();
    const { parsed, output, images } = fixture();
    output.recognition!.panels[0].words[0].text = "1 Cald Udon 6.50";
    vi.spyOn(enhancedOcrProvider, "extract").mockResolvedValue(primary());
    vi.spyOn(localOcrProvider, "extract").mockResolvedValue(independent());
    const result = await rereadUncertainNames(
      parsed,
      output,
      images,
      new AbortController().signal,
      () => {},
    );
    expect(result.receipt.items[0]).toMatchObject({
      description: "Cold Udon",
      lineTotal: "6.50",
    });
  });
  it("keeps money/counts and the original name while storing an agreed correction", async () => {
    canvasRuntime();
    const { parsed, output, images } = fixture();
    const first = vi
      .spyOn(enhancedOcrProvider, "extract")
      .mockResolvedValue(primary());
    const second = vi
      .spyOn(localOcrProvider, "extract")
      .mockResolvedValue(independent());
    const release = vi.spyOn(URL, "revokeObjectURL");
    const result = await rereadUncertainNames(
      parsed,
      output,
      images,
      new AbortController().signal,
      () => {},
    );
    expect(result.receipt.items[0]).toMatchObject({
      description: "Cold Udon",
      observedDescription: "Cald Udon",
      quantity: "1",
      lineTotal: "6.50",
    });
    expect(parsed.receipt.items[0].description).toBe("Cald Udon");
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledTimes(2);
  });
  it("preserves the first draft when optional assets are unavailable", async () => {
    canvasRuntime();
    const { parsed, output, images } = fixture();
    vi.spyOn(enhancedOcrProvider, "extract").mockRejectedValue(
      new Error("missing optional assets"),
    );
    const second = vi.spyOn(localOcrProvider, "extract");
    expect(
      await rereadUncertainNames(
        parsed,
        output,
        images,
        new AbortController().signal,
        () => {},
      ),
    ).toBe(parsed);
    expect(second).not.toHaveBeenCalled();
  });
  it("stops the optional pass at its deadline, with no retry or loss of the first draft", async () => {
    vi.useFakeTimers();
    canvasRuntime();
    const { parsed, output, images } = fixture();
    vi.spyOn(enhancedOcrProvider, "extract").mockImplementation(
      async (_, signal) =>
        new Promise((_, reject) =>
          signal.addEventListener(
            "abort",
            () => reject(new Error("deadline")),
            { once: true },
          ),
        ),
    );
    const second = vi.spyOn(localOcrProvider, "extract");
    const result = rereadUncertainNames(
      parsed,
      output,
      images,
      new AbortController().signal,
      () => {},
    );
    await vi.advanceTimersByTimeAsync(8100);
    expect(await result).toBe(parsed);
    expect(second).not.toHaveBeenCalled();
  });
  it("honours explicit cancellation rather than accepting a partial result", async () => {
    const { parsed, output, images } = fixture(),
      controller = new AbortController();
    controller.abort();
    await expect(
      rereadUncertainNames(parsed, output, images, controller.signal, () => {}),
    ).rejects.toThrow();
  });
  it("uses no extra panels once the original receipt reaches its budget", async () => {
    const { parsed, output, images } = fixture();
    output.recognition!.panels = Array.from(
      { length: 24 },
      () => output.recognition!.panels[0],
    );
    expect(
      await rereadUncertainNames(
        parsed,
        output,
        images,
        new AbortController().signal,
        () => {},
      ),
    ).toBe(parsed);
  });
});
