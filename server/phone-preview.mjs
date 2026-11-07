import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { createReadStream } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { freemem } from "node:os";
import { MAX_READING_PANELS } from "../src/lib/scan-limits.mjs";

const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".wasm": "application/wasm",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};
const assetExtensions = new Set([
  ...Object.keys(mime),
  ".gz",
  ".tar",
  ".bcmap",
  ".ttf",
  ".pfb",
  ".icc",
  ".txt",
  ".woff",
  ".woff2",
]);

export function ipv4(value) {
  const parts = value.split(".");
  if (
    parts.length !== 4 ||
    parts.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)
  )
    return null;
  return parts.reduce((n, x) => n * 256 + Number(x), 0) >>> 0;
}

export function isPrivateAddress(value) {
  const n = ipv4(value);
  return (
    n !== null && (n >>> 24 === 10 || n >>> 20 === 0xac1 || n >>> 16 === 0xc0a8)
  );
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(body);
}

const login = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gather phone test</title><style>body{font:16px system-ui;background:#f5f3eb;color:#17231b;margin:0;padding:24px}main{max-width:420px;margin:8vh auto;background:white;padding:24px;border-radius:18px}input,button{font:inherit;box-sizing:border-box;width:100%;min-height:48px;padding:10px;margin-top:12px}button{background:#344f3e;color:white;border:0;border-radius:9px}</style></head><body><main><h1>Gather phone test</h1><p>Enter the access code from your PC. Keep your PC awake while testing. Receipt reading runs on your phone.</p><!--error--><form method="post" action="/pair"><label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="off" required maxlength="12"><button>Open Gather</button></form></main></body></html>`;

function showLogin(res, status = 200, message = "") {
  const safe = message
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  return send(
    res,
    status,
    login.replace(
      "<!--error-->",
      message ? `<p id="pair-error" role="alert">${safe}</p>` : "",
    ),
    {
      "content-type": "text/html; charset=utf-8",
      // no-referrer makes navigation/form POST Origin null and rejects a valid login.
      "referrer-policy": "same-origin",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    },
  );
}

async function body(req, max) {
  const chunks = [];
  let length = 0;
  for await (const bytes of req) {
    length += bytes.length;
    if (length > max)
      throw Object.assign(new Error("Request too large"), { status: 413 });
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, length);
}

export async function indexBuiltFiles(directory) {
  const root = resolve(directory),
    routes = new Map();
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const file = resolve(dir, entry.name);
      if (entry.isDirectory()) await visit(file);
      else if (assetExtensions.has(extname(file)))
        routes.set("/" + relative(root, file).replaceAll("\\", "/"), file);
    }
  }
  await visit(root);
  assert(
    routes.has("/index.html"),
    "Build the app before starting the phone preview.",
  );
  return routes;
}

