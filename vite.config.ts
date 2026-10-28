import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [
    react(),
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
  server: { host: "127.0.0.1", strictPort: true },
  preview: { host: "127.0.0.1", strictPort: true },
  test: { include: ["tests/**/*.test.ts"], testTimeout: 15000 },
});
