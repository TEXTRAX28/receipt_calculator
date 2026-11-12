import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.openai.config";

// Optional engine check. Host WebKit is not a physical iPhone or Apple Safari.
export default defineConfig({
  ...base,
  workers: 1,
  outputDir: "qa-artifacts/webkit-latest/test-results",
  reporter: [
    ["list"],
    [
      "html",
      { open: "never", outputFolder: "qa-artifacts/webkit-latest/report" },
    ],
  ],
  projects: [{ name: "webkit-mobile", use: { ...devices["iPhone 13"] } }],
});
