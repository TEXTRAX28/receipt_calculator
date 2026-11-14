import assert from "node:assert/strict";
import http from "node:http";
import https from "node:https";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { freemem } from "node:os";
import { serveBuiltFile, indexBuiltFiles } from "./built-site.mjs";

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

const login = `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gather OpenAI phone test</title><style>body{font:16px system-ui;background:#f5f3eb;color:#17231b;margin:0;padding:24px}main{max-width:420px;margin:8vh auto;background:white;padding:24px;border-radius:18px}input,button{font:inherit;box-sizing:border-box;width:100%;min-height:48px;padding:10px;margin-top:12px}button{background:#344f3e;color:white;border:0;border-radius:9px}</style></head><body><main><h1>Gather OpenAI phone test</h1><p>Enter the access code from your PC. Keep your PC awake while testing. OpenAI reads receipts after you authorize a scan.</p><!--error--><form method="post" action="/pair"><label for="code">Access code</label><input id="code" name="code" type="password" autocomplete="off" required maxlength="12"><button>Open Gather</button></form></main></body></html>`;

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

/** Forward the two authorized OpenAI routes to the existing loopback reader. */
function forwardOpenAi(req, res, pathname, port) {
  const headers = {};
  if (req.method === "POST") {
    headers.origin = `http://127.0.0.1:${port}`;
    for (const name of [
      "content-type",
      "content-length",
      "content-encoding",
      "x-gather-request",
    ]) {
      const value = req.headers[name];
      if (typeof value === "string") headers[name] = value;
    }
  }
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port,
      path: pathname,
      method: req.method,
      headers,
    },
    (response) => {
      if (res.destroyed) return response.destroy();
      res.writeHead(response.statusCode || 502, {
        "content-type": "application/json",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
      });
      response.once("error", () => res.destroy());
      response.pipe(res);
    },
  );
  const cancel = () => upstream.destroy();
  req.once("aborted", cancel);
  req.once("error", cancel);
  res.once("close", cancel);
  upstream.setTimeout(95000, cancel);
  upstream.once("error", () => {
    if (res.destroyed || res.writableEnded) return;
    if (res.headersSent) return res.destroy();
    send(
      res,
      502,
      JSON.stringify({
        error: "Check that the OpenAI preview is running on your PC.",
      }),
      { "content-type": "application/json" },
    );
  });
  if (req.method === "POST") req.pipe(upstream);
  else upstream.end();
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

/** Paired HTTPS preview. The OpenAI reader stays on loopback. */
export function createPhoneHandler({
  origin,
  host,
  netmask,
  accessCode,
  routes,
  now = Date.now,
  openAiPort = 4175,
}) {
  assert(/^[A-F0-9]{12}$/.test(accessCode), "Invalid local pairing code");
  assert(
    Number.isInteger(openAiPort) && openAiPort >= 1024 && openAiPort <= 65535,
    "Invalid OpenAI preview port.",
  );
  const cookieName = "gather_openai";
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
          "set-cookie": `${cookieName}=${token}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=28800`,
        });
      }
      const token = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith(cookieName + "="))
        ?.slice(cookieName.length + 1);
      if (!token || !sessions.has(token))
        return pathname === "/" && req.method === "GET"
          ? showLogin(res)
          : send(res, 401, "Enter the access code on the home page.");
      if (pathname.startsWith("/api/receipts/")) {
        if (
          (req.method === "GET" &&
            pathname === "/api/receipts/openai/config") ||
          (req.method === "POST" && pathname === "/api/receipts/openai")
        )
          return forwardOpenAi(req, res, pathname, openAiPort);
        return send(res, 404, "Not found.");
      }
      if (!(await serveBuiltFile(req, res, pathname, routes)))
        return send(res, 404, "Not found.");
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
  certificatePort = 0,
  cert,
  key,
  publicCertificate,
  accessCode,
  directory,
  openAiPort = 4175,
}) {
  assert(isPrivateAddress(host), "Use a private LAN IPv4 address.");
  const routes = await indexBuiltFiles(directory);
  const auth = createPhoneHandler({
    host,
    netmask,
    origin: `https://${host}:${port}`,
    accessCode,
    routes,
    openAiPort,
  });
  const secure = https.createServer(
    { cert, key, minVersion: "TLSv1.2" },
    (req, res) => {
      void auth.handler(req, res);
    },
  );
  const certificate = certificatePort
    ? http.createServer((req, res) => {
        const remote = ipv4(
          (req.socket.remoteAddress || "").replace(/^::ffff:/, ""),
        );
        if (
          remote === null ||
          (remote & ipv4(netmask)) >>> 0 !==
            (ipv4(host) & ipv4(netmask)) >>> 0 ||
          req.headers.host !== `${host}:${certificatePort}`
        )
          return send(res, 403, "Private local-network test only.");
        if (req.method !== "GET" || req.url !== "/gather-phone-test.cer")
          return send(res, 404, "Not found.");
        return send(res, 200, publicCertificate, {
          "content-type": "application/x-x509-ca-cert",
          "content-disposition": 'attachment; filename="gather-phone-test.cer"',
        });
      })
    : null;
  const servers = certificate ? [secure, certificate] : [secure];
  for (const server of servers) {
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
    if (certificate) await listen(certificate, certificatePort);
  } catch (error) {
    for (const server of servers) {
      server.closeAllConnections();
      server.close();
    }
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
      servers.map(
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
