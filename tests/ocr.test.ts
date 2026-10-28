import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { localOcrProvider } from "../src/lib/ocr";
import type { ReceiptImage } from "../src/lib/images";
import { PHOTO_SEPARATOR } from "../src/lib/parser";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  recognize: vi.fn(),
  terminate: vi.fn(),
  parameters: vi.fn(),
}));
vi.mock("tesseract.js", () => ({
  createWorker: mocks.create,
  PSM: { SINGLE_BLOCK: "6" },
}));
const image: ReceiptImage = {
  id: "test",
  name: "receipt.png",
  url: "blob:test",
  blob: new Blob(["test"]),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.create.mockResolvedValue({
    recognize: mocks.recognize,
    terminate: mocks.terminate,
    setParameters: mocks.parameters,
  });
  mocks.recognize.mockResolvedValue({
    data: { text: "TEST SHOP\nMilk 1x 2.50 2.50\nTOTAL 2.50" },
  });
  mocks.terminate.mockResolvedValue(undefined);
  mocks.parameters.mockResolvedValue(undefined);
  vi.stubGlobal("location", { origin: "http://127.0.0.1:4173" });
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response("", {
          headers: { "content-type": "application/javascript" },
        }),
    ),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("bounded, replaceable local extraction provider", () => {
  it("uses only same-origin assets and validates recognized text", async () => {
    const result = await localOcrProvider.extract(
      [image],
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.text).toContain("Milk");
    expect(mocks.terminate).toHaveBeenCalled();
    const options = mocks.create.mock.calls[0][2];
    expect(options.workerPath).toBe("http://127.0.0.1:4173/ocr/worker.min.js");
    expect(options.langPath).toBe("http://127.0.0.1:4173/ocr");
  });
  it("keeps image boundaries explicit", async () => {
    const result = await localOcrProvider.extract(
      [image, image],
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.text).toContain(PHOTO_SEPARATOR);
    expect(mocks.recognize).toHaveBeenCalledTimes(2);
  });
  it("rejects malformed OCR output", async () => {
    mocks.recognize.mockResolvedValue({
      data: { text: { instructions: "do something" } },
    });
    await expect(
      localOcrProvider.extract([image], new AbortController().signal, vi.fn()),
    ).rejects.toThrow();
    expect(mocks.terminate).toHaveBeenCalled();
  });
  it("fails promptly for network and missing-asset errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("Network failure")),
    );
    await expect(
      localOcrProvider.extract([image], new AbortController().signal, vi.fn()),
    ).rejects.toThrow(/assets are unavailable/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects a fake JavaScript asset returning HTML", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response("<html>", { headers: { "content-type": "text/html" } }),
      ),
    );
    await expect(
      localOcrProvider.extract([image], new AbortController().signal, vi.fn()),
    ).rejects.toThrow(/assets are unavailable/);
  });
  it("normalizes a provider rejecting with undefined into a useful error", async () => {
    mocks.create.mockRejectedValue(undefined);
    await expect(
      localOcrProvider.extract([image], new AbortController().signal, vi.fn()),
    ).rejects.toThrow(/could not start/);
  });
  it("cancels a running extraction and terminates the worker", async () => {
    mocks.recognize.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const work = localOcrProvider.extract([image], controller.signal, vi.fn());
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
    const rejected = expect(work).rejects.toThrow(/cancelled/);
    controller.abort();
    await rejected;
    expect(mocks.terminate).toHaveBeenCalled();
  });
  it("bounds a stalled extraction to 120 seconds", async () => {
    vi.useFakeTimers();
    mocks.recognize.mockImplementation(() => new Promise(() => {}));
    const work = localOcrProvider.extract(
      [image],
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(mocks.recognize).toHaveBeenCalled());
    const rejected = expect(work).rejects.toThrow(/120 seconds/);
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    expect(mocks.terminate).toHaveBeenCalled();
  });
  it("enforces image batch and combined output bounds", async () => {
    await expect(
      localOcrProvider.extract([], new AbortController().signal, vi.fn()),
    ).rejects.toThrow();
    await expect(
      localOcrProvider.extract(
        [image, image, image, image],
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow();
    mocks.recognize.mockResolvedValue({ data: { text: "x".repeat(30000) } });
    await expect(
      localOcrProvider.extract(
        [image, image, image],
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow();
  });
});
