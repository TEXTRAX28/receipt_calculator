import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { createReceiptApi } from "./server/receipt-api.mjs";
import { privateFileDeny } from "./server/private-paths.mjs";
import { openAiSettings } from "./server/openai-settings.mjs";

export default defineConfig({
  cacheDir: ".vite",
  publicDir: ".receipt-assets",
  envDir: false as const,
  envPrefix: [],
  // Avoid a first-PDF dependency optimization reload discarding selected files.
  optimizeDeps: {
    entries: ["index.html"],
    include: ["pdfjs-dist"],
  },
  plugins: [
    react(),
    {
      name: "private-local-receipt-api",
      configureServer(server) {
        server.middlewares.use(
          createReceiptApi(openAiSettings(server.config.root)),
        );
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
        "**/receipt_training/**",
        "**/qa-artifacts/**",
        "**/graphify-out/**",
        "**/playwright-report/**",
        "**/test-results/**",
      ],
    },
  },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 15000, maxWorkers: 2 },
});
