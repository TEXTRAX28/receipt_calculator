import { defineConfig, devices } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testIgnore: [
    ...(!process.env.GATHER_LOCAL_COMPARISON_URL
      ? ["**/compared-reader-real.spec.ts"]
      : []),
    ...(!process.env.GATHER_LOCAL_VISION_URL
      ? ["**/local-vision-real.spec.ts"]
      : []),
    ...(!process.env.GATHER_REAL_RECEIPT ? ["**/real-receipt.spec.ts"] : []),
    ...(!process.env.GATHER_LOCAL_MODEL_URL
      ? ["**/computer-reader-real.spec.ts"]
      : []),
  ],
  timeout: 60000,
  expect: { timeout: 10000 },
  fullyParallel: true,
  retries: 0,
  workers: 2,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        channel: "chrome",
        viewport: { width: 1440, height: 1000 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
        defaultBrowserType: "chromium",
        channel: "chrome",
      },
    },
  ],
  webServer: {
    command: "npm run preview -- --port 4173",
    env: {
      LOCAL_OCR_PYTHON: "",
      GEMINI_API_KEY: "",
      VERYFI_CLIENT_ID: "",
      VERYFI_BEARER_KEY: "",
      VERYFI_ALLOWANCE_ID: "",
      VERYFI_DOCUMENT_LIMIT: "0",
      AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT: "",
      AZURE_DOCUMENT_INTELLIGENCE_KEY: "",
      AZURE_ALLOWANCE_ID: "",
      AZURE_SECTION_LIMIT: "0",
    },
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 30000,
  },
});
