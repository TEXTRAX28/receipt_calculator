import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { readdirSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  writeFile,
  symlink,
} from "node:fs/promises";
import { resolve, relative } from "node:path";
import { pathToFileURL } from "node:url";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createLocalModelReader,
  removeOwnedJob,
  workerEnvironment,
} from "../server/local-ocr.mjs";
import {
  createReceiptJob,
  recoverReceiptJobs,
  receiptProcessExists,
  JOB_OWNER_FILE,
} from "../server/receipt-jobs.mjs";
import { createReceiptApi } from "../server/receipt-api.mjs";

const ownedBase = resolve("qa-artifacts/local-bridge-tests");
const roots: string[] = [];
const readers: ReturnType<typeof createLocalModelReader>[] = [];
const servers: Server[] = [];
const panels = (tag = "MILK") => [
  {
    photo: 1,
    part: 1,
    data: Buffer.concat([
      Buffer.from([255, 216, 255, 224, 0, 0, 0, 0]),
      Buffer.from(tag),
    ]).toString("base64"),
  },
];
async function jobFixture() {
  await mkdir(ownedBase, { recursive: true });
  const root = await mkdtemp(resolve(ownedBase, "runtime-"));
  roots.push(root);
  const job = await createReceiptJob(root, process.pid + 1, 1);
  await writeFile(
    resolve(job, "1.jpg"),
    "Synthetic protocol image, not a private receipt",
  );
  return { root, job };
}
async function reader(
  options: { timeoutMs?: number; availableMemory?: () => number } = {},
) {
  await mkdir(ownedBase, { recursive: true });
  const root = await mkdtemp(resolve(ownedBase, "runtime-"));
  roots.push(root);
  let starts = 0;
  const model = createLocalModelReader({
    python: process.execPath,
    runtimeRoot: root,
    requireModels: false,
    availableMemory: options.availableMemory ?? (() => 4 * 1024 ** 3),
    workerScript: resolve("tests/fixtures/local-worker.mjs"),
    timeoutMs: options.timeoutMs || 10000,
    spawnWorker: (program, args, spawnOptions) => {
      starts++;
      return spawn(
        program,
        args.filter((arg) => arg !== "-u"),
        spawnOptions,
      );
    },
  });
  readers.push(model);
  return { model, root, starts: () => starts };
}
afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(readers.splice(0).map((r) => r.dispose()));
  await Promise.all(
    servers.splice(0).map(
      (s) =>
        new Promise<void>((done) => {
          s.closeAllConnections();
          s.close(() => done());
        }),
    ),
  );
  for (const root of roots.splice(0)) {
    const actual = await realpath(root);
    if (relative(await realpath(ownedBase), actual).startsWith(".."))
      throw new Error("Unsafe test cleanup");
    await rm(actual, { recursive: true, force: true });
  }
});

