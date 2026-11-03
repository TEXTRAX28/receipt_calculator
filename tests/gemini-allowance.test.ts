import { afterEach, describe, expect, it, vi } from "vitest";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { createReceiptApi } from "../server/receipt-api.mjs";
import { aiCostcoDraft } from "./fixtures/ai-receipt";

const servers: Server[] = [],
  folders: string[] = [];
const fakeKey = "synthetic_gemini_key_not_real";
const success = () =>
  new Response(
    JSON.stringify({
      status: "completed",
      steps: [
        {
          type: "model_output",
          content: [{ type: "text", text: JSON.stringify(aiCostcoDraft()) }],
        },
      ],
    }),
  );
const panels = [1, 2].map((photo) => ({ photo, part: 1, data: "" }));
const jpeg = await readFile(
  new URL("./fixtures/prepared-section.jpg", import.meta.url),
);
panels.forEach((panel) => {
  panel.data = jpeg.toString("base64");
});
const body = { consent: true, panels };
async function folder() {
  const directory = await mkdtemp(join(tmpdir(), "gather-gemini-budget-"));
  folders.push(directory);
  return directory;
}
async function api(
  directory: string,
  options: Parameters<typeof createReceiptApi>[0] = {},
) {
  const upstream = vi.fn(async () => success());
  const handler = createReceiptApi({
    apiKey: fakeKey,
    geminiAllowance: { directory, grant: "offline-shared-grant", limit: 1 },
    fetcher: upstream,
    ...options,
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
  return {
    upstream,
    status: async () => (await fetch(base + "/api/receipts/config")).json(),
    post: (value: unknown = body) =>
      fetch(base + "/api/receipts/extract", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gather-request": "receipt-scan",
          origin: base,
        },
        body: JSON.stringify(value),
      }),
  };
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((done) => {
          server.closeAllConnections();
          server.close(() => done());
        }),
    ),
  );
  for (const directory of folders.splice(0)) {
    if (
      !resolve(directory).startsWith(resolve(tmpdir()) + sep) ||
      !directory.includes("gather-gemini-budget-")
    )
      throw Error("Unsafe test directory");
    await rm(directory, { recursive: true, force: true });
  }
});
async function slots(directory: string) {
  const names = await readdir(directory, { recursive: true });
  return Promise.all(
    names
      .filter((name) => name.endsWith(".json"))
      .map((name) => readFile(join(directory, name), "utf8")),
  );
}

describe("Gemini persistent request allowance through actual loopback HTTP", () => {
  it("a key alone cannot enable a request and status exposes no credentials", async () => {
    const client = await api(await folder(), { geminiAllowance: undefined });
    const status = await client.status();
    expect(status).toMatchObject({
      configured: false,
      remaining: 0,
      availability: "missing-allowance",
    });
    expect(JSON.stringify(status)).not.toContain(fakeKey);
    expect((await client.post()).status).toBe(503);
    expect(client.upstream).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1.5, 101, NaN])(
    "refuses invalid request limit %s",
    async (limit) => {
      const directory = await folder(),
        client = await api(directory, {
          geminiAllowance: { directory, grant: "offline-invalid-limit", limit },
        });
      expect((await client.status()).configured).toBe(false);
      expect((await client.post()).status).toBe(503);
      expect(client.upstream).not.toHaveBeenCalled();
    },
  );
  it("validates consent and every JPEG before reserving; one multi-photo request consumes one slot", async () => {
    const directory = await folder();
    for (const invalid of [
      { ...body, consent: false },
      {
        ...body,
        panels: [
          panels[0],
          { ...panels[1], data: Buffer.alloc(300).toString("base64") },
        ],
      },
    ]) {
      const client = await api(directory);
      expect((await client.post(invalid)).status).toBe(400);
      expect(client.upstream).not.toHaveBeenCalled();
      expect(await slots(directory)).toEqual([]);
    }
    const client = await api(directory);
    expect((await client.post()).status).toBe(200);
    expect(client.upstream).toHaveBeenCalledOnce();
    expect(await client.status()).toMatchObject({
      configured: false,
      remaining: 0,
      availability: "exhausted",
    });
    const records = await slots(directory);
    expect(records).toHaveLength(1);
    expect(JSON.parse(records[0]).state).toBe("completed");
    expect(records[0]).not.toContain(fakeKey);
    expect(records[0]).not.toContain(panels[0].data);
    expect(records[0]).not.toContain("SPAM");
  });
  it("two independent API handlers atomically share the cap; restart, key and model changes cannot replenish it", async () => {
    const directory = await folder(),
      one = await api(directory),
      two = await api(directory);
    const responses = await Promise.all([one.post(), two.post()]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(
      one.upstream.mock.calls.length + two.upstream.mock.calls.length,
    ).toBe(1);
    const restarted = await api(directory, {
      apiKey: "different_synthetic_key",
      model: "different-synthetic-model",
    });
    expect((await restarted.post()).status).toBe(429);
    expect(restarted.upstream).not.toHaveBeenCalled();
    expect(await slots(directory)).toHaveLength(1);
  });
  it.each([401, 403, 429, 503])(
    "HTTP %i consumes the attempt without retry, including after restart",
    async (status) => {
      const directory = await folder(),
        upstream = vi.fn(
          async () => new Response("private-provider-error", { status }),
        );
      const client = await api(directory, { fetcher: upstream });
      const response = await client.post();
      expect(response.ok).toBe(false);
      expect(await response.text()).not.toContain("private-provider-error");
      expect(upstream).toHaveBeenCalledOnce();
      expect(JSON.parse((await slots(directory))[0]).state).toBe("failed");
      const restarted = await api(directory);
      expect((await restarted.post()).status).toBe(429);
      expect(restarted.upstream).not.toHaveBeenCalled();
    },
  );
  it("a lost response remains spent and does not expose the transport error", async () => {
    const directory = await folder(),
      upstream = vi.fn(async () => {
        throw Error(fakeKey);
      });
    const client = await api(directory, { fetcher: upstream });
    const response = await client.post();
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(fakeKey);
    expect((await (await api(directory)).post()).status).toBe(429);
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("a malformed model response is still an attempt", async () => {
    const directory = await folder(),
      upstream = vi.fn(async () => new Response("not-json"));
    expect(
      (await (await api(directory, { fetcher: upstream })).post()).status,
    ).toBe(502);
    expect((await (await api(directory)).post()).status).toBe(429);
    expect(upstream).toHaveBeenCalledOnce();
  });
  it("a deadline consumes the slot and cancellation stops the injected transport", async () => {
    const directory = await folder(),
      upstream = vi.fn(
        (_input: RequestInfo | URL, options?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            options!.signal!.addEventListener(
              "abort",
              () => reject(new DOMException("Aborted", "AbortError")),
              { once: true },
            );
          }),
      );
    const client = await api(directory, { fetcher: upstream, timeoutMs: 100 });
    expect((await client.post()).status).toBe(504);
    expect(upstream).toHaveBeenCalledOnce();
    expect(JSON.parse((await slots(directory))[0]).state).toBe("cancelled");
    expect((await (await api(directory)).post()).status).toBe(429);
  });
  it("storage failure disables status and cannot send a request", async () => {
    const directory = await folder(),
      blocked = join(directory, "not-a-directory");
    await writeFile(blocked, "synthetic obstacle");
    const client = await api(blocked);
    expect(await client.status()).toMatchObject({
      configured: false,
      availability: "storage-unavailable",
    });
    expect((await client.post()).status).toBe(503);
    expect(client.upstream).not.toHaveBeenCalled();
  });
});
