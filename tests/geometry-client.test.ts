import { afterEach, describe, expect, it, vi } from "vitest";
import { straightenImage } from "../src/lib/geometry-client";
import { rectangleQuad } from "../src/lib/image-geometry";
import type { ReceiptImage } from "../src/lib/images";

function setup() {
  vi.useFakeTimers();
  vi.stubGlobal("OffscreenCanvas", function () {});
  vi.stubGlobal("createImageBitmap", function () {});
  class WorkerStub {
    static instances: WorkerStub[] = [];
    onmessage?: (event: MessageEvent) => void;
    onerror?: () => void;
    postMessage = vi.fn();
    terminate = vi.fn();
    constructor() {
      WorkerStub.instances.push(this);
    }
  }
  vi.stubGlobal("Worker", WorkerStub);
  const blob = new Blob(["unchanged preview"]),
    sourceBlob = new Blob(["original native source"]);
  const image = { blob, sourceBlob } as ReceiptImage,
    controller = new AbortController();
  const run = () =>
    straightenImage(
      image,
      { turns: 0, corners: rectangleQuad() },
      controller.signal,
    );
  return { WorkerStub, image, controller, run };
}
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("owned geometry worker lifetime", () => {
  it.each(["OffscreenCanvas", "createImageBitmap"])(
    "keeps the source and starts no worker when %s is unavailable",
    async (missing) => {
      const s = setup();
      vi.stubGlobal(missing, undefined);
      await expect(s.run()).rejects.toThrow(
        "Photo correction is unavailable in this browser. Use trimming or take a flatter photo.",
      );
      expect(s.WorkerStub.instances).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
      expect(await s.image.sourceBlob!.text()).toBe("original native source");
    },
  );
  it("does not start a worker for an already cancelled correction", async () => {
    const s = setup();
    s.controller.abort();
    await expect(s.run()).rejects.toMatchObject({ name: "AbortError" });
    expect(s.WorkerStub.instances).toHaveLength(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("sends native original bytes and terminates exactly once after success", async () => {
    const s = setup(),
      promise = s.run(),
      worker = s.WorkerStub.instances[0];
    expect(worker.postMessage.mock.calls[0][0].blob).toBe(s.image.sourceBlob);
    const output = {
      preview: new Blob(["corrected"], { type: "image/jpeg" }),
      width: 800,
      height: 1200,
      quality: { flags: [] },
    };
    worker.onmessage!({ data: output } as MessageEvent);
    expect(await promise).toBe(output);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("terminates on cancellation and ignores a late success", async () => {
    const s = setup(),
      pending = expect(s.run()).rejects.toMatchObject({ name: "AbortError" }),
      worker = s.WorkerStub.instances[0];
    s.controller.abort();
    await pending;
    worker.onmessage!({
      data: { preview: new Blob(["late"]), width: 800, height: 1200 },
    } as MessageEvent);
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("bounds a stalled worker and ignores later errors", async () => {
    const s = setup(),
      pending = expect(s.run()).rejects.toThrow(/too long/),
      worker = s.WorkerStub.instances[0];
    await vi.advanceTimersByTimeAsync(30000);
    await pending;
    worker.onerror!();
    expect(worker.terminate).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["error", "invalid"])(
    "leaves the source usable after %s output",
    async (kind) => {
      const s = setup(),
        promise = s.run(),
        pending = expect(promise).rejects.toThrow();
      s.WorkerStub.instances[0].onmessage!({
        data:
          kind === "error"
            ? { error: "Unsupported canvas" }
            : { preview: new Blob(["x"]), width: 100000, height: 100000 },
      } as MessageEvent);
      await pending;
      expect(s.WorkerStub.instances[0].terminate).toHaveBeenCalledTimes(1);
      expect(await s.image.sourceBlob!.text()).toBe("original native source");
    },
  );
});
