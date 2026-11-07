import { beforeEach, describe, expect, it, vi } from "vitest";
const readers = vi.hoisted(() => ({ enhanced: vi.fn(), basic: vi.fn() }));
vi.mock("../src/lib/ocr", () => ({
  localOcrProvider: { extract: readers.basic },
}));
vi.mock("../src/lib/paddle-browser", () => ({
  enhancedOcrProvider: { extract: readers.enhanced },
  EnhancedReaderUnavailableError: class extends Error {},
}));
import { deviceOcrProvider } from "../src/lib/device-reader";
import { EnhancedReaderUnavailableError } from "../src/lib/paddle-browser";
import { chooseAssistedReader } from "../src/lib/scanner-policy";
beforeEach(() => {
  vi.resetAllMocks();
});
describe("one private device flow", () => {
  it("uses the stronger reading without running a second OCR pass", async () => {
    readers.enhanced.mockResolvedValue({
      text: "Quantity table",
      warnings: [],
    });
    expect(
      (
        await deviceOcrProvider.extract(
          [],
          new AbortController().signal,
          vi.fn(),
        )
      ).text,
    ).toBe("Quantity table");
    expect(readers.basic).not.toHaveBeenCalled();
  });
  it("falls back locally only when the stronger reader is unavailable before recognition", async () => {
    readers.enhanced.mockRejectedValue(new EnhancedReaderUnavailableError());
    readers.basic.mockResolvedValue({ text: "Compatibility reading" });
    const result = await deviceOcrProvider.extract(
      [],
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.text).toBe("Compatibility reading");
    expect(result.warnings?.[0]).toMatch(/compatibility reader/);
    expect(readers.basic).toHaveBeenCalledTimes(1);
  });
  it.each([new Error("Invalid image"), new Error("Recognition timed out")])(
    "does not hide %s or start an expensive second pass",
    async (error) => {
      readers.enhanced.mockRejectedValue(error);
      await expect(
        deviceOcrProvider.extract([], new AbortController().signal, vi.fn()),
      ).rejects.toBe(error);
      expect(readers.basic).not.toHaveBeenCalled();
    },
  );
  it("never continues a cancelled scan into the fallback", async () => {
    const controller = new AbortController();
    controller.abort();
    readers.enhanced.mockRejectedValue(new EnhancedReaderUnavailableError());
    await expect(
      deviceOcrProvider.extract([], controller.signal, vi.fn()),
    ).rejects.toBeInstanceOf(Error);
    expect(readers.basic).not.toHaveBeenCalled();
  });
});
describe("one optional helper", () => {
  it("honours a configured owner's helper preference without silently substituting another provider", () => {
    const config = {
      computer: { configured: true },
      azure: { configured: true, remaining: 1 },
    };
    expect(chooseAssistedReader(config, "azure")).toBe("azure");
    expect(chooseAssistedReader(config, "openai")).toBeUndefined();
  });
  it("prefers configured computer OCR while OpenAI stays last", () => {
    expect(
      chooseAssistedReader({
        computer: { configured: true },
        gemini: { configured: true },
        openai: { configured: true },
      }),
    ).toBe("computer");
    expect(
      chooseAssistedReader({
        gemini: { configured: true, remaining: 1 },
        openai: { configured: true },
      }),
    ).toBe("gemini");
  });
  it("does not offer exhausted, disabled or unknown helpers", () => {
    expect(
      chooseAssistedReader({
        gemini: { configured: true, remaining: 0 },
        computer: { configured: false },
        openai: null,
      }),
    ).toBeUndefined();
  });
  it("offers OpenAI only when it is configured and no earlier helper is available", () => {
    expect(
      chooseAssistedReader({ openai: { configured: true, remaining: 1 } }),
    ).toBe("openai");
  });
});
