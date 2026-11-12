import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { createReceiptApi } from "./server/receipt-api.mjs";
import { createLocalModelReader } from "./server/local-ocr.mjs";
import { createLocalVisionReader } from "./server/local-vision.mjs";
import { privateFileDeny } from "./server/private-paths.mjs";
import { createOpenAiReader } from "./server/openai-reader.mjs";
import { resolve } from "node:path";
import { LOCAL_VISION_TIMEOUT_MS } from "./src/lib/vision-plan.mjs";

// A restartable local-only session never loads cloud keys from dotenv or the
// inherited environment. These settings are trusted server configuration only.
export function receiptEnvironment(
  mode: string,
  directory = process.cwd(),
  variables: NodeJS.ProcessEnv = process.env,
) {
  if (mode !== "local-only")
    return loadEnv(mode, directory, ["OPENAI_", "OPEN_AI_KEY"]);
  return Object.fromEntries(
    [
      "LOCAL_OCR_PYTHON",
      "LOCAL_OCR_ENGINE",
      "LOCAL_OCR_CACHE_ROOT",
      "LOCAL_VISION_ENABLED",
      "RECEIPT_ASSISTED_READER",
      "LOCAL_OCR_CHECK_MODE",
    ].map((name) => [name, variables[name] || ""]),
  );
}

export default defineConfig(({ command, mode }) => {
  const openAiOnly = mode !== "local-only";
  const env = command === "build" ? {} : receiptEnvironment(mode);
  const api = () => {
    if (openAiOnly)
      return {
        handler: createReceiptApi({
          openAiOnly,
          openaiReader: createOpenAiReader({
            apiKey: env.OPENAI_API_KEY || env.OPEN_AI_KEY || "",
            directory: resolve(
              env.OPENAI_ALLOWANCE_DIRECTORY || ".receipt-reader-state/openai",
            ),
            grant: env.OPENAI_ALLOWANCE_ID || "",
            limit: Number(env.OPENAI_REQUEST_LIMIT || 0),
          }),
        }),
      };
    const localReader = createLocalModelReader({
      python: env.LOCAL_OCR_PYTHON || "",
      engine: env.LOCAL_OCR_ENGINE || "paddle-v6",
      cacheRoot: resolve(env.LOCAL_OCR_CACHE_ROOT || "receipt_training/.cache"),
    });
    const localVision = createLocalVisionReader({
      enabled: env.LOCAL_VISION_ENABLED === "1",
      python: env.LOCAL_OCR_PYTHON || "",
    });
    return {
      localReader,
      localVision,
      handler: createReceiptApi({
        assistedReader: env.RECEIPT_ASSISTED_READER || undefined,
        localCheckMode: env.LOCAL_OCR_CHECK_MODE || "off",
        localReader,
        localVision,
        visionTimeoutMs: LOCAL_VISION_TIMEOUT_MS,
      }),
    };
  };
  return {
    // Keep generated caches in this checkout when dependencies are shared.
    cacheDir: ".vite",
    envDir: false as const,
    envPrefix: [],
    // Avoid a first-PDF dependency optimization reload discarding selected files.
    optimizeDeps: {
      entries: ["index.html"],
      include: ["pdfjs-dist", "@techstark/opencv-js", "clipper-lib"],
      exclude: ["@paddleocr/paddleocr-js"],
    },
    plugins: [
      react(),
      {
        name: "private-local-receipt-api",
        configureServer(server) {
          const reader = api();
          server.middlewares.use(reader.handler);
          server.httpServer?.once("close", () => {
            void reader.localReader?.dispose().catch(() => {});
            void reader.localVision?.dispose().catch(() => {});
          });
        },
        configurePreviewServer(server) {
          const reader = api();
          server.middlewares.use(reader.handler);
          server.httpServer?.once("close", () => {
            void reader.localReader?.dispose().catch(() => {});
            void reader.localVision?.dispose().catch(() => {});
          });
        },
      },
      {
        name: "local-dev-csp",
        apply: "serve",
        transformIndexHtml: {
          order: "post",
          handler: (html) =>
            html
              .replace(
                "script-src 'self' 'wasm-unsafe-eval'",
                "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
              )
              .replace(
                "connect-src 'self'",
                "connect-src 'self' ws://127.0.0.1:*",
              ),
        },
      },
    ],
    build: { target: "es2022" },
    worker: { format: "es" },
    server: {
      host: "127.0.0.1",
      strictPort: true,
      fs: { deny: privateFileDeny },
      watch: {
        ignored: [
          "**/receipt_training/.cache/**",
          "**/receipt_training/evaluation/runs/**",
          "**/qa-artifacts/**",
          "**/graphify-out/**",
          "**/playwright-report/**",
          "**/test-results/**",
        ],
      },
    },
    preview: { host: "127.0.0.1", strictPort: true },
    test: { include: ["tests/**/*.test.ts"], testTimeout: 15000 },
  };
});
