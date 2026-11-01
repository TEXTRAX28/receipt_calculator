import { afterEach, describe, expect, it, vi } from "vitest";
import { suggestReceiptEdges } from "../src/lib/edge-preview";

function setup() {
  vi.useFakeTimers();
  const bitmap = { width: 500, height: 1000, close: vi.fn() };
  const decode = vi.fn().mockResolvedValue(bitmap);
  class TestWorker {
    static instances: TestWorker[] = [];
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      TestWorker.instances.push(this);
    }
  }
  vi.stubGlobal("createImageBitmap", decode);
  vi.stubGlobal("Worker", TestWorker);
  vi.stubGlobal("document", {
    createElement: () => {
      const canvas = {
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          fillRect: vi.fn(),
          drawImage: vi.fn(),
          getImageData: () => ({
            width: canvas.width,
            height: canvas.height,
            data: new Uint8ClampedArray(canvas.width * canvas.height * 4).fill(
              255,
            ),
          }),
        }),
      };
      return canvas;
    },
  });
  const controller = new AbortController();
  const run = () =>
    suggestReceiptEdges(new Blob(["synthetic preview"]), controller.signal);
  return { bitmap, decode, TestWorker, controller, run };
}

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("owned edge-preview resource lifetime", () => {
  it("does not decode an already cancelled request", async () => {
    const s = setup();
    s.controller.abort();
    await expect(s.run()).rejects.toMatchObject({ name: "AbortError" });
    expect(s.decode).not.toHaveBeenCalled();
    expect(s.TestWorker.instances).toHaveLength(0);
  });

  it("closes a late decode after cancellation without starting a worker", async () => {
    const s = setup();
    let resolve!: (value: typeof s.bitmap) => void;
    s.decode.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = expect(s.run()).rejects.toMatchObject({
      name: "AbortError",
    });
    s.controller.abort();
    await pending;
    resolve(s.bitmap);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.bitmap.close).toHaveBeenCalledTimes(1);
    expect(s.TestWorker.instances).toHaveLength(0);
  });

  it("terminates a running owned worker when cancelled", async () => {
    const s = setup();
    const pending = expect(s.run()).rejects.toMatchObject({
      name: "AbortError",
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(s.TestWorker.instances).toHaveLength(1);
    expect(s.bitmap.close).toHaveBeenCalledTimes(1);
    s.controller.abort();
    await pending;
    expect(s.TestWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled worker and rejects its later response", async () => {
    const s = setup();
    const pending = expect(s.run()).rejects.toThrow("Edge search timed out");
    await vi.advanceTimersByTimeAsync(0);
    const worker = s.TestWorker.instances[0];
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    worker.onmessage!({
      data: {
        result: {
          bounds: { left: 40, right: 40, top: 40, bottom: 40 },
          axes: [],
        },
      },
    } as MessageEvent);
    expect(vi.getTimerCount()).toBe(0);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("bounds a stalled decode and closes its eventual bitmap", async () => {
    const s = setup();
    let resolve!: (value: typeof s.bitmap) => void;
    s.decode.mockReturnValue(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = expect(s.run()).rejects.toThrow("Edge search timed out");
    await vi.advanceTimersByTimeAsync(5000);
    await pending;
    resolve(s.bitmap);
    await vi.advanceTimersByTimeAsync(0);
    expect(s.bitmap.close).toHaveBeenCalledTimes(1);
    expect(s.TestWorker.instances).toHaveLength(0);
  });

  it("cleans up a successful abstention and removes its deadline", async () => {
    const s = setup();
    const pending = s.run();
    await vi.advanceTimersByTimeAsync(0);
    const worker = s.TestWorker.instances[0];
    worker.onmessage!({ data: { result: null } } as MessageEvent);
    await expect(pending).resolves.toBeNull();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    s.controller.abort();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it("rejects an oversized preview and closes it before starting a worker", async () => {
    const s = setup();
    s.bitmap.width = s.bitmap.height = 10000;
    await expect(s.run()).rejects.toThrow("Adjust the frame manually");
    expect(s.bitmap.close).toHaveBeenCalledTimes(1);
    expect(s.TestWorker.instances).toHaveLength(0);
  });
});
