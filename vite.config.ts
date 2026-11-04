import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { createReceiptApi } from "./server/receipt-api.mjs";
import { createLocalModelReader } from "./server/local-ocr.mjs";
import { createLocalVisionReader } from "./server/local-vision.mjs";
import { privateFileDeny } from "./server/private-paths.mjs";
import { createVeryfiReader } from "./server/veryfi-reader.mjs";
import { createAzureReader } from "./server/azure-reader.mjs";
import { createOpenAiReader } from "./server/openai-reader.mjs";
import { resolve } from "node:path";
import { LOCAL_VISION_TIMEOUT_MS } from "./src/lib/vision-plan.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const api = () => {
    const localReader = createLocalModelReader({
      python: env.LOCAL_OCR_PYTHON || "",
      engine: env.LOCAL_OCR_ENGINE || "paddle-v6",
    });
    const localVision = createLocalVisionReader({
      enabled: env.LOCAL_VISION_ENABLED === "1",
      python: env.LOCAL_OCR_PYTHON || "",
    });
    return {
      localReader,
      localVision,
      handler: createReceiptApi({
        apiKey: env.GEMINI_API_KEY || "",
        model: env.GEMINI_MODEL || undefined,
        geminiAllowance: {
          directory: resolve(
            env.GEMINI_ALLOWANCE_DIRECTORY || ".receipt-reader-state/gemini",
          ),
          grant: env.GEMINI_ALLOWANCE_ID || "",
          limit: Number(env.GEMINI_REQUEST_LIMIT || 0),
        },
        localReader,
        localVision,
        openaiReader: createOpenAiReader({
          apiKey: env.OPEN_AI_KEY || env.OPENAI_API_KEY || "",
          directory: resolve(
            env.OPENAI_ALLOWANCE_DIRECTORY || ".receipt-reader-state/openai",
          ),
          grant: env.OPENAI_ALLOWANCE_ID || "",
          limit: Number(env.OPENAI_REQUEST_LIMIT || 0),
        }),
        visionTimeoutMs: LOCAL_VISION_TIMEOUT_MS,
        azureReader: createAzureReader({
          endpoint: env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT || "",
          key: env.AZURE_DOCUMENT_INTELLIGENCE_KEY || "",
          directory: resolve(
            env.AZURE_ALLOWANCE_DIRECTORY || ".receipt-reader-state/azure",
          ),
          grant: env.AZURE_ALLOWANCE_ID || "",
          limit: Number(env.AZURE_SECTION_LIMIT || 0),
        }),
        veryfiReader: createVeryfiReader({
          clientId: env.VERYFI_CLIENT_ID || "",
          bearerKey: env.VERYFI_BEARER_KEY || "",
          directory: resolve(
            env.VERYFI_ALLOWANCE_DIRECTORY || ".receipt-reader-state",
          ),
          grant: env.VERYFI_ALLOWANCE_ID || "",
          limit: Number(env.VERYFI_DOCUMENT_LIMIT || 0),
        }),
      }),
    };
  };
  return {
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
            void reader.localReader.dispose().catch(() => {});
            void reader.localVision.dispose().catch(() => {});
          });
        },
        configurePreviewServer(server) {
          const reader = api();
          server.middlewares.use(reader.handler);
          server.httpServer?.once("close", () => {
            void reader.localReader.dispose().catch(() => {});
            void reader.localVision.dispose().catch(() => {});
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
