import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { loadEnv } from "vite";
import { createReceiptApi } from "./server/receipt-api.mjs";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const api = () =>
    createReceiptApi({
      apiKey: env.GEMINI_API_KEY || "",
      model: env.GEMINI_MODEL || undefined,
    });
  return {
    plugins: [
      react(),
      {
        name: "private-local-receipt-api",
        configureServer(server) {
          server.middlewares.use(api());
        },
        configurePreviewServer(server) {
          server.middlewares.use(api());
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
    server: {
      host: "127.0.0.1",
      strictPort: true,
      watch: {
        ignored: [
          "**/receipt_training/.cache/**",
          "**/receipt_training/evaluation/runs/**",
          "**/qa-artifacts/**",
        ],
      },
    },
    preview: { host: "127.0.0.1", strictPort: true },
    test: { include: ["tests/**/*.test.ts"], testTimeout: 15000 },
  };
});
