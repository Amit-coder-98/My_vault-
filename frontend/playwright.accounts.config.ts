import { defineConfig } from "@playwright/test";
const python =
  process.platform === "win32"
    ? ".venv\\Scripts\\python.exe"
    : ".venv/bin/python";
export default defineConfig({
  testDir: "./tests",
  testMatch: "accounts.spec.ts",
  workers: 1,
  fullyParallel: false,
  timeout: 45_000,
  reporter: "list",
  outputDir: "./test-results/accounts",
  use: {
    baseURL: "http://127.0.0.1:5175",
    channel: "chrome",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: `${python} -m tests.browser_server`,
      cwd: "../backend",
      url: "http://127.0.0.1:8001/health",
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      command: "npm run dev -- --port 5175",
      env: {
        VAULT_API_PROXY: "http://127.0.0.1:8001",
        VITE_DEMO_MODE: "false",
      },
      url: "http://127.0.0.1:5175",
      reuseExistingServer: false,
    },
  ],
});
