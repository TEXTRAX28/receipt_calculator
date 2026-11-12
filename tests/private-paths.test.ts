import { afterEach, expect, it, vi } from "vitest";
import { createServer, type ViteDevServer } from "vite";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { privateFileDeny } from "../server/private-paths.mjs";
import receiptConfig, { receiptEnvironment } from "../vite.config";

const ownedBase = join(tmpdir(), "gather-private-http-tests");
let root: string | undefined, server: ViteDevServer | undefined;
afterEach(async () => {
  vi.unstubAllEnvs();
  await server?.close();
  server = undefined;
  const ownedRoot = root;
  root = undefined;
  if (!ownedRoot) return;
  const inside = relative(await realpath(ownedBase), await realpath(ownedRoot));
  if (!inside || inside.startsWith("..") || isAbsolute(inside))
    throw new Error("Unsafe private HTTP fixture cleanup");
  await rm(ownedRoot, { recursive: true, force: true });
});

it("local-only configuration ignores cloud credentials, allowances and client variables", () => {
  const local = {
    LOCAL_OCR_PYTHON: "/installed/python",
    LOCAL_OCR_ENGINE: "paddle-v6",
    LOCAL_OCR_CACHE_ROOT: "/installed/models",
    LOCAL_VISION_ENABLED: "0",
    RECEIPT_ASSISTED_READER: "computer",
    LOCAL_OCR_CHECK_MODE: "off",
  };
  const variables = new Proxy(local, {
    get(target, name) {
      if (!(name in target)) throw new Error("Unexpected environment read");
      return target[name as keyof typeof local];
    },
    ownKeys() {
      throw new Error("Environment enumeration is forbidden");
    },
  });
  expect(receiptEnvironment("local-only", "/unused", variables)).toEqual(local);
});

it("OpenAI mode reads only its server settings and local-only skips dotenv", async () => {
  await mkdir(ownedBase, { recursive: true });
  root = await realpath(await mkdtemp(join(ownedBase, "env-")));
  await writeFile(
    join(root, ".env.local"),
    "OPENAI_ALLOWANCE_ID=synthetic-openai-grant\nGEMINI_API_KEY=synthetic-other-reader\nVITE_SYNTHETIC_SECRET=never-expose\nLOCAL_OCR_PYTHON=/dotenv/python\n",
  );
  const env = receiptEnvironment("local-only", root, {});
  expect(Object.values(env).every((value) => value === "")).toBe(true);
  expect(env).not.toHaveProperty("OPENAI_ALLOWANCE_ID");
  expect(env).not.toHaveProperty("VITE_SYNTHETIC_SECRET");
  vi.stubEnv("OPENAI_ALLOWANCE_ID", undefined);
  const openai = receiptEnvironment("development", root);
  expect(openai.OPENAI_ALLOWANCE_ID).toBe("synthetic-openai-grant");
  expect(openai).not.toHaveProperty("GEMINI_API_KEY");
  expect(openai).not.toHaveProperty("VITE_SYNTHETIC_SECRET");
  expect(openai).not.toHaveProperty("LOCAL_OCR_PYTHON");
  if (typeof receiptConfig !== "function")
    throw new Error("Expected Vite factory");
  const config = await receiptConfig({ command: "serve", mode: "local-only" });
  expect(config.envDir).toBe(false);
  expect(config.envPrefix).toEqual([]);
  expect(config.cacheDir).toBe(".vite");
  const build = await receiptConfig({ command: "build", mode: "production" });
  expect(build.envDir).toBe(false);
  expect(build.envPrefix).toEqual([]);
});

it("serves public files but blocks private data through direct, encoded and absolute development HTTP paths", async () => {
  await mkdir(ownedBase, { recursive: true });
  root = await realpath(await mkdtemp(join(ownedBase, "app-")));
  const secret = "SYNTHETIC_PRIVATE_CONTENT_MUST_NOT_BE_SERVED";
  const privateFiles = [
    "private-receipts/runtime/scan-fixture/1.jpg",
    "receipt_training/private/receipt.json",
    "qa-artifacts/receipt-output.json",
    "graphify-out/graph.json",
    ".graphify/cache.json",
    ".receipt-reader-state/synthetic-account/offline-grant/1.json",
    ".cache/model.bin",
    ".vscode/tasks.json",
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
