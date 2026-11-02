import { readFileSync } from "node:fs";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import fixture from "./fixtures/paddle-synthetic.json";
const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  predict: vi.fn(),
  mat: vi.fn(),
  deleted: vi.fn(),
  closed: vi.fn(),
  pixels: { width: 700, height: 600, data: new Uint8ClampedArray(0) },
}));
vi.mock("@paddleocr/paddleocr-js", () => ({
  PaddleOCR: { create: mocks.create },
}));
vi.mock("@techstark/opencv-js", () => ({
  default: { matFromImageData: mocks.mat },
}));
const blob = new Blob(
  [readFileSync(new URL("./fixtures/paddle-synthetic.png", import.meta.url))],
  { type: "image/png" },
);
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubGlobal("location", { origin: "http://127.0.0.1:4173" });
  mocks.create.mockResolvedValue({ predict: mocks.predict });
  mocks.predict.mockResolvedValue(fixture.reading);
  mocks.mat.mockReturnValue({ delete: mocks.deleted });
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(async () => ({ width: 700, height: 600, close: mocks.closed })),
  );
  vi.stubGlobal(
    "OffscreenCanvas",
    class {
      width: number;
      height: number;
      constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
      }
      getContext() {
        return { drawImage: vi.fn(), getImageData: () => mocks.pixels };
      }
    },
  );
});
afterEach(() => vi.unstubAllGlobals());
describe("isolated enhanced worker protocol", () => {
  it("initializes only pinned local WASM models and reads unchanged image bytes", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    expect(await processPaddleMessage({ id: 1, type: "init" })).toEqual({
      id: 1,
      ok: true,
    });
    const options = mocks.create.mock.calls[0][0];
    expect(options.worker).toBe(false);
    expect(options.ortOptions).toMatchObject({
      backend: "wasm",
      numThreads: 1,
      wasmPaths: "http://127.0.0.1:4173/ocr-enhanced/",
    });
    expect(options.textDetectionModelAsset.url).toBe(
      "http://127.0.0.1:4173/ocr-enhanced/det.tar",
    );
    expect(options.textRecognitionModelAsset.url).toBe(
      "http://127.0.0.1:4173/ocr-enhanced/rec.tar",
    );
    expect(await processPaddleMessage({ id: 2, type: "read", blob })).toEqual({
      id: 2,
      ok: true,
      result: fixture.reading,
    });
    expect(createImageBitmap).toHaveBeenCalledWith(blob);
    expect(mocks.mat).toHaveBeenCalledWith(mocks.pixels);
    expect(mocks.predict).toHaveBeenCalledWith(
      mocks.mat.mock.results[0].value,
      {
        textDetLimitSideLen: 960,
        textDetLimitType: "max",
      },
    );
    expect(mocks.deleted).toHaveBeenCalledTimes(1);
    expect(mocks.closed).toHaveBeenCalledTimes(1);
  });
  it("ignores invalid envelopes and cannot read before initialization", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    for (const input of [
      null,
      "instructions",
      { id: -1, type: "init" },
      { id: 26, type: "init" },
      { id: 1.1, type: "init" },
    ])
      expect(await processPaddleMessage(input)).toBeNull();
    expect(await processPaddleMessage({ id: 1, type: "read", blob })).toEqual({
      id: 1,
      ok: false,
    });
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.predict).not.toHaveBeenCalled();
  });
  it("rejects a second initialization or simultaneous work", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    await processPaddleMessage({ id: 1, type: "init" });
    expect(await processPaddleMessage({ id: 2, type: "init" })).toEqual({
      id: 2,
      ok: false,
    });
    let done!: (value: unknown) => void;
    mocks.predict.mockImplementation(
      () =>
        new Promise((resolve) => {
          done = resolve;
        }),
    );
    const reading = processPaddleMessage({ id: 2, type: "read", blob });
    await vi.waitFor(() => expect(mocks.predict).toHaveBeenCalled());
    expect(await processPaddleMessage({ id: 3, type: "read", blob })).toEqual({
      id: 3,
      ok: false,
    });
    done(fixture.reading);
    await reading;
  });
  it("bounds bytes and geometry before model prediction", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    await processPaddleMessage({ id: 1, type: "init" });
    expect(
      await processPaddleMessage({ id: 2, type: "read", blob: "not a Blob" }),
    ).toEqual({ id: 2, ok: false });
    expect(
      await processPaddleMessage({
        id: 2,
        type: "read",
        blob: new Blob([new Uint8Array(12 * 1024 ** 2 + 1)]),
      }),
    ).toEqual({ id: 2, ok: false });
    const data = new Uint8Array(await blob.arrayBuffer());
    new DataView(data.buffer).setUint32(16, 2001);
    new DataView(data.buffer).setUint32(20, 2000);
    expect(
      await processPaddleMessage({
        id: 2,
        type: "read",
        blob: new Blob([data], { type: "image/png" }),
      }),
    ).toEqual({ id: 2, ok: false });
    expect(mocks.predict).not.toHaveBeenCalled();
  });
  it("returns no library error or receipt content across failures", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    mocks.create.mockRejectedValue(new Error("PRIVATE SOURCE TEXT"));
    expect(await processPaddleMessage({ id: 1, type: "init" })).toEqual({
      id: 1,
      ok: false,
    });
  });
  it("rejects decoder/header mismatches and closes the bitmap", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    await processPaddleMessage({ id: 1, type: "init" });
    vi.mocked(createImageBitmap).mockResolvedValue({
      width: 701,
      height: 600,
      close: mocks.closed,
    } as unknown as ImageBitmap);
    expect(await processPaddleMessage({ id: 2, type: "read", blob })).toEqual({
      id: 2,
      ok: false,
    });
    expect(mocks.closed).toHaveBeenCalled();
    expect(mocks.mat).not.toHaveBeenCalled();
  });
  it("frees the matrix and bitmap after model failure", async () => {
    const { processPaddleMessage } = await import("../src/lib/paddle.worker");
    await processPaddleMessage({ id: 1, type: "init" });
    mocks.predict.mockRejectedValue(new Error("PRIVATE SOURCE TEXT"));
    expect(await processPaddleMessage({ id: 2, type: "read", blob })).toEqual({
      id: 2,
      ok: false,
    });
    expect(mocks.deleted).toHaveBeenCalled();
    expect(mocks.closed).toHaveBeenCalled();
  });
});
