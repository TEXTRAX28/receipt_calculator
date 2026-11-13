import { createServer } from "node:http";
import { resolve } from "node:path";
import { parseArgs } from "node:util";
import { indexBuiltFiles, serveBuiltFile } from "../server/built-site.mjs";
import { createReceiptApi } from "../server/receipt-api.mjs";
import { openAiSettings } from "../server/openai-settings.mjs";

const { values } = parseArgs({
  options: { port: { type: "string", default: "4175" } },
});
const port = Number(values.port);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("Choose a port from 1024 to 65535.");

const host = "127.0.0.1";
const root = resolve(import.meta.dirname, "..");
const routes = await indexBuiltFiles(resolve(root, "dist"));
const api = createReceiptApi(openAiSettings(root));
const server = createServer((req, res) => {
  if (![host + ":" + port, "localhost:" + port].includes(req.headers.host)) {
    res.writeHead(403).end("Open Gather using its local server address.");
    return;
  }
  void api(req, res, async () => {
    const path = decodeURIComponent((req.url || "").split("?")[0]);
    if (!(await serveBuiltFile(req, res, path, routes)))
      res.writeHead(404).end("Not found.");
  }).catch(() => {
    if (res.headersSent) res.destroy();
    else
      res.writeHead(500).end("The local server could not finish this request.");
  });
});
server.headersTimeout = 10000;
server.requestTimeout = 20000;
server.maxConnections = 32;
server.listen(port, host, () =>
  console.log("Gather is ready at http://" + host + ":" + port + "/"),
);
