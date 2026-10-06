import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:3405",
    browserName: "chromium",
    launchOptions: {
      executablePath:
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    },
    trace: "retain-on-failure",
  },
  reporter: [["list"], ["html", { open: "never" }]],
});
