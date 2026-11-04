import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { execFile, type ChildProcess } from "node:child_process";
import { mkdir, mkdtemp, readdir, realpath, rm } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { createLocalVisionReader } from "../server/local-vision.mjs";
import { aiCostcoDraft } from "./fixtures/ai-receipt";

// These are virtual processes. No fake PID can reach an OS termination function.
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => {
    throw new Error("Native spawning is forbidden in this test");
  }),
  execFile: vi.fn(),
}));

const GiB = 1024 ** 3;
const base = resolve("qa-artifacts/local-vision-memory-tests");
const roots: string[] = [];
const readers: ReturnType<typeof createLocalVisionReader>[] = [];
const children: VirtualProcess[] = [];
const panels = [
  {
    photo: 1,
    part: 1,
    data: Buffer.from([255, 216, 255, 224, 0, 0, 0, 0]).toString("base64"),
  },
];

class VirtualProcess extends EventEmitter {
  pid = 424242 + children.length;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  closed = false;
  constructor(
    public mode: string,
    private hold: Set<string>,
    public stopCloses: boolean,
  ) {
    super();
    this.stdin.once("finish", () => {
      if (this.hold.has(mode)) return;
      queueMicrotask(() => {
        if (mode === "guard") this.stdout.write('{"valid":true}');
        if (mode === "vision") {
          const draft = aiCostcoDraft();
          draft.items.forEach((item) => {
            item.sourcePhotos = [1];
            item.note = "";
          });
          this.stdout.write(JSON.stringify(draft));
        }
        this.finish();
      });
    });
  }
  kill = vi.fn(() => {
    if (this.stopCloses) queueMicrotask(() => this.finish());
    return this.stopCloses;
  });
  finish() {
    if (this.closed) return;
    this.closed = true;
    this.exitCode = 0;
    this.emit("close", 0, null);
    this.stdout.end();
    this.stderr.end();
  }
}

async function fixture(availableMemory: () => number, stopCloses = true) {
  await mkdir(base, { recursive: true });
  const root = await mkdtemp(join(base, "runtime-"));
  roots.push(root);
  const spawned: VirtualProcess[] = [];
  const hold = new Set<string>();
  let onVision!: () => void;
  const visionStarted = new Promise<void>((done) => {
    onVision = done;
  });
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    const argv = args[1] as string[];
    const child = children.find((entry) => entry.pid === Number(argv[1]));
    if (
      !child ||
      args[0] !== "taskkill.exe" ||
      argv.join(" ") !== `/PID ${child.pid} /T /F`
    )
      throw new Error("An unowned termination was attempted");
    const done = args.at(-1) as (error: Error | null) => void;
    queueMicrotask(() => {
      if (child.stopCloses) child.finish();
      done(child.stopCloses ? null : new Error("Controlled stop failure"));
    });
    return {} as ChildProcess;
  });
  const model = createLocalVisionReader({
    enabled: true,
    python: process.execPath,
    requireAssets: false,
    runtimeRoot: root,
    availableMemory,
    spawnProcess: (_program, args) => {
      const mode = args.includes("--check")
        ? "verify"
        : args.some((arg) => String(arg).endsWith("local_image_guard.py"))
          ? "guard"
          : "vision";
      const child = new VirtualProcess(mode, hold, stopCloses);
      children.push(child);
      spawned.push(child);
      if (mode === "vision") onVision();
      return child as unknown as ChildProcess;
    },
  });
  readers.push(model);
  return { model, root, spawned, hold, visionStarted };
}

afterEach(async () => {
  children.splice(0).forEach((child) => child.finish());
  vi.useRealTimers();
  await Promise.all(readers.splice(0).map((reader) => reader.dispose()));
  vi.clearAllMocks();
  for (const root of roots.splice(0)) {
    const actual = await realpath(root);
    if (dirname(actual) !== (await realpath(base)))
      throw new Error("Unsafe test cleanup");
    await rm(actual, { recursive: true, force: true });
  }
});