describe("bounded local-model process bridge (protocol fixture, no OCR accuracy claim)", () => {
  it("releases the idle model for vision and restarts it for a later OCR scan", async () => {
    const { model, root, starts } = await reader();
    await model.extract(panels("FIRST"));
    await model.release();
    expect(model.configured).toBe(true);
    expect(
      (await model.extract(panels("SECOND"))).panels[0].lines[0].text,
    ).toBe("SECOND");
    expect(starts()).toBe(2);
    expect(await readdir(root)).toEqual([]);
  });
  it("reuses one worker, preserves split UTF-8 and removes every job's files", async () => {
    const { model, root, starts } = await reader();
    expect((await model.extract(panels("MILK"))).panels[0].lines[0].text).toBe(
      "MILK",
    );
    expect((await model.extract(panels("牛奶"))).panels[0].lines[0].text).toBe(
      "牛奶",
    );
    expect(starts()).toBe(1);
    expect(await readdir(root)).toEqual([]);
  });
  it("does not pass provider keys into the model environment", async () => {
    vi.stubEnv("GEMINI_API_KEY", "secret-google-test-value");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret-aws-test-value");
    const { model } = await reader();
    expect((await model.extract(panels("env"))).panels[0].words[0].text).toBe(
      "NO_KEYS",
    );
  });
  it.each(["bad-score", "wrong-photo", "oversize", "exit"])(
    "rejects %s output and cleans private files",
    async (tag) => {
      const { model, root } = await reader();
      await expect(model.extract(panels(tag))).rejects.toThrow(
        /unavailable|cancelled/,
      );
      expect(await readdir(root)).toEqual([]);
      expect(
        (await model.extract(panels("RECOVERY"))).panels[0].words[0].text,
      ).toBe("RECOVERY");
    },
  );
  it("cancels a live inference process, rejects concurrent scans and cleans its files", async () => {
    const { model, root } = await reader();
    const control = new AbortController();
    const pending = model.extract(panels("stall"), { signal: control.signal });
    const failed = expect(pending).rejects.toThrow(/cancelled/);
    await vi.waitFor(async () => expect((await readdir(root)).length).toBe(1));
    await expect(model.extract(panels())).rejects.toMatchObject({
      status: 429,
    });
    control.abort();
    await failed;
    expect(await readdir(root)).toEqual([]);
  });
  it("bounds a stalled model with its own deadline", async () => {
    const { model, root } = await reader({ timeoutMs: 500 });
    await expect(model.extract(panels("stall"))).rejects.toMatchObject({
      status: 504,
    });
    expect(await readdir(root)).toEqual([]);
  });
  it("does not start a worker for duplicate panels or invalid configuration", async () => {
    const { model, starts } = await reader();
    await expect(
      model.extract([...panels(), ...panels()]),
    ).rejects.toMatchObject({ status: 400 });
    expect(starts()).toBe(0);
    const unavailable = createLocalModelReader();
    expect(unavailable.configured).toBe(false);
    await expect(unavailable.extract(panels())).rejects.toMatchObject({
      status: 503,
    });
  });
  it("refuses deletion outside its owned job directory", async () => {
    const { root } = await reader();
    const other = await mkdtemp(resolve(ownedBase, "other-"));
    roots.push(other);
    await writeFile(resolve(other, "keep.txt"), "keep");
    await expect(removeOwnedJob(other, root)).rejects.toThrow(
      /Refusing cleanup/,
    );
    expect(await readdir(other)).toContain("keep.txt");
  });
});

