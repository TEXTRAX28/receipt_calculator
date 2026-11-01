import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import {
  azureOrigin,
  createAzureReader,
  AZURE_API_VERSION,
} from "../server/azure-reader.mjs";
import { createReceiptApi } from "../server/receipt-api.mjs";
import { projectAzurePage, AZURE_ENGINE } from "../src/lib/azure-layout.mjs";
import { AZURE_NOTICE, azureResultSchema } from "../src/lib/azure-schema.mjs";
import { receiptFromAzureWords } from "../src/lib/azure";

const folders: string[] = [],
  servers: Server[] = [];
const endpoint = "https://synthetic-reader.cognitiveservices.azure.com",
  key = "synthetic_azure_key_for_offline_tests";
const jpeg = () => {
  // Envelope/dimension control; not a real image decoder or recognition fixture.
  const b = Buffer.alloc(300);
  b.set([255, 216, 255, 224, 0, 16]);
  b.set([255, 192, 0, 17, 8], 20);
  b.writeUInt16BE(100, 25);
  b.writeUInt16BE(100, 27);
  b.set([255, 217], 298);
  return b.toString("base64");
};
const panels = (count = 1) =>
  Array.from({ length: count }, (_, i) => ({
    photo: 1,
    part: i + 1,
    data: jpeg(),
  }));
const word = (content: string, x: number, y: number, confidence = 0.99) => ({
  content,
  confidence,
  polygon: [x, y, x + 10, y, x + 10, y + 5, x, y + 5],
});
const record = () => ({
  status: "succeeded",
  analyzeResult: {
    apiVersion: AZURE_API_VERSION,
    modelId: "prebuilt-receipt",
    pages: [
      {
        pageNumber: 1,
        unit: "pixel",
        width: 100,
        height: 100,
        angle: 0,
        words: [
          word("Tea", 10, 10),
          word("5.50", 60, 10),
          word("Tea", 10, 25),
          word("5.50", 60, 25),
        ],
      },
    ],
    content: "DO NOT USE NATIVE CONTENT",
    documents: [
      {
        fields: {
          Total: { valueCurrency: { amount: 999999, currencyCode: "AUD" } },
        },
      },
    ],
  },
});
const context = { photo: 1, part: 1, width: 100, height: 100 };
const json = (value: unknown) =>
  new Response(JSON.stringify(value), {
    headers: { "content-type": "application/json" },
  });
const location = (id: number) =>
  endpoint +
  `/documentintelligence/documentModels/prebuilt-receipt/analyzeResults/00000000-0000-0000-0000-${String(id).padStart(12, "0")}?api-version=${AZURE_API_VERSION}`;
type Call = { url: string; options: RequestInit };
async function setup(
  options: {
    limit?: number;
    post?: (call: Call) => Response | Promise<Response>;
    poll?: (call: Call) => Response | Promise<Response>;
    deletion?: (call: Call) => Response | Promise<Response>;
    wait?: (ms: number, signal: AbortSignal) => Promise<void>;
  } = {},
) {
  const directory = await mkdtemp(join(tmpdir(), "gather-azure-"));
  folders.push(directory);
  const calls: Call[] = [];
  let id = 0;
  const config = {
    endpoint,
    key,
    directory,
    grant: "offline-azure-grant",
    limit: options.limit ?? 2,
    wait: options.wait ?? (async () => {}),
    fetcher: async (
      input: string | URL | Request,
      request: RequestInit = {},
    ) => {
      const call = {
        url:
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url,
        options: request,
      };
      calls.push(call);
      if (request.method === "POST")
        return options.post
          ? options.post(call)
          : new Response(null, {
              status: 202,
              headers: { "operation-location": location(++id) },
            });
      if (request.method === "DELETE")
        return options.deletion
          ? options.deletion(call)
          : new Response(null, { status: 204 });
      return options.poll ? options.poll(call) : json(record());
    },
  };
  return { reader: createAzureReader(config), config, directory, calls };
}
afterEach(async () => {
  for (const server of servers.splice(0))
    await new Promise<void>((done, reject) => {
      server.close((e) => (e ? reject(e) : done()));
      server.closeAllConnections();
    });
  for (const path of folders.splice(0)) {
    if (
      !resolve(path).startsWith(resolve(tmpdir()) + sep) ||
      !path.includes("gather-azure-")
    )
      throw new Error("Unsafe fixture directory");
    await rm(path, { recursive: true, force: true });
  }
});

