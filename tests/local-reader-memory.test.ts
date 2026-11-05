import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { createLocalModelReader } from "../server/local-ocr.mjs";
import { JOB_OWNER_FILE } from "../server/receipt-jobs.mjs";

const terminate = vi.hoisted(() => vi.fn());
// Virtual PIDs cannot reach an OS termination function in these controls.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("Native spawning is forbidden");
  }),
  execFile: vi.fn(
    (
      _program: string,
      args: string[],
      _options: unknown,
      done: (error: Error | null) => void,
    ) => {
      terminate(Number(args[1]));
      queueMicrotask(() => done(null));
      return {};
    },
  ),
}));

const GiB = 1024 ** 3;
const base = resolve("qa-artifacts/primary-memory-tests");
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
  pid = 424242 + workers.length;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new PassThrough();
  requests = 0;
  closed = false;
  requestStarted: Promise<void>;
  private acceptRequest!: () => void;
  private request: { panels: { photo: number; part: number }[] } | undefined;
  constructor(
    private respond: boolean,
    readonly stoppable: boolean,
  ) {
    super();
    this.requestStarted = new Promise((done) => {
      this.acceptRequest = done;
    });
  }
  stdin = new Writable({
    write: (chunk, _encoding, done) => {
      this.request = JSON.parse(String(chunk));
      this.requests++;
      this.acceptRequest();
      if (this.respond) queueMicrotask(() => this.reply());
      done();
    },
  });
  kill = vi.fn(() => {
    if (this.stoppable) this.finish();
    return this.stoppable;
  });
  ready() {
    this.stdout.write(
      JSON.stringify({ ready: true, engine: "paddle-ppocrv6-medium-onnx" }) +
        "\n",
    );
  }
  reply() {
    const region = {
      text: "PROTOCOL ONLY",
      confidence: 0.95,
      box: [0.1, 0.1, 0.8, 0.2],
    };
    this.stdout.write(
      JSON.stringify({
        engine: "paddle-ppocrv6-medium-onnx",
        panels: this.request!.panels.map((panel) => ({
          photo: panel.photo,
          part: panel.part,
          width: 160,
          height: 320,
          lines: [region],
          words: [region],
        })),
      }) + "\n",
    );
  }
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.exitCode = 0;
    this.emit("close", 0, null);
    this.stdin.end();
    this.stdout.end();
  }
}

async function fixture({
  probe = () => 4 * GiB,
  ready = true,
  respond = true,
  stoppable = true,
}: {
  probe?: () => number;
  ready?: boolean;
  respond?: boolean;
  stoppable?: boolean;
} = {}) {
  await mkdir(base, { recursive: true });
  const parent = await mkdtemp(resolve(base, "case-"));
  roots.push(parent);
  const root = resolve(parent, "private");
  let createdWorker!: (worker: VirtualWorker) => void;
  const created = new Promise<VirtualWorker>((done) => {
    createdWorker = done;
  });
  const ownWorkers: VirtualWorker[] = [];
  terminate.mockImplementation((pid: number) => {
    const worker = workers.find((item) => item.pid === pid && !item.closed);
    if (worker?.stoppable) worker.finish();
  });
  const model = createLocalModelReader({
    python: process.execPath,
    requireModels: false,
    runtimeRoot: root,
    availableMemory: probe,
    spawnWorker: () => {
      const child = new VirtualWorker(respond, stoppable);
      workers.push(child);
      ownWorkers.push(child);
      createdWorker(child);
      if (ready) queueMicrotask(() => child.ready());
      return child as unknown as ChildProcess;
    },
  });
  models.push(model);
  return { model, root, parent, created, ownWorkers };
}

afterEach(async () => {
  workers.splice(0).forEach((worker) => worker.finish());
  vi.useRealTimers();
  vi.unstubAllEnvs();
  await Promise.all(models.splice(0).map((model) => model.dispose()));
  for (const root of roots.splice(0)) {
    const actual = await realpath(root);
    if (dirname(actual) !== (await realpath(base)))
      throw new Error("Unsafe cleanup");
    await rm(actual, { recursive: true, force: true });
  }
});

