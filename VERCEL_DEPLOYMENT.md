# Vercel frontend deployment

Repository: [Amit-coder-98/My_vault-](https://github.com/Amit-coder-98/My_vault-).

This deployment hosts **frontend on Vercel**, with the current **FastAPI backend
on a separate Docker-capable host**. Atlas and the private B2 bucket remain the
database/storage providers. No changes to the existing owner or 42 imported
songs are needed.

The current backend accepts audio up to 100 MiB, uses FFmpeg, and runs folder
imports in its API process. [Vercel Functions have a 4.5 MB payload limit](https://vercel.com/docs/functions/limitations)
and function duration/scaling constraints. Moving this API into Vercel Functions
requires a separate design for direct private B2 uploads/downloads, processing
and durable import jobs. Do not import `backend` as a Vercel FastAPI project with
the current implementation.

## 1. Deploy the API

Use the backend Dockerfile and production settings in [DEPLOYMENT.md](DEPLOYMENT.md).
Run one API instance. Provide the existing Atlas/B2 credentials through the
backend host's secret/environment settings, FFmpeg, and writable processing
space. Keep B2 private. The original `Songs_data` folder is not needed to play
the already imported library.

Get the backend HTTPS origin, for example `https://your-vault-api.your-host.com`.
Set backend `FRONTEND_URL` to the final Vercel frontend HTTPS origin and
`ALLOWED_ORIGINS` to an exact JSON list containing that origin. Enable
`VAULT_ENV=production`, `COOKIE_SECURE=true`, and a stable random auth secret.
Allow the API host's outbound IP in Atlas. Reuse your existing Atlas database
name and B2 bucket. Do not rerun owner creation when the owner already exists.

Configure forwarded-IP trust according to the host's ingress and Vercel proxy
path. Trust the Vercel visitor headers only when the origin verifies that the
request came through Vercel. Do not enable unrestricted trust on a public API.
[Vercel documents proxy headers and origin restrictions](https://vercel.com/docs/routing/rewrites#identifying-the-visitor-at-your-origin).

## 2. Import the frontend in Vercel

In Vercel, choose **Add New Project**, connect GitHub, and import `My_vault-`.

| Setting | Value |
| --- | --- |
| Root directory | `frontend` |
| Framework | Vite |
| Node version | 24.x |
| Install command | `npm ci` |
| Build command | `npm run build:vercel` |
| Output directory | `dist` |

The frontend's `engines.node` pins Node.js to `24.x`. Its lockfile includes
the optional native/WASM dependency records needed for Linux builds. Keep
the install command as `npm ci` and commit lockfile changes alongside changes
to `frontend/package.json`.

If a previous build reported missing `@emnapi/runtime` or `@emnapi/core`,
deploy the latest `main` commit containing the repaired lockfile. Check the
commit shown in Vercel's build log so you are validating the updated source.

Add these **frontend project** environment variables before deploying:

| Variable | Value |
| --- | --- |
| `VAULT_API_ORIGIN` | Actual backend HTTPS origin, with no trailing slash or `/api` path |
| `VITE_API_ORIGIN` | Leave empty or unset |
| `VITE_DEMO_MODE` | `false` |

`frontend/vercel.json` uses Vercel's environment-variable expansion in route
destinations to proxy `/api/*` to the same path on the backend. The import form
can validate this static configuration before the backend URL is known. The
Vercel build command checks `VAULT_API_ORIGIN` and the frontend authentication
settings before building; a missing or invalid URL fails with a clear error.
The configuration also rewrites the account/admin page routes to the SPA,
adds the audited browser security headers, and disables shared caching of
API/audio responses. See
[environment variables in route destinations](https://vercel.com/docs/project-configuration/vercel-json#in-route-destinations).

If the import form previously displayed `rewrites[0] missing required property
destination`, refresh or reopen the import after the latest GitHub commit is
available. The old computed TypeScript rewrite has been replaced by the static
configuration. Keep Root Directory `frontend` and Application Preset `Vite`.

Find the API URL in Render by opening **Dashboard → your backend web service**.
Copy the public `https://....onrender.com` address shown near the top. If the
service has not been created, finish the Docker backend deployment first. Add
that URL as `VAULT_API_ORIGIN` in the Vercel import form's **Environment
Variables** before clicking **Deploy**. The example URL is not a working API.

Keep Atlas, B2 and auth secrets on the backend host. They do not belong in the
Vercel frontend project or `VITE_*` variables. `.env` and original audio files
are excluded from Git; frontend local files are excluded from CLI uploads.

## 3. Verify the public deployment

Use a stable production Vercel domain or your custom domain for the backend's
allowed frontend origin. Random preview deployment domains are not
automatically trusted. Use a separate staging API/database if you need
interactive previews; do not add wildcard origins.

Test login, page reload/session refresh, invitation registration, sign out,
private playback and seeking, a small admin upload, and adding/replacing a
cover. Then test a representative larger upload on the actual Vercel/backend
path. The external rewrite is a proxy rather than a Vercel Function, but proxy
transport limits still require real deployment testing. Vercel documents a
[120-second proxied request timeout](https://vercel.com/docs/limits#proxied-request-timeout).
Slow uploads, cold backend startup and media processing can reach that limit.
Do not mark 100 MiB uploads verified until the live test passes.

Ensure responses preserve `Set-Cookie`, `Cookie`, `Range`, `Content-Range` and
`Accept-Ranges`; cookies must have `Secure`, `HttpOnly` and `SameSite=Lax`.
Guest audio must return 401 and a regular user must receive 403 from admin API
routes. `/health` is cheap and public; readiness is not forwarded by the Vercel
configuration. Redact invitation/recovery query strings in backend and hosting
logs. Verify API/media responses are never shared-cache hits.

The frontend can be linked/deployed with the dashboard, or with the Vercel CLI
after authentication. Local Vercel login/credentials are not configured in the
current workspace. GitHub push and deployment configuration do not mean the
application has already been deployed.
