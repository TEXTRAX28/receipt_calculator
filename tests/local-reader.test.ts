import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  readdir,
  realpath,
  rm,
  writeFile,
} from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  createLocalModelReader,
  removeOwnedJob,
} from "../server/local-ocr.mjs";
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
async function reader(options: { timeoutMs?: number } = {}) {
  await mkdir(ownedBase, { recursive: true });
  const root = await mkdtemp(resolve(ownedBase, "runtime-"));
  roots.push(root);
  let starts = 0;
  const model = createLocalModelReader({
    python: process.execPath,
    runtimeRoot: root,
    requireModels: false,
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
