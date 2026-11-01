import { afterEach, describe, expect, it, vi } from "vitest";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
} from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLocalVisionReader } from "../server/local-vision.mjs";
import { runPrivateProcess } from "../server/private-process.mjs";
import { createReceiptApi } from "../server/receipt-api.mjs";
import { aiCostcoDraft } from "./fixtures/ai-receipt";
import { receiptFromAi } from "../src/lib/gemini";
import { calculateReceipt } from "../src/lib/engine";

const ownedBase = resolve("qa-artifacts/local-vision-tests");
const fixture = resolve("tests/fixtures/local-vision-process.mjs");
const roots: string[] = [];
const readers: ReturnType<typeof createLocalVisionReader>[] = [];
const servers: Server[] = [];
const panels = (marker = "MILK") => [
  {
    photo: 1,
    part: 1,
    data: Buffer.concat([
      Buffer.from([255, 216, 255, 224, 0, 0, 0, 0]),
      Buffer.from(marker),
    ]).toString("base64"),
  },
];
async function ownedRoot() {
  await mkdir(ownedBase, { recursive: true });
  const root = await mkdtemp(join(ownedBase, "runtime-"));
  roots.push(root);
  return root;
}
async function reader(timeoutMs = 10000) {
  const root = await ownedRoot();
  const starts: string[] = [];
  const formats: boolean[] = [];
  const model = createLocalVisionReader({
    enabled: true,
    python: process.execPath,
    requireAssets: false,
    runtimeRoot: root,
    timeoutMs,
    spawnProcess: (program, args, options) => {
      const mode = args.includes("--check")
        ? "verify"
        : args.some((arg) => String(arg).endsWith("local_image_guard.py"))
          ? "guard"
          : "vision";
      starts.push(mode);
      expect(options.windowsHide).toBe(true);
      expect(options.shell).toBe(false);
      expect(options.env?.GEMINI_API_KEY).toBeUndefined();
      expect(options.env?.OTHER_SECRET_KEY).toBeUndefined();
      if (mode === "vision") {
        const schema = JSON.parse(
          readFileSync(
            String(args[args.indexOf("--json-schema-file") + 1]),
            "utf8",
          ),
        );
        formats.push(!!schema.properties.items.items.prefixItems);
        expect(program).toMatch(/runtime-b11960[\\/]llama-mtmd-cli.exe$/);
        expect(args[args.indexOf("--ctx-size") + 1]).toBe("8192");
        expect(args[args.indexOf("--n-predict") + 1]).toBe("4000");
      }
      return spawn(process.execPath, [fixture, mode, ...args], options);
    },
  });
  readers.push(model);
  return { model, root, starts, formats };
}
async function api(options: Parameters<typeof createReceiptApi>[0] = {}) {
  const handler = createReceiptApi(options);
  const server = createServer(
    (req, res) =>
      void handler(req, res, () => {
        res.writeHead(404);
        res.end();
      }),
  );
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (
    body: unknown = { panels: panels() },
    headers: Record<string, string> = {},
  ) =>
    fetch(`${base}/api/receipts/vision`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-gather-request": "receipt-scan",
        origin: base,
        ...headers,
      },
      body: JSON.stringify(body),
    });
  return { base, post };
}
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await Promise.all(readers.splice(0).map((model) => model.dispose()));
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    ),
  );
  for (const root of roots.splice(0)) {
    const inside = relative(await realpath(ownedBase), await realpath(root));
    if (!inside || inside.startsWith("..") || isAbsolute(inside))
      throw new Error("Unsafe test cleanup");
    await rm(root, { recursive: true, force: true });
  }
});