describe("local vision memory admission and shutdown (virtual process controls)", () => {
  it("refuses a low-memory scan before creating private inputs or launching any child", async () => {
    const { model, root, spawned } = await fixture(() => 3 * GiB - 1);
    expect(model.configured).toBe(true);
    await expect(model.extract(panels)).rejects.toMatchObject({ status: 503 });
    expect(spawned).toEqual([]);
    expect(await readdir(root)).toEqual([]);
    expect(model.configured).toBe(true);
  });

  it.each([NaN, Infinity, -1, 3 * GiB + 0.5])(
    "refuses an invalid memory reading (%s)",
    async (value) => {
      const { model, spawned } = await fixture(() => value);
      await expect(model.extract(panels)).rejects.toThrow(/memory/);
      expect(spawned).toEqual([]);
    },
  );

  it("refuses when the memory probe throws", async () => {
    const { model, spawned } = await fixture(() => {
      throw new Error("Probe failed");
    });
    await expect(model.extract(panels)).rejects.toThrow(/memory/);
    expect(spawned).toEqual([]);
  });

  it("allows the exact startup boundary and has no memory poll after completion", async () => {
    const probe = vi.fn(() => 3 * GiB);
    const { model, root, spawned } = await fixture(probe);
    vi.useFakeTimers();
    await model.extract(panels);
    expect(spawned.map((child) => child.mode)).toEqual([
      "guard",
      "verify",
      "vision",
    ]);
    expect(spawned.every((child) => child.closed)).toBe(true);
    expect(await readdir(root)).toEqual([]);
    const count = probe.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1000);
    expect(probe).toHaveBeenCalledTimes(count);
  });

  it("rechecks startup headroom after image and asset validation", async () => {
    let observed: VirtualProcess[] = [];
    const { model, root, spawned } = await fixture(() =>
      observed.some((child) => child.mode === "verify") ? 2 * GiB : 8 * GiB,
    );
    observed = spawned;
    await expect(model.extract(panels)).rejects.toThrow(/memory/);
    expect(spawned.map((child) => child.mode)).toEqual(["guard", "verify"]);
    expect(await readdir(root)).toEqual([]);
  });

  it("requires the existing CPU startup floor before asset verification", async () => {
    let observed: VirtualProcess[] = [];
    const { model, root, spawned } = await fixture(() =>
      observed.some((child) => child.mode === "guard")
        ? 1.5 * GiB - 1
        : 8 * GiB,
    );
    observed = spawned;
    await expect(model.extract(panels)).rejects.toThrow(/memory/);
    expect(spawned.map((child) => child.mode)).toEqual(["guard"]);
    expect(await readdir(root)).toEqual([]);
  });

  it("stops the owned process below the runtime floor, then permits an explicit later scan", async () => {
    let available = 8 * GiB;
    const { model, root, spawned, hold, visionStarted } = await fixture(
      () => available,
    );
    hold.add("vision");
    vi.useFakeTimers();
    const pending = model.extract(panels);
    const rejected = expect(pending).rejects.toThrow(/memory/);
    await visionStarted;
    available = GiB;
    await vi.advanceTimersByTimeAsync(500);
    expect(spawned.at(-1)!.closed).toBe(false);
    available = GiB - 1;
    await vi.advanceTimersByTimeAsync(251);
    await rejected;
    expect(spawned.at(-1)!.closed).toBe(true);
    expect(await readdir(root)).toEqual([]);
    available = 8 * GiB;
    hold.delete("vision");
    await model.extract(panels);
    expect(model.configured).toBe(true);
    expect(spawned.filter((child) => child.mode === "vision")).toHaveLength(2);
  });

  it("retains inputs and disables the reader if a memory stop cannot be confirmed", async () => {
    let available = 8 * GiB;
    const { model, root, spawned, hold, visionStarted } = await fixture(
      () => available,
      false,
    );
    hold.add("vision");
    vi.useFakeTimers();
    const pending = model.extract(panels);
    const rejected = expect(pending).rejects.toMatchObject({
      status: 500,
      unsafeToCleanup: true,
    });
    await visionStarted;
    available = GiB - 1;
    await vi.advanceTimersByTimeAsync(5251);
    await rejected;
    expect(spawned.at(-1)!.closed).toBe(false);
    expect(model.configured).toBe(false);
    const jobs = await readdir(root);
    expect(jobs).toHaveLength(1);
    expect(await readdir(join(root, jobs[0]))).toEqual([
      "1.jpg",
      "schema.json",
    ]);
    const count = spawned.length;
    await expect(model.extract(panels)).rejects.toThrow(/not ready/);
    expect(spawned).toHaveLength(count);
  });

  it("bounds stream closure after a reported exit without signalling its PID", async () => {
    const { model, root, spawned, hold, visionStarted } = await fixture(
      () => 8 * GiB,
      false,
    );
    hold.add("vision");
    vi.useFakeTimers();
    const abort = new AbortController();
    let outcome: unknown;
    const pending = model.extract(panels, { signal: abort.signal });
    void pending.catch((error) => {
      outcome = error;
    });
    await visionStarted;
    spawned.at(-1)!.exitCode = 0;
    abort.abort();
    await vi.advanceTimersByTimeAsync(5001);
    expect(outcome).toMatchObject({ status: 500, unsafeToCleanup: true });
    expect(execFile).not.toHaveBeenCalled();
    expect(spawned.at(-1)!.closed).toBe(false);
    expect(model.configured).toBe(false);
    const jobs = await readdir(root);
    expect(jobs).toHaveLength(1);
    expect(await readdir(join(root, jobs[0]))).toEqual([
      "1.jpg",
      "schema.json",
    ]);
  });
});
