import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { extname, relative, resolve } from "node:path";

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
  ".bcmap": "application/octet-stream",
  ".ttf": "font/ttf",
  ".pfb": "application/octet-stream",
  ".icc": "application/octet-stream",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

export async function indexBuiltFiles(directory) {
  const root = resolve(directory);
  const routes = new Map();
  async function visit(folder) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".")) continue;
      const file = resolve(folder, entry.name);
      if (entry.isDirectory()) {
        if (folder !== root || ["assets", "pdf-assets"].includes(entry.name))
          await visit(file);
      } else if (
        entry.isFile() &&
        Object.hasOwn(mime, extname(file)) &&
        (folder !== root || entry.name === "index.html")
      ) {
        routes.set("/" + relative(root, file).replaceAll("\\", "/"), file);
      }
    }
  }
  await visit(root);
  if (!routes.has("/index.html")) throw new Error("Run npm run build first.");
  return routes;
}

export async function serveBuiltFile(req, res, pathname, routes) {
  const file = routes.get(pathname === "/" ? "/index.html" : pathname);
  if (!file) return false;
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" }).end();
    return true;
  }
  const info = await stat(file);
  res.writeHead(200, {
    "content-type": mime[extname(file)],
    "content-length": info.size,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "same-origin",
  });
  if (req.method === "HEAD") res.end();
  else {
    const stream = createReadStream(file);
    stream.once("error", () => res.destroy());
    res.once("close", () => stream.destroy());
    stream.pipe(res);
  }
  return true;
}
