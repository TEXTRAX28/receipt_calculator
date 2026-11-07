import { afterEach, beforeEach, describe, expect, it } from "vitest";
import http from "node:http";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, sep } from "node:path";
import {
  createPhoneHandler,
  indexBuiltFiles,
  ipv4,
  isPrivateAddress,
} from "../server/phone-preview.mjs";

const origin = "https://127.0.0.1:5443",
  code = "ABCDEF123456";
let server: http.Server, directory: string, port: number, clock: number;
type Response = {
  status: number;
  headers: http.IncomingHttpHeaders;
  text: string;
};
function request(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
  } = {},
): Promise<Response> {
  return new Promise((ok, fail) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method: options.method || "GET",
        headers: { host: "127.0.0.1:5443", ...options.headers },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (bytes) => chunks.push(bytes));
        res.on("end", () =>
          ok({
            status: res.statusCode!,
            headers: res.headers,
            text: Buffer.concat(chunks).toString(),
          }),
        );
      },
    );
    req.once("error", fail);
    req.end(options.body);
  });
}
const pair = (value = code, headers: Record<string, string> = { origin }) =>
  request("/pair", {
    method: "POST",
    headers,
    body: new URLSearchParams({ code: value }).toString(),
  });
async function authenticated() {
  const result = await pair();
  return result.headers["set-cookie"]![0].split(";")[0];
}

beforeEach(async () => {
  clock = 0;
  directory = await mkdtemp(resolve(tmpdir(), "gather-phone-preview-"));
  await writeFile(
    resolve(directory, "index.html"),
    '<div id="root">Synthetic app</div>',
  );
  await writeFile(resolve(directory, "app.js"), "export default 1");
  const gateway = createPhoneHandler({
    origin,
    host: "127.0.0.1",
    netmask: "255.255.255.0",
    accessCode: code,
    routes: await indexBuiltFiles(directory),
    now: () => clock,
  });
  server = http.createServer((req, res) => {
    void gateway.handler(req, res);
  });
  await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
  port = (server.address() as import("node:net").AddressInfo).port;
});
afterEach(async () => {
  server?.closeAllConnections();
  if (server) await new Promise<void>((ok) => server.close(() => ok()));
  if (directory?.startsWith(resolve(tmpdir()) + sep + "gather-phone-preview-"))
    await rm(directory, { recursive: true });
});