describe("abandoned native receipt job recovery", () => {
  it("recovers a marked job only after its app and worker are both confirmed absent", async () => {
    const { root, job } = await jobFixture();
    const owner = JSON.parse(
      await readFile(resolve(job, JOB_OWNER_FILE), "utf8"),
    );
    expect(owner).toMatchObject({
      kind: "gather-native-ocr",
      ownerPid: process.pid,
      workerPid: process.pid + 1,
      panels: 1,
    });
    expect(JSON.stringify(owner)).not.toContain("Synthetic");
    expect(
      (await recoverReceiptJobs(root, { processExists: () => false })).removed,
    ).toBe(1);
    expect(await readdir(root)).toEqual([]);
  });

  it.each(["parent", "worker", "unknown", "throws"])(
    "retains a job when %s ownership cannot be ruled out",
    async (mode) => {
      const { root, job } = await jobFixture();
      const probe = (pid: number) => {
        if (mode === "throws") throw new Error("Process access denied");
        if (mode === "unknown") return undefined;
        return mode === "parent"
          ? pid === process.pid
          : pid === process.pid + 1;
      };
      expect(
        (await recoverReceiptJobs(root, { processExists: probe })).removed,
      ).toBe(0);
      expect(await readFile(resolve(job, "1.jpg"), "utf8")).toContain(
        "Synthetic",
      );
    },
  );

  it("rechecks process state before removal", async () => {
    const { root, job } = await jobFixture();
    let probes = 0;
    expect(
      (await recoverReceiptJobs(root, { processExists: () => ++probes > 2 }))
        .removed,
    ).toBe(0);
    expect(await readdir(job)).toContain("1.jpg");
  });

  it.each([
    { version: 2 },
    { ownerPid: 0 },
    { workerPid: -1 },
    { job: "scan-another-job" },
    { extra: "unknown" },
  ])("retains foreign or malformed ownership %j", async (patch) => {
    const { root, job } = await jobFixture();
    const path = resolve(job, JOB_OWNER_FILE);
    const owner = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...owner, ...patch }));
    const probe = vi.fn(() => false);
    expect(
      (await recoverReceiptJobs(root, { processExists: probe })).removed,
    ).toBe(0);
    expect(probe).not.toHaveBeenCalled();
    expect(await readdir(job)).toContain("1.jpg");
  });

  it("leaves legacy unmarked jobs, unknown files and nested directories alone", async () => {
    const { root, job } = await jobFixture();
    await mkdir(resolve(root, "scan-legacy"));
    await writeFile(resolve(root, "scan-legacy", "1.jpg"), "legacy");
    await writeFile(resolve(job, "keep.txt"), "unknown");
    expect(
      (await recoverReceiptJobs(root, { processExists: () => false })).removed,
    ).toBe(0);
    await rm(resolve(job, "keep.txt"));
    await mkdir(resolve(job, "nested"));
    expect(
      (await recoverReceiptJobs(root, { processExists: () => false })).removed,
    ).toBe(0);
    expect(await readFile(resolve(root, "scan-legacy", "1.jpg"), "utf8")).toBe(
      "legacy",
    );
    expect(await readdir(job)).toContain("1.jpg");
  });

  it("does not follow job junctions or linked input files", async () => {
    const { root, job } = await jobFixture();
    const link = resolve(root, "scan-linked-job");
    await symlink(job, link, "junction");
    await expect(removeOwnedJob(link, root)).rejects.toThrow(
      /Refusing cleanup/,
    );
    await symlink(root, resolve(job, "nested-link"), "junction");
    expect(
      (await recoverReceiptJobs(root, { processExists: () => false })).removed,
    ).toBe(0);
    expect(await readdir(job)).toContain("1.jpg");
  });

  it("bounds recovery and allows a later pass to continue", async () => {
    const { root } = await jobFixture();
    for (let i = 0; i < 19; i++)
      await createReceiptJob(root, process.pid + 1, 1);
    const options = { processExists: () => false };
    expect((await recoverReceiptJobs(root, options)).removed).toBe(16);
    expect(await readdir(root)).toHaveLength(4);
    expect((await recoverReceiptJobs(root, options)).removed).toBe(4);
    expect(await readdir(root)).toEqual([]);
  });

  it("limits directory inspection and never deletes unrelated entries", async () => {
    const { root } = await jobFixture();
    for (let i = 0; i < 130; i++)
      await writeFile(resolve(root, `keep-${i}`), "unrelated");
    const result = await recoverReceiptJobs(root, {
      processExists: () => false,
    });
    expect(result.inspected).toBe(128);
    expect(
      (await readdir(root)).filter((name) => name.startsWith("keep-")),
    ).toHaveLength(130);
  });

  it("honors cancellation before touching abandoned inputs", async () => {
    const { root, job } = await jobFixture();
    const control = new AbortController();
    control.abort();
    await expect(
      recoverReceiptJobs(root, {
        signal: control.signal,
        processExists: () => false,
      }),
    ).rejects.toThrow();
    expect(await readdir(job)).toContain("1.jpg");
  });

  it("uses non-terminating existence probes and refuses invalid PIDs", () => {
    expect(receiptProcessExists(process.pid)).toBe(true);
    expect(receiptProcessExists(0)).toBeUndefined();
    expect(receiptProcessExists(-1)).toBeUndefined();
    expect(receiptProcessExists(NaN)).toBeUndefined();
  });

  it("retains a real orphan worker's job, then reaps it after both owned processes close", async () => {
    const { root, job } = await jobFixture();
    await removeOwnedJob(job, root);
    const options = {
      windowsHide: true,
      env: workerEnvironment(),
      stdio: ["ignore", "pipe", "ignore"] as ["ignore", "pipe", "ignore"],
    };
    const worker = spawn(
      process.execPath,
      ["--max-old-space-size=32", "-e", "setInterval(()=>{},1000)"],
      options,
    );
    const workerClosed = new Promise<void>((done) =>
      worker.once("close", () => done()),
    );
    const program = `const {createReceiptJob}=await import(process.argv[1]);const {writeFile}=await import('node:fs/promises');const d=await createReceiptJob(process.argv[2],Number(process.argv[3]),1);await writeFile(d+'/1.jpg','SYNTHETIC');console.log(d);process.exit(23);`;
    const parent = spawn(
      process.execPath,
      [
        "--max-old-space-size=32",
        "--input-type=module",
        "-e",
        program,
        pathToFileURL(resolve("server/receipt-jobs.mjs")).href,
        root,
        String(worker.pid),
      ],
      options,
    );
    const parentClosed = new Promise<number | null>((done) =>
      parent.once("close", done),
    );
    let output = "";
    parent.stdout!.on("data", (chunk) => {
      output += String(chunk);
    });
    try {
      expect(await parentClosed).toBe(23);
      expect(output.trim()).toMatch(/scan-/);
      expect((await recoverReceiptJobs(root)).removed).toBe(0);
      expect(await readdir(root)).toHaveLength(1);
      worker.kill();
      await workerClosed;
      const model = createLocalModelReader({
        python: process.execPath,
        runtimeRoot: root,
        requireModels: false,
        availableMemory: () => 4 * 1024 ** 3,
        workerScript: resolve("tests/fixtures/local-worker.mjs"),
        spawnWorker: (program, args, spawnOptions) => {
          expect(readdirSync(root)).toEqual([]);
          return spawn(
            program,
            args.filter((arg) => arg !== "-u"),
            spawnOptions,
          );
        },
      });
      readers.push(model);
      expect((await model.extract(panels())).panels[0].lines[0].text).toBe(
        "MILK",
      );
      expect(await readdir(root)).toEqual([]);
    } finally {
      if (parent.exitCode === null) parent.kill();
      if (worker.exitCode === null) worker.kill();
      await Promise.all([parentClosed, workerClosed]);
    }
  });
});