const invalidProbes: [string, () => number][] = [
  ["low", () => 1.5 * GiB - 1],
  ["negative", () => -1],
  ["NaN", () => NaN],
  ["infinite", () => Infinity],
  ["fractional", () => 2 * GiB + 0.5],
  ["string", () => String(4 * GiB) as unknown as number],
  [
    "throwing",
    () => {
      throw new Error("Probe failure");
    },
  ],
];

describe("persistent OCR memory policy (virtual worker, no accuracy claim)", () => {
  it.each(invalidProbes)(
    "refuses %s memory before creating a runtime directory or worker",
    async (_name, probe) => {
      const { model, parent, ownWorkers } = await fixture({ probe });
      await expect(model.extract(panels)).rejects.toMatchObject({
        status: 503,
        message: expect.stringContaining("memory"),
      });
      expect(await readdir(parent)).toEqual([]);
      expect(ownWorkers).toHaveLength(0);
      expect(model.configured).toBe(true);
    },
  );

  it("accepts exactly the fixed startup threshold", async () => {
    const { model, root, ownWorkers } = await fixture({
      probe: () => 1.5 * GiB,
    });
    expect((await model.extract(panels)).panels).toHaveLength(1);
    expect(ownWorkers).toHaveLength(1);
    expect(await readdir(root)).toEqual([]);
  });

  it("rechecks memory immediately before launching after asynchronous directory setup", async () => {
    let checks = 0;
    const { model, root, ownWorkers } = await fixture({
      probe: () => (++checks === 1 ? 4 * GiB : GiB),
    });
    await expect(model.extract(panels)).rejects.toMatchObject({ status: 503 });
    expect(checks).toBe(2);
    expect(ownWorkers).toHaveLength(0);
    expect(await readdir(root)).toEqual([]);
  });

  it("rechecks admission after the model loads, before any private files", async () => {
    let checks = 0;
    const { model, root, ownWorkers } = await fixture({
      probe: () => (++checks < 3 ? 4 * GiB : 1.25 * GiB),
    });
    await expect(model.extract(panels)).rejects.toMatchObject({ status: 503 });
    expect(ownWorkers[0].closed).toBe(true);
    expect(ownWorkers[0].requests).toBe(0);
    expect(await readdir(root)).toEqual([]);
  });

  it("stops safely if memory falls while private inputs are written", async () => {
    let checks = 0;
    const { model, root, ownWorkers } = await fixture({
      probe: () => (++checks < 5 ? 4 * GiB : GiB - 1),
    });
    await expect(model.extract(panels)).rejects.toMatchObject({ status: 503 });
    expect(ownWorkers[0].closed).toBe(true);
    expect(ownWorkers[0].requests).toBe(0);
    expect(await readdir(root)).toEqual([]);
  });

  it("monitors a worker that has not finished loading", async () => {
    let available = 4 * GiB;
    const { model, root, created } = await fixture({
      probe: () => available,
      ready: false,
    });
    vi.useFakeTimers();
    const failed = expect(model.extract(panels)).rejects.toMatchObject({
      status: 503,
    });
    const worker = await created;
    available = GiB - 1;
    await vi.advanceTimersByTimeAsync(250);
    await failed;
    expect(worker.closed).toBe(true);
    expect(await readdir(root)).toEqual([]);
  });

  it("waits for the active worker's closure before removing its receipt inputs", async () => {
    let available = 4 * GiB;
    const { model, root, created } = await fixture({
      probe: () => available,
      respond: false,
      stoppable: false,
    });
    vi.useFakeTimers();
    let returned = false;
    const pending = model.extract(panels);
    void pending
      .finally(() => {
        returned = true;
      })
      .catch(() => {});
    const failed = expect(pending).rejects.toMatchObject({ status: 503 });
    const worker = await created;
    await worker.requestStarted;
    available = GiB - 1;
    await vi.advanceTimersByTimeAsync(250);
    expect(returned).toBe(false);
    const jobs = await readdir(root);
    expect(jobs).toHaveLength(1);
    expect(await readdir(resolve(root, jobs[0]))).toEqual([
      JOB_OWNER_FILE,
      "1.jpg",
    ]);
    available = 4 * GiB;
    worker.finish();
    await failed;
    expect(await readdir(root)).toEqual([]);
  });

  it.each(["NaN", "throw"])(
    "fails closed when the runtime probe returns %s",
    async (mode) => {
      let bad = false;
      const probe = () => {
        if (!bad) return 4 * GiB;
        if (mode === "throw") throw new Error("Probe failure");
        return NaN;
      };
      const { model, root, created } = await fixture({ probe, respond: false });
      vi.useFakeTimers();
      const failed = expect(model.extract(panels)).rejects.toMatchObject({
        status: 503,
      });
      const worker = await created;
      await worker.requestStarted;
      bad = true;
      await vi.advanceTimersByTimeAsync(250);
      await failed;
      expect(worker.closed).toBe(true);
      expect(await readdir(root)).toEqual([]);
    },
  );

  it("accepts exactly the runtime reserve during an active scan", async () => {
    let available = 4 * GiB;
    const { model, created } = await fixture({
      probe: () => available,
      respond: false,
    });
    vi.useFakeTimers();
    const pending = model.extract(panels);
    const worker = await created;
    await worker.requestStarted;
    available = GiB;
    await vi.advanceTimersByTimeAsync(250);
    expect(worker.closed).toBe(false);
    worker.reply();
    expect((await pending).panels).toHaveLength(1);
  });

  it("releases an idle worker under memory pressure and permits a later explicit scan", async () => {
    let available = 4 * GiB,
      checks = 0;
    const { model, ownWorkers } = await fixture({
      probe: () => {
        checks++;
        return available;
      },
    });
    vi.useFakeTimers();
    await model.extract(panels);
    available = GiB - 1;
    await vi.advanceTimersByTimeAsync(250);
    await model.release();
    expect(ownWorkers[0].closed).toBe(true);
    const stoppedChecks = checks;
    await vi.advanceTimersByTimeAsync(1000);
    expect(checks).toBe(stoppedChecks);
    available = 4 * GiB;
    await model.extract(panels);
    expect(ownWorkers).toHaveLength(2);
  });

  it.each(["release", "dispose", "close"] as const)(
    "removes its memory monitor on %s",
    async (mode) => {
      const probe = vi.fn(() => 4 * GiB);
      const { model, created } = await fixture({ probe });
      vi.useFakeTimers();
      await model.extract(panels);
      const worker = await created;
      if (mode === "close") worker.finish();
      else await model[mode]();
      const checks = probe.mock.calls.length;
      await vi.advanceTimersByTimeAsync(1000);
      expect(probe).toHaveBeenCalledTimes(checks);
    },
  );

  it("blocks subsequent scans and retains inputs if the memory-stopped worker cannot be confirmed closed", async () => {
    let available = 4 * GiB;
    const { model, root, created, ownWorkers } = await fixture({
      probe: () => available,
      respond: false,
      stoppable: false,
    });
    vi.useFakeTimers();
    const failed = expect(model.extract(panels)).rejects.toMatchObject({
      status: 500,
      unsafeToCleanup: true,
    });
    const worker = await created;
    await worker.requestStarted;
    available = GiB - 1;
    await vi.advanceTimersByTimeAsync(5251);
    await failed;
    expect(model.configured).toBe(false);
    const jobs = await readdir(root);
    expect(jobs).toHaveLength(1);
    expect(await readdir(resolve(root, jobs[0]))).toEqual([
      JOB_OWNER_FILE,
      "1.jpg",
    ]);
    available = 4 * GiB;
    await expect(model.extract(panels)).rejects.toMatchObject({ status: 503 });
    expect(ownWorkers).toHaveLength(1);
  });

  it("does not accept environment overrides for the fixed memory limits", async () => {
    vi.stubEnv("LOCAL_OCR_MIN_MEMORY_BYTES", "0");
    vi.stubEnv("LOCAL_OCR_RUNTIME_MEMORY_BYTES", "0");
    const { model, parent, ownWorkers } = await fixture({ probe: () => GiB });
    await expect(model.extract(panels)).rejects.toMatchObject({ status: 503 });
    expect(await readdir(parent)).toEqual([]);
    expect(ownWorkers).toHaveLength(0);
  });
});
