import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { enhancedOcrProvider } from "../src/lib/paddle-browser";
import { recognitionSchema } from "../src/lib/recognition-schema.mjs";
import { PHOTO_SEPARATOR } from "../src/lib/parser";
import fixture from "./fixtures/paddle-synthetic.json";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  predict: vi.fn(),
  terminate: vi.fn(),
  error: undefined as (() => void) | undefined,
  message: undefined as ((event: unknown) => void) | undefined,
}));
const image = {
  id: "test",
  name: "synthetic.png",
  url: "blob:synthetic",
  blob: new Blob(
    [readFileSync(new URL("./fixtures/paddle-synthetic.png", import.meta.url))],
    { type: "image/png" },
  ),
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.error = undefined;
  mocks.message = undefined;
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
  vi.stubGlobal(
    "Worker",
    class {
      terminate = mocks.terminate;
      addEventListener(name: string, callback: (event: unknown) => void) {
        if (name === "error") mocks.error = () => callback(undefined);
        if (name === "message") mocks.message = callback;
      }
      postMessage(request: { id: number; type: string; blob?: Blob }) {
        const job =
          request.type === "init"
            ? mocks.create()
            : mocks.predict(request.blob);
        void job
          .then((result: unknown) =>
            mocks.message?.({ data: { id: request.id, ok: true, result } }),
          )
          .catch(() =>
            mocks.message?.({ data: { id: request.id, ok: false } }),
          );
      }
    },
  );
  mocks.create.mockResolvedValue(undefined);
  mocks.predict.mockResolvedValue(fixture.reading);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("bounded enhanced browser provider", () => {
  it("uses only local assets, keeps actual regions, and owns worker cleanup", async () => {
    const result = await enhancedOcrProvider.extract(
      [image, image],
      new AbortController().signal,
      vi.fn(),
    );
    expect(result.recognition?.engine).toBe("paddle-ppocrv6-tiny-browser-wasm");
    expect(result.text).toContain(PHOTO_SEPARATOR);
    expect(result.recognition?.panels).toHaveLength(2);
    expect(result.recognition?.panels[0].words).toHaveLength(6);
    expect(result.recognition?.panels[0]).not.toHaveProperty("wordRows");
    expect(recognitionSchema.safeParse(result.recognition).success).toBe(false);
    expect(mocks.terminate).toHaveBeenCalled();
    for (const [url, options] of vi.mocked(fetch).mock.calls) {
      expect(new URL(String(url)).origin).toBe("http://127.0.0.1:4173");
      expect(options?.method).toBe("HEAD");
      expect(options?.body).toBeUndefined();
    }
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.predict).toHaveBeenCalledTimes(2);
  });
  it("rejects a missing-asset HTML fallback before SDK initialization", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("", { headers: { "content-type": "text/html" } }),
    );
    await expect(
      enhancedOcrProvider.extract(
        [image],
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow(/files are unavailable/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("rejects bad declared asset lengths before initialization", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response("", {
        headers: {
          "content-type": "application/javascript",
          "content-length": "1",
        },
      }),
    );
    await expect(
      enhancedOcrProvider.extract(
        [image],
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow(/files are unavailable/);
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("does not start an already cancelled scan", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      enhancedOcrProvider.extract([image], controller.signal, vi.fn()),
    ).rejects.toThrow(/cancelled/);
    expect(fetch).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("terminates its worker when cancelled during initialization", async () => {
    mocks.create.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const promise = enhancedOcrProvider.extract(
      [image],
      controller.signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    controller.abort();
    await expect(promise).rejects.toThrow(/cancelled/);
    expect(mocks.terminate).toHaveBeenCalled();
    expect(mocks.predict).not.toHaveBeenCalled();
  });
  it("terminates its worker when cancelled during prediction, preserving inputs", async () => {
    mocks.predict.mockImplementation(() => new Promise(() => {}));
    const controller = new AbortController();
    const promise = enhancedOcrProvider.extract(
      [image],
      controller.signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(mocks.predict).toHaveBeenCalled());
    controller.abort();
    await expect(promise).rejects.toThrow(/cancelled/);
    expect(mocks.terminate).toHaveBeenCalled();
    expect(image.url).toBe("blob:synthetic");
  });
  it("bounds a stuck prediction to 120 seconds", async () => {
    vi.useFakeTimers();
    mocks.predict.mockImplementation(() => new Promise(() => {}));
    const promise = enhancedOcrProvider.extract(
      [image],
      new AbortController().signal,
      vi.fn(),
    );
    const rejected = expect(promise).rejects.toThrow(/longer than 120 seconds/);
    await vi.advanceTimersByTimeAsync(120000);
    await rejected;
    expect(mocks.terminate).toHaveBeenCalled();
  });
  it("handles an owned worker crash without clearing the draft", async () => {
    mocks.predict.mockImplementation(() => new Promise(() => {}));
    const promise = enhancedOcrProvider.extract(
      [image],
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(mocks.predict).toHaveBeenCalled());
    mocks.error?.();
    await expect(promise).rejects.toThrow(/stopped unexpectedly/);
    expect(mocks.terminate).toHaveBeenCalled();
    expect(image.url).toBe("blob:synthetic");
  });
  it("rejects invalid geometry and still releases the worker", async () => {
    mocks.predict.mockResolvedValue([
      { ...fixture.reading[0], image: { width: 701, height: 600 } },
    ]);
    await expect(
      enhancedOcrProvider.extract(
        [image],
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow(/could not read/);
    expect(mocks.terminate).toHaveBeenCalled();
  });
  it("rejects an unrelated worker response and terminates instead of using its data", async () => {
    mocks.predict.mockImplementation(() => new Promise(() => {}));
    const promise = enhancedOcrProvider.extract(
      [image],
      new AbortController().signal,
      vi.fn(),
    );
    await vi.waitFor(() => expect(mocks.predict).toHaveBeenCalled());
    mocks.message?.({ data: { id: 999, ok: true, result: fixture.reading } });
    await expect(promise).rejects.toThrow(/invalid response/);
    expect(mocks.terminate).toHaveBeenCalled();
  });
});
