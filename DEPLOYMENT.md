# Deploying My Music Vault

Deploy the React frontend and the FastAPI API behind **one HTTPS origin**. The
private B2 bucket holds audio and artwork; Atlas holds users and catalog data.
Browser audio uses an HttpOnly session cookie, so a separate public API domain
requires additional cookie/proxy work. The supplied configuration uses `/api` on
the frontend's domain and keeps the backend off the public network.

## Production configuration

1. Copy `backend/.env.production.example` to `backend/.env.production`. Keep the
   working development `.env` unchanged.
2. Fill in the existing Atlas URI, database name, B2 endpoint, region, private
   bucket name and application key. Preserve the database/bucket already holding
   your vault. Do not create a second owner if the existing owner is present.
3. Generate a new production secret locally with
   `python -c "import secrets; print(secrets.token_hex(32))"`, and put it in
   `AUTH_SECRET`. Keep it private and stable across releases.
4. Replace `vault.example.com` in both `FRONTEND_URL` and `ALLOWED_ORIGINS` with
   the actual HTTPS origin, with no trailing slash. Production startup rejects
   HTTP, wildcard origins, insecure cookies and missing/short secrets.
5. Allow the deployment host's outbound IP in Atlas and give its database user
   access only to the vault database. Keep B2 private and the application key
   scoped to the vault bucket. Store credentials in the host's secret settings
   when deploying without Docker.

Never put Atlas/B2 credentials, `AUTH_SECRET` or private music in frontend
environment variables or static output. The Docker build contexts exclude local
secrets, managed storage, source music and test data.

## Docker on a server with a TLS ingress

The root `compose.yaml` builds the services independently. On a Docker-capable
host, after filling in the production file:

```sh
docker compose config --quiet
docker compose build --pull
docker compose up -d
docker compose ps
docker compose exec backend python -m app.cli check-services
```

The frontend listens on **127.0.0.1:8080**. Configure your HTTPS ingress to proxy
the public domain to that address, redirect HTTP to HTTPS, and add HSTS once the
HTTPS domain works. Do not expose port 8000. The Compose API trusts forwarded
headers because only the internal frontend proxy accepts public requests.

When an ingress sits in front of Nginx, configure Nginx `set_real_ip_from` for
**only the actual ingress addresses** and the ingress's client-IP header. Nginx
then overwrites `X-Forwarded-For` with the verified address. Without this step,
users behind that ingress share an IP rate-limit bucket. Do not trust forwarded
IP headers from arbitrary clients. With other hosts, set Uvicorn's
`FORWARDED_ALLOW_IPS` to the actual proxy address/network; use `*` only when
direct external access to the API is prevented.

The Nginx configuration includes security headers and SPA fallback, leaves
authenticated media uncached, and disables response buffering for range
streaming. It disables access logs so invitation/recovery tokens in query
strings are not logged. Apply the same query-string redaction at your TLS
ingress, hosting logs and monitoring service. Only `/health` is public;
`/health/ready` is an internal check that calls Atlas/B2.

Docker is unavailable in the current development environment. Validate both
images and the Compose startup on the target host before release. Base images
use maintained version tags; rebuild with `--pull` for security updates and pin
the tested image digests in your release process.

## Other hosting services

- Frontend root: `frontend`; install `npm ci`; build `npm run build`; output `dist`.
- Leave `VITE_API_ORIGIN` empty and `VITE_DEMO_MODE=false`.
- API root: `backend`; install `requirements.txt`, provide FFmpeg and writable
  processing space, and run `python -m uvicorn app.main:app --host 0.0.0.0
  --port 8000 --proxy-headers --no-access-log` with the host's required port.
- Forward `/api/*` to the API without changing the path. Preserve `Range`,
  `Content-Range`, `Accept-Ranges`, `Set-Cookie`, and `Cookie` headers. Support
  streaming and a total upload request of 109 MiB for the default 100 MiB audio
  and 8 MiB cover limits. Update both proxy/backend limits if customizing them.
- Apply the headers and SPA fallback from `frontend/deploy/nginx.conf`, and keep
  readiness checks internal. Do not serve the app using Vite's development or
  preview servers in production.

Run **one API worker and one API instance** in this version. Imports run in that
process and restart marks an unfinished import interrupted. Multiple instances
need a durable background job worker before scaling. B2 mode only needs
temporary processing space if all records have migrated to B2; local records
still need their original managed files. The original `Songs_data` directory is
not required to play already imported songs. Mount it read-only at `/imports`
only when performing folder imports on the deployment host.

## Release and recovery checks

Before inviting friends, test the real HTTPS domain: login, reload/session
refresh, sign out, seek/play a song, invitation registration, favorites and
playlists, and an admin upload/edit/archive/restore. Verify unauthenticated
audio is rejected, a listener cannot open admin API routes, and HTTP redirects
to HTTPS. Use a disposable test recording and remove it through the admin UI.
Check headers and `Secure; HttpOnly; SameSite=Lax` on the session cookie.

Back up Atlas and preserve B2 object versions referenced by song records. A
blanket lifecycle rule deleting old B2 versions can remove the exact version a
song uses. Test database restore and media playback in an isolated environment
before relying on the backup. For a code rollback, retain the same production
secret, database, bucket and processing volume; do not delete the volume with
`docker compose down -v`.

Watch `/health` for API liveness, use internal service checks for Atlas/B2, and
review admin activity and pending artwork cleanup. Use
`python -m app.cli cleanup-storage` to retry queued old artwork deletions. Audio
streams through the API, so check the selected host's outbound bandwidth costs
before opening access broadly.
