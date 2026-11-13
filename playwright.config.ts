import { defineConfig, devices } from "@playwright/test";

const port = 4187;
const baseURL = "http://127.0.0.1:" + port;
const channel = process.env.GATHER_TEST_CHROME === "1" ? "chrome" : undefined;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 60000,
  expect: { timeout: 10000 },
  workers: 1,
  outputDir: "test-results",
  reporter: "list",
  use: { baseURL, trace: "retain-on-failure" },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel,
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel,
        deviceScaleFactor: 1,
      },
    },
  ],
  webServer: {
    command: "node scripts/start.mjs --port " + port,
    env: { OPENAI_API_KEY: "", OPEN_AI_KEY: "", OPENAI_REQUEST_LIMIT: "0" },
    url: baseURL,
    reuseExistingServer: false,
  },
});
