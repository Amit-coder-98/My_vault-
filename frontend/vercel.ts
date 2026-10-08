// Vercel evaluates this server-side configuration during deployment.
// The API URL is not compiled into the browser; /api remains on the frontend origin.
const configuredOrigin = process.env.VAULT_API_ORIGIN?.trim();
if (!configuredOrigin) {
  throw new Error(
    "Set VAULT_API_ORIGIN in Vercel to the deployed backend HTTPS origin before deploying.",
  );
}
const backend = new URL(configuredOrigin);
if (
  backend.protocol !== "https:" ||
  backend.username ||
  backend.password ||
  backend.pathname !== "/" ||
  backend.search ||
  backend.hash
) {
  throw new Error("VAULT_API_ORIGIN must be an HTTPS origin without credentials, paths or query parameters.");
}
if (process.env.VITE_API_ORIGIN?.trim() || process.env.VITE_DEMO_MODE === "true") {
  throw new Error("Keep VITE_API_ORIGIN empty and VITE_DEMO_MODE=false for the private Vercel deployment.");
}

const appRoutes = [
  "/login", "/register", "/forgot-password", "/reset-password", "/account", "/admin",
];

export const config = {
  framework: "vite",
  installCommand: "npm ci",
  buildCommand: "npm run build",
  outputDirectory: "dist",
  headers: [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Strict-Transport-Security", value: "max-age=31536000" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        {
          key: "Content-Security-Policy",
          value: "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        },
      ],
    },
    {
      source: "/api/:path*",
      headers: [
        { key: "Cache-Control", value: "private, no-store" },
        { key: "CDN-Cache-Control", value: "no-store" },
        { key: "Vercel-CDN-Cache-Control", value: "no-store" },
        { key: "x-vercel-enable-rewrite-caching", value: "0" },
      ],
    },
    {
      source: "/assets/:path*",
      headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
    },
  ],
  rewrites: [
    { source: "/api/:path*", destination: `${backend.origin}/api/:path*` },
    { source: "/health", destination: `${backend.origin}/health` },
    ...appRoutes.map((source) => ({ source, destination: "/index.html" })),
  ],
};
