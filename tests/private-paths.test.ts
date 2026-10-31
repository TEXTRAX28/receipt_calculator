import { afterEach, expect, it } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { privateFileDeny } from "../server/private-paths.mjs";

const ownedBase = resolve("node_modules/.gather-private-http-tests");
let root: string, server: ViteDevServer;
afterEach(async () => {
  await server?.close();
  if (!root) return;
  const inside = relative(await realpath(ownedBase), await realpath(root));
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Unsafe private HTTP fixture cleanup");
  await rm(root, { recursive: true, force: true });
});

it("serves public files but blocks private data through direct, encoded and absolute development HTTP paths", async () => {
  await mkdir(ownedBase, { recursive: true });
  root = await mkdtemp(join(ownedBase, "app-"));
  const secret = "SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_BE_SERVED";
  const privateFiles = [
    "private-receipts/runtime/scan-fixture/1.jpg",
    "receipt_training/private/receipt.json",
    "qa-artifacts/receipt-output.json",
    "graphify-out/graph.json",
    ".graphify/cache.json",
    ".cache/model.bin",
    "test-results/screenshot.png",
    "playwright-report/index.html",
    ".git/config",
    ".env.local",
    ".npmrc",
    "secret.pem",
  ];
  await writeFile(join(root, "public.txt"), "PUBLIC_CONTROL");
  for (const file of privateFiles) {
    await mkdir(dirname(join(root, file)), { recursive: true });
    await writeFile(join(root, file), secret);
  }
  server = await createServer({
    configFile: false,
    root,
    envDir: root,
    logLevel: "silent",
    cacheDir: join(root, "vite-cache"),
    optimizeDeps: { noDiscovery: true },
    server: {
      host: "127.0.0.1",
      port: 0,
      hmr: false,
      fs: { allow: [root], deny: privateFileDeny },
    },
  });
  await server.listen();
  const base = `http://127.0.0.1:${(server.httpServer!.address() as AddressInfo).port}`;
  expect(await (await fetch(`${base}/public.txt`)).text()).toBe(
    "PUBLIC_CONTROL",
  );
  for (const file of privateFiles) {
    const encoded = file.replace(
      /[a-z]/,
      (letter) => `%${letter.charCodeAt(0).toString(16)}`,
    );
    const absolute = join(root, file).replaceAll("\\", "/");
    const paths = [
      `/${file}`,
      `/${encoded}`,
      `/@fs/${absolute}`,
      ...(process.platform === "win32" ? [`/${file.toUpperCase()}`] : []),
    ];
    for (const path of paths) {
      const response = await fetch(base + path);
      expect(response.status, path).toBe(403);
      expect(await response.text(), path).not.toContain(secret);
    }
  }
});