describe("Azure word geometry", () => {
  it("marks fields on weak source rows for review without changing amounts", () => {
    const raw = record();
    raw.analyzeResult.pages[0].words[1].confidence = 0.3;
    const panel = projectAzurePage(raw, context);
    const output = receiptFromAzureWords(
      { engine: AZURE_ENGINE, panels: [panel] },
      { currency: "GBP" },
    );
    const item = output.receipt.items[0];
    expect(item.lineTotal).toBe("5.50");
    for (const field of ["description", "quantity", "unitPrice", "lineTotal"])
      expect(
        output.receipt.reviewChecks.some(
          (check) =>
            check.scope === "item" &&
            check.itemId === item.id &&
            check.field === field &&
            check.reason === "unclear" &&
            check.confirmedValue === "",
        ),
      ).toBe(true);
  });
  it("preserves every repeated word and genuine confidence, ignoring native fields", () => {
    const raw = record(),
      before = structuredClone(raw),
      p = projectAzurePage(raw, context);
    expect(raw).toEqual(before);
    expect(p.words).toHaveLength(4);
    expect(p.lines.map((l) => l.text)).toEqual(["Tea 5.50", "Tea 5.50"]);
    expect(p.lines[0]).toEqual({
      text: "Tea 5.50",
      confidence: 0.99,
      box: [0.1, 0.1, 0.7, 0.15],
    });
    const parsed = receiptFromAzureWords(
      { engine: AZURE_ENGINE, panels: [p] },
      { currency: "GBP" },
    );
    expect(parsed.receipt.items).toHaveLength(2);
    expect(parsed.receipt.items.every((i) => i.lineTotal === "5.50")).toBe(
      true,
    );
    for (const field of ["items", "adjustments", "pricesIncludeTax"])
      expect(
        parsed.receipt.reviewChecks.some(
          (c) =>
            c.scope === "receipt" &&
            c.field === field &&
            c.confirmedValue === "",
        ),
      ).toBe(true);
    expect(parsed.text).not.toMatch(/999999|AUD|NATIVE/);
  });
  it.each([
    "outside",
    "degenerate",
    "confidence",
    "dimension",
    "unit",
    "angle",
    "model",
    "page count",
    "empty",
  ])("rejects %s geometry", (fault) => {
    const r = record(),
      p = r.analyzeResult.pages[0];
    if (fault === "outside") p.words[0].polygon[0] = -1;
    if (fault === "degenerate") p.words[0].polygon.fill(10);
    if (fault === "confidence") p.words[0].confidence = 1.01;
    if (fault === "dimension") p.width = 101;
    if (fault === "unit") p.unit = "inch";
    if (fault === "angle") p.angle = NaN;
    if (fault === "model") r.analyzeResult.modelId = "prebuilt-layout";
    if (fault === "page count") r.analyzeResult.pages.push(structuredClone(p));
    if (fault === "empty") p.words = [];
    expect(() => projectAzurePage(r, context)).toThrow();
  });
  it("keeps sloping rows and overlapping slots separate", () => {
    const r = record(),
      p = r.analyzeResult.pages[0];
    p.words = [
      word("Tea", 10, 10),
      word("5.50", 60, 20),
      word("Tea", 10, 25),
      word("5.50", 60, 35),
    ];
    for (const w of p.words) {
      w.polygon[3] += 2;
      w.polygon[5] += 2;
    }
    expect(projectAzurePage(r, context).lines.map((l) => l.text)).toEqual([
      "Tea 5.50",
      "Tea 5.50",
    ]);
    p.words = [word("A", 10, 10), word("B", 11, 11)];
    expect(projectAzurePage(r, context).lines).toHaveLength(2);
  });
  it("requires Azure identity in the result contract", () => {
    const value = {
      recognition: {
        engine: "paddle-ppocrv6-medium-onnx",
        panels: [projectAzurePage(record(), context)],
      },
      remaining: 0,
      cleanup: "unknown",
    };
    expect(() => azureResultSchema.parse(value)).toThrow();
  });
});

