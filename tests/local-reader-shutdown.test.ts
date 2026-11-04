import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createLocalModelReader } from "../server/local-ocr.mjs";

// No native command or real PID is used: both process-launch exports are mocked.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("Native spawning is forbidden in this test");
  }),
  execFile: vi.fn(
    (
      _program: unknown,
      _args: unknown,
      _options: unknown,
      callback: (error: Error) => void,
    ) => {
      queueMicrotask(() =>
        callback(new Error("Controlled termination failure")),
      );
      return {};
    },
  ),
}));

const base = resolve("qa-artifacts/worker-shutdown-tests");
const roots: string[] = [];
const models: ReturnType<typeof createLocalModelReader>[] = [];
const workers: VirtualWorker[] = [];
const panels = [
  {
    photo: 1,
    part: 1,
    data: Buffer.from([255, 216, 255, 224, 0, 0, 0, 0]).toString("base64"),
  },
];

class VirtualWorker extends EventEmitter {
  pid = 424242; // A virtual identifier. It cannot reach an OS termination function.
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new PassThrough();
  kill = vi.fn(() => false);
  requestStarted: Promise<void>;
  private acceptRequest!: () => void;
  private closed = false;
  constructor(private respond = true) {
    super();
    this.requestStarted = new Promise((done) => {
      this.acceptRequest = done;
    });
  }
  stdin = new Writable({
    write: (chunk, _encoding, done) => {
      const request = JSON.parse(String(chunk));
      this.acceptRequest();
      if (!this.respond) {
        done();
        return;
      }
      const region = {
        text: "PROTOCOL ONLY",
        confidence: 0.95,
        box: [0.1, 0.1, 0.8, 0.2],
      };
      const result = {
        engine: "paddle-ppocrv6-medium-onnx",
        panels: request.panels.map(
          (panel: { photo: number; part: number }) => ({
            photo: panel.photo,
            part: panel.part,
            width: 160,
            height: 320,
            lines: [region],
            words: [region],
          }),
        ),
      };
      queueMicrotask(() => this.stdout.write(JSON.stringify(result) + "\n"));
      done();
    },
  });
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.exitCode = 0;
    this.emit("close", 0, null);
    this.stdin.end();
    this.stdout.end();
  }
}

async function fixture(respond = true) {
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(resolve(base, "runtime-"));
  roots.push(root);
  let createdWorker!: (worker: VirtualWorker) => void;
  const created = new Promise<VirtualWorker>((done) => {
    createdWorker = done;
  });
  const model = createLocalModelReader({
    python: process.execPath,
    requireModels: false,
    runtimeRoot: root,
    workerScript: resolve("tests/fixtures/local-worker.mjs"),
    spawnWorker: () => {
      const child = new VirtualWorker(respond);
      workers.push(child);
      createdWorker(child);
      queueMicrotask(() =>
        child.stdout.write(
          JSON.stringify({
            ready: true,
            engine: "paddle-ppocrv6-medium-onnx",
          }) + "\n",
        ),
      );
      return child as unknown as ChildProcess;
    },
  });
  models.push(model);
  return { model, root, created };
}

afterEach(async () => {
  workers.splice(0).forEach((worker) => worker.finish());
  vi.useRealTimers();
  await Promise.all(models.splice(0).map((model) => model.dispose()));
  for (const root of roots.splice(0)) {
    const actual = await realpath(root);
    if (dirname(actual) !== (await realpath(base)))
      throw new Error("Unsafe test cleanup");
    await rm(actual, { recursive: true, force: true });
  }
});

describe("persistent reader shutdown ownership", () => {
  it("blocks new scans after termination cannot be confirmed", async () => {
    const { model } = await fixture();
    await model.extract(panels);
    vi.useFakeTimers();
    const stopped = expect(model.release()).rejects.toThrow(
      /stopped|unavailable/,
    );
    await vi.advanceTimersByTimeAsync(5001);
    await stopped;
    expect(model.configured).toBe(false);
    await expect(model.extract(panels)).rejects.toThrow(/unavailable/);
    expect(workers).toHaveLength(1);
  });

  it("waits for an automatic shutdown rather than returning while its worker is still alive", async () => {
    const { model } = await fixture();
    await model.extract(panels);
    vi.useFakeTimers();
    workers[0].stdout.write("malformed protocol\n");
    let returned = false;
    const released = model.release();
    void released.then(
      () => {
        returned = true;
      },
      () => {
        returned = true;
      },
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(returned).toBe(false);
    workers[0].finish();
    await released;
    expect(model.configured).toBe(true);
  });

  it("waits for stream closure after a process exit is reported", async () => {
    const { model, created } = await fixture();
    await model.extract(panels);
    const worker = await created;
    worker.exitCode = 0;
    vi.useFakeTimers();
    let returned = false;
    const released = model.release();
    void released.then(
      () => {
        returned = true;
      },
      () => {
        returned = true;
      },
    );
    await vi.advanceTimersByTimeAsync(1);
    expect(returned).toBe(false);
    worker.finish();
    await released;
  });

  it("retains an active job's inputs when cancellation cannot stop its worker", async () => {
    const { model, root, created } = await fixture(false);
    const abort = new AbortController();
    const pending = model.extract(panels, { signal: abort.signal });
    const rejected = expect(pending).rejects.toMatchObject({
      status: 500,
      unsafeToCleanup: true,
    });
    const worker = await created;
    await worker.requestStarted;
    vi.useFakeTimers();
    abort.abort();
    await vi.advanceTimersByTimeAsync(5001);
    await rejected;
    expect(model.configured).toBe(false);
    const jobs = await readdir(root);
    expect(jobs).toHaveLength(1);
    expect(await readdir(resolve(root, jobs[0]))).toEqual(["1.jpg"]);
  });
});
