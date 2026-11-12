import { defineConfig } from "@playwright/test";
import baseline from "./playwright.config";

const port = 4175;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  ...baseline,
  testMatch: ["**/openai-only.spec.ts", "**/digital-receipt.spec.ts"],
  testIgnore: [],
  fullyParallel: false,
  workers: 1,
  outputDir: "qa-artifacts/openai-only/test-results",
  reporter: [["list"]],
  use: { ...baseline.use, baseURL },
  projects: baseline.projects?.map((project) => ({
    ...project,
    use: { ...project.use, deviceScaleFactor: 1 },
  })),
  webServer: {
    command: `node node_modules/vite/bin/vite.js preview --configLoader native --port ${port} --strictPort`,
    env: {
      OPENAI_API_KEY: "",
      OPEN_AI_KEY: "",
      OPENAI_ALLOWANCE_ID: "",
      OPENAI_REQUEST_LIMIT: "0",
    },
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