describe("Azure bounded transport and allowance", () => {
  it.each([
    "http://synthetic.cognitiveservices.azure.com",
    "https://example.com",
    "https://foo.cognitiveservices.azure.com.evil.test",
    "https://user:pass@foo.cognitiveservices.azure.com",
    "https://foo.cognitiveservices.azure.com/path",
    "https://foo.cognitiveservices.azure.com/?a=b",
  ])("rejects untrusted endpoint %s", (url) =>
    expect(() => azureOrigin(url)).toThrow(),
  );
  it("credentials alone do not enable a reader or any request", async () => {
    const x = await setup({ limit: 0 });
    expect(await x.reader.getStatus()).toMatchObject({
      configured: false,
      remaining: 0,
    });
    await expect(
      x.reader.extract(panels(), { signal: new AbortController().signal }),
    ).rejects.toThrow(/allowance/);
    expect(x.calls).toEqual([]);
  });
  it("reads multiple panels once each, preserves mapping and deletes only their new results", async () => {
    const x = await setup(),
      r = await x.reader.extract(panels(2), {
        signal: new AbortController().signal,
      });
    expect(x.calls.map((c) => c.options.method)).toEqual([
      "POST",
      "GET",
      "DELETE",
      "POST",
      "GET",
      "DELETE",
    ]);
    expect(r.recognition.engine).toBe(AZURE_ENGINE);
    expect(r.recognition.panels.map((p) => p.part)).toEqual([1, 2]);
    expect(r.remaining).toBe(0);
    expect(r.cleanup).toBe("provider-reported-success");
    for (const call of x.calls) {
      expect(call.options.redirect).toBe("error");
      expect(call.options.headers).toMatchObject({
        "Ocp-Apim-Subscription-Key": key,
      });
      if (call.options.method === "POST")
        expect(Object.keys(JSON.parse(String(call.options.body)))).toEqual([
          "base64Source",
        ]);
    }
    const restarted = createAzureReader(x.config);
    expect(await restarted.getStatus()).toMatchObject({
      configured: false,
      remaining: 0,
    });
    const serialized = JSON.stringify(r);
    expect(serialized).not.toContain(key);
    expect(serialized).not.toContain(endpoint);
    expect(serialized).not.toContain("999999");
    const account = (await readdir(x.directory))[0],
      grant = join(x.directory, account, x.config.grant);
    for (const name of await readdir(grant)) {
      const text = await readFile(join(grant, name), "utf8");
      expect(text).not.toContain(key);
      expect(text).not.toContain("base64Source");
      expect(text).not.toContain("Tea");
    }
  });
  it("preflights insufficient allowance and malformed final panels before any upload", async () => {
    const x = await setup({ limit: 1 });
    await expect(
      x.reader.extract(panels(2), { signal: new AbortController().signal }),
    ).rejects.toThrow(/all receipt sections/);
    const bad = panels(2);
    bad[1].data = "abcdefgh";
    await expect(
      x.reader.extract(bad, { signal: new AbortController().signal }),
    ).rejects.toThrow(/JPEG/);
    expect(x.calls).toEqual([]);
    expect((await x.reader.getStatus()).remaining).toBe(1);
  });
  it("keeps a failed POST consumed without polling, deleting or retrying", async () => {
    const x = await setup({
      limit: 1,
      post: () => new Response(null, { status: 503 }),
    });
    await expect(
      x.reader.extract(panels(), { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ status: 502, cleanup: "unknown" });
    expect(x.calls).toHaveLength(1);
    expect((await x.reader.getStatus()).remaining).toBe(0);
  });
  it("never follows or deletes a cross-origin operation URL", async () => {
    const x = await setup({
      post: () =>
        new Response(null, {
          status: 202,
          headers: {
            "operation-location": location(1).replace(
              endpoint,
              "https://example.com",
            ),
          },
        }),
    });
    await expect(
      x.reader.extract(panels(), { signal: new AbortController().signal }),
    ).rejects.toThrow(/source words/);
    expect(x.calls).toHaveLength(1);
  });
  it("caps status checks at thirty and then cleans up once", async () => {
    const x = await setup({ poll: () => json({ status: "running" }) });
    await expect(
      x.reader.extract(panels(), { signal: new AbortController().signal }),
    ).rejects.toMatchObject({ cleanup: "provider-reported-success" });
    expect(x.calls.filter((c) => c.options.method === "GET")).toHaveLength(30);
    expect(x.calls.filter((c) => c.options.method === "DELETE")).toHaveLength(
      1,
    );
  });
  it("cancellation still uses one independent cleanup attempt and returns no partial result", async () => {
    const abort = new AbortController(),
      x = await setup({
        wait: async () => {
          abort.abort();
        },
      });
    await expect(
      x.reader.extract(panels(2), { signal: abort.signal }),
    ).rejects.toMatchObject({
      status: 504,
      cleanup: "provider-reported-success",
    });
    expect(x.calls.map((c) => c.options.method)).toEqual(["POST", "DELETE"]);
    expect(x.calls[1].options.signal?.aborted).toBe(false);
    expect((await x.reader.getStatus()).remaining).toBe(1);
  });
  it("reports unconfirmed deletion without retrying a successful extraction", async () => {
    const x = await setup({
      deletion: () => new Response(null, { status: 500 }),
    });
    const r = await x.reader.extract(panels(), {
      signal: new AbortController().signal,
    });
    expect(r.cleanup).toBe("unknown");
    expect(x.calls.map((c) => c.options.method)).toEqual([
      "POST",
      "GET",
      "DELETE",
    ]);
  });
  it("rejects credential echoes and mismatched source dimensions, with cleanup", async () => {
    for (const mode of ["echo", "geometry"]) {
      const x = await setup({
        poll: () => {
          const r = record();
          if (mode === "echo") r.analyzeResult.pages[0].words[0].content = key;
          else r.analyzeResult.pages[0].width = 101;
          return json(r);
        },
      });
      await expect(
        x.reader.extract(panels(), { signal: new AbortController().signal }),
      ).rejects.toMatchObject({ cleanup: "provider-reported-success" });
      expect(x.calls.map((c) => c.options.method)).toEqual([
        "POST",
        "GET",
        "DELETE",
      ]);
    }
  });
  it("two reader instances cannot exceed their shared finite allowance", async () => {
    const x = await setup({ limit: 1 }),
      other = createAzureReader(x.config);
    const all = await Promise.allSettled([
      x.reader.extract(panels(), { signal: new AbortController().signal }),
      other.extract(panels(), { signal: new AbortController().signal }),
    ]);
    expect(all.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(x.calls.filter((c) => c.options.method === "POST")).toHaveLength(1);
  });
});

describe("Azure local HTTP boundary", () => {
  async function server() {
    const x = await setup();
    const handler = createReceiptApi({ azureReader: x.reader });
    const s = createServer(
      (req, res) =>
        void handler(req, res, () => {
          res.writeHead(404);
          res.end();
        }),
    );
    servers.push(s);
    await new Promise<void>((done) => s.listen(0, "127.0.0.1", done));
    return {
      ...x,
      base: `http://127.0.0.1:${(s.address() as AddressInfo).port}`,
    };
  }
  it("exposes no credential and requires matching consent before the shared route can upload", async () => {
    const x = await server();
    const c = await (await fetch(x.base + "/api/receipts/providers")).json();
    expect(c.azure).toEqual({ configured: true, remaining: 2, maxPanels: 24 });
    expect(JSON.stringify(c)).not.toContain(key);
    const send = (body: unknown, headers: Record<string, string> = {}) =>
      fetch(x.base + "/api/receipts/azure", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gather-request": "receipt-scan",
          ...headers,
        },
        body: JSON.stringify(body),
      });
    expect((await send({ panels: panels() })).status).toBe(400);
    expect(
      (
        await send({
          consent: true,
          privacyNotice: "old-notice",
          panels: panels(),
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(
          { consent: true, privacyNotice: AZURE_NOTICE, panels: panels() },
          { origin: "https://example.com" },
        )
      ).status,
    ).toBe(403);
    expect(x.calls).toEqual([]);
    const r = await send({
      consent: true,
      privacyNotice: AZURE_NOTICE,
      panels: panels(),
    });
    expect(r.status).toBe(200);
    expect((await r.json()).recognition.engine).toBe(AZURE_ENGINE);
    expect(x.calls).toHaveLength(3);
  });
});
