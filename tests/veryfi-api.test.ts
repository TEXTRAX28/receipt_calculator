import { afterEach, describe, expect, it } from "vitest";
import { createServer, request, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createReceiptApi } from "../server/receipt-api.mjs";
import {
  createVeryfiReader,
  VERYFI_ENDPOINT,
} from "../server/veryfi-reader.mjs";
import { VERYFI_NOTICE } from "../src/lib/veryfi-schema.mjs";

const servers: Server[] = [],
  folders: string[] = [];
const clientId = "offline_client_id",
  bearerKey = "offline_bearer_key_only_for_tests";
const text = "SYNTHETIC MARKET\nTea 1x 5.50 5.50\nTOTAL GBP 5.50";
function requestBody() {
  const jpeg = Buffer.alloc(300);
  jpeg.set([255, 216, 255, 224, 0, 16]);
  jpeg.set([255, 192, 0, 17, 8], 20);
  jpeg.writeUInt16BE(32, 25);
  jpeg.writeUInt16BE(32, 27);
  jpeg.set([255, 217], 298);
  return {
    consent: true,
    privacyNotice: VERYFI_NOTICE,
    panels: [{ photo: 1, part: 1, data: jpeg.toString("base64") }],
  };
}
async function setup({ limit = 1, stalled = false, timeoutMs = 120000 } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "gather-veryfi-api-"));
  folders.push(directory);
  const calls: string[] = [];
  const reader = createVeryfiReader({
    clientId,
    bearerKey,
    directory,
    grant: "offline-api-grant",
    limit,
    fetcher: async (input, options = {}) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      calls.push(`${options.method} ${url}`);
      if (options.method === "DELETE") {
        expect(url).toBe(VERYFI_ENDPOINT + "/123");
        return new Response(null, { status: 204 });
      }
      expect(url).toBe(VERYFI_ENDPOINT);
      if (stalled)
        return new Promise<Response>((_resolve, reject) => {
          options.signal!.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          );
        });
      const body = JSON.parse(options.body as string);
      return new Response(
        JSON.stringify({
          id: 123,
          external_id: body.external_id,
          ocr_text: text,
          total: 99999,
          currency_code: "WRONG",
          line_items: [{ total: 99999 }],
        }),
        { status: 201, headers: { "content-type": "application/json" } },
      );
    },
  });
  const handler = createReceiptApi({ veryfiReader: reader, timeoutMs });
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
  return {
    reader,
    calls,
    base,
    rawPost: (headers: Record<string, string>) =>
      new Promise<number>((done, reject) => {
        const req = request(
          `${base}/api/receipts/veryfi`,
          {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-gather-request": "receipt-scan",
              ...headers,
            },
          },
          (res) => {
            res.resume();
            res.once("end", () => done(res.statusCode!));
          },
        );
        req.once("error", reject);
        req.end(JSON.stringify(requestBody()));
      }),
    post: (
      body: unknown = requestBody(),
      headers: Record<string, string> = {},
    ) =>
      fetch(`${base}/api/receipts/veryfi`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-gather-request": "receipt-scan",
          origin: base,
          ...headers,
        },
        body: JSON.stringify(body),
      }),
  };
}
afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((done, reject) =>
            server.close((error) => (error ? reject(error) : done())),
          ),
      ),
  );
  for (const folder of folders.splice(0)) {
    if (
      !resolve(folder).startsWith(resolve(tmpdir()) + sep) ||
      !folder.includes("gather-veryfi-api-")
    )
      throw new Error("Unexpected fixture directory");
    await rm(folder, { recursive: true, force: true });
  }
});

describe("Veryfi route with a synthetic upstream and no live requests", () => {
  it("does not enable cloud spending from credentials alone or contact providers for status", async () => {
    const s = await setup({ limit: 0 });
    const status = await (
      await fetch(s.base + "/api/receipts/providers")
    ).json();
    expect(status.veryfi).toEqual({
      configured: false,
      remaining: 0,
      maxPanels: 15,
    });
    expect(JSON.stringify(status)).not.toContain(clientId);
    expect(JSON.stringify(status)).not.toContain(bearerKey);
    expect((await s.post()).status).toBe(503);
    expect(s.calls).toEqual([]);
  });
  it("requires current versioned consent before reserving credit and returns literal text only", async () => {
    const s = await setup();
    const valid = requestBody();
    for (const body of [
      { panels: valid.panels },
      { ...valid, consent: false },
      { ...valid, privacyNotice: "old-notice" },
      { ...valid, currency: "GBP" },
    ])
      expect((await s.post(body)).status).toBe(400);
    expect((await s.reader.getStatus()).remaining).toBe(1);
    expect(s.calls).toEqual([]);
    const result = await s.post();
    expect(result.status).toBe(200);
    const body = await result.json();
    expect(body).toMatchObject({
      text,
      cleanup: "provider-reported-success",
      remaining: 0,
    });
    expect(body.total).toBeUndefined();
    expect(body.currency_code).toBeUndefined();
    expect(body.line_items).toBeUndefined();
    expect(body.id).toBeUndefined();
    expect((await s.post()).status).toBe(429);
    expect(s.calls).toEqual([
      `POST ${VERYFI_ENDPOINT}`,
      `DELETE ${VERYFI_ENDPOINT}/123`,
    ]);
  });
  it("retains loopback-host, same-origin and scanner JSON guards without using credits", async () => {
    const s = await setup();
    expect(
      (await s.post(undefined, { origin: "https://other.invalid" })).status,
    ).toBe(403);
    // Native fetch normalizes Host; use a real HTTP request for this guard.
    expect(await s.rawPost({ host: "other.invalid" })).toBe(403);
    expect((await s.post(undefined, { "x-gather-request": "" })).status).toBe(
      415,
    );
    expect(
      (await s.post(undefined, { "content-type": "text/plain" })).status,
    ).toBe(415);
    expect(s.calls).toEqual([]);
    expect((await s.reader.getStatus()).remaining).toBe(1);
  });
  it("applies the API deadline, reserves the failed attempt and never retries an uncertain upload", async () => {
    const s = await setup({ stalled: true, timeoutMs: 80 });
    const result = await s.post();
    expect(result.status).toBe(504);
    const body = await result.json();
    expect(body.error).toMatch(/cancelled|timed out/);
    // The status remains available for the UI even when the API deadline fired.
    // A timed-out upload has no proven new identity and cannot safely be deleted.
    expect(body.cleanup).toBe("unknown");
    expect(s.calls).toEqual([`POST ${VERYFI_ENDPOINT}`]);
    expect((await s.reader.getStatus()).remaining).toBe(0);
  });
});
