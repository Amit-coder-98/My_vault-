import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const frontend = fileURLToPath(new URL("../", import.meta.url));
const backend = fileURLToPath(new URL("../../backend/", import.meta.url));
const python = path.join(
  backend,
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const result = spawnSync(
  process.execPath,
  [
    require.resolve("@playwright/test/cli"),
    "test",
    "--config",
    "playwright.accounts.config.ts",
    ...process.argv.slice(2),
  ],
  { cwd: frontend, stdio: "inherit" },
);
// Windows forcibly stops Playwright's server tree; clean test data after it exits.
const cleanup = spawnSync(python, ["-m", "tests.browser_cleanup"], {
  cwd: backend,
  stdio: "inherit",
});
if (result.error) process.stderr.write(`${result.error.message}\n`);
if (cleanup.error) process.stderr.write(`${cleanup.error.message}\n`);
process.exitCode = (result.status ?? 1) || (cleanup.status ?? 1);
