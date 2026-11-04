import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

const state = vi.hoisted(() => ({
  manifest: {} as Record<
    string,
    { files: { path: string; bytes: number; sha256: string }[] }
  >,
  reads: [] as number[],
  closed: [] as number[],
  failRead: false,
  shortFirst: false,
  stopAfterFirst: false,
  growOnFirst: "",
}));
vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    readFileSync(path: string | URL) {
      if (
        path instanceof URL &&
        path.pathname.endsWith("/local-model-manifest.json")
      )
        return JSON.stringify(state.manifest);
      return actual.readFileSync(path);
    },
    readSync(
      fd: number,
      buffer: Buffer,
      offset: number,
      length: number,
      position: number | null,
    ) {
      state.reads.push(length);
      if (state.failRead) throw new Error("test read failure");
      if (state.stopAfterFirst && state.reads.length > 1) return 0;
      const count = actual.readSync(
        fd,
        buffer,
        offset,
        state.shortFirst && state.reads.length === 1 ? 17 : length,
        position,
      );
      if (state.growOnFirst && state.reads.length === 1)
        actual.appendFileSync(state.growOnFirst, "x");
      return count;
    },
    closeSync(fd: number) {
      state.closed.push(fd);
      return actual.closeSync(fd);
    },
  };
});

const base = resolve("qa-artifacts/model-cache-tests");
let root: string;
let payload: Buffer;
let verify: (engine: string, cacheRoot: string) => boolean;

beforeEach(async () => {
  vi.resetModules();
  Object.assign(state, {
    reads: [],
    closed: [],
    failRead: false,
    shortFirst: false,
    stopAfterFirst: false,
    growOnFirst: "",
  });
  await mkdir(base, { recursive: true });
  root = await mkdtemp(resolve(base, "cache-"));
  payload = Buffer.alloc(256 * 1024 + 17);
  for (let i = 0; i < payload.length; i++)
    payload[i] = (i * 31 + (i >>> 3)) & 255;
  await writeFile(resolve(root, "model.onnx"), payload);
  state.manifest = {
    "paddle-v6": {
      files: [
        {
          path: "model.onnx",
          bytes: payload.length,
          sha256: createHash("sha256").update(payload).digest("hex"),
        },
      ],
    },
  };
  verify = (await import("../server/local-ocr.mjs")).verifiedModelCache;
});
afterEach(async () => {
  const actual = await realpath(root);
  const inside = relative(await realpath(base), actual);
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Unsafe model-cache test cleanup");
  await rm(actual, { recursive: true, force: true });
});

describe("bounded model-cache integrity verification", () => {
  it("verifies the full native digest through bounded reads, including the final tail", () => {
    expect(verify("paddle-v6", root)).toBe(true);
    expect(state.reads.length).toBeGreaterThan(4);
    expect(Math.max(...state.reads)).toBeLessThanOrEqual(128 * 1024);
    expect(state.closed).toHaveLength(1);
  });
  it("handles short filesystem reads without hashing stale buffer bytes", () => {
    state.shortFirst = true;
    expect(verify("paddle-v6", root)).toBe(true);
  });
  it("rejects changed bytes even when the file size still matches", async () => {
    payload[100] ^= 255;
    await writeFile(resolve(root, "model.onnx"), payload);
    expect(verify("paddle-v6", root)).toBe(false);
    expect(state.closed).toHaveLength(1);
  });
  it("rejects a different file size before reading its contents", async () => {
    await writeFile(resolve(root, "model.onnx"), payload.subarray(0, -1));
    expect(verify("paddle-v6", root)).toBe(false);
    expect(state.reads).toHaveLength(0);
    expect(state.closed).toHaveLength(1);
  });
  it("rejects a missing model", async () => {
    await rm(resolve(root, "model.onnx"));
    expect(verify("paddle-v6", root)).toBe(false);
  });
  it("rejects an unknown engine without opening model files", () => {
    expect(verify("unknown", root)).toBe(false);
    expect(state.reads).toHaveLength(0);
    expect(state.closed).toHaveLength(0);
  });
  it("closes the descriptor after a read error", async () => {
    state.failRead = true;
    expect(verify("paddle-v6", root)).toBe(false);
    expect(state.closed).toHaveLength(1);
    const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
    expect(() => actual.fstatSync(state.closed[0])).toThrow();
  });
  it("rejects early EOF instead of accepting a partial digest", () => {
    state.stopAfterFirst = true;
    expect(verify("paddle-v6", root)).toBe(false);
    expect(state.closed).toHaveLength(1);
  });
  it("bounds a file that grows during verification", () => {
    state.growOnFirst = resolve(root, "model.onnx");
    expect(verify("paddle-v6", root)).toBe(false);
    expect(state.closed).toHaveLength(1);
  });
});
