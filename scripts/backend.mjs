import { spawnSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
const directory = fileURLToPath(new URL("../backend/", import.meta.url));
const windows = process.platform === "win32";
const python = path.join(
  directory,
  ".venv",
  windows ? "Scripts/python.exe" : "bin/python",
);
const command = process.argv[2] ?? "dev";
function run(binary, args) {
  const result = spawnSync(binary, args, { cwd: directory, stdio: "inherit" });
  if (result.error) {
    process.stderr.write(result.error.message + "\n");
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (command === "setup") {
  if (!existsSync(python))
    run(windows ? "python" : "python3", ["-m", "venv", ".venv"]);
  run(python, ["-m", "pip", "install", "-r", "requirements.txt"]);
} else {
  if (!existsSync(python)) {
    process.stderr.write(
      "Install the backend first with npm run setup:backend\n",
    );
    process.exit(1);
  }
  const args =
    command === "dev"
      ? [
          "-m",
          "uvicorn",
          "app.main:app",
          "--host",
          "127.0.0.1",
          "--port",
          "8000",
          "--reload",
          "--no-access-log",
        ]
      : command === "test"
        ? ["-m", "pytest", "-q"]
        : command === "lint"
          ? ["-m", "ruff", "check", "app", "tests"]
          : ["-m", "app.cli", command];
  const child = spawn(python, args, { cwd: directory, stdio: "inherit" });
  child.on("error", (error) => {
    process.stderr.write(error.message + "\n");
    process.exitCode = 1;
  });
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
  });
}
