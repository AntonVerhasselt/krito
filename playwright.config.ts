import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: "*.pw.ts",
  timeout: 300_000,
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
    screenshot: "off",
    video: "off",
  },
  reporter: "list",
});