describe("private phone preview", () => {
  it("keeps form POST Origin intact and serves a displayable login page", async () => {
    const result = await request("/");
    expect(result.status).toBe(200);
    expect(result.headers["referrer-policy"]).toBe("same-origin");
    expect(result.headers["content-type"]).toContain("text/html");
    expect(result.text).toContain('action="/pair"');
    expect(result.headers["content-security-policy"]).toContain(
      "form-action 'self'",
    );
  });
  it.each([undefined, "null", "https://example.invalid"])(
    "rejects an untrusted POST Origin %s with readable text",
    async (value) => {
      const result = await pair(code, value ? { origin: value } : {});
      expect(result.status).toBe(403);
      expect(result.headers["content-type"]).toContain("text/plain");
      expect(result.headers["set-cookie"]).toBeUndefined();
    },
  );
  it("shows an incorrect code inline instead of a downloadable response", async () => {
    const result = await pair("000000000000");
    expect(result.status).toBe(401);
    expect(result.headers["content-type"]).toContain("text/html");
    expect(result.text).toContain('role="alert"');
    expect(result.text).toContain('action="/pair"');
    expect(result.headers["content-disposition"]).toBeUndefined();
  });
  it("rejects Unicode code input cleanly", async () => {
    expect((await pair("é".repeat(12))).status).toBe(401);
  });
  it("signs in with a safe redirect and a protected cookie", async () => {
    const result = await pair();
    expect(result.status).toBe(303);
    expect(result.headers.location).toBe("/");
    expect(result.headers["set-cookie"]![0]).toMatch(
      /; Secure; HttpOnly; SameSite=Strict;/,
    );
    const page = await request("/", {
      headers: { cookie: result.headers["set-cookie"]![0].split(";")[0] },
    });
    expect(page.status).toBe(200);
    expect(page.text).toContain("Synthetic app");
  });
  it("redirects a re-opened /pair URL to the home page", async () => {
    const result = await request("/pair");
    expect(result.status).toBe(303);
    expect(result.headers.location).toBe("/");
  });
  it("limits guessing and permits retry after the minute expires", async () => {
    for (let i = 0; i < 5; i++)
      expect((await pair("000000000000")).status).toBe(401);
    const held = await pair();
    expect(held.status).toBe(429);
    expect(held.headers["content-type"]).toContain("text/html");
    clock = 60000;
    expect((await pair()).status).toBe(303);
  });
  it("blocks a hostile Host header", async () => {
    expect(
      (await request("/", { headers: { host: "example.invalid" } })).status,
    ).toBe(403);
  });
  it("denies API access before authentication and rejects a forged cookie", async () => {
    expect((await request("/api/receipts/providers")).status).toBe(401);
    expect(
      (
        await request("/app.js", {
          headers: { cookie: "gather_phone=invalid" },
        })
      ).status,
    ).toBe(401);
  });
  it.each([
    "openai",
    "extract",
    "recognize",
    "veryfi",
    "azure",
    "vision-batches",
  ])("never accepts a %s extraction upload", async (provider) => {
    const cookie = await authenticated();
    expect(
      (
        await request("/api/receipts/" + provider, {
          method: "POST",
          headers: { cookie, origin },
          body: "{}",
        })
      ).status,
    ).toBe(403);
  });
  it("reports every available reader as unconfigured", async () => {
    const cookie = await authenticated();
    const result = JSON.parse(
      (await request("/api/receipts/providers", { headers: { cookie } })).text,
    );
    expect(result.localModel.configured).toBe(false);
    expect(result.localVision.configured).toBe(false);
    expect(
      JSON.parse(
        (await request("/api/receipts/openai/config", { headers: { cookie } }))
          .text,
      ).configured,
    ).toBe(false);
  });
  it.each([
    "/.env.local",
    "/server/receipt-api.mjs",
    "/.receipt-reader-state/phone-preview/ca-key.pem",
  ])("does not expose %s", async (path) => {
    const cookie = await authenticated();
    expect((await request(path, { headers: { cookie } })).status).toBe(404);
  });
  it("serves built JavaScript with a usable type and supports HEAD", async () => {
    const cookie = await authenticated();
    const result = await request("/app.js", {
      method: "HEAD",
      headers: { cookie },
    });
    expect(result.status).toBe(200);
    expect(result.text).toBe("");
    expect(result.headers["content-type"]).toContain("javascript");
  });
  it("does not index hidden files or source-only extensions", async () => {
    await mkdir(resolve(directory, ".private"));
    await writeFile(resolve(directory, ".private", "data.txt"), "private");
    await writeFile(resolve(directory, "config.pem"), "synthetic non-key data");
    const routes = await indexBuiltFiles(directory);
    expect(routes.has("/.private/data.txt")).toBe(false);
    expect(routes.has("/config.pem")).toBe(false);
  });
});

describe("local address selection", () => {
  it.each(["10.130.249.5", "172.16.24.50", "172.31.255.255", "192.168.1.2"])(
    "permits private address %s",
    (value) => {
      expect(isPrivateAddress(value)).toBe(true);
    },
  );
  it.each([
    "127.0.0.1",
    "172.32.0.1",
    "8.8.8.8",
    "10.999.0.1",
    "localhost",
    "::1",
  ])("rejects non-LAN address %s", (value) => {
    expect(isPrivateAddress(value)).toBe(false);
  });
  it("parses a real IPv4 address without accepting extra fields", () => {
    expect(ipv4("10.130.249.5")).toBe(0x0a82f905);
    expect(ipv4("10.130.249.5.1")).toBeNull();
  });
});