/** Authenticated static preview only. No dotenv, native inference or provider key. */
export function createPhoneHandler({
  origin,
  host,
  netmask,
  accessCode,
  routes,
  now = Date.now,
}) {
  assert(/^[A-F0-9]{12}$/.test(accessCode), "Invalid local pairing code");
  const authority = new URL(origin).host,
    mask = ipv4(netmask),
    network = ipv4(host);
  assert(
    mask !== null && mask !== 0 && network !== null,
    "Invalid local network",
  );
  const sessions = new Set(),
    attempts = new Map();
  const handler = async (req, res) => {
    try {
      const remote = ipv4(
        (req.socket.remoteAddress || "").replace(/^::ffff:/, ""),
      );
      if (
        remote === null ||
        (remote & mask) >>> 0 !== (network & mask) >>> 0 ||
        req.headers.host !== authority
      )
        return send(res, 403, "Private local-network test only.");
      const pathname = decodeURIComponent(new URL(req.url, origin).pathname);
      if (req.method === "POST" && req.headers.origin !== origin)
        return send(
          res,
          403,
          "Open the Gather page on this address and try again.",
        );
      if (pathname === "/pair" && req.method === "GET")
        return send(res, 303, "", { location: "/" });
      if (pathname === "/pair" && req.method === "POST") {
        let state = attempts.get(remote);
        if (!state || now() - state.start >= 60000) {
          state = { start: now(), count: 0 };
          attempts.set(remote, state);
        }
        if (++state.count > 5)
          return showLogin(res, 429, "Wait a minute before trying again.");
        const value = (
          new URLSearchParams((await body(req, 256)).toString()).get("code") ||
          ""
        )
          .trim()
          .toUpperCase();
        if (
          !/^[A-F0-9]{12}$/.test(value) ||
          !timingSafeEqual(Buffer.from(value), Buffer.from(accessCode))
        )
          return showLogin(
            res,
            401,
            "Incorrect access code. Check the code on your PC and try again.",
          );
        if (sessions.size >= 4) sessions.delete(sessions.values().next().value);
        const token = randomBytes(32).toString("base64url");
        sessions.add(token);
        return send(res, 303, "", {
          location: "/",
          "set-cookie": `gather_phone=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`,
        });
      }
      const token = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("gather_phone="))
        ?.slice(13);
      if (!token || !sessions.has(token))
        return pathname === "/" && req.method === "GET"
          ? showLogin(res)
          : send(res, 401, "Enter the access code on the home page.");
      if (pathname.startsWith("/api/receipts/")) {
        // Configuration is safe to read; this preview never accepts extraction uploads.
        if (req.method !== "GET")
          return send(
            res,
            403,
            "Computer and cloud readers are disabled in the phone preview.",
          );
        const config =
          pathname === "/api/receipts/providers"
            ? {
                localModel: { configured: false, name: "PaddleOCR" },
                localVision: {
                  configured: false,
                  name: "Qwen3-VL 4B",
                  maxPanels: 3,
                  maxReceiptPanels: MAX_READING_PANELS,
                  supportsBatches: true,
                },
              }
            : pathname === "/api/receipts/config" ||
                pathname === "/api/receipts/openai/config"
              ? { configured: false, remaining: 0, availability: "missing-key" }
              : null;
        return send(
          res,
          config ? 200 : 404,
          JSON.stringify(config || { error: "Not found" }),
          { "content-type": "application/json" },
        );
      }
      if (!["GET", "HEAD"].includes(req.method))
        return send(res, 405, "Method unavailable.");
      const file = routes.get(pathname === "/" ? "/index.html" : pathname);
      if (!file) return send(res, 404, "Not found.");
      if (pathname === "/" || pathname === "/index.html")
        return send(res, 200, await readFile(file), {
          "content-type": mime[".html"],
        });
      const info = await stat(file);
      res.writeHead(200, {
        "content-type": mime[extname(file)] || "application/octet-stream",
        "content-length": info.size,
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(file);
      stream.once("error", () => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent)
        send(
          res,
          error.status === 413 ? 413 : 500,
          "The local preview request could not finish.",
        );
      else res.end();
    }
  };
  return {
    handler,
    clear: () => {
      sessions.clear();
      attempts.clear();
    },
  };
}

/** Start only explicitly selected local interfaces, with bounded lifetime/memory. */
export async function startPhonePreview({
  host,
  netmask,
  port,
  certificatePort,
  cert,
  key,
  publicCertificate,
  accessCode,
  directory,
}) {
  assert(isPrivateAddress(host), "Use a private LAN IPv4 address.");
  const routes = await indexBuiltFiles(directory);
  const auth = createPhoneHandler({
    host,
    netmask,
    origin: `https://${host}:${port}`,
    accessCode,
    routes,
  });
  const secure = https.createServer(
    { cert, key, minVersion: "TLSv1.2" },
    (req, res) => {
      void auth.handler(req, res);
    },
  );
  const certificate = http.createServer((req, res) => {
    const remote = ipv4(
      (req.socket.remoteAddress || "").replace(/^::ffff:/, ""),
    );
    if (
      remote === null ||
      (remote & ipv4(netmask)) >>> 0 !== (ipv4(host) & ipv4(netmask)) >>> 0 ||
      req.headers.host !== `${host}:${certificatePort}`
    )
      return send(res, 403, "Private local-network test only.");
    if (req.method !== "GET" || req.url !== "/gather-phone-test.cer")
      return send(res, 404, "Not found.");
    return send(res, 200, publicCertificate, {
      "content-type": "application/x-x509-ca-cert",
      "content-disposition": 'attachment; filename="gather-phone-test.cer"',
    });
  });
  for (const server of [secure, certificate]) {
    server.requestTimeout = 15000;
    server.headersTimeout = 10000;
    server.maxConnections = 16;
  }
  const listen = (server, localPort) =>
    new Promise((ok, fail) => {
      server.once("error", fail);
      server.listen(localPort, host, ok);
    });
  try {
    await listen(secure, port);
    await listen(certificate, certificatePort);
  } catch (error) {
    secure.closeAllConnections();
    secure.close();
    certificate.close();
    throw error;
  }
  const started = Date.now();
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    auth.clear();
    await Promise.all(
      [secure, certificate].map(
        (server) =>
          new Promise((ok) => {
            server.closeAllConnections();
            server.close(ok);
          }),
      ),
    );
  };
  const timer = setInterval(() => {
    if (freemem() < 1024 ** 3 || Date.now() - started >= 8 * 60 * 60 * 1000)
      void close();
  }, 1000);
  return { close };
}