describe("bounded local vision bridge (synthetic process protocol, not recognition accuracy)", () => {
  it("allows a long canonical one-photo reading the same bounded model time as multiple photos", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const { model, formats, root } = await reader(200000);
    await model.extract([panels()[0], { ...panels()[0], part: 2 }]);
    expect(formats).toEqual([false]);
    expect(timeout).toHaveBeenCalledWith(200000);
    expect(timeout).toHaveBeenCalledWith(180000);
    expect(await readdir(root)).toEqual([]);
  });
  it("expands distinct multi-photo item values without swapping positions and retains the one-photo format for detail sections", async () => {
    const { model, root, formats } = await reader();
    const draft = await model.extract([
      panels("DISTINCT")[0],
      { ...panels()[0], photo: 2 },
    ]);
    expect(draft.items[0]).toMatchObject({
      quantity: "2",
      unitPrice: "3.25",
      lineTotal: "6.50",
      taxCode: "A",
      discount: "1.10",
      sourcePhotos: [2, 1],
      note: "",
    });
    expect(formats).toEqual([true]);
    await model.extract([panels()[0], { ...panels()[0], part: 2 }]);
    expect(formats).toEqual([true, false]);
    expect(await readdir(root)).toEqual([]);
  });
  it.each(["BADTUPLE", "OBJECT", "OUTSIDE"])(
    "rejects an invalid multi-photo %s response without accepting or retaining a prefix",
    async (marker) => {
      const { model, root } = await reader();
      await expect(
        model.extract([panels(marker)[0], { ...panels()[0], photo: 2 }]),
      ).rejects.toThrow(/reader/);
      expect(await readdir(root)).toEqual([]);
    },
  );
  it("checks images/assets, preserves strict fields, strips credentials and cleans all temporary files", async () => {
    vi.stubEnv("GEMINI_API_KEY", "must-not-reach-model");
    vi.stubEnv("OTHER_SECRET_KEY", "must-not-reach-model");
    const { model, root, starts } = await reader();
    const draft = await model.extract(panels());
    expect(starts).toEqual(["guard", "verify", "vision"]);
    const receipt = receiptFromAi(draft, "Local vision");
    expect(receipt.warnings.join(" ")).toContain("Local vision prepared");
    expect(receipt.warnings.join(" ")).not.toContain("Gemini");
    expect(calculateReceipt(receipt).total).toBe(200n);
    expect(await readdir(root)).toEqual([]);
    await model.extract(panels());
    expect(starts).toEqual(["guard", "verify", "vision", "guard", "vision"]);
    expect(await readdir(root)).toEqual([]);
  });
  it("retains unknown currency as unresolved instead of using a guessed financial total", async () => {
    const { model } = await reader();
    const receipt = receiptFromAi(
      await model.extract(panels("UNKNOWN")),
      "Local vision",
    );
    expect(receipt.currencyUnresolved).toBe(true);
    expect(calculateReceipt(receipt).printed).toBeNull();
  });
  it.each(["INVALID", "JSON", "RELAX", "WRONGPHOTO", "LARGE"])(
    "rejects %s evidence and cleans the job",
    async (marker) => {
      const { model, root, starts } = await reader();
      await expect(model.extract(panels(marker))).rejects.toThrow(
        /reader|decoded/,
      );
      expect(await readdir(root)).toEqual([]);
      if (marker === "INVALID") expect(starts).toEqual(["guard"]);
    },
  );
  it("rejects excess sections before starting any process; it never drops panels", async () => {
    const { model, starts, root } = await reader();
    await expect(
      model.extract(
        Array.from({ length: 4 }, (_, index) => ({
          ...panels()[0],
          part: index + 1,
        })),
      ),
    ).rejects.toThrow(/No sections were dropped|no sections were dropped/);
    expect(starts).toEqual([]);
    expect(await readdir(root)).toEqual([]);
  });
  it("cancels an owned scan, clears private files and remains usable", async () => {
    const { model, root, starts } = await reader();
    const abort = new AbortController();
    const pending = model.extract(panels("HANG"), { signal: abort.signal });
    const rejection = expect(pending).rejects.toThrow(/cancelled|too long/);
    await vi.waitFor(() => expect(starts).toContain("vision"));
    abort.abort();
    await rejection;
    expect(await readdir(root)).toEqual([]);
    expect((await model.extract(panels())).printedTotal).toBe("2.00");
  });
  it("enforces the deadline and stops accepting work after disposal", async () => {
    const { model, root } = await reader(1000);
    await expect(model.extract(panels("HANG"))).rejects.toThrow(
      /cancelled|too long/,
    );
    expect(await readdir(root)).toEqual([]);
    await model.dispose();
    expect(model.configured).toBe(false);
    await expect(model.extract(panels())).rejects.toThrow(/not ready/);
  });
  it("kills an owned descendant process when cancelled", async () => {
    const root = await ownedRoot();
    const abort = new AbortController();
    const pending = runPrivateProcess(
      process.execPath,
      [fixture, "tree", root],
      { signal: abort.signal, cwd: root },
    );
    const rejection = expect(pending).rejects.toThrow(/cancelled|too long/);
    let pid = 0;
    await vi.waitFor(async () => {
      pid = Number(await readFile(join(root, "descendant.pid"), "utf8"));
      expect(pid).toBeGreaterThan(0);
    });
    abort.abort();
    await rejection;
    expect(() => process.kill(pid, 0)).toThrow();
  });
});

