import { fileURLToPath } from "node:url";
import { loadEnv } from "vite";

// Validate at build time. The import screen can read vercel.json without
// executing code or requiring a backend URL before the project exists.
const frontend = fileURLToPath(new URL("../", import.meta.url));
const env = loadEnv("production", frontend, "");
const configuredOrigin = env.VAULT_API_ORIGIN;

if (!configuredOrigin) {
  throw new Error(
    "Set VAULT_API_ORIGIN in Vercel to your Render backend HTTPS origin before deploying.",
  );
}

let backend;
try {
  backend = new URL(configuredOrigin);
} catch {
  throw new Error("VAULT_API_ORIGIN must be a valid HTTPS origin, for example https://your-api.onrender.com.");
}

if (backend.protocol !== "https:" || configuredOrigin !== backend.origin) {
  throw new Error(
    "VAULT_API_ORIGIN must be an HTTPS origin without a trailing slash, credentials, paths, query parameters or whitespace.",
  );
}

if (env.VITE_API_ORIGIN?.trim() || env.VITE_DEMO_MODE === "true") {
  throw new Error(
    "Keep VITE_API_ORIGIN empty and VITE_DEMO_MODE=false for the private Vercel deployment.",
  );
}

process.stdout.write("Vercel backend configuration is valid.\n");