async function api(
  localReader?: NonNullable<
    Parameters<typeof createReceiptApi>[0]
  >["localReader"],
) {
  const fetcher = vi.fn();
  const handler = createReceiptApi({
    apiKey: "test-google-key",
    localReader,
    fetcher,
  });
  const server = createServer((req, res) => {
    void handler(req, res, () => {
      res.writeHead(404);
      res.end();
    });
  });
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (
    body: unknown = { panels: panels() },
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/api/receipts/recognize`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
        origin: base,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { base, post, fetcher };
}
describe("local recognition shares the receipt API security boundary", () => {
  it("returns honest capabilities without paths or keys", async () => {
    const { base, post, fetcher } = await api();
    expect(
      await (await fetch(`${base}/api/receipts/providers`)).json(),
    ).toEqual({
      localModel: { configured: false, name: "PaddleOCR" },
      localVision: {
        configured: false,
        name: "Qwen3-VL 4B",
        maxPanels: 3,
        maxReceiptPanels: 24,
        supportsBatches: true,
      },
    });
    expect((await post()).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses only the local provider without external-processing consent or a Google call", async () => {
    const { model, root } = await reader();
    const { post, fetcher } = await api(model);
    const response = await post();
    expect(response.status).toBe(200);
    expect((await response.json()).recognition.panels[0].lines[0].text).toBe(
      "MILK",
    );
    expect(fetcher).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });
  it("returns a safe memory failure without starting a worker, writing photos or calling a cloud reader", async () => {
    const { model, root, starts } = await reader({
      availableMemory: () => 1024 ** 3,
    });
    const { post, fetcher } = await api(model);
    const response = await post();
    expect(response.status).toBe(503);
    expect(JSON.stringify(await response.json())).toContain("memory");
    expect(starts()).toBe(0);
    expect(await readdir(root)).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, malformed and repeated-panel requests before model startup", async () => {
    const { model, starts } = await reader();
    const { post } = await api(model);
    expect(
      (await post(undefined, { origin: "https://untrusted.invalid" })).status,
    ).toBe(403);
    expect(
      (await post({ panels: panels(), command: "run anything" })).status,
    ).toBe(400);
    expect((await post({ panels: [...panels(), ...panels()] })).status).toBe(
      400,
    );
    expect(starts()).toBe(0);
  });
});