describe("local vision shares the existing private API boundary", () => {
  const localVision = (extract = vi.fn(async () => aiCostcoDraft())) => ({
    configured: true,
    name: "Qwen3-VL 4B",
    maxPanels: 3,
    extract,
  });
  it("uses its explicit vision budget after a bounded request body and cancels a stalled model at that budget", async () => {
    const slow = localVision(
      vi.fn(async () => {
        await new Promise((done) => setTimeout(done, 150));
        return aiCostcoDraft();
      }),
    );
    const ready = await api({
      timeoutMs: 80,
      visionTimeoutMs: 500,
      localVision: slow,
    });
    expect(
      (
        await ready.post({
          panels: [panels()[0], { ...panels()[0], photo: 2 }],
        })
      ).status,
    ).toBe(200);
    let cancelled = false;
    const stalled = localVision(
      vi.fn(
        ((_panels: unknown, { signal }: { signal: AbortSignal }) =>
          new Promise<ReturnType<typeof aiCostcoDraft>>((_, reject) => {
            signal.addEventListener(
              "abort",
              () => {
                cancelled = true;
                reject(new Error("stalled"));
              },
              { once: true },
            );
          })) as typeof slow.extract,
      ),
    );
    const stopped = await api({
      timeoutMs: 80,
      visionTimeoutMs: 150,
      localVision: stalled,
    });
    const response = await stopped.post();
    expect(response.status).toBe(504);
    expect(cancelled).toBe(true);
    expect((await response.json()).error).toMatch(/vision.*timed out/i);
  });
  it("reports an unconfigured provider honestly and does not expose server paths", async () => {
    const { base, post } = await api();
    const config = await (await fetch(`${base}/api/receipts/providers`)).json();
    expect(config.localVision).toEqual({
      configured: false,
      name: "Qwen3-VL 4B",
      maxPanels: 3,
      maxReceiptPanels: 24,
      supportsBatches: true,
    });
    expect(JSON.stringify(config)).not.toMatch(/python|\.exe|api.key/i);
    expect((await post()).status).toBe(503);
  });
  it("releases the idle CPU model, uses only native extraction and needs no cloud consent", async () => {
    const draft = aiCostcoDraft();
    draft.items.forEach((item) => {
      item.sourcePhotos = [1];
    });
    const extract = vi.fn(async () => draft);
    const release = vi.fn(async () => {});
    const fetcher = vi.fn();
    const { post } = await api({
      localVision: localVision(extract),
      localReader: {
        configured: true,
        name: "PaddleOCR",
        release,
        extract: vi.fn(),
      },
      fetcher,
    });
    const response = await post();
    expect(response.status).toBe(200);
    expect((await response.json()).receipt.items).toHaveLength(18);
    expect(release.mock.invocationCallOrder[0]).toBeLessThan(
      extract.mock.invocationCallOrder[0],
    );
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects cross-origin, spoofed host, executable options and out-of-request photo references", async () => {
    const provider = localVision();
    const { base, post } = await api({ localVision: provider });
    expect(
      (await post(undefined, { origin: "https://attacker.invalid" })).status,
    ).toBe(403);
    const spoofed = await new Promise<number | undefined>((done, reject) => {
      const req = request(
        `${base}/api/receipts/vision`,
        { method: "POST", headers: { host: "attacker.invalid" } },
        (res) => {
          res.resume();
          done(res.statusCode);
        },
      );
      req.on("error", reject);
      req.end();
    });
    expect(spoofed).toBe(403);
    expect(
      (await post({ panels: panels(), command: "run-something" })).status,
    ).toBe(400);
    expect(provider.extract).not.toHaveBeenCalled();
    // The fixture includes photo 2, which this one-photo request did not supply.
    expect((await post()).status).toBe(502);
  });
});
